import fs from "fs/promises";
import path from "path";

import connection from "../../../../config/bdPedidosApi.js";
import {
  validarPedidoEmpresa,
  obtenerCorrelativoPorEmpresa,
  obtenerCondpagoPorSucursal,
  insertPedidoEmpresa,
} from "../models/productsModel.js";
import {
  OCEnProcesoError,
  buscarOC,
  guardarOCRecibida,
  marcarOCProcesada,
  marcarOCConError,
  actualizarItemResuelto,
  buscarSkuPorCodigoPlanet,
  buscarSucursalDespacho,
} from "../models/pedidosPlanetModel.js";
import { parseNumeroCL, parseFechaPlanet, normalizarDireccion } from "../helpers/planet.js";
import { enviarAviso } from "../helpers/notificador.js";
import { ValidationError } from "../helpers/errors.js";

// Webhook de Grupo Planet (documento "Venta en Verde", punto 6.2): Planet nos
// envia cada OC emitida a nuestro nombre. Espera cuerpo vacio + 200 si la
// recibimos bien, o el codigo de error que corresponda.
//
// Planet reintenta hasta 3 veces si no recibe 200, y despues avisa a su equipo.
// Por eso:
//  1. la OC se guarda completa en tbl_planet_oc ANTES de procesarla,
//  2. si falla queda 'con_error' con su motivo y se avisa por correo (una vez
//     por motivo, no en cada reintento),
//  3. si la misma OC vuelve a llegar: si ya estaba procesada -> 200 sin duplicar;
//     si habia fallado -> se reprocesa; si otra peticion la esta procesando en
//     ese momento -> 409, para que el reintento siguiente la encuentre resuelta.

const PDF_DIR = process.env.PLANET_PDF_DIR || path.join(process.cwd(), "storage", "planet_oc");

// Supuestos mientras Planet confirma (ver NOTAS-V2.md, seccion Grupo Planet)
const TRANSPORTE_PLANET = () => process.env.PLANET_TRANSPORTE || "GRUPO PLANET";
const RUT_CLIENTE_PLANET = () => process.env.PLANET_CLIENTE_RUT;

const texto = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// Traduce el body de Planet a los campos de tbl_planet_oc / tbl_planet_oc_items.
const leerOC = (body) => {
  const oc = body.orden_compra || {};
  const prov = body.proveedor || {};
  const desp = body.despacho || {};
  const tot = body.totales || {};

  // se guarda el JSON sin el PDF (puede pesar hasta 25 MB; va a disco aparte)
  const { pdf_base64, ...sinPdf } = body;

  return {
    numero_oc: texto(oc.numero, 30),
    fecha_oc: parseFechaPlanet(oc.fecha),
    fecha_original: oc.fecha,
    cliente: texto(oc.cliente, 150),
    moneda: texto(oc.moneda, 10),
    proveedor_rut: texto(prov.rut, 15),
    proveedor_codigo: texto(prov.codigo, 20),
    despacho_centro: texto(desp.centro, 150),
    despacho_direccion: texto(desp.direccion, 255),
    total_neto: parseNumeroCL(tot.total_neto),
    total_bruto: parseNumeroCL(tot.total_bruto),
    payload: JSON.stringify(sinPdf),
    pdf_base64,
    items: (Array.isArray(body.items) ? body.items : []).map((it) => ({
      item: texto(it.item, 10),
      codigo_planet: texto(it.codigo, 40),
      orden_servicio: texto(it.orden_servicio, 40),
      descripcion: texto(it.descripcion, 255),
      cantidad: parseNumeroCL(it.cantidad),
      um: texto(it.um, 10),
      precio_oc: parseNumeroCL(it.precio),                 // precio neto, SIN descuento aplicado
      descuento_oc: parseNumeroCL(it.descuento_porcentaje) ?? 0,
    })),
  };
};

// Guarda el PDF en disco. Si viene mal, no corta la OC: queda como alerta.
const guardarPdf = async (numero_oc, pdf_base64, alertas) => {
  if (!pdf_base64) return null;
  try {
    const buffer = Buffer.from(String(pdf_base64), "base64");
    if (buffer.subarray(0, 4).toString() !== "%PDF") {
      alertas.push("El campo pdf_base64 no contiene un PDF válido; no se guardó.");
      return null;
    }
    await fs.mkdir(PDF_DIR, { recursive: true });
    const archivo = path.join(PDF_DIR, `OC_${numero_oc.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`);
    await fs.writeFile(archivo, buffer);
    return archivo;
  } catch (error) {
    alertas.push(`No se pudo guardar el PDF: ${error.message}`);
    return null;
  }
};

// Convierte la OC ya guardada en pedido(s) nuestro(s). Lanza ValidationError
// con un motivo legible si algo del contenido impide crearlo.
const procesarOC = async (ocId, oc, alertas) => {
  const rut = RUT_CLIENTE_PLANET();
  if (!rut) throw new Error("Falta PLANET_CLIENTE_RUT en el entorno (rut de Grupo Planet como cliente).");

  // la factura debe llevar numero y fecha de la OC: sin fecha valida no se crea el pedido
  if (!oc.fecha_oc) {
    throw new ValidationError(`Fecha de OC inválida o ausente: "${oc.fecha_original ?? ""}" (se espera dd.mm.aaaa).`);
  }

  // 1. SKU nuestro por item: orden_servicio si viene; si no, tabla de equivalencias
  const sinSku = [];
  const cantidadesInvalidas = [];
  const productos = [];

  for (const it of oc.items) {
    const sku = it.orden_servicio || (it.codigo_planet ? await buscarSkuPorCodigoPlanet(it.codigo_planet) : null);
    if (!sku) { sinSku.push(it.codigo_planet || `item ${it.item}`); continue; }
    if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) { cantidadesInvalidas.push(`${sku} (${it.cantidad})`); continue; }
    productos.push({ sku, cantidad: it.cantidad, item: it.item, precio_oc: it.precio_oc, descuento_oc: it.descuento_oc });
  }

  if (sinSku.length > 0) {
    throw new ValidationError(`Ítems sin SKU de Automarco (orden_servicio vacío y sin equivalencia en tbl_planet_productos): ${sinSku.join(", ")}`);
  }
  if (cantidadesInvalidas.length > 0) {
    throw new ValidationError(`Cantidades inválidas: ${cantidadesInvalidas.join(", ")}`);
  }

  // 2. empresa, precio de lista y descuento de cada SKU (misma logica que /pedidos;
  //    lanza ValidationError si algun SKU no existe en ninguna empresa)
  await validarPedidoEmpresa(productos, rut);

  for (const p of productos) {
    await actualizarItemResuelto(ocId, p.item, {
      sku: p.sku, empresa: p.empresa, precio_lista: p.precio, descuento: p.descuento,
    });

    // aviso (no bloquea) si el precio o el descuento de la OC no calzan con los
    // nuestros. Planet envia el precio SIN descuento + descuento_porcentaje aparte.
    const descuentoNuestro = Number(p.descuento) || 0;
    if (p.precio_oc !== null && Math.round(p.precio_oc) !== Math.round(p.precio)) {
      alertas.push(`Precio distinto en ${p.sku}: OC $${p.precio_oc}, nuestra lista $${p.precio}.`);
    }
    if (Number(p.descuento_oc) !== descuentoNuestro) {
      alertas.push(`Descuento distinto en ${p.sku}: OC ${p.descuento_oc}%, nuestro ${descuentoNuestro}%.`);
    }
  }

  // 3. sucursal de despacho por empresa (FRENOS usa la de GABTEC, como en /pedidos)
  const direccion = normalizarDireccion(oc.despacho_direccion);
  const empresas = [...new Set(productos.map((p) => p.empresa))];
  const sucursalPorEmpresa = {};

  // Planet confirmo que emite una OC por empresa; si llega mezclada se procesa
  // igual (un pedido por empresa) pero se deja el aviso.
  const empresasFacturan = new Set(empresas.map((e) => (e === "FRENOS" ? "GABTEC" : e)));
  if (empresasFacturan.size > 1) {
    alertas.push(`La OC trae productos de más de una empresa (${[...empresasFacturan].join(", ")}); se generó un pedido por empresa.`);
  }
  const sinSucursal = [];

  for (const emp of empresas) {
    const empresaSucursal = emp === "FRENOS" ? "GABTEC" : emp;
    const cli_sec = direccion ? await buscarSucursalDespacho(direccion, empresaSucursal) : null;
    if (cli_sec === null) sinSucursal.push(empresaSucursal);
    else sucursalPorEmpresa[emp] = cli_sec;
  }

  if (sinSucursal.length > 0) {
    throw new ValidationError(`La dirección de despacho "${oc.despacho_direccion}" no tiene sucursal asociada en tbl_planet_despachos para: ${[...new Set(sinSucursal)].join(", ")} (clave buscada: "${direccion}")`);
  }

  // 4. agrupar por empresa (GABTEC + FRENOS juntos -> UNIFICADO, igual que /pedidos)
  const grupos = {};
  for (const p of productos) (grupos[p.empresa] ||= []).push(p);
  if (grupos.GABTEC && grupos.FRENOS) {
    grupos.UNIFICADO = [...grupos.GABTEC, ...grupos.FRENOS];
    sucursalPorEmpresa.UNIFICADO = sucursalPorEmpresa.GABTEC;
    delete grupos.GABTEC;
    delete grupos.FRENOS;
  }

  // 5. insertar un pedido por empresa y marcar la OC 'procesada', todo en una
  //    sola transaccion (ver marcarOCProcesada)
  const db = await connection.getConnection();
  try {
    await db.beginTransaction();
    const pedidos = [];

    for (const [empresa, productosGrupo] of Object.entries(grupos)) {
      const cli_sec = sucursalPorEmpresa[empresa];
      const pedcorint = await obtenerCorrelativoPorEmpresa(empresa);
      const cli_conven = await obtenerCondpagoPorSucursal(db, rut, cli_sec, empresa);

      const pedido = await insertPedidoEmpresa(db, {
        empresa, pedcorint, rut, tran_nombre: TRANSPORTE_PLANET(), cli_sec, cli_conven,
        oc_numero: oc.numero_oc, oc_fecha: oc.fecha_oc,
        productos: productosGrupo.map((p) => ({
          codigo: p.sku, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento, empresa: p.empresa,
        })),
      });
      pedidos.push(pedido.pedido);
    }

    await marcarOCProcesada(db, ocId, pedidos.join(", "), alertas.join("\n"));
    await db.commit();
    return pedidos;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
};

const avisar = (asunto, oc, detalle) =>
  enviarAviso({
    destinatarios: process.env.NOTIFICAR_PLANET_A,
    asunto,
    texto: [
      `OC Grupo Planet: ${oc.numero_oc}`,
      `Fecha OC: ${oc.fecha_oc || "-"}   Cliente: ${oc.cliente || "-"}`,
      `Despacho: ${oc.despacho_centro || "-"} / ${oc.despacho_direccion || "-"}`,
      `Total neto: ${oc.total_neto ?? "-"}`,
      "",
      detalle,
      "",
      "Ítems:",
      ...oc.items.map((it) => `  ${it.item || "-"}  cod. Planet ${it.codigo_planet || "-"}  SKU ${it.orden_servicio || "-"}  cant. ${it.cantidad ?? "-"}  $${it.precio_oc ?? "-"} (desc. ${it.descuento_oc ?? 0}%)  ${it.descripcion || ""}`),
      "",
      "Detalle completo en bd_api_automarco.tbl_planet_oc (numero_oc) y tbl_planet_oc_items.",
      "Grupo Planet reintenta hasta 3 veces: si el problema se corrige antes, un reintento la procesa solo. Si no, hay que pedirles que reenvíen la OC.",
    ].join("\n"),
  }).catch(() => {});

const recibirOCPlanetController = async (req, res) => {
  const body = req.body || {};
  const oc = leerOC(body);

  // Sin numero de OC o sin items no hay nada que guardar ni procesar
  if (!oc.numero_oc || oc.items.length === 0) {
    avisar("OC Grupo Planet rechazada (formato inválido)", { ...oc, numero_oc: oc.numero_oc || "(sin número)" },
      "La OC llegó sin orden_compra.numero o sin items, no se guardó.");
    return res.status(400).json({ message: "La OC debe incluir orden_compra.numero e items." });
  }

  let ocId = null;
  let existente = null;
  const alertas = [];

  try {
    existente = await buscarOC(oc.numero_oc);
    if (existente && existente.estado === "procesada") {
      console.log(`OC Planet ${oc.numero_oc} recibida de nuevo; ya estaba procesada (${existente.pedidos}).`);
      return res.status(200).end();
    }

    oc.pdf_path = await guardarPdf(oc.numero_oc, oc.pdf_base64, alertas);
    ocId = await guardarOCRecibida(oc, existente?.id || null);

    const pedidos = await procesarOC(ocId, oc, alertas);

    if (alertas.length > 0) {
      avisar(`OC Grupo Planet ${oc.numero_oc} procesada con alertas`, oc,
        `Pedidos creados: ${pedidos.join(", ")}\n\nAlertas:\n- ${alertas.join("\n- ")}`);
    }

    return res.status(200).end();

  } catch (error) {
    // otra peticion con la misma OC la esta procesando: el proximo reintento de
    // Planet la encontrara 'procesada' (200) o 'con_error' (se reprocesa)
    if (error instanceof OCEnProcesoError) {
      return res.status(409).json({ message: error.message });
    }

    const esValidacion = error instanceof ValidationError;
    console.error(`Error procesando OC Planet ${oc.numero_oc}:`, error.message);

    if (ocId) await marcarOCConError(ocId, error.message).catch((e) => console.error("No se pudo marcar la OC con error:", e.message));

    // con reintentos, el mismo error llegaria hasta 4 veces: se avisa solo si es nuevo
    const mismoErrorQueAntes = existente?.estado === "con_error" && existente?.error_detalle === error.message;
    if (!mismoErrorQueAntes) {
      avisar(`OC Grupo Planet ${oc.numero_oc} NO procesada`, oc,
        `Motivo: ${error.message}${ocId ? "" : "\n(La OC tampoco se pudo guardar en tbl_planet_oc.)"}`);
    }

    return res.status(esValidacion ? 422 : 500).json({
      message: esValidacion ? error.message : "No se pudo procesar la OC.",
    });
  }
};

export { recibirOCPlanetController };
