// Portado desde producción (v1): flujo de pedidos para órdenes que llegan de
// Mercado Libre / Daito ("Disam"). A diferencia de insertarPedidosRepSolController
// (productsModel.js), acá NO hay un cliente real detrás de cada pedido: todas las
// órdenes de un mismo canal (Mercado Libre) se registran contra una cuenta fija
// por empresa, por eso el RUT va hardcodeado a propósito (no es el mismo bug que
// se corrigió en el flujo de pedidos normal). Confirmar con el equipo si estos
// RUTs (76073217 / 76967772) siguen siendo las cuentas correctas antes de usar
// esto en producción.
import connection from "../../../../config/bdPedidosApi.js";

const obtenerEmpresa = async (prod_id) => {
  try {
    const [result] = await connection.execute(
      `SELECT prod_id, 'HD' as empresa, prod_precio, prod_nombre2 as nombre, IFNULL(b.multiplo, 1) multiplo FROM autohd_automarcohd.tbl_productos a
      left join autohd_automarcohd.tbl_productos_multiplos b on a.prod_id = b.id_prod WHERE prod_id = ? and prod_estado = 1
      UNION
      SELECT prod_id, 'AUTOMARCO' as empresa, prod_precio, prod_nombre_2 as nombre, IFNULL(b.multiplo, 1) multiplo FROM automarc_automarco.tbl_productos2 a
      left join automarc_automarco.tbl_productos_multiplos b on a.prod_id = b.id_prod WHERE prod_id = ? and prod_estado = 1
      UNION
      SELECT prod_id, 'AUTOTEC' as empresa, prod_precio, prod_nombre as nombre, IFNULL(b.multiplo, 1) multiplo FROM autotec_ecom.tbl_productos a
      left join autotec_ecom.tbl_productos_multiplos b on a.prod_id = b.id_prod WHERE prod_id = ? and prod_estado = 1
      UNION
      SELECT prod_id, 'GABTEC' as empresa, prod_precio, prod_nombre as nombre, IFNULL(b.multiplo, 1) multiplo FROM gabteccl_sitbdd1978.tbl_productos a
      left join gabteccl_sitbdd1978.tbl_productos_multiplos b on a.prod_id = b.id_prod WHERE a.prod_id = ? and prod_estado = 1
      UNION
      SELECT prod_id, 'FRENOS' as empresa, prod_precio, prod_nombre as nombre, IFNULL(b.multiplo, 1) multiplo FROM gabteccl_sitbdd1978.tbl_productos a
      left join gabteccl_sitbdd1978.tbl_productos_multiplos b on a.prod_id = b.id_prod WHERE prod_id = ? and prod_estado2 = 1;`,
      [prod_id, prod_id, prod_id, prod_id, prod_id]
    );
    return result;
  } catch (error) {
    console.error("Error al obtener datos de la empresa:", error);
    return [];
  }
};

const obtenerDescuentoEmpresa = async (prod_id, empresa) => {
  try {
    let descuento = 0;
    let descuento_cliente = 0;
    let descuento_producto = 0;

    if (empresa.toUpperCase() == "AUTOTEC") {
      const [descCliente] = await connection.execute(
        `SELECT cli_descuento FROM autotec_ecom.tbl_clientes WHERE cli_rut like '%76967772%'
          order by cli_descuento desc LIMIT 1;`
      );
      descuento_cliente = descCliente[0]?.cli_descuento || 0;

      const [producto] = await connection.execute(
        `SELECT prod_desc FROM autotec_ecom.tbl_productos WHERE prod_estado = 1 and prod_id = ?`,
        [prod_id]
      );
      descuento_producto = producto[0]?.prod_desc || 0;
      descuento = descuento_producto == 1 ? 0 : descuento_cliente;
    }

    if (empresa.toUpperCase() == "GABTEC") {
      const [descCliente] = await connection.execute(
        `SELECT cli_descuento FROM gabteccl_sitbdd1978.tbl_clientes WHERE cli_rut like '%76073217%'
          order by cli_descuento desc LIMIT 1;`
      );
      descuento_cliente = descCliente[0]?.cli_descuento || 0;

      const [producto] = await connection.execute(
        `SELECT prod_desc FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_estado = 1 and prod_id = ?`,
        [prod_id]
      );
      descuento_producto = producto[0]?.prod_desc || 0;
      descuento = descuento_producto == 1 ? 0 : descuento_cliente;
    }

    if (empresa.toUpperCase() == "FRENOS") {
      const [descCliente] = await connection.execute(
        `SELECT cli_dcto2 FROM gabteccl_sitbdd1978.tbl_clientes WHERE cli_rut like '%76073217%'
          order by cli_descuento desc LIMIT 1;`
      );
      descuento_cliente = descCliente[0]?.cli_dcto2 || 0;

      const [producto] = await connection.execute(
        `SELECT prod_desc FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_estado2 = 1 and prod_id = ?`,
        [prod_id]
      );
      descuento_producto = producto[0]?.prod_desc || 0;
      descuento = descuento_producto == 1 ? 0 : descuento_cliente;
    }

    if (empresa.toUpperCase() == "AUTOMARCO") {
      const [descCliente] = await connection.execute(
        `SELECT cli_descuento FROM automarc_automarco.tbl_clientes WHERE cli_rut like '%76073217%'
          order by cli_descuento desc LIMIT 1;`
      );
      descuento_cliente = descCliente[0]?.cli_descuento || 0;

      const [producto] = await connection.execute(
        `SELECT prod_desc FROM automarc_automarco.tbl_productos2 WHERE prod_estado = 1 and prod_id = ?`,
        [prod_id]
      );
      descuento_producto = producto[0]?.prod_desc || 0;
      descuento = descuento_producto == 1 ? 0 : descuento_cliente;
    }

    if (empresa.toUpperCase() == "HD") {
      const [descCliente] = await connection.execute(
        `SELECT cli_descuento FROM autohd_automarcohd.tbl_clientes WHERE cli_rut like '%76073217%'
          order by cli_descuento desc LIMIT 1;`
      );
      descuento_cliente = descCliente[0]?.cli_descuento || 0;

      const [producto] = await connection.execute(
        `SELECT prod_desc FROM autohd_automarcohd.tbl_productos WHERE prod_estado = 1 and prod_id = ?`,
        [prod_id]
      );
      descuento_producto = producto[0]?.prod_desc || 0;
      descuento = descuento_producto == 1 ? 0 : descuento_cliente;
    }

    return descuento;
  } catch (error) {
    console.error("Error al obtener datos de la empresa:", error);
    return 0;
  }
};

// procesa la lista de productos: asigna precio, empresa, y ajusta la cantidad
// al múltiplo de venta del producto si corresponde (ej. cajas de N unidades).
const validarPedidoEmpresa = async (productos) => {
  let automarco = 0, autotec = 0, gabtec = 0, frenos = 0, hd = 0;

  const array_prod_emp = await Promise.all(
    productos.map(async (v) => {
      const empresa = await obtenerEmpresa(v.codigo);
      const descuento = await obtenerDescuentoEmpresa(v.codigo, empresa[0].empresa);

      if (descuento == 0) {
        v.precio = empresa[0].prod_precio;
      } else {
        const factor = descuento / 100;
        v.precio = empresa[0].prod_precio - (empresa[0].prod_precio * factor);
      }

      const multiplo = empresa[0].multiplo || 1;
      if (multiplo === 1) {
        v.cantidad_ajustada = v.cantidad;
      } else if (v.cantidad % multiplo !== 0) {
        v.cantidad_ajustada = Math.ceil(v.cantidad / multiplo) * multiplo;
        v.cantidad_solicitada = v.cantidad;
        v.cantidad = v.cantidad_ajustada;
      } else {
        v.cantidad_ajustada = v.cantidad;
      }

      v.empresa = empresa[0].empresa;
      v.titulo = empresa[0].nombre;
      v.code = 200;
      v.status = "OK";
      v.message = "Producto agregado";

      return v;
    })
  );

  array_prod_emp.forEach((p) => {
    if (p.empresa == "AUTOMARCO") automarco++;
    else if (p.empresa == "AUTOTEC") autotec++;
    else if (p.empresa == "GABTEC") gabtec++;
    else if (p.empresa == "FRENOS") frenos++;
    else if (p.empresa == "HD") hd++;
  });

  if (gabtec > 0 && frenos > 0) return "UNIFICADO";
  if (autotec > 0) return "AUTOTEC";
  if (automarco > 0) return "AUTOMARCO";
  if (hd > 0) return "HD";
  if (gabtec > 0 && frenos == 0) return "GABTEC";
  if (gabtec == 0 && frenos > 0) return "FRENOS";
};

const obtenerCorrelativo = async (pedvensec, empresa) => {
  try {
    let emp = "", pedvenrut = "";

    if (empresa.toUpperCase() == "AUTOMARCO") { emp = "bd_hautomarco.tbl_pedidos"; pedvenrut = "93"; }
    else if (empresa.toUpperCase() == "GABTEC" || empresa.toUpperCase() == "UNIFICADO") { emp = "bd_automarco.tbl_pedidos"; pedvenrut = "93"; }
    else if (empresa.toUpperCase() == "FRENOS") { emp = "bd_automarco.tbl_pedidos"; pedvenrut = "94"; }
    else if (empresa.toUpperCase() == "AUTOTEC") { emp = "bd_autotec.tbl_pedidos"; pedvenrut = "93"; }
    else if (empresa.toUpperCase() == "HD") { emp = "bd_hdautomarco.tbl_pedidos"; pedvenrut = "93"; }

    const [result] = await connection.execute(
      `SELECT (PEDCORINT+1) PEDCORINT FROM ${emp}
      WHERE PEDVENRUT= ? AND PEDVENSEC= ? ORDER BY PEDCORINT DESC LIMIT 1`,
      [pedvenrut, pedvensec]
    );

    return result[0].PEDCORINT;
  } catch (error) {
    console.error("Error al obtener correlativo:", error);
    throw error;
  }
};

const insertPedido = async (empresa, pedcorint, productos, nota_ml, etiqueta_zpl) => {
  try {
    let emp = "", unificado = 0, pedvenrut = "", empresaRDS = 0;

    if (empresa.toUpperCase() == "AUTOMARCO") { emp = "bd_hautomarco.tbl_pedidos"; pedvenrut = 93; empresaRDS = 1; }
    else if (empresa.toUpperCase() == "GABTEC") { emp = "bd_automarco.tbl_pedidos"; pedvenrut = 93; empresaRDS = 10; }
    else if (empresa.toUpperCase() == "FRENOS") { emp = "bd_automarco.tbl_pedidos"; pedvenrut = 94; empresaRDS = 14; }
    else if (empresa.toUpperCase() == "AUTOTEC") { emp = "bd_autotec.tbl_pedidos"; pedvenrut = 93; empresaRDS = 3; }
    else if (empresa.toUpperCase() == "HD") { emp = "bd_hdautomarco.tbl_pedidos"; pedvenrut = 93; empresaRDS = 6; }
    else if (empresa.toUpperCase() == "UNIFICADO") { emp = "bd_automarco.tbl_pedidos"; pedvenrut = 93; empresaRDS = 10; unificado = 1; }

    // RUT/sucursal fijos: cuenta de la integración Mercado Libre/Daito, no un cliente real (ver nota al inicio del archivo).
    await connection.execute(
      `INSERT INTO ${emp} (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES ( ? ,0, ? ,now(),0,76073217,0);`,
      [pedvenrut, pedcorint]
    );

    await connection.execute(
      `INSERT INTO bd_daito_disam.tbl_pedidos (id_pedido, fecha, estado, empresa, pedvenrut, pedcorint, unificado, numero_orden, etiqueta_zpl ) VALUES (NULL,now(),0, ? , ? , ? , ?, ? , ?);`,
      [empresaRDS, pedvenrut, pedcorint, unificado, nota_ml, etiqueta_zpl]
    );

    for (const p of productos) {
      await connection.execute(
        `INSERT INTO bd_daito_disam.tbl_pedidos_detalle (id_detalle, pedido_id, prod_id, cantidad, empresa, pedcorint, pedvenrut) VALUES (NULL,0, ? , ? , ? , ? , ?);`,
        [p.codigo, p.cantidad, p.empresa, pedcorint, pedvenrut]
      );
    }

    return pedvenrut + "-" + pedcorint;
  } catch (error) {
    console.error("Error al Insertar el pedido:", error);
    throw error;
  }
};

const limpiarEmpresa = (productos) => {
  productos.forEach((v) => { delete v.empresa; });
};

const obtenerTotal = (productos) => {
  let total = 0;
  productos.forEach((v) => { total += v.precio * v.cantidad; });
  return total;
};

export {
  obtenerEmpresa,
  obtenerDescuentoEmpresa,
  validarPedidoEmpresa,
  obtenerCorrelativo,
  insertPedido,
  limpiarEmpresa,
  obtenerTotal
};
