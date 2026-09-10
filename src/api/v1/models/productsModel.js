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

// calcula el correlativo
const obtenerCorrelativo = async () => {
    try {
        //consultar máximo en la API nueva
        const [resApi] = await connection.execute(`SELECT MAX(pedcorint) as maximo FROM bd_api_automarco.tbl_pedidos`);
        const maxApi = resApi[0]?.maximo || 0;
        
        //consultar máximos en dmz
        const [resAuto] = await connection.execute(`SELECT MAX(PEDCORINT) as maximo FROM bd_hautomarco.tbl_pedidos WHERE PEDVENRUT = 93`);
        const [resGab] = await connection.execute(`SELECT MAX(PEDCORINT) as maximo FROM bd_automarco.tbl_pedidos WHERE PEDVENRUT = 93`);
        const [resFrenos] = await connection.execute(`SELECT MAX(PEDCORINT) as maximo FROM bd_automarco.tbl_pedidos WHERE PEDVENRUT = 94`);
        const [resHD] = await connection.execute(`SELECT MAX(PEDCORINT) as maximo FROM bd_hdautomarco.tbl_pedidos WHERE PEDVENRUT = 93`);
        const [resAutotec] = await connection.execute(`SELECT MAX(PEDCORINT) as maximo FROM bd_autotec.tbl_pedidos WHERE PEDVENRUT = 93`);

        //obtener el valor más alto histórico
        const techoMaximo = Math.max(
            maxApi, 
            resAuto[0]?.maximo || 0, 
            resGab[0]?.maximo || 0, 
            resFrenos[0]?.maximo || 0, 
            resHD[0]?.maximo || 0, 
            resAutotec[0]?.maximo || 0
        );
        
        console.log(`🔢 Correlativo generado: ${techoMaximo + 1}`);
        return techoMaximo + 1; 

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


const insertPedido = async (db, data, productos) => {
  //inserta pedido en base pedidos_api
    const sqlHeader = `
        INSERT INTO bd_api_automarco.tbl_pedidos
        (
            fecha, estado, pedvenrut, pedcorint, unificado, tran_nombre, cli_rut,
            cli_sec_automarco, cli_conven_automarco,
            cli_sec_autotec, cli_conven_autotec,
            cli_sec_hd, cli_conven_hd,
            cli_sec_gabtec, cli_conven_gabtec
        ) 
        VALUES (NOW(), 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valuesHeader = [
        data.pedvenrut, data.pedcorint, data.unificado, data.tran_nombre, data.rut,
        data.secAutomarco, data.convenAutomarco,
        data.secAutotec, data.convenAutotec,
        data.secHD, data.convenHD,
        data.secGabtec, data.convenGabtec
    ];

    const [resultHeader] = await db.execute(sqlHeader, valuesHeader);
    const idPedidoGenerado = resultHeader.insertId;

   //inserta detalle del pedido en base pedidos_api
    if (productos && productos.length > 0) {
        const sqlDetalle = `
            INSERT INTO bd_api_automarco.tbl_pedidos_detalle (pedido_id, prod_id, cantidad, empresa, pedcorint)
            VALUES (?, ?, ?, ?, ?)
        `;
        for (const prod of productos) {
            await db.execute(sqlDetalle, [
                idPedidoGenerado, prod.codigo, prod.cantidad, prod.empresa, data.pedcorint
            ]);
        }
    }

    //inserta pedido dmz

    // AUTOMARCO
    if (data.secAutomarco) {
        await db.execute(
            `INSERT INTO bd_hautomarco.tbl_pedidos (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (93, 0, ?, NOW(), 0, ?, ?)`,
            [data.pedcorint, data.rut, data.secAutomarco]
        );
    }

    // AUTOTEC
    if (data.secAutotec) {
        await db.execute(
            `INSERT INTO bd_autotec.tbl_pedidos (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (93, 0, ?, NOW(), 0, ?, ?)`,
            [data.pedcorint, data.rut, data.secAutotec]
        );
    }

    //  HD 
    if (data.secHD) {
        await db.execute(
            `INSERT INTO bd_hdautomarco.tbl_pedidos (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (93, 0, ?, NOW(), 0, ?, ?)`,
            [data.pedcorint, data.rut, data.secHD]
        );
    }

    //  GABTEC
    if (data.secGabtec) {
      //si todos son frenos inserta en 94, si no en 93
        const esSoloFrenos = productos.some(p => p.empresa === 'FRENOS') && !productos.some(p => p.empresa === 'GABTEC');
        const rutVendedor = esSoloFrenos ? 94 : 93;

        await db.execute(
            `INSERT INTO bd_automarco.tbl_pedidos (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (?, 0, ?, NOW(), 0, ?, ?)`,
            [rutVendedor, data.pedcorint, data.rut, data.secGabtec]
        );
    }

    return idPedidoGenerado;
};

export {
  getStockProducts,
  obtenerDescuentoEmpresa,
  validarPedidoEmpresa,
  limpiarEmpresa,
  obtenerNombreTransporte,
  obtenerCondpagoPorSucursal,
  obtenerDireccionSucursal,
  obtenerCorrelativo,
  getOCdefinitiva,
  insertPedido,
};