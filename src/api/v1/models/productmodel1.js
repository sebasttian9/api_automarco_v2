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

// Pagina a nivel SQL sobre varias empresas como si fueran una sola lista, en el
// mismo orden en que antes se concatenaban (AUTOMARCO, AUTOTEC, GABTEC).
// fuentes: funciones (pag) => consulta, donde pag es { count: true } para contar
// o { limit, offset } para traer esa porcion. Primero se cuenta cada empresa y
// luego solo se consultan las que caen dentro de la pagina pedida.
const paginarFuentes = async (fuentes, limit, page) => {
  const totales = await Promise.all(fuentes.map((f) => f({ count: true })));
  const total = totales.reduce((acc, t) => acc + (Number(t) || 0), 0);

  let offset = (page - 1) * limit;
  let restante = limit;
  let rows = [];

  for (let i = 0; i < fuentes.length && restante > 0; i++) {
    const totalFuente = Number(totales[i]) || 0;
    if (offset >= totalFuente) { offset -= totalFuente; continue; }

    const cantidad = Math.min(restante, totalFuente - offset);
    const parte = await fuentes[i]({ limit: cantidad, offset });
    rows = rows.concat(parte || []);
    restante -= cantidad;
    offset = 0;
  }

  return { rows, total };
};

const getProducts = async (
  token,
  order_by = "nombre__ASC",
  limits = 500,
  page = 1,
  cla_id = null,
  marca = null,
  modelo = null,
  cilindrada = null,
  agno = null,
  rut = null,
  sucursales = null,
  empresa = null
) => {
  const db = await connection;
  try {
    // empresa opcional: si viene, solo se consulta esa; si no, todas las permitidas.
    const incluye = (emp) => !empresa || empresa === emp;
    const fuentes = [];

    const permisos = await obtenerPermisos(token);

    if (!permisos) {
        console.log("Token inválido o sin permisos");
        return { data: [], total: 0 };
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
      if (clasificaciones.length === 0) return { data: [], total: 0 };

      //  AUTOMARCO
      if (incluye("AUTOMARCO") && clasificaciones[0].automarco_cla_id > 0 && permisos.automarco == 1) {
        fuentes.push((pag) => consultaPorEmpresa("AUTOMARCO", {
          cla_id: clasificaciones[0].automarco_cla_id, marca, modelo, agno, cilindrada
        }, pag));
      }

      //  AUTOTEC
      if (incluye("AUTOTEC") && clasificaciones[0].autotec_cla_id > 0 && permisos.autotec == 1) {
        fuentes.push((pag) => consultaPorEmpresa("AUTOTEC", {
          cla_id: clasificaciones[0].autotec_cla_id, marca, modelo, agno, cilindrada
        }, pag));
      }

      //  GABTEC
      if (incluye("GABTEC") && clasificaciones[0].gabtec_cla_id > 0 && permisos.gabtec == 1) {
        fuentes.push((pag) => consultaPorEmpresa("GABTEC", {
          cla_id: clasificaciones[0].gabtec_cla_id, marca, modelo, agno, cilindrada
        }, pag));
      }
    } else {
      if (incluye("AUTOMARCO") && permisos.automarco == 1) {
        fuentes.push((pag) => consultaPorEmpresa("AUTOMARCO", { marca, modelo, agno, cilindrada }, pag));
      }
      if (incluye("AUTOTEC") && permisos.autotec == 1) {
        fuentes.push((pag) => consultaPorEmpresa("AUTOTEC", { marca, modelo, agno, cilindrada }, pag));
      }
      if (incluye("GABTEC") && permisos.gabtec == 1) {
        fuentes.push((pag) => consultaPorEmpresa("GABTEC", { marca, modelo, agno, cilindrada }, pag));
      }
    }

    const { rows, total } = await paginarFuentes(fuentes, limits, page);

    // el descuento se calcula solo para los productos de la pagina
    const data = await aplicarDescuentosPorSucursal(rows, rut, sucursales);

    return { data, total };

  } catch (error) {
    console.error("Error al obtener datos:", error);
    return { data: [], total: 0 };
  }
};

const getProductsCategory = async (
  token,
  order_by = "nombre__ASC",
  limits = 500,
  page = 1,
  cla_id = 0,
  rut = null,
  sucursales = null,
  empresa = null
) => {
  const db = await connection;
  try {
    // empresa opcional: si viene, solo se consulta esa; si no, todas las permitidas.
    const incluye = (emp) => !empresa || empresa === emp;
    const fuentes = [];

    // --- PASO A: VALIDAR PERMISOS ---
    const permisos = await obtenerPermisos(token);
    if (!permisos) return { data: [], total: 0 };

    // validar la clasificacion
    const [clasificaciones, fields] = await db.execute(
      "SELECT * FROM gestioncar.tbl_clasificaciones where id_cla = ?",
      [cla_id]
    );

    if (clasificaciones.length === 0) return { data: [], total: 0 };

    // --- PASO B: CONSULTAS CON DOBLE VALIDACIÓN ---

    // 1. AUTOMARCO
    if (incluye("AUTOMARCO") && clasificaciones[0].automarco_cla_id > 0 && permisos.automarco == 1) {
      fuentes.push((pag) => consultaPorEmpresaSoloClasificacion(
        "AUTOMARCO",
        clasificaciones[0].automarco_cla_id,
        pag
      ));
    }

    // 2. AUTOTEC
    if (incluye("AUTOTEC") && clasificaciones[0].autotec_cla_id > 0 && permisos.autotec == 1) {
      fuentes.push((pag) => consultaPorEmpresaSoloClasificacion(
        "AUTOTEC",
        clasificaciones[0].autotec_cla_id,
        pag
      ));
    }

    // 3. GABTEC
    if (incluye("GABTEC") && clasificaciones[0].gabtec_cla_id > 0 && permisos.gabtec == 1) {
      fuentes.push((pag) => consultaPorEmpresaSoloClasificacion(
        "GABTEC",
        clasificaciones[0].gabtec_cla_id,
        pag
      ));
    }

    const { rows, total } = await paginarFuentes(fuentes, limits, page);

    // el descuento se calcula solo para los productos de la pagina
    const data = await aplicarDescuentosPorSucursal(rows, rut, sucursales);

    return { data, total };

  } catch (error) {
    console.error("Error al obtener datos:", error);
    return { data: [], total: 0 };
  }
};

export {
    getProducts,
    getProductsCategory,
    getProductosPorEmpresaPaginado
    // ... exporta las otras (getStock, consultaPorEmpresa, etc)
};

// pag (opcional): { count: true } retorna solo la cantidad de filas; { limit, offset }
// retorna esa porcion ordenada por prod_id (orden estable entre paginas); sin pag,
// retorna todo como antes. Se usa query (no execute) porque LIMIT/OFFSET como
// parametros no funcionan bien con prepared statements de mysql2.
const ejecutarConsulta = async (sql, params, pag) => {
  if (pag && pag.count) {
    const [r] = await connection.query(`SELECT COUNT(*) AS total FROM (${sql}) t`, params);
    return [r[0].total]; // mismo formato [filas, fields] que execute/query
  }
  if (pag && pag.limit) {
    return connection.query(`${sql} ORDER BY a.prod_id LIMIT ? OFFSET ?`, [...params, pag.limit, pag.offset]);
  }
  return connection.execute(sql, params);
};

// filtros: { cla_id, marca, modelo, agno, cilindrada } - todos opcionales.
// Solo se agrega al WHERE la condicion de los campos que efectivamente vengan.
const consultaPorEmpresa = async (empresa, filtros = {}, pag = null) => {
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

      const [producstAutotec, fields] = await ejecutarConsulta(
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
                      k.marca_nombre as marca_producto,
                      COALESCE(m.multiplo, 1) as multiplo
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
              LEFT JOIN autotec_ecom.tbl_productos_multiplos m on m.id_prod = a.prod_id
              WHERE ${condiciones.join(" and ")}
              GROUP BY a.prod_id`,
        params,
        pag
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

      const [producsGabtec, fields] = await ejecutarConsulta(
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
                    l.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version,
                    COALESCE(m.multiplo, 1) as multiplo
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion l on f.traccion_id = l.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_multiplos m on m.id_prod = a.prod_id
            WHERE ${condiciones.join(" and ")}`,
        params,
        pag
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

      const [producstAutomarco, fields] = await ejecutarConsulta(
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
                  k.marca_nombre as marca_producto,
                  COALESCE(m.multiplo, 1) as multiplo
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
          LEFT JOIN automarc_automarco.tbl_productos_multiplos m on m.id_prod = a.prod_id
          WHERE ${condiciones.join(" and ")}
          GROUP by a.prod_id`,
        params,
        pag
      );

      resultado = producstAutomarco;
    }

    // en modo conteo, el destructuring [filas, fields] ya deja la cantidad en resultado
    return pag && pag.count ? (Number(resultado) || 0) : resultado;
  } catch (error) {
    console.error("Error al obtener datos:", error);
  }
};

const consultaPorEmpresaSoloClasificacion = async (empresa, cla_id, pag = null) => {
  // const db = await connect();
  try {
    let resultado = [];
    console.log(empresa);

    if (empresa == "AUTOTEC") {
      const [producstAutotec, fields] = await ejecutarConsulta(
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
                      k.marca_nombre as marca_producto,
                      COALESCE(m.multiplo, 1) as multiplo
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
              LEFT JOIN autotec_ecom.tbl_productos_multiplos m on m.id_prod = a.prod_id
              WHERE a.prod_estado = 1 and a.prod_precio > 0 and d.cla_id = ?
              GROUP BY a.prod_id`,
        [cla_id],
        pag
      );

      resultado = producstAutotec;
    }

    if (empresa == "GABTEC") {
      const [producsGabtec, fields] = await ejecutarConsulta(
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
                    l.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version,
                    COALESCE(m.multiplo, 1) as multiplo
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion l on f.traccion_id = l.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_multiplos m on m.id_prod = a.prod_id
            WHERE a.prod_estado = 1 and a.prod_id not in ('92989-1','92676-0','92648-5','93038-5','92499-7','93036-9','92634-5','93039-3','93061-K',
            '93062-8','93063-6') and d.cla_id = ? `,
        [cla_id],
        pag
      );
      console.log(producsGabtec);
      resultado = producsGabtec;
    }

    if (empresa == "AUTOMARCO") {
      const [producstAutomarco, fields] = await ejecutarConsulta(
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
                    k.marca_nombre as marca_producto,
                  COALESCE(m.multiplo, 1) as multiplo
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
          LEFT JOIN automarc_automarco.tbl_productos_multiplos m on m.id_prod = a.prod_id
          WHERE a.prod_estado = 1 and a.prod_precio > 0 and d.cla_id2 = ?
          GROUP by a.prod_id`,
        [cla_id],
        pag
      );

      console.log(producstAutomarco);
      resultado = producstAutomarco;
    }

    // en modo conteo, el destructuring [filas, fields] ya deja la cantidad en resultado
    return pag && pag.count ? (Number(resultado) || 0) : resultado;
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
                      k.marca_nombre as marca_producto,
                      COALESCE(m.multiplo, 1) as multiplo
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
              LEFT JOIN autotec_ecom.tbl_productos_multiplos m on m.id_prod = a.prod_id
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
                    l.traccion,
                    f.agno_inicio,
                    f.agno_fin,
                    'GABTEC' as empresa,
                    k.marca_nombre as marca_producto,
                    f.version,
                    COALESCE(m.multiplo, 1) as multiplo
            FROM gabteccl_sitbdd1978.tbl_productos AS a
            LEFT JOIN gabteccl_sitbdd1978.tbl_clasificacion AS d ON a.cla_id=d.cla_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_especificacion j on a.espe_id = j.espe_id
            LEFT join gabteccl_sitbdd1978.tbl_productos_modelos_2 f on a.prod_id = f.prod_id
            LEFT JOIN automarc_automarco.tbl_marcas_2 e on f.marca_id = e.marca_id
            LEFT join gabteccl_sitbdd1978.tbl_marcas_productos k on a.marca_id = k.marca_id
            LEFT JOIN automarc_automarco.tbl_modelos_marcas_2 g on f.mod_id = g.mod_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_agnos i on f.pm_id = i.pm_id
            left join gabteccl_sitbdd1978.tbl_ubicacion as c on f.ubi_id=c.ubi_id
            left join automarc_automarco.tbl_traccion l on f.traccion_id = l.traccion_id
            left join automarc_automarco.tbl_origen h on h.origen_id = f.origen_id
            LEFT JOIN gabteccl_sitbdd1978.tbl_productos_multiplos m on m.id_prod = a.prod_id
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
                  k.marca_nombre as marca_producto,
                  COALESCE(m.multiplo, 1) as multiplo
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
          LEFT JOIN automarc_automarco.tbl_productos_multiplos m on m.id_prod = a.prod_id
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