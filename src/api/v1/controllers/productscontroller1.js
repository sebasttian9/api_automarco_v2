import {
  getProducts,
  getProductsCategory,
  getProductosPorEmpresaPaginado,
} from "../models/productmodel1.js";

import prepareHateoas from "../helpers/hateoas.js";

// Formato comun de respuesta paginada para todos los modos de /products.
const respuestaPaginada = (results, total, pageNum, limitNum) => {
  const totalPages = Math.ceil(total / limitNum);
  return {
    info: {
      total_records: total,
      total_pages: totalPages,
      current_page: pageNum,
      next_page: pageNum < totalPages ? pageNum + 1 : null,
      prev_page: pageNum > 1 ? pageNum - 1 : null
    },
    results
  };
};

const getAllProductsAplications1 = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token.' });
    }
    
 
    const token = authHeader.replace('Bearer ', '').trim();
    const rut = req.user && req.user.rut;
    const sucursales = req.body.sucursales || null;

    // empresa es opcional en todos los modos: si viene, se consulta solo esa
    // empresa; si no, las 3 (segun permisos). En modo "catalogo completo" (sin
    // filtros) sigue siendo obligatoria.
    const EMPRESAS_VALIDAS = ["AUTOMARCO", "AUTOTEC", "GABTEC"];
    const empresaFiltro = req.body.empresa ? req.body.empresa.toString().trim().toUpperCase() : null;

    if (empresaFiltro && !EMPRESAS_VALIDAS.includes(empresaFiltro)) {
      return res.status(400).json({ message: "Empresa invalida. Valores permitidos: AUTOMARCO, AUTOTEC o GABTEC." });
    }

    // Paginacion para todos los modos: default 500, maximo 500 por pagina.
    const pageNum = Math.max(parseInt(req.body.page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.body.limits) || 500, 1), 500);

    if (req.existe_clasificacion) {
      // busqueda solo por clasificacion

      const { order_by, cla_id } = req.body;

      // Validaciones
      if (!cla_id || cla_id == 0) {
        return res.status(400).json({ message: "Categoria (cla_id) es requerida!" });
      }


      const { data, total } = await getProductsCategory(
        token,
        order_by,
        limitNum,
        pageNum,
        cla_id,
        rut,
        sucursales,
        empresaFiltro
      );

      const productsImg = await prepareHateoas(data);

      res.status(200).json(respuestaPaginada(productsImg, total, pageNum, limitNum));

    } else {


      const {
        order_by,
        cla_id,
        marca_id,
        modelo_id,
        cili_id,
        agno,
      } = req.body;

      // Unica validacion obligatoria: no se puede filtrar por modelo sin indicar marca.
      if (modelo_id && modelo_id != 0 && (!marca_id || marca_id == 0)) {
        return res.status(400).json({ message: "Marca (marca_id) es requerida cuando se especifica un modelo." });
      }

      const sinFiltros =
        (!cla_id || cla_id == 0) &&
        (!marca_id || marca_id == 0) &&
        (!modelo_id || modelo_id == 0) &&
        (!cili_id || cili_id == 0) &&
        (!agno || agno == 0);

      // Sin ningun filtro: se exige indicar la empresa y se devuelve su catalogo
      // completo paginado (igual formato que /recetas), en vez de traer las 3
      // empresas sin acotar.
      if (sinFiltros) {
        if (!empresaFiltro) {
          return res.status(400).json({
            message: "Debes enviar al menos un filtro (cla_id, marca_id, modelo_id, cili_id o agno), o el campo 'empresa' (AUTOMARCO, AUTOTEC o GABTEC) para listar su catálogo completo."
          });
        }

        const { data, total } = await getProductosPorEmpresaPaginado(
          token, empresaFiltro, limitNum, pageNum, rut, sucursales
        );
        const productsImg = await prepareHateoas(data);

        return res.status(200).json(respuestaPaginada(productsImg, total, pageNum, limitNum));
      }

      const { data, total } = await getProducts(
        token,
        order_by,
        limitNum,
        pageNum,
        cla_id,
        marca_id,
        modelo_id,
        cili_id,
        agno,
        rut,
        sucursales,
        empresaFiltro
      );

      const productsImg = await prepareHateoas(data);
      res.status(200).json(respuestaPaginada(productsImg, total, pageNum, limitNum));
    }

  } catch (error) {
    console.log("Error en getAllProductsAplications:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


export default getAllProductsAplications1;