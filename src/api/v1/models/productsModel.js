import connection from "../../../../config/bdPedidosApi.js";
import { ValidationError } from "../helpers/errors.js";



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

// Portado desde producción (v1): ficha de un producto por SKU, buscando en la
// empresa a la que pertenece (vía obtenerEmpresa).
const getProductById = async (prod_id) => {
  try {
    let resultado = [];
    const empresa = await obtenerEmpresa(prod_id);

    if (empresa.length == 0) return [];

    if (empresa[0].empresa == "AUTOTEC") {
      const [rows] = await connection.execute(
        `SELECT prod_id, prod_stock, id_prov, prod_nombre, prod_precio, k.marca_nombre, prod_img
         FROM autotec_ecom.tbl_productos a
         LEFT JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
         WHERE prod_estado = 1 and prod_id = ?`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "GABTEC") {
      const [rows] = await connection.execute(
        `SELECT prod_id, prod_stock, id_prov, prod_nombre, prod_precio, k.marca_nombre, prod_img
         FROM gabteccl_sitbdd1978.tbl_productos a
         LEFT JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
         WHERE prod_id = ? and prod_estado = 1;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "FRENOS") {
      const [rows] = await connection.execute(
        `SELECT prod_id, prod_stock, id_prov, prod_nombre, prod_precio, k.marca_nombre, prod_img
         FROM gabteccl_sitbdd1978.tbl_productos a
         LEFT JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
         WHERE prod_id = ? and prod_estado2 = 1;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "AUTOMARCO") {
      const [rows] = await connection.execute(
        `SELECT prod_id, prod_stock, id_prov, prod_nombre, prod_precio, k.marca_nombre, prod_img
         FROM automarc_automarco.tbl_productos2 a
         LEFT JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
         where prod_id = ? and prod_estado = 1;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "HD") {
      const [rows] = await connection.execute(
        `SELECT prod_id, prod_stock, id_prov, prod_nombre, prod_precio, k.marca_nombre, prod_img
         FROM autohd_automarcohd.tbl_productos a
         LEFT JOIN autohd_automarcohd.tbl_marcas_productos k on a.marca_id = k.marca_id
         where prod_id = ? and prod_estado = 1;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (resultado.length > 0) {
      resultado[0].empresa = empresa[0].empresa;
      return resultado;
    }
    return [];
  } catch (error) {
    console.error("Error al obtener producto por id:", error);
    return [];
  }
};

// Portado desde producción: códigos OEM equivalentes de un producto.
const getOemById = async (prod_id) => {
  try {
    let resultado = [];
    const empresa = await obtenerEmpresa(prod_id);

    if (empresa.length == 0) return [];

    if (empresa[0].empresa == "AUTOTEC") {
      const [rows] = await connection.execute(
        `SELECT a.cod_equivalente, k.marca_nombre FROM autotec_ecom.tbl_prod_equivalente a
         LEFT JOIN automarc_automarco.tbl_marcas_2 k on a.marca_id = k.marca_id
         WHERE tipo_equivalencia = 3 and prod_id = ?;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "GABTEC" || empresa[0].empresa == "FRENOS") {
      const [rows] = await connection.execute(
        `SELECT a.oem, k.marca_nombre FROM gabteccl_sitbdd1978.tbl_productos_oem_unificado a
         LEFT JOIN automarc_automarco.tbl_marcas_2 k on a.marca_id = k.marca_id
         WHERE id_oem_tipo = 3 and prod_id = ?;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "AUTOMARCO") {
      const [rows] = await connection.execute(
        `SELECT a.cod_equivalente, k.marca_nombre FROM automarc_automarco.tbl_prod_equivalente a
         LEFT JOIN automarc_automarco.tbl_marcas_2 k on a.marca_id = k.marca_id
         WHERE tipo_equivalencia = 3 and prod_id = ?;`,
        [prod_id]
      );
      resultado = rows;
    }

    if (empresa[0].empresa == "HD") {
      const [rows] = await connection.execute(
        `SELECT a.cod_equivalente, k.marca_nombre FROM autohd_automarcohd.tbl_prod_equivalente a
         LEFT JOIN autohd_automarcohd.tbl_marcas k on a.marca_id = k.marca_id
         WHERE id_tipo_equiv = 2 and prod_id = ?;`,
        [prod_id]
      );
      resultado = rows;
    }

    return resultado;
  } catch (error) {
    console.error("Error al obtener OEM:", error);
    return [];
  }
};

// Portado desde producción: info de una publicación de Mercado Libre por
// código de publicación (búsqueda parcial, como en el original).
const getInfoTR = async (cod_publicacion) => {
  try {
    const [rows] = await connection.execute(
      `SELECT cod_publicacion, titulo, prod_id_1, prod_id_2, prod_id_3, prod_id_4,
              img_prod_1, img_prod_2, img_prod_3, img_prod_4
       FROM gabteccl_sitbdd1978.tbl_mercado_libre where cod_publicacion like ?`,
      [`%${cod_publicacion}%`]
    );
    return rows;
  } catch (error) {
    console.error("Error al obtener info TR:", error);
    return [];
  }
};

// Portado desde producción: volumetría/peso de un producto (para WMS).
const getVolumetriaWms = async (cod_producto) => {
  try {
    const codigoLimpio = cod_producto.includes('-') ? cod_producto.replace('-', '') : cod_producto;

    const [rows] = await connection.execute(
      `SELECT prod_id, descripcion, formato, unidad_medida, unidades_caja,
              largo, ancho, alto, volumen_producto, peso_producto, peso_embalaje,
              unidad_medida_caja_master, unidades_caja_master, largo_caja_master,
              ancho_caja_master, alto_caja_master, volumen_caja_master,
              peso_caja_master_producto, peso_carton_caja_master
       FROM automarc_automarco.tbl_volumetria WHERE prod_id = ?`,
      [codigoLimpio]
    );
    return rows;
  } catch (error) {
    console.error("Error al obtener volumetria:", error);
    return [];
  }
};

// Portado desde producción: listado paginado de "recetas" de compatibilidad
// para Mercado Libre (Gabtec/HD).
const getAllRecetas = async (limit, offset) => {
  try {
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM gabteccl_sitbdd1978.tbl_mercado_libre a
       left join automarc_automarco.tbl_marcas_2 b on a.marca_id = b.marca_id
       left join gabteccl_sitbdd1978.tbl_marcas_productos as d on a.marca_pub=d.marca_id
       LEFT join gabteccl_mlibre.tbl_publicaciones c on a.cod_publicacion = c.cod_publicacion
       where a.id_empresa in (10,14);`
    );
    const total = countResult[0].total;

    const [rows] = await connection.query(
      `SELECT REPLACE(a.cod_publicacion, 'TR', 'DSM') AS cod_disam, CASE
        WHEN a.id_empresa = 10 THEN 'Gabtec'
        WHEN a.id_empresa = 1  THEN 'Automarco'
        WHEN a.id_empresa = 2  THEN 'Autotec'
        WHEN a.id_empresa = 6  THEN 'HD'
        ELSE a.id_empresa
        END AS nombre_empresa, e.nombre_relacion, b.marca_nombre, a.mod_id, d.marca_nombre marca_producto,
        a.agno_ini, a.agno_ter, prod_id_1, gabtec_stock_prod_1, img_prod_1, prod_id_2, gabtec_stock_prod_2,
        img_prod_2, prod_id_3, gabtec_stock_prod_3, img_prod_3, prod_id_4, gabtec_stock_prod_4, img_prod_4,
        c.stock stock_publicacion FROM gabteccl_sitbdd1978.tbl_mercado_libre a
        left join automarc_automarco.tbl_marcas_2 b on a.marca_id = b.marca_id
        left join gabteccl_sitbdd1978.tbl_marcas_productos as d on a.marca_pub=d.marca_id
        LEFT join gabteccl_mlibre.tbl_publicaciones c on a.cod_publicacion = c.cod_publicacion
        left join gabteccl_sitbdd1978.tbl_mercado_libre_relac e on a.id_tipo_relacion = e.id_tipo_relacion
        where a.id_empresa in (10,14)
        LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return { data: rows, total };
  } catch (error) {
    console.error("Error al obtener recetas:", error);
    return { data: [], total: 0 };
  }
};

// Portado desde producción: listado paginado de imágenes de productos
// (Daito/Disam), opcionalmente filtrado por empresa.
const getImagenesProductos = async (limit, offset, empresa) => {
  try {
    let total = 0;

    if (empresa) {
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM automarc_automarco.tbl_imagenes_daitodisam WHERE empresa = ?;`,
        [empresa]
      );
      total = countResult[0].total;
    } else {
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM automarc_automarco.tbl_imagenes_daitodisam;`
      );
      total = countResult[0].total;
    }

    let rows;
    if (empresa) {
      [rows] = await connection.query(
        `SELECT a.prod_id, a.empresa, a.img_1, a.img_2, a.img_3, a.img_4, a.img_5, a.img_6, a.img_7, a.img_8, a.img_9, a.img_10
         FROM automarc_automarco.tbl_imagenes_daitodisam a
         WHERE a.empresa = ?
         LIMIT ? OFFSET ?`,
        [empresa, limit, offset]
      );
    } else {
      [rows] = await connection.query(
        `SELECT a.prod_id, a.empresa, a.img_1, a.img_2, a.img_3, a.img_4, a.img_5, a.img_6, a.img_7, a.img_8, a.img_9, a.img_10
         FROM automarc_automarco.tbl_imagenes_daitodisam a
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    return { data: rows, total };
  } catch (error) {
    console.error("Error al obtener imagenes de productos:", error);
    return { data: [], total: 0 };
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

// Descuento para el listado de productos: a diferencia de obtenerDescuentoEmpresa
// (usada al crear pedidos), acá el descuento depende de la sucursal exacta que
// entrega el cliente -> sin fallback a sucursal '0'. Si la sucursal no viene o no
// existe para ese rut, se devuelve 0 (precio de lista).
const obtenerDescuentoPorSucursal = async (empresa, rut_cliente, cli_sec, esFrenos = false) => {
  if (!rut_cliente || !cli_sec) return 0;

  try {
    let tablaClientes = "";
    let colDescCli = "cli_descuento";

    switch (empresa.toUpperCase()) {
      case "AUTOTEC":
        tablaClientes = "autotec_ecom.tbl_clientes";
        break;
      case "GABTEC":
        tablaClientes = "gabteccl_sitbdd1978.tbl_clientes";
        colDescCli = esFrenos ? "cli_dcto2" : "cli_descuento";
        break;
      case "AUTOMARCO":
        tablaClientes = "automarc_automarco.tbl_clientes";
        break;
      case "HD":
        tablaClientes = "autohd_automarcohd.tbl_clientes";
        break;
      default: return 0;
    }

    const [rows] = await connection.execute(
      `SELECT ${colDescCli} as descuento FROM ${tablaClientes} WHERE cli_rut = ? AND cli_sec = ? LIMIT 1;`,
      [rut_cliente, cli_sec]
    );

    if (rows.length === 0) return 0;

    return rows[0].descuento || 0;

  } catch (error) {
    console.error(`Error calculando descuento por sucursal (${empresa}):`, error.message);
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
         v.descuento = 0;
         v.empresa = "DESCONOCIDA";
         return v;
      }

      const empresaNombre = empresaData[0].empresa;
      const precioBase = Number(empresaData[0].prod_precio);

      //  calcular descuento
      const descuento = await obtenerDescuentoEmpresa(v.sku, empresaNombre, cli_rut);

      // se guarda el precio de lista (sin descuento aplicado); el % de descuento
      // queda registrado aparte en v.descuento.
      v.precio = precioBase;
      v.descuento = descuento;
      v.empresa = empresaNombre;
      v.titulo = empresaData[0].nombre;
      return v;
    })
  );

  // corta el pedido si vino algun SKU que no existe en ninguna empresa, en vez de
  // dejar que caiga (por accidente) en el chequeo de permisos mas adelante
  const skusNoEncontrados = array_prod_emp.filter((p) => p.empresa === "DESCONOCIDA").map((p) => p.sku);
  if (skusNoEncontrados.length > 0) {
    throw new ValidationError(`SKU no encontrado: ${skusNoEncontrados.join(', ')}`);
  }

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

    // PEDCLIRUT es "int unsigned" en la DMZ (guarda el rut sin guion ni dígito
    // verificador, ej. 76230475) -> a diferencia de bd_api_automarco.cli_rut
    // (varchar, guarda el rut completo "18211738-2"), acá hay que pasarle solo
    // la parte numérica.
    const rutNumerico = parseInt(String(grupo.rut).split('-')[0], 10);

    // inserta la reserva del correlativo en la DMZ de esta empresa.
    // OJO: no se fija PEDESTPRO -> queda en su default (2). El cron que integra
    // estos pedidos en el DMZ ignora las filas con PEDESTPRO=2 y recien las toma
    // cuando otro proceso las pasa a 0; fijarlo aca las procesaria antes de tiempo.
    await db.execute(
        `INSERT INTO ${config.tabla} (PEDVENRUT, PEDVENSEC, PEDCORINT, PEDFCH, PEDEST, PEDCLIRUT, PEDCLISEC) VALUES (?, 0, ?, NOW(), 0, ?, ?)`,
        [config.pedvenrut, grupo.pedcorint, rutNumerico, grupo.cli_sec]
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
            INSERT INTO bd_api_automarco.tbl_pedidos_detalle (pedido_id, prod_id, cantidad, empresa, pedcorint, precio, descuento)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        for (const prod of grupo.productos) {
            await db.execute(sqlDetalle, [
                idPedidoGenerado, prod.codigo, prod.cantidad, prod.empresa, grupo.pedcorint, prod.precio, prod.descuento
            ]);
        }
    }

    return { empresa: grupo.empresa, pedido: `${config.pedvenrut}-${grupo.pedcorint}`, id_interno: idPedidoGenerado };
};

export {
  getStockProducts,
  obtenerDescuentoEmpresa,
  obtenerDescuentoPorSucursal,
  validarPedidoEmpresa,
  limpiarEmpresa,
  obtenerNombreTransporte,
  obtenerCondpagoPorSucursal,
  obtenerDireccionSucursal,
  MAPA_DMZ_EMPRESA,
  obtenerCorrelativoPorEmpresa,
  getOCdefinitiva,
  insertPedidoEmpresa,
  getProductById,
  getOemById,
  getInfoTR,
  getVolumetriaWms,
  getAllRecetas,
  getImagenesProductos,
};