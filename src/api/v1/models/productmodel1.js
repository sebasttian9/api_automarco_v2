import connection from '../../../../config/bdPedidosApi.js';
import obtenerPermisos from '../helpers/verificapermiso.js';
import { obtenerDescuentoPorSucursal } from './productsModel.js';



// Aplica descuento por sucursal a una lista de productos ya resuelta (con empresa
// asignada). Si no se entrega rut o sucursales, no se toca nada (precio de lista).
const aplicarDescuentosPorSucursal = async (productos, rut, sucursales) => {
  return Promise.all(productos.map(async (p) => {
    const { prod_estado2, ...producto } = p;

    if (!rut || !sucursales) return producto;

    const cli_sec = sucursales[p.empresa] || null;
    const esFrenos = p.empresa === "GABTEC" && prod_estado2 == 1;

    const descuento = await obtenerDescuentoPorSucursal(p.empresa, rut, cli_sec, esFrenos);
    const precioBase = Number(p.prod_precio);
    const precio_final = descuento > 0
      ? Math.round(precioBase - (precioBase * (descuento / 100)))
      : precioBase;

    return { ...producto, descuento, precio_final };
  }));
};

const getProducts = async (
  token,
  order_by = "nombre__ASC",
  limits = 3,
  page = 1,
  cla_id = null,
  marca = null,
  modelo = null,
  cilindrada = null,
  agno = null,
  rut = null,
  sucursales = null
) => {
  const db = await connection;
  try {
    let Productos_automarco = [];
    let productos_autotec = [];
    let productos_gabtec = [];
    let resultado_final = [];


    const permisos = await obtenerPermisos(token);
    console.log("Token usado:", token);
    console.log("Permisos devueltos:", permisos);

    if (!permisos) {
        console.log("Token inválido o sin permisos");
        return [];
    }

    // cla_id es opcional. Cuando viene, se resuelve contra gestioncar.tbl_clasificaciones
    // para saber el cla_id interno de cada empresa (y para no consultar empresas sin
    // mapeo). Cuando NO viene, se consulta en todas las empresas donde el cliente tiene
    // permiso, filtrando solo por los demas campos (marca/modelo/agno/cilindrada) que
    // hayan sido enviados.
    const hayClasificacion = cla_id !== null && cla_id !== undefined && cla_id != 0;

    if (hayClasificacion) {
      const [clasificaciones] = await db.execute(
        "SELECT * FROM gestioncar.tbl_clasificaciones where id_cla = ?",
        [cla_id]
      );

      // Si no encuentra clasificación, retorna vacío
      if (clasificaciones.length === 0) return [];

      //  AUTOTEC
      if (clasificaciones[0].autotec_cla_id > 0 && permisos.autotec == 1) {
        productos_autotec = await consultaPorEmpresa("AUTOTEC", {
          cla_id: clasificaciones[0].autotec_cla_id, marca, modelo, agno, cilindrada
        });
      }

      //  GABTEC
      if (clasificaciones[0].gabtec_cla_id > 0 && permisos.gabtec == 1) {
        productos_gabtec = await consultaPorEmpresa("GABTEC", {
          cla_id: clasificaciones[0].gabtec_cla_id, marca, modelo, agno, cilindrada
        });
      }

      //  AUTOMARCO
      if (clasificaciones[0].automarco_cla_id > 0 && permisos.automarco == 1) {
        Productos_automarco = await consultaPorEmpresa("AUTOMARCO", {
          cla_id: clasificaciones[0].automarco_cla_id, marca, modelo, agno, cilindrada
        });
      }
    } else {
      if (permisos.autotec == 1) {
        productos_autotec = await consultaPorEmpresa("AUTOTEC", { marca, modelo, agno, cilindrada });
      }
      if (permisos.gabtec == 1) {
        productos_gabtec = await consultaPorEmpresa("GABTEC", { marca, modelo, agno, cilindrada });
      }
      if (permisos.automarco == 1) {
        Productos_automarco = await consultaPorEmpresa("AUTOMARCO", { marca, modelo, agno, cilindrada });
      }
    }

    // Unir resultados
    resultado_final = [].concat(
      Productos_automarco || [],
      productos_autotec || [],
      productos_gabtec || []
    );

    resultado_final = await aplicarDescuentosPorSucursal(resultado_final, rut, sucursales);

    return resultado_final;

  } catch (error) {
    console.error("Error al obtener datos:", error);
    return [];
  }
};

const getProductsCategory = async (
  token,
  order_by = "nombre__ASC",
  limits = 3,
  page = 1,
  cla_id = 0,
  rut = null,
  sucursales = null
) => {
  const db = await connection;
  try {
    let Productos_automarco = [];
    let productos_autotec = [];
    let productos_gabtec = [];
    let resultado_final = [];

    // --- PASO A: VALIDAR PERMISOS ---
    const permisos = await obtenerPermisos(token);
    if (!permisos) return [];

    // validar la clasificacion
    const [clasificaciones, fields] = await db.execute(
      "SELECT * FROM gestioncar.tbl_clasificaciones where id_cla = ?",
      [cla_id]
    );

    if (clasificaciones.length === 0) return [];

    // --- PASO B: CONSULTAS CON DOBLE VALIDACIÓN ---

    // 1. AUTOTEC
    if (clasificaciones[0].autotec_cla_id > 0 && permisos.autotec == 1) {
      productos_autotec = await consultaPorEmpresaSoloClasificacion(
        "AUTOTEC",
        clasificaciones[0].autotec_cla_id
      );
    }

    // 2. GABTEC
    if (clasificaciones[0].gabtec_cla_id > 0 && permisos.gabtec == 1) {
      productos_gabtec = await consultaPorEmpresaSoloClasificacion(
        "GABTEC",
        clasificaciones[0].gabtec_cla_id
      );
    }

    // 3. AUTOMARCO
    if (clasificaciones[0].automarco_cla_id > 0 && permisos.automarco == 1) {
      Productos_automarco = await consultaPorEmpresaSoloClasificacion(
        "AUTOMARCO",
        clasificaciones[0].automarco_cla_id
      );
      
    }

    resultado_final = [].concat(
      Productos_automarco || [],
      productos_autotec || [],
      productos_gabtec || []
    );

    resultado_final = await aplicarDescuentosPorSucursal(resultado_final, rut, sucursales);

    return resultado_final;

  } catch (error) {
    console.error("Error al obtener datos:", error);
    return [];
  }
};

export {
    getProducts,
    getProductsCategory,
    getProductosPorEmpresaPaginado
    // ... exporta las otras (getStock, consultaPorEmpresa, etc)
};

// filtros: { cla_id, marca, modelo, agno, cilindrada } - todos opcionales.
// Solo se agrega al WHERE la condicion de los campos que efectivamente vengan.
const consultaPorEmpresa = async (empresa, filtros = {}) => {
  const { cla_id, marca, modelo, agno, cilindrada } = filtros;
  try {
    let resultado = [];
    console.log(empresa, filtros);

    if (empresa == "AUTOTEC") {
      const condiciones = ["a.prod_estado = 1", "a.prod_precio > 0"];
      const params = [];
      if (cla_id) { condiciones.push("d.cla_id = ?"); params.push(cla_id); }
      if (marca) { condiciones.push("f.marca_id = ?"); params.push(marca); }
      if (modelo) { condiciones.push("g.id_mod = ?"); params.push(modelo); }
      if (agno) { condiciones.push("i.prod_agno = ?"); params.push(agno); }
      if (cilindrada) { condiciones.push("x.cilin_id = ?"); params.push(cilindrada); }

      const [producstAutotec, fields] = await connection.execute(
        `SELECT DISTINCT
                      a.prod_id,
                      a.id_prov,
                      a.prod_nombre,
                      a.prod_texto_corto,
                      a.prod_precio,
                      j.espe_nombre,
                      a.prod_img2 AS prod_img,
                      a.prod_stock,
                      h.marca_nombre,
                      f.mod_id,
                      x.cilindrada,
                      l.combustible,
                      a.origen,
                      f.agno_inicio,
                      f.agno_fin,
                      'AUTOTEC' as empresa,
                      a.unidades_caja,
                      k.marca_nombre as marca_producto
              FROM autotec_ecom.tbl_productos AS a
              LEFT JOIN autotec_ecom.tbl_clasificacion AS d ON a.cla_id=d.cla_id
              LEFT JOIN autotec_ecom.tbl_especificacion j on a.espe_id = j.espe_id
              LEFT JOIN automarc_automarco.tbl_marcas_2 e on a.marca_id = e.marca_id
              LEFT join autotec_ecom.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
              LEFT join autotec_ecom.tbl_marcas_productos k on a.marca_id = k.marca_id
              LEFT JOIN automarc_automarco.tbl_marcas_2 h on f.marca_id = h.marca_id
              LEFT join autotec_ecom.tbl_combustible as l on f.id_combustible = l.id_combustible
              LEFT JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id
              LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
              LEFT JOIN autotec_ecom.tbl_productos_agnos i on f.pm_id = i.pm_id
              WHERE ${condiciones.join(" and ")}
              GROUP BY a.prod_id`,
        params
      );

      resultado = producstAutotec;
    }

    if (empresa == "GABTEC") {
      const condiciones = ["(a.prod_estado = 1 or a.prod_estado2 = 1)"];
      const params = [];
      if (cla_id) { condiciones.push("d.cla_id = ?"); params.push(cla_id); }
      if (marca) { condiciones.push("f.marca_id = ?"); params.push(marca); }
      if (modelo) { condiciones.push("g.id_mod = ?"); params.push(modelo); }
      if (agno) { condiciones.push("i.prod_agno = ?"); params.push(agno); }
      // Nota: GABTEC no tiene join a la tabla de cilindrada, por lo que ese filtro
      // no se puede aplicar aqui (ya era asi antes de este cambio).

      const [producsGabtec, fields] = await connection.execute(
        `SELECT DISTINCT
                    a.prod_id,
                    a.id_prov,
                    a.prod_nombre,
                    a.prod_texto_corto,
                    a.prod_precio,
                    j.espe_nombre,
                    a.prod_img,
                    a.prod_stock,
                    a.prod_estado2,
                    e.marca_nombre,
                    g.mod_id,
                    c.ubi_nombre,
                    h.origen,
                    k.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion k on f.traccion_id = k.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            WHERE ${condiciones.join(" and ")}`,
        params
      );
      resultado = producsGabtec;
    }

    if (empresa == "AUTOMARCO") {
      const condiciones = ["a.prod_estado = 1", "a.prod_precio > 0"];
      const params = [];
      if (cla_id) { condiciones.push("d.cla_id2 = ?"); params.push(cla_id); }
      if (marca) { condiciones.push("f.marca_id = ?"); params.push(marca); }
      if (modelo) { condiciones.push("g.id_mod = ?"); params.push(modelo); }
      if (agno) { condiciones.push("i.prod_agno = ?"); params.push(agno); }
      if (cilindrada) { condiciones.push("x.cilin_id = ?"); params.push(cilindrada); }

      const [producstAutomarco, fields] = await connection.execute(
        `SELECT
                  a.prod_id,
                  a.id_prov_2 as id_prov,
                  a.prod_nombre_2 as prod_nombre,
                  a.prod_texto_corto,
                  a.prod_precio,
                  j.espe_nombre,
                  (CASE WHEN usa_img2=1 THEN b.img_prod_th WHEN usa_img2=2 THEN b.img_prod_th ELSE a.prod_img END) as prod_img,
                  a.prod_stock,
                  e.marca_nombre,
                  g.mod_id,
                  x.cilindrada,
                  t.valvulas,
                  z.combustible,
                  k.marca_nombre as nombre_marc,
                  a.detalle,
                  f.agno_inicio,
                  f.agno_fin,
                  'AUTOMARCO' as empresa,
                  k.marca_nombre as marca_producto
          FROM automarc_automarco.tbl_productos2 AS a
          INNER JOIN automarc_automarco.tbl_clasificacion2 AS d ON a.cla_id2=d.cla_id2
          LEFT JOIN automarc_automarco.tbl_especificacion j on a.espe_id = j.espe_id
          INNER JOIN automarc_automarco.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
          INNER JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
          LEFT JOIN automarc_automarco.tbl_prod_img2 b on a.prod_id = b.prod_id
          INNER JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
          LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.id_mod = g.id_mod
          INNER JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id
          INNER JOIN automarc_automarco.tbl_valvulas as t on f.valvulas_id = t.valvula_id
          LEFT JOIN automarc_automarco.tbl_subfamilia y on y.sf_id = a.sf_id
          LEFT JOIN automarc_automarco.tbl_combustible z on z.id_combustible = f.id_combustible
          LEFT JOIN automarc_automarco.tbl_productos_agnos i on f.pm_id = i.pm_id
          WHERE ${condiciones.join(" and ")}
          GROUP by a.prod_id`,
        params
      );

      resultado = producstAutomarco;
    }

    return resultado;
  } catch (error) {
    console.error("Error al obtener datos:", error);
  }
};

const consultaPorEmpresaSoloClasificacion = async (empresa, cla_id) => {
  // const db = await connect();
  try {
    let resultado = [];
    console.log(empresa);

    if (empresa == "AUTOTEC") {
      const [producstAutotec, fields] = await connection.execute(
        `SELECT DISTINCT 
                      a.prod_id,
                      a.id_prov,
                      a.prod_nombre,
                      a.prod_texto_corto,
                      a.prod_precio,
                      j.espe_nombre,
                      a.prod_img2 AS prod_img,
                      a.prod_stock,
                      h.marca_nombre,
                      f.mod_id,
                      x.cilindrada,
                      l.combustible,
                      a.origen,
                      f.agno_inicio,
                      f.agno_fin,
                      'AUTOTEC' as empresa,
                      k.marca_nombre as marca_producto
              FROM autotec_ecom.tbl_productos AS a 
              LEFT JOIN autotec_ecom.tbl_clasificacion AS d ON a.cla_id=d.cla_id 
              LEFT JOIN autotec_ecom.tbl_especificacion j on a.espe_id = j.espe_id 
              LEFT JOIN automarc_automarco.tbl_marcas_2 e on a.marca_id = e.marca_id 
              LEFT join autotec_ecom.tbl_productos_modelos_2 f on a.prod_id = f.prod_id 
              LEFT join autotec_ecom.tbl_marcas_productos k on a.marca_id = k.marca_id 
              LEFT JOIN automarc_automarco.tbl_marcas_2 h on f.marca_id = h.marca_id 
              LEFT join autotec_ecom.tbl_combustible as l on f.id_combustible = l.id_combustible 
              LEFT JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id 
              LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id 
              LEFT JOIN autotec_ecom.tbl_productos_agnos i on f.pm_id = i.pm_id 
              WHERE a.prod_estado = 1 and a.prod_precio > 0 and d.cla_id = ? 
              GROUP BY a.prod_id`,
        [cla_id]
      );

      resultado = producstAutotec;
    }

    if (empresa == "GABTEC") {
      const [producsGabtec, fields] = await connection.execute(
        `SELECT DISTINCT 
                    a.prod_id,
                    a.id_prov,                    
                    a.prod_nombre,
                    a.prod_texto_corto,
                    a.prod_precio,
                    j.espe_nombre,
                    a.prod_img,
                    a.prod_stock,
                    a.prod_estado2,
                    e.marca_nombre,
                    g.mod_id,
                    c.ubi_nombre,
                    h.origen,
                    k.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion k on f.traccion_id = k.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            WHERE a.prod_estado = 1 and a.prod_id not in ('92989-1','92676-0','92648-5','93038-5','92499-7','93036-9','92634-5','93039-3','93061-K',
            '93062-8','93063-6') and d.cla_id = ? `,
        [cla_id]
      );
      console.log(producsGabtec);
      resultado = producsGabtec;
    }

    if (empresa == "AUTOMARCO") {
      const [producstAutomarco, fields] = await connection.execute(
        `SELECT 
                  a.prod_id,
                  a.id_prov_2 as id_prov,
                  a.prod_nombre_2 as prod_nombre,
                  a.prod_texto_corto,
                  a.prod_precio,
                  j.espe_nombre,
                  (CASE WHEN usa_img2=1 THEN b.img_prod_th WHEN usa_img2=2 THEN b.img_prod_th ELSE a.prod_img END) as prod_img,
                  a.prod_stock,
                  e.marca_nombre,
                  g.mod_id,
                  x.cilindrada,
                  t.valvulas,
                  z.combustible,              
                  k.marca_nombre as nombre_marc,                  
                  a.detalle,
                  f.agno_inicio,
                  f.agno_fin,
                  'AUTOMARCO' as empresa,
                    k.marca_nombre as marca_producto
          FROM automarc_automarco.tbl_productos2 AS a 
          INNER JOIN automarc_automarco.tbl_clasificacion2 AS d ON a.cla_id2=d.cla_id2 
          LEFT JOIN automarc_automarco.tbl_especificacion j on a.espe_id = j.espe_id 
          INNER JOIN automarc_automarco.tbl_productos_modelos_2 f on a.prod_id = f.prod_id 
          INNER JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id 
          LEFT JOIN automarc_automarco.tbl_prod_img2 b on a.prod_id = b.prod_id 
          INNER JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id 
          LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.id_mod = g.id_mod 
          INNER JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id 
          INNER JOIN automarc_automarco.tbl_valvulas as t on f.valvulas_id = t.valvula_id 
          LEFT JOIN automarc_automarco.tbl_subfamilia y on y.sf_id = a.sf_id 
          LEFT JOIN automarc_automarco.tbl_combustible z on z.id_combustible = f.id_combustible 
          LEFT JOIN automarc_automarco.tbl_productos_agnos i on f.pm_id = i.pm_id 
          WHERE a.prod_estado = 1 and a.prod_precio > 0 and d.cla_id2 = ? 
          GROUP by a.prod_id`,
        [cla_id]
      );

      console.log(producstAutomarco);
      resultado = producstAutomarco;
    }

    return resultado;
  } catch (error) {
    console.error("Error al obtener datos:", error);
  }
};

// Listado paginado del catalogo completo de UNA sola empresa (AUTOMARCO, AUTOTEC o
// GABTEC), sin filtros de categoria/marca/modelo/agno/cilindrada. Se usa cuando el
// endpoint de /products no recibe ningun filtro: en vez de traer las 3 empresas sin
// acotar (lo que obligaria a unir columnas heterogeneas y paginar todo en memoria),
// se exige indicar la empresa y se pagina esa unica consulta a nivel SQL.
const PERMISO_POR_EMPRESA = { AUTOMARCO: "automarco", AUTOTEC: "autotec", GABTEC: "gabtec" };

const getProductosPorEmpresaPaginado = async (
  token,
  empresa,
  limit = 20,
  page = 1,
  rut = null,
  sucursales = null
) => {
  try {
    const permisos = await obtenerPermisos(token);
    if (!permisos) return { data: [], total: 0 };

    const campoPermiso = PERMISO_POR_EMPRESA[empresa];
    if (!campoPermiso || permisos[campoPermiso] != 1) return { data: [], total: 0 };

    const offset = (page - 1) * limit;
    let total = 0;
    let rows = [];

    if (empresa === "AUTOTEC") {
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM autotec_ecom.tbl_productos WHERE prod_estado = 1 and prod_precio > 0`
      );
      total = countResult[0].total;

      [rows] = await connection.query(
        `SELECT DISTINCT
                      a.prod_id,
                      a.id_prov,
                      a.prod_nombre,
                      a.prod_texto_corto,
                      a.prod_precio,
                      j.espe_nombre,
                      a.prod_img2 AS prod_img,
                      a.prod_stock,
                      h.marca_nombre,
                      f.mod_id,
                      x.cilindrada,
                      l.combustible,
                      a.origen,
                      f.agno_inicio,
                      f.agno_fin,
                      'AUTOTEC' as empresa,
                      a.unidades_caja,
                      k.marca_nombre as marca_producto
              FROM autotec_ecom.tbl_productos AS a
              LEFT JOIN autotec_ecom.tbl_clasificacion AS d ON a.cla_id=d.cla_id
              LEFT JOIN autotec_ecom.tbl_especificacion j on a.espe_id = j.espe_id
              LEFT JOIN automarc_automarco.tbl_marcas_2 e on a.marca_id = e.marca_id
              LEFT join autotec_ecom.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
              LEFT join autotec_ecom.tbl_marcas_productos k on a.marca_id = k.marca_id
              LEFT JOIN automarc_automarco.tbl_marcas_2 h on f.marca_id = h.marca_id
              LEFT join autotec_ecom.tbl_combustible as l on f.id_combustible = l.id_combustible
              LEFT JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id
              LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
              LEFT JOIN autotec_ecom.tbl_productos_agnos i on f.pm_id = i.pm_id
              WHERE a.prod_estado = 1 and a.prod_precio > 0
              GROUP BY a.prod_id
              LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    if (empresa === "GABTEC") {
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM gabteccl_sitbdd1978.tbl_productos WHERE (prod_estado = 1 or prod_estado2 = 1)`
      );
      total = countResult[0].total;

      [rows] = await connection.query(
        `SELECT DISTINCT
                    a.prod_id,
                    a.id_prov,
                    a.prod_nombre,
                    a.prod_texto_corto,
                    a.prod_precio,
                    j.espe_nombre,
                    a.prod_img,
                    a.prod_stock,
                    a.prod_estado2,
                    e.marca_nombre,
                    g.mod_id,
                    c.ubi_nombre,
                    h.origen,
                    k.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion k on f.traccion_id = k.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            WHERE (a.prod_estado = 1 or a.prod_estado2 = 1)
            LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    if (empresa === "AUTOMARCO") {
      // El conteo replica los INNER JOIN de la query principal: un producto sin marca,
      // modelo, cilindrada o valvulas asociada tampoco aparece en el listado, por lo
      // que no debe contarse en el total (igual que ya pasaba antes de este cambio).
      const [countResult] = await connection.execute(
        `SELECT COUNT(DISTINCT a.prod_id) as total
         FROM automarc_automarco.tbl_productos2 AS a
         INNER JOIN automarc_automarco.tbl_clasificacion2 AS d ON a.cla_id2=d.cla_id2
         INNER JOIN automarc_automarco.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
         INNER JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
         INNER JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
         INNER JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id
         INNER JOIN automarc_automarco.tbl_valvulas as t on f.valvulas_id = t.valvula_id
         WHERE a.prod_estado = 1 and a.prod_precio > 0`
      );
      total = countResult[0].total;

      [rows] = await connection.query(
        `SELECT
                  a.prod_id,
                  a.id_prov_2 as id_prov,
                  a.prod_nombre_2 as prod_nombre,
                  a.prod_texto_corto,
                  a.prod_precio,
                  j.espe_nombre,
                  (CASE WHEN usa_img2=1 THEN b.img_prod_th WHEN usa_img2=2 THEN b.img_prod_th ELSE a.prod_img END) as prod_img,
                  a.prod_stock,
                  e.marca_nombre,
                  g.mod_id,
                  x.cilindrada,
                  t.valvulas,
                  z.combustible,
                  k.marca_nombre as nombre_marc,
                  a.detalle,
                  f.agno_inicio,
                  f.agno_fin,
                  'AUTOMARCO' as empresa,
                  k.marca_nombre as marca_producto
          FROM automarc_automarco.tbl_productos2 AS a
          INNER JOIN automarc_automarco.tbl_clasificacion2 AS d ON a.cla_id2=d.cla_id2
          LEFT JOIN automarc_automarco.tbl_especificacion j on a.espe_id = j.espe_id
          INNER JOIN automarc_automarco.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
          INNER JOIN automarc_automarco.tbl_marcas_productos k on a.marca_id = k.marca_id
          LEFT JOIN automarc_automarco.tbl_prod_img2 b on a.prod_id = b.prod_id
          INNER JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
          LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.id_mod = g.id_mod
          INNER JOIN automarc_automarco.tbl_cilindrada2 x on x.cilin_id = f.cilindrada_id
          INNER JOIN automarc_automarco.tbl_valvulas as t on f.valvulas_id = t.valvula_id
          LEFT JOIN automarc_automarco.tbl_subfamilia y on y.sf_id = a.sf_id
          LEFT JOIN automarc_automarco.tbl_combustible z on z.id_combustible = f.id_combustible
          LEFT JOIN automarc_automarco.tbl_productos_agnos i on f.pm_id = i.pm_id
          WHERE a.prod_estado = 1 and a.prod_precio > 0
          GROUP by a.prod_id
          LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    const data = await aplicarDescuentosPorSucursal(rows, rut, sucursales);
    return { data, total };
  } catch (error) {
    console.error("Error al obtener datos:", error);
    return { data: [], total: 0 };
  }
};