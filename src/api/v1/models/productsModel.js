import connection from "../../../../config/bdPedidosApi.js";



const getStockProducts = async (empresa, prod_id, cantidad) => {
  try {
    let resultado = [];
    
 
    let empresaData = await obtenerEmpresa(prod_id);

    if (empresaData.length == 0) return [];
    const nombreEmpresa = empresaData[0].empresa;

    if (nombreEmpresa == "AUTOTEC") {
      const [rows] = await connection.execute(`SELECT prod_id, prod_stock FROM autotec_ecom.tbl_productos WHERE prod_estado = 1 and prod_id = ? and prod_stock > 5 `, [prod_id]);
      resultado = rows;
    } else if (nombreEmpresa == "GABTEC") {
      const [rows] = await connection.execute(`SELECT prod_id, prod_stock FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_id = ? and prod_estado = 1 and prod_stock > 5;`, [prod_id]);
      resultado = rows;
    } else if (nombreEmpresa == "FRENOS") {
      const [rows] = await connection.execute(`SELECT prod_id, prod_stock FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_id = ? and prod_estado2 = 1 and prod_stock > 5;`, [prod_id]);
      resultado = rows;
    } else if (nombreEmpresa == "AUTOMARCO") {
      const [rows] = await connection.execute(`SELECT prod_id, prod_stock FROM automarc_automarco.tbl_productos2 where prod_id = ? and prod_estado = 1 and prod_stock > 5;`, [prod_id]);
      resultado = rows;
    } else if (nombreEmpresa == "HD") {
      const [rows] = await connection.execute(`SELECT prod_id, prod_stock FROM autohd_automarcohd.tbl_productos where prod_id = ? and prod_estado = 1 and prod_stock > 5;`, [prod_id]);
      resultado = rows;
    }


    if (resultado.length > 0 && resultado[0].prod_stock > cantidad) {
      return resultado;
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error al obtener stock:", error);
    return [];
  }
};


const obtenerEmpresa = async (prod_id) => {
  try {
    const [result] = await connection.execute(
      `SELECT prod_id, 'HD' as empresa, prod_precio, prod_nombre2 as nombre FROM autohd_automarcohd.tbl_productos WHERE prod_id = ? and prod_estado = 1
       UNION
       SELECT prod_id, 'AUTOMARCO' as empresa, prod_precio, prod_nombre_2 as nombre FROM automarc_automarco.tbl_productos2 WHERE prod_id = ? and prod_estado = 1
       UNION
       SELECT prod_id, 'AUTOTEC' as empresa, prod_precio, prod_nombre as nombre FROM autotec_ecom.tbl_productos WHERE prod_id = ? and prod_estado = 1
       UNION
       SELECT prod_id, 'GABTEC' as empresa, prod_precio, prod_nombre as nombre FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_id = ? and prod_estado = 1
       UNION
       SELECT prod_id, 'FRENOS' as empresa, prod_precio, prod_nombre as nombre FROM gabteccl_sitbdd1978.tbl_productos WHERE prod_id = ? and prod_estado2 = 1;`,
      [prod_id, prod_id, prod_id, prod_id, prod_id]
    );
    return result;
  } catch (error) {
    console.error("Error al obtener empresa:", error);
    return [];
  }
};



const obtenerDescuentoEmpresa = async (prod_id, empresa, rut_cliente) => {
  try {
    const rutSeguro = rut_cliente || null;
    let tablaClientes = "", tablaProductos = "";
    let colDescCli = "cli_descuento", colEstadoProd = "prod_estado";
    let colProdDesc = "prod_desc"; 

    switch (empresa.toUpperCase()) {
      case "AUTOTEC":   
          tablaClientes = "autotec_ecom.tbl_clientes"; 
          tablaProductos = "autotec_ecom.tbl_productos"; 
          break;
      case "GABTEC":    
          tablaClientes = "gabteccl_sitbdd1978.tbl_clientes"; 
          tablaProductos = "gabteccl_sitbdd1978.tbl_productos"; 
          break;
      case "FRENOS":    
          tablaClientes = "gabteccl_sitbdd1978.tbl_clientes"; 
          tablaProductos = "gabteccl_sitbdd1978.tbl_productos"; 
          colDescCli = "cli_dcto2"; 
          colEstadoProd = "prod_estado2"; 
          break;
      case "AUTOMARCO": 
          tablaClientes = "automarc_automarco.tbl_clientes"; 
          tablaProductos = "automarc_automarco.tbl_productos2"; 
          break;
      case "HD":        
          tablaClientes = "autohd_automarcohd.tbl_clientes"; 
          tablaProductos = "autohd_automarcohd.tbl_productos"; 
          break;
      default: return 0;
    }

    const [descCliente] = await connection.execute(
      `SELECT ${colDescCli} as descuento FROM ${tablaClientes} WHERE cli_rut = ? ORDER BY ${colDescCli} DESC LIMIT 1;`, 
      [rutSeguro]
    );
    const dCliente = descCliente[0]?.descuento || 0;

    const [infoProducto] = await connection.execute(
      `SELECT prod_desc FROM ${tablaProductos} WHERE prod_id = ?`, 
      [prod_id]
    );
    const esNeto = infoProducto[0]?.prod_desc || 0; 

    if (esNeto == 1) {
        return 0;
    }

    return dCliente;

  } catch (error) {
    console.error(`Error calculando descuento ${empresa}:`, error.message);
    return 0;
  }
};

// procesa la lista de productos para asignar precios finales y determinar la empresa global
const validarPedidoEmpresa = async (productos, cli_rut) => { 
  let automarco = 0, autotec = 0, gabtec = 0, frenos = 0, hd = 0;

  // recorremos cada producto para asignar precio y empresa
  const array_prod_emp = await Promise.all(
    productos.map(async (v) => {
      //  identifica empresa a la que pertenece el producto
      const empresaData = await obtenerEmpresa(v.sku);
      
      if (!empresaData || empresaData.length === 0) {
         v.precio = 0;
         v.empresa = "DESCONOCIDA";
         return v;
      }
      
      const empresaNombre = empresaData[0].empresa;
      const precioBase = Number(empresaData[0].prod_precio);

      //  calcular descuento
      const descuento = await obtenerDescuentoEmpresa(v.sku, empresaNombre, cli_rut);
      
      //  aplica precio final
      if(descuento == 0){
        v.precio = precioBase;
      } else {
        let factor = (descuento / 100);
        let precioFinal = precioBase - (precioBase * factor);
        v.precio = Math.round(precioFinal);
      }
      
      v.empresa = empresaNombre;      
      v.titulo = empresaData[0].nombre;
      return v;
    })
  );

  // contabiliza cuántos productos hay de cada empresa
  array_prod_emp.forEach((p) => {
    if (p.empresa == "AUTOMARCO") automarco++;
    else if (p.empresa == "AUTOTEC") autotec++;
    else if (p.empresa == "GABTEC") gabtec++;
    else if (p.empresa == "FRENOS") frenos++;
    else if (p.empresa == "HD") hd++;
  });

  // logica de "Empresa Dominante" para determinar si es Pedido Unificado o Individual
  if (gabtec > 0 && frenos > 0) return "UNIFICADO";
  if (autotec > 0) return "AUTOTEC";
  if (automarco > 0) return "AUTOMARCO";
  if (hd > 0) return "HD";
  if (gabtec > 0 && frenos == 0) return "GABTEC";
  if (gabtec == 0 && frenos > 0) return "FRENOS";
  
  return "AUTOMARCO";
};

const limpiarEmpresa = (productos) => {
  productos.map((v) => { delete v.empresa; });
};


const obtenerNombreTransporte = async (tran_id) => {
    try {
        const [rows] = await connection.execute(
            `SELECT tran_nombre FROM automarc_automarco.tbl_transportes WHERE tran_id = ?`,
            [tran_id]
        );
        return rows[0]?.tran_nombre || "Transporte Desconocido";
    } catch (error) { console.error(error); return "Error Transporte"; }
};

// obtiene la condición de pago asociada a una sucursal específica
const obtenerCondpagoPorSucursal = async (db, rutCliente, codigoSucursal, empresa) => {
    if (!empresa) return null; 
    let tablaClientes = "";

    // selección dinámica de la tabla de clientes
    switch (empresa.toUpperCase()) {
        case "AUTOMARCO": tablaClientes = "automarc_automarco.tbl_clientes"; break;
        case "GABTEC":    
        case "FRENOS":    
        case "UNIFICADO": tablaClientes = "gabteccl_sitbdd1978.tbl_clientes"; break;
        case "AUTOTEC":   tablaClientes = "autotec_ecom.tbl_clientes"; break;
        case "HD":        tablaClientes = "autohd_automarcohd.tbl_clientes"; break;
        default:          tablaClientes = "automarc_automarco.tbl_clientes"; 
    }
    const conn = db || connection; 
    
    // busca cond de pago en la sucursal
    if (codigoSucursal) {
        const sql = `SELECT cli_conven FROM ${tablaClientes} WHERE cli_rut = ? AND cli_sec = ? LIMIT 1`;
        const [rows] = await conn.execute(sql, [rutCliente, codigoSucursal]);
        if (rows.length > 0 && rows[0].cli_conven) return rows[0].cli_conven;
    }

    // Busca en la sucursal 0 si la específica falla
    const sqlMatriz = `SELECT cli_conven FROM ${tablaClientes} WHERE cli_rut = ? AND cli_sec = '0' LIMIT 1`;
    const [rowsMatriz] = await conn.execute(sqlMatriz, [rutCliente]);
    if (rowsMatriz.length > 0) return rowsMatriz[0].cli_conven;
    return null; 
};

// Recupera la dirección física de despacho de una sucursal
const obtenerDireccionSucursal = async (rut, empresa, sucursal) => {
try {
    let tablaClientes = "";
    switch (empresa.toUpperCase()) {
        case "AUTOMARCO": tablaClientes = "automarc_automarco.tbl_clientes"; break;
        case "GABTEC": tablaClientes = "gabteccl_sitbdd1978.tbl_clientes"; break;
        case "FRENOS": tablaClientes = "gabteccl_sitbdd1978.tbl_clientes"; break;
        case "AUTOTEC": tablaClientes = "autotec_ecom.tbl_clientes"; break;
        case "HD": tablaClientes = "autohd_automarcohd.tbl_clientes"; break;
        default: return null;
    }
    const sql = `SELECT cli_direccion, cli_comuna FROM ${tablaClientes} WHERE cli_rut = ? AND cli_sec = ? LIMIT 1`;
    const [rows] = await connection.execute(sql, [rut, sucursal]);
    if (rows.length > 0) {
        return { direccion: rows[0].cli_direccion, comuna: rows[0].cli_comuna || "S/I" };
    }
    return null; 
  } catch (error) { console.error(error); return null; }
};

// mapa de cada empresa a su tabla DMZ y su namespace de correlativo (PEDVENRUT)
const MAPA_DMZ_EMPRESA = {
  AUTOMARCO: { tabla: "bd_hautomarco.tbl_pedidos", pedvenrut: 93 },
  AUTOTEC:   { tabla: "bd_autotec.tbl_pedidos",    pedvenrut: 93 },
  HD:        { tabla: "bd_hdautomarco.tbl_pedidos", pedvenrut: 93 },
  GABTEC:    { tabla: "bd_automarco.tbl_pedidos",   pedvenrut: 93 },
  UNIFICADO: { tabla: "bd_automarco.tbl_pedidos",   pedvenrut: 93 },
  FRENOS:    { tabla: "bd_automarco.tbl_pedidos",   pedvenrut: 94 },
};

// calcula el correlativo propio de una empresa, tomando el máximo de SU tabla DMZ
const obtenerCorrelativoPorEmpresa = async (empresa) => {
    try {
        const config = MAPA_DMZ_EMPRESA[empresa];
        if (!config) throw new Error(`Empresa no reconocida para correlativo: ${empresa}`);

        const [result] = await connection.execute(
            `SELECT MAX(PEDCORINT) as maximo FROM ${config.tabla} WHERE PEDVENRUT = ?`,
            [config.pedvenrut]
        );

        const correlativo = (result[0]?.maximo || 0) + 1;
        console.log(`🔢 Correlativo ${empresa} generado: ${correlativo}`);
        return correlativo;

    } catch (error) {
        console.error("Error correlativo:", error);
        throw error;
    }
};

const getOCdefinitiva = async (empresa, pedcorint, pedvenrut) => {
    try {
      let emp = "";
      if (empresa.toUpperCase() == "AUTOMARCO") emp = "bd_hautomarco.tbl_pedidos";
      else if (empresa.toUpperCase() == "GABTEC") emp = "bd_automarco.tbl_pedidos";
      else if (empresa.toUpperCase() == "FRENOS") emp = "bd_automarco.tbl_pedidos";
      else if (empresa.toUpperCase() == "AUTOTEC") emp = "bd_autotec.tbl_pedidos";
      else if (empresa.toUpperCase() == "HD") emp = "bd_hdautomarco.tbl_pedidos";
      else if (empresa.toUpperCase() == "UNIFICADO") emp = "bd_automarco.tbl_pedidos";

      const [result] = await connection.execute(
        `SELECT PEDNUM FROM ${emp} WHERE PEDVENRUT= ? AND pedcorint= ? ORDER BY PEDCORINT DESC LIMIT 1`,
        [pedvenrut, pedcorint]
      );
      return result[0]?.PEDNUM;
    } catch (error) { console.error(error); return null; }
}


// inserta la cabecera + detalle de UN grupo (una empresa) del pedido, y reserva
// su correlativo en la tabla DMZ correspondiente
const insertPedidoEmpresa = async (db, grupo) => {
    const config = MAPA_DMZ_EMPRESA[grupo.empresa];
    if (!config) throw new Error(`Empresa no reconocida al insertar pedido: ${grupo.empresa}`);

    // inserta la reserva del correlativo en la DMZ de esta empresa.
    // OJO: no se fija PEDESTPRO -> queda en su default (2). El cron que integra
    // estos pedidos en el DMZ ignora las filas con PEDESTPRO=2 y recien las toma
    // cuando otro proceso las pasa a 0; fijarlo aca las procesaria antes de tiempo.
    await db.execute(
        `INSERT INTO ${config.tabla} (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (?, 0, ?, NOW(), 0, ?, ?)`,
        [config.pedvenrut, grupo.pedcorint, grupo.rut, grupo.cli_sec]
    );

    //inserta cabecera del pedido en base pedidos_api
    const sqlHeader = `
        INSERT INTO bd_api_automarco.tbl_pedidos
        (fecha, estado, empresa, pedvenrut, pedcorint, tran_nombre, cli_rut, cli_sec, cli_conven)
        VALUES (NOW(), 0, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valuesHeader = [
        grupo.empresa, config.pedvenrut, grupo.pedcorint, grupo.tran_nombre, grupo.rut,
        grupo.cli_sec, grupo.cli_conven
    ];

    const [resultHeader] = await db.execute(sqlHeader, valuesHeader);
    const idPedidoGenerado = resultHeader.insertId;

    //inserta detalle del pedido en base pedidos_api
    if (grupo.productos && grupo.productos.length > 0) {
        const sqlDetalle = `
            INSERT INTO bd_api_automarco.tbl_pedidos_detalle (pedido_id, prod_id, cantidad, empresa, pedcorint)
            VALUES (?, ?, ?, ?, ?)
        `;
        for (const prod of grupo.productos) {
            await db.execute(sqlDetalle, [
                idPedidoGenerado, prod.codigo, prod.cantidad, prod.empresa, grupo.pedcorint
            ]);
        }
    }

    return { empresa: grupo.empresa, pedido: `${config.pedvenrut}-${grupo.pedcorint}`, id_interno: idPedidoGenerado };
};

export {
  getStockProducts,
  obtenerDescuentoEmpresa,
  validarPedidoEmpresa,
  limpiarEmpresa,
  obtenerNombreTransporte,
  obtenerCondpagoPorSucursal,
  obtenerDireccionSucursal,
  MAPA_DMZ_EMPRESA,
  obtenerCorrelativoPorEmpresa,
  getOCdefinitiva,
  insertPedidoEmpresa,
};