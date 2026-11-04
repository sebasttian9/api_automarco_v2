import "dotenv/config";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import connection from "../config/bdPedidosApi.js";
import { MAPA_DMZ_EMPRESA, obtenerDireccionSucursal } from "../src/api/v1/models/productsModel.js";

// Envia por correo el PDF de la OC de Grupo Planet una vez que el pedido ya
// tiene nota de venta (PEDNUM) en la DMZ. Corre por cron en el mismo servidor de
// la API (los PDF estan en su disco, ver guardarPdf en PedidosPlanetController):
//
//   */10 * * * * cd /usr/local/apiproductos-v2 && flock -n /tmp/envioPdfPlanet.lock node scripts/envioPdfPlanet.js >> logs/envioPdfPlanet.log 2>&1
//
// Marca tbl_pedidos.oc_pdf_enviado = 1 SOLO si el correo salio; si falla, queda
// pendiente y se reintenta en la proxima corrida.

const RUT_PLANET = process.env.PLANET_CLIENTE_RUT;
// Destinatarios por empresa: PLANET_PDF_ENVIO_A_GABTEC, _AUTOTEC, _AUTOMARCO...
// Una empresa sin su variable no envia (sus pedidos quedan pendientes).
// UNIFICADO y FRENOS usan los de GABTEC (comparten tabla DMZ y despacho).
const destinatariosEmpresa = (empresa) => {
  const emp = empresa === "UNIFICADO" || empresa === "FRENOS" ? "GABTEC" : empresa;
  return process.env[`PLANET_PDF_ENVIO_A_${emp}`] || null;
};
// Solo pedidos desde esta fecha: los pedidos Planet anteriores quedaron con
// oc_pdf_enviado en NULL y sin esto se mandarian todos la primera vez.
const FECHA_DESDE = process.env.PLANET_PDF_ENVIO_DESDE;

const obtenerPendientes = async () => {
  const [rows] = await connection.execute(
    `SELECT p.id_pedido, p.empresa, p.pedvenrut, p.pedcorint, p.oc_numero, p.cli_rut, p.cli_sec,
            o.pdf_path, o.cliente, o.despacho_direccion
       FROM bd_api_automarco.tbl_pedidos p
       JOIN bd_api_automarco.tbl_planet_oc o ON o.numero_oc = p.oc_numero
      WHERE p.cli_rut = ?
        AND (p.oc_pdf_enviado IS NULL OR p.oc_pdf_enviado = 0)
        AND p.fecha >= ?
        AND o.pdf_path IS NOT NULL
      ORDER BY p.id_pedido`,
    [RUT_PLANET, FECHA_DESDE]
  );
  return rows;
};

// PEDNUM = 0 => la DMZ todavia no le asigna nota de venta
const obtenerPednum = async (ped) => {
  const config = MAPA_DMZ_EMPRESA[ped.empresa];
  if (!config) return null;
  const [rows] = await connection.execute(
    `SELECT PEDNUM FROM ${config.tabla}
      WHERE PEDVENRUT = ? AND PEDCORINT = ? AND PEDNUM IS NOT NULL AND PEDNUM != 0
      LIMIT 1`,
    [ped.pedvenrut, ped.pedcorint]
  );
  return rows[0]?.PEDNUM || null;
};

// Direccion de la sucursal del cliente (trae comuna; la de la OC de Planet no).
// Si no se encuentra la sucursal, se usa la direccion de despacho de la OC.
// UNIFICADO usa la tabla de clientes de GABTEC (comparten sucursal).
const obtenerDireccionDespacho = async (ped) => {
  const empresa = ped.empresa === "UNIFICADO" ? "GABTEC" : ped.empresa;
  const sucursal = await obtenerDireccionSucursal(ped.cli_rut, empresa, ped.cli_sec);
  if (sucursal?.direccion) {
    return sucursal.comuna && sucursal.comuna !== "S/I"
      ? `${sucursal.direccion} ${sucursal.comuna}`
      : sucursal.direccion;
  }
  return ped.despacho_direccion || "";
};

const main = async () => {
  const faltantes = ["PLANET_CLIENTE_RUT", "PLANET_PDF_ENVIO_DESDE", "SMTP_HOST"]
    .filter((v) => !process.env[v]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(", ")}. Ver .env.example.`);
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  const pendientes = await obtenerPendientes();
  console.log(`[${new Date().toISOString()}] Pendientes: ${pendientes.length}`);

  let enviados = 0;
  for (const ped of pendientes) {
    const pedido = `${ped.pedvenrut}-${ped.pedcorint}`;

    const destinatarios = destinatariosEmpresa(ped.empresa);
    if (!destinatarios) {
      console.log(`Pedido ${pedido} (${ped.empresa}): sin PLANET_PDF_ENVIO_A_ para esta empresa, se omite.`);
      continue;
    }

    const pednum = await obtenerPednum(ped);
    if (!pednum) {
      console.log(`Pedido ${pedido} (OC ${ped.oc_numero}): sin PEDNUM todavia.`);
      continue;
    }

    if (!fs.existsSync(ped.pdf_path)) {
      console.error(`Pedido ${pedido}: no se encuentra el PDF ${ped.pdf_path}, se omite.`);
      continue;
    }

    const direccion = await obtenerDireccionDespacho(ped);
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destinatarios,
        subject: `Pedido Grupo Planet OC ${ped.oc_numero}`,
        text:
          `Sres. favor despachar pedido ${pednum} O/C ${ped.oc_numero}\n` +
          `Direccion ${direccion}\n` +
          `Gracias`,
        attachments: [{ filename: path.basename(ped.pdf_path), path: ped.pdf_path }],
      });
    } catch (error) {
      console.error(`Pedido ${pedido}: error al enviar correo: ${error.message}`);
      continue;
    }

    await connection.execute(
      `UPDATE bd_api_automarco.tbl_pedidos SET oc_pdf_enviado = 1, oc_pdf_fecha_envio = NOW() WHERE id_pedido = ?`,
      [ped.id_pedido]
    );
    enviados++;
    console.log(`Pedido ${pedido} (OC ${ped.oc_numero}, nota ${pednum}): correo enviado.`);
  }

  console.log(`Enviados: ${enviados}`);
};

main()
  .catch((error) => {
    console.error("Error en envioPdfPlanet:", error);
    process.exitCode = 1;
  })
  .finally(() => connection.end());
