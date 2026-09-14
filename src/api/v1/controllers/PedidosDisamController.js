import {
  validarPedidoEmpresa,
  obtenerCorrelativo,
  insertPedido,
  limpiarEmpresa,
  obtenerTotal
} from "../models/pedidos_disam.js";

// Portado desde producción (v1): recibe órdenes de Mercado Libre/Daito y las
// inserta en bd_daito_disam (ver notas de diseño en pedidos_disam.js).
const insertarPedidosDisamController = async (req, res) => {
  try {
    const { productos, cabecera } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ message: "El pedido debe incluir al menos un producto." });
    }
    if (!Array.isArray(cabecera) || cabecera.length === 0) {
      return res.status(400).json({ message: "El pedido debe incluir la cabecera (numero_orden, etiqueta_zpl)." });
    }

    const pedidoEmpresa = await validarPedidoEmpresa(productos);
    const correlativo = await obtenerCorrelativo(0, pedidoEmpresa);
    const pedido = await insertPedido(pedidoEmpresa, correlativo, productos, cabecera[0].numero_orden, cabecera[0].etiqueta_zpl);

    limpiarEmpresa(productos);

    const total = obtenerTotal(productos);

    const response = {
      pedido: [{
        pedido: `${pedido}`,
        code: 200,
        status: "OK",
        message: "Pedido creado correctamente",
        fecha: new Date().toISOString().split('T')[0],
        hora: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[1].split('.')[0],
        transporte: "MELI",
        total
      }],
      productos
    };

    res.status(200).json(response);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "No se pudo procesar la orden", error_detail: error.message });
  }
};

export { insertarPedidosDisamController };
