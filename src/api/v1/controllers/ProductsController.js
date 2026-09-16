import {
  getStockProducts,
  getOCdefinitiva,
  insertPedidoEmpresa,
  obtenerCorrelativoPorEmpresa,
  obtenerCondpagoPorSucursal,
  validarPedidoEmpresa,
  obtenerNombreTransporte,
  obtenerDireccionSucursal,
  getProductById,
  getOemById,
  getInfoTR,
  getVolumetriaWms,
  getAllRecetas,
  getImagenesProductos
} from "../models/productsModel.js";

import prepareHateoas from "../helpers/hateoas.js";
import connection from "../../../../config/bdPedidosApi.js";
import obtenerPermisos from "../helpers/verificapermiso.js";
import { ValidationError } from "../helpers/errors.js";

const getStockProductsController = async (req, res) => {
  try {
    const { empresa, codigo, cantidad } = req.params;

    if (!empresa) return res.status(400).json({ message: "Empresa requerida!" });
    if (!codigo) return res.status(400).json({ message: "Codigo requerido!" });
    if (isNaN(cantidad)) return res.status(400).json({ message: "Cantidad requerida!" });

    const products = await getStockProducts(empresa, codigo, cantidad);
    
    if (products.length > 0) res.status(200).json({ message: "Disponible" });
    else res.status(200).json({ message: "No disponible" });

  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error al consultar stock" });
  }
};
const getOCdefinitivaController = async (req, res) => {
  try {
    const { empresa, correlativo } = req.body;
    if(!correlativo) return res.status(400).json({ message: "Correlativo requerido" });

    let pedvenrut = correlativo.split("-")[0];
    let pedcorint = correlativo.split("-")[1];

    const oc = await getOCdefinitiva(empresa, pedcorint, pedvenrut);
    res.status(200).json({ oc });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error al obtener OC" });
  }
}


const insertarPedidosRepSolController = async (req, res) => {

    const db = await connection.getConnection();
    await db.beginTransaction();

    try {

        // Hallazgo C1: antes el RUT del cliente salia de un header enviado por quien
        // llama ('x-rut-prueba'), lo que permitia inyectar pedidos a nombre de
        // cualquier otro RUT con solo cambiar ese header. Ahora sale unicamente del
        // token JWT ya verificado por el middleware verificarToken (req.user).
        const rut = req.user && req.user.rut;
        if (!rut) { await db.rollback(); db.release(); return res.status(401).json({ message: "Token invalido: no contiene un RUT asociado." }); }

        const body = req.body;

        if (!Array.isArray(body.productos) || body.productos.length === 0) {
            await db.rollback(); db.release();
            return res.status(400).json({ message: "El pedido debe incluir al menos un producto." });
        }

        if (!body.tran_nombre && !body.tran_id) {
            await db.rollback(); db.release();
            return res.status(400).json({ message: "El transporte es obligatorio (tran_nombre o tran_id)." });
        }

        // sacar precios de los productos (precio de lista) y su empresa
        await validarPedidoEmpresa(body.productos, rut);

        // Hallazgo C2: antes no se validaba si el cliente tenia permiso para comprar
        // en la(s) empresa(s) de los productos del pedido. Se valida ahora contra
        // tiene_permiso (la misma tabla que ya usan las consultas de productos).
        const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
        const permisos = await obtenerPermisos(token);
        if (!permisos) {
            await db.rollback(); db.release();
            return res.status(403).json({
                message: "No se pudo procesar el pedido",
                error_detail: "No fue posible verificar los permisos del cliente."
            });
        }

        // FRENOS es una sub-linea de GABTEC en la base de datos (misma tabla de
        // clientes/productos, columna prod_estado2), por eso comparte el permiso.
        const MAPA_PERMISO_EMPRESA = {
            AUTOMARCO: 'automarco',
            AUTOTEC: 'autotec',
            GABTEC: 'gabtec',
            HD: 'hd',
            FRENOS: 'gabtec',
        };

        const empresasDelPedido = [...new Set(body.productos.map((p) => p.empresa))];
        const empresasSinPermiso = empresasDelPedido.filter((emp) => {
            const campoPermiso = MAPA_PERMISO_EMPRESA[emp];
            return !campoPermiso || permisos[campoPermiso] !== 1;
        });

        // En vez de rechazar el pedido completo por una empresa sin permiso, se
        // procesan las que sí tienen permiso y las demás quedan como alerta.
        const productosConPermiso = body.productos.filter((p) => !empresasSinPermiso.includes(p.empresa));
        const alertas = empresasSinPermiso.map((emp) => ({
            empresa: emp,
            motivo: `El cliente no tiene permiso para comprar en ${emp}.`
        }));

        if (productosConPermiso.length === 0) {
            await db.rollback(); db.release();
            return res.status(403).json({
                message: "No se pudo procesar el pedido: el cliente no tiene permiso en ninguna de las empresas solicitadas.",
                alertas
            });
        }

        const validaCampo = (v) => (v === undefined || v === null || v === "" || v === "null") ? null : v;

        // sacar el nombre del transporte
        let tran_nombre = validaCampo(body.tran_nombre);
        if (!tran_nombre && body.tran_id) tran_nombre = await obtenerNombreTransporte(body.tran_id);

        // Sucursales: es obligatoria por cada empresa presente en el pedido (ya no
        // se acepta "retiro sin sucursal"). Cada empresa se resuelve por separado:
        // si falta o el código no existe para este cliente, esa empresa queda
        // excluida (alerta), sin afectar a las demás que sí tengan una sucursal
        // válida. Ya no se exige que las direcciones coincidan entre empresas:
        // cada una despacha desde la sucursal que el cliente eligió para ella.
        const sucursales = body.sucursales || {};
        const secPorEmpresa = {
            AUTOMARCO: validaCampo(sucursales.AUTOMARCO),
            AUTOTEC: validaCampo(sucursales.AUTOTEC),
            HD: validaCampo(sucursales.HD),
            GABTEC: validaCampo(sucursales.GABTEC),
            FRENOS: validaCampo(sucursales.GABTEC), // FRENOS comparte sucursal con GABTEC
        };

        const empresasConPermiso = [...new Set(productosConPermiso.map((p) => p.empresa))];
        const resolucionPorEmpresa = {};

        for (const emp of empresasConPermiso) {
            const sec = secPorEmpresa[emp];

            if (!sec) {
                alertas.push({ empresa: emp, motivo: `No se indicó sucursal para la empresa ${emp}.` });
                continue;
            }

            const d = await obtenerDireccionSucursal(rut, emp, sec);
            if (!d) {
                alertas.push({ empresa: emp, motivo: `La sucursal código '${sec}' para ${emp} no existe o no esta creada.` });
                continue;
            }

            const cli_conven = await obtenerCondpagoPorSucursal(db, rut, sec, emp);

            resolucionPorEmpresa[emp] = {
                cli_sec: sec,
                cli_conven,
                direccion: d.direccion ? d.direccion.trim() : null,
                comuna: d.comuna ? d.comuna.trim() : null,
            };
        }

        const productosFinales = productosConPermiso.filter((p) => resolucionPorEmpresa[p.empresa]);

        if (productosFinales.length === 0) {
            await db.rollback(); db.release();
            return res.status(400).json({
                message: "No se pudo procesar el pedido: ninguna empresa tiene una sucursal válida.",
                alertas
            });
        }

        // sucursal/convenio/direccion a usar segun la empresa del grupo
        const SUCURSAL_POR_EMPRESA = { ...resolucionPorEmpresa };
        if (SUCURSAL_POR_EMPRESA.GABTEC || SUCURSAL_POR_EMPRESA.FRENOS) {
            SUCURSAL_POR_EMPRESA.UNIFICADO = SUCURSAL_POR_EMPRESA.GABTEC || SUCURSAL_POR_EMPRESA.FRENOS;
        }

        // condición de pago por empresa, para el resumen del cliente (null si esa
        // empresa no quedó con sucursal válida / no viene en el pedido)
        const condicion_pago = {
            automarco: resolucionPorEmpresa.AUTOMARCO?.cli_conven ?? null,
            gabtec: (resolucionPorEmpresa.GABTEC?.cli_conven ?? resolucionPorEmpresa.FRENOS?.cli_conven) ?? null,
            autotec: resolucionPorEmpresa.AUTOTEC?.cli_conven ?? null,
            hd: resolucionPorEmpresa.HD?.cli_conven ?? null,
        };

        // agrupar los productos finales por su empresa real (ya asignada por validarPedidoEmpresa)
        const gruposPorEmpresa = {};
        for (const p of productosFinales) {
            if (!gruposPorEmpresa[p.empresa]) gruposPorEmpresa[p.empresa] = [];
            gruposPorEmpresa[p.empresa].push(p);
        }

        // GABTEC y FRENOS comparten la misma tabla DMZ -> se fusionan en un solo pedido UNIFICADO
        if (gruposPorEmpresa.GABTEC && gruposPorEmpresa.FRENOS) {
            gruposPorEmpresa.UNIFICADO = [...gruposPorEmpresa.GABTEC, ...gruposPorEmpresa.FRENOS];
            delete gruposPorEmpresa.GABTEC;
            delete gruposPorEmpresa.FRENOS;
        }

        const productosParaModelo = (productos) => productos.map(p => ({
            codigo: p.sku, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento, empresa: p.empresa
        }));

        // insertar un pedido (cabecera + detalle + reserva dmz) por cada empresa presente
        const pedidos = [];
        for (const [empresa, productosGrupo] of Object.entries(gruposPorEmpresa)) {
            const pedcorint = await obtenerCorrelativoPorEmpresa(empresa);
            const sucursal = SUCURSAL_POR_EMPRESA[empresa] || {};

            const pedido = await insertPedidoEmpresa(db, {
                empresa, pedcorint, rut, tran_nombre,
                cli_sec: sucursal.cli_sec, cli_conven: sucursal.cli_conven,
                productos: productosParaModelo(productosGrupo),
            });

            pedidos.push({
                ...pedido,
                direccion_despacho: sucursal.direccion || null,
                comuna: sucursal.comuna || null,
            });
        }

        await db.commit();

        res.status(201).json({
            message: alertas.length > 0 ? "Pedido creado parcialmente: algunas empresas quedaron fuera (ver alertas)" : "Pedido creado exitosamente",
            pedidos,
            alertas,
            datos_cliente: {
                rut: rut,
                condicion_pago
            },
            detalle_productos: productosFinales.map(p => ({
                sku: p.sku, descripcion: p.titulo || "Producto", cantidad: p.cantidad, precio_unitario: p.precio, descuento: p.descuento, empresa: p.empresa
            })),
        });

    } catch (error) {
        await db.rollback();
        console.error("Error creando pedido:", error.message);

        const status = error instanceof ValidationError ? 400 : 500;
        res.status(status).json({
            message: "No se pudo procesar el pedido",
            error_detail: error.message
        });
    } finally {
        db.release();
    }
};

// Portado desde producción (v1): ficha de un producto por SKU + sus equivalencias OEM.
const getProductbyIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "El parametro id es requerido!" });

    const product = await getProductById(id);
    const oem = await getOemById(id);
    const productsImg = await prepareHateoas(product);

    if (productsImg.length > 0) {
      productsImg[0].oem = oem.length > 0 ? oem : [];
    }

    if (productsImg.length > 0) {
      res.status(200).json(productsImg);
    } else {
      res.status(404).json({ message: "Producto no encontrado" });
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
};

// Portado desde producción: info de una publicación de Mercado Libre.
const getInfoTRController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "El parametro COD de publicacion es requerido!" });

    const product = await getInfoTR(id);

    if (product.length > 0) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: "Producto no encontrado" });
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
};

// Portado desde producción: volumetría/peso de un producto (para WMS).
const getVolumetriaWmsController = async (req, res) => {
  try {
    const { producto } = req.params;
    if (!producto) return res.status(400).json({ message: "El parametro COD de producto es requerido!" });

    const product = await getVolumetriaWms(producto);

    if (product.length > 0) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: "Producto no encontrado" });
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
};

// Portado desde producción: listado paginado de recetas de compatibilidad para Mercado Libre.
const getAllRecetasController = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 500;
    const offset = (page - 1) * limit;

    const { data, total } = await getAllRecetas(limit, offset);
    const totalPages = Math.ceil(total / limit);

    res.json({
      info: {
        total_records: total,
        total_pages: totalPages,
        current_page: page,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null
      },
      results: data
    });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener datos", error });
  }
};

// Portado desde producción: listado paginado de imágenes de productos (Daito/Disam).
const getImagenesProductosController = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 500;
    let empresa = req.query.empresa || null;

    if (empresa === 'gabtec') empresa = 10;
    else if (empresa === 'autotec') empresa = 2;
    else if (empresa === 'automarco') empresa = 1;

    const offset = (page - 1) * limit;

    const { data, total } = await getImagenesProductos(limit, offset, empresa);
    const totalPages = Math.ceil(total / limit);

    res.json({
      info: {
        total_records: total,
        total_pages: totalPages,
        current_page: page,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null
      },
      results: data
    });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener datos", error });
  }
};


export {
  getStockProductsController,
  getOCdefinitivaController,
  insertarPedidosRepSolController,
  getProductbyIdController,
  getInfoTRController,
  getVolumetriaWmsController,
  getAllRecetasController,
  getImagenesProductosController
};

