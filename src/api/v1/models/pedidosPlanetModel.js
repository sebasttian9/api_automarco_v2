import connection from "../../../../config/bdPedidosApi.js";

// Acceso a las tablas del webhook de Grupo Planet (ver sql/planet_oc.sql).

// Otra peticion con la misma OC la esta procesando en este momento (Planet
// reintenta hasta 3 veces si no respondemos a tiempo).
class OCEnProcesoError extends Error {
  constructor(numero_oc) {
    super(`La OC ${numero_oc} se está procesando en este momento.`);
    this.name = "OCEnProcesoError";
  }
}

// Una OC en 'recibida' por mas de este tiempo se considera abandonada (ej. el
// proceso se cayo a mitad de camino) y se puede volver a tomar.
const MINUTOS_OC_ABANDONADA = 2;

const buscarOC = async (numero_oc) => {
  const [rows] = await connection.execute(
    `SELECT id, estado, pedidos, error_detalle FROM bd_api_automarco.tbl_planet_oc WHERE numero_oc = ?`,
    [numero_oc]
  );
  return rows[0] || null;
};

// Guarda la OC recibida (estado 'recibida') junto a sus items. Si la OC ya
// existia (reintento de una que quedo con error), se reemplazan sus datos.
// Tomar la OC es atomico: si otra peticion la tiene en 'recibida' (en proceso),
// se lanza OCEnProcesoError en vez de procesarla dos veces.
const guardarOCRecibida = async (oc, existenteId = null) => {
  const db = await connection.getConnection();
  try {
    await db.beginTransaction();

    const valores = [
      oc.fecha_oc, oc.cliente, oc.moneda, oc.proveedor_rut, oc.proveedor_codigo,
      oc.despacho_centro, oc.despacho_direccion, oc.total_neto, oc.total_bruto,
      oc.payload, oc.pdf_path, oc.codigo_cliente ?? null,
    ];

    let ocId = existenteId;
    if (existenteId) {
      const [r] = await db.execute(
        `UPDATE bd_api_automarco.tbl_planet_oc
         SET fecha_oc = ?, cliente = ?, moneda = ?, proveedor_rut = ?, proveedor_codigo = ?,
             despacho_centro = ?, despacho_direccion = ?, total_neto = ?, total_bruto = ?,
             payload = ?, pdf_path = ?, codigo_cliente = ?, estado = 'recibida', error_detalle = NULL,
             alertas = NULL, intentos = intentos + 1, fecha_recepcion = NOW(), fecha_proceso = NULL
         WHERE id = ?
           AND (estado = 'con_error'
                OR (estado = 'recibida' AND fecha_recepcion < NOW() - INTERVAL ${MINUTOS_OC_ABANDONADA} MINUTE))`,
        [...valores, existenteId]
      );
      if (r.affectedRows === 0) throw new OCEnProcesoError(oc.numero_oc);
      await db.execute(`DELETE FROM bd_api_automarco.tbl_planet_oc_items WHERE oc_id = ?`, [existenteId]);
    } else {
      const [r] = await db.execute(
        `INSERT INTO bd_api_automarco.tbl_planet_oc
         (fecha_oc, cliente, moneda, proveedor_rut, proveedor_codigo, despacho_centro,
          despacho_direccion, total_neto, total_bruto, payload, pdf_path, codigo_cliente, numero_oc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...valores, oc.numero_oc]
      );
      ocId = r.insertId;
    }

    for (const it of oc.items) {
      await db.execute(
        `INSERT INTO bd_api_automarco.tbl_planet_oc_items
         (oc_id, item, codigo_planet, orden_servicio, descripcion, cantidad, um, precio_oc, descuento_oc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ocId, it.item, it.codigo_planet, it.orden_servicio, it.descripcion, it.cantidad, it.um, it.precio_oc, it.descuento_oc]
      );
    }

    await db.commit();
    return ocId;
  } catch (error) {
    await db.rollback();
    // mismo numero_oc insertado al mismo tiempo por otra peticion
    if (error.code === "ER_DUP_ENTRY") throw new OCEnProcesoError(oc.numero_oc);
    throw error;
  } finally {
    db.release();
  }
};

// Se llama con la misma conexion/transaccion que inserta los pedidos: o quedan
// el pedido y la OC 'procesada' juntos, o ninguno (asi un reintento nunca
// encuentra un pedido ya creado con la OC todavia en 'recibida').
const marcarOCProcesada = async (db, ocId, pedidos, alertas) => {
  await db.execute(
    `UPDATE bd_api_automarco.tbl_planet_oc
     SET estado = 'procesada', pedidos = ?, alertas = ?, error_detalle = NULL, fecha_proceso = NOW()
     WHERE id = ?`,
    [pedidos, alertas || null, ocId]
  );
};

const marcarOCConError = async (ocId, detalle) => {
  await connection.execute(
    `UPDATE bd_api_automarco.tbl_planet_oc
     SET estado = 'con_error', error_detalle = ?, fecha_proceso = NOW()
     WHERE id = ?`,
    [String(detalle).slice(0, 5000), ocId]
  );
};

// deja registrado en cada item lo que se resolvio (sku, empresa, precio de lista)
const actualizarItemResuelto = async (ocId, item, datos) => {
  await connection.execute(
    `UPDATE bd_api_automarco.tbl_planet_oc_items
     SET sku = ?, empresa = ?, precio_lista = ?, descuento = ?
     WHERE oc_id = ? AND item <=> ?`,
    [datos.sku, datos.empresa, datos.precio_lista, datos.descuento, ocId, item]
  );
};

// codigo de Planet -> SKU nuestro (solo cuando orden_servicio viene vacio)
const buscarSkuPorCodigoPlanet = async (codigo_planet) => {
  const [rows] = await connection.execute(
    `SELECT sku FROM bd_api_automarco.tbl_planet_productos WHERE codigo_planet = ?`,
    [codigo_planet]
  );
  return rows[0]?.sku || null;
};

// codigo del local de Planet (ej. "AP0031") + empresa -> cli_sec del cliente Planet
const buscarSucursalPorCodigo = async (codigo_planet, empresa) => {
  const [rows] = await connection.execute(
    `SELECT cli_sec FROM bd_api_automarco.tbl_planet_despachos
     WHERE codigo_planet = ? AND empresa = ?`,
    [codigo_planet, empresa]
  );
  return rows[0]?.cli_sec ?? null;
};

// direccion de despacho normalizada + empresa -> cli_sec del cliente Planet
// (respaldo cuando el codigo no esta cargado)
const buscarSucursalDespacho = async (direccion_normalizada, empresa) => {
  const [rows] = await connection.execute(
    `SELECT cli_sec FROM bd_api_automarco.tbl_planet_despachos
     WHERE direccion_normalizada = ? AND empresa = ?`,
    [direccion_normalizada, empresa]
  );
  return rows[0]?.cli_sec ?? null;
};

export {
  OCEnProcesoError,
  buscarOC,
  guardarOCRecibida,
  marcarOCProcesada,
  marcarOCConError,
  actualizarItemResuelto,
  buscarSkuPorCodigoPlanet,
  buscarSucursalPorCodigo,
  buscarSucursalDespacho,
};
