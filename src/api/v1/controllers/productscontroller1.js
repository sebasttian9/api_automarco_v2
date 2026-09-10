import {
  getProducts,
  getProductsCategory,
} from "../models/productmodel1.js";

import prepareHateoas from "../helpers/hateoas.js";

const getAllProductsAplications1 = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token.' });
    }
    
 
    const token = authHeader.replace('Bearer ', '').trim();


    if (req.existe_clasificacion) {
      // busqueda solo por clasificacion
      
      const { order_by, page, limits, cla_id } = req.body;

      // Validaciones
      if (!cla_id || cla_id == 0) {
        return res.status(400).json({ message: "Categoria (cla_id) es requerida!" });
      }

 
      const products = await getProductsCategory(
        token,    
        order_by,
        limits,
        page,
        cla_id
      );

      const productsImg = await prepareHateoas(products);

      res.status(200).json(productsImg);

    } else {


      const {
        order_by,
        page,
        limits,
        cla_id,
        marca_id,
        modelo_id,
        cili_id,
        agno,
      } = req.body;

      // Validaciones
      if (!cla_id || cla_id == 0) return res.status(400).json({ message: "Categoria (cla_id) es requerida!" });
      if (!marca_id || marca_id == 0) return res.status(400).json({ message: "Marca (marca_id) es requerida!" });
      if (!modelo_id || modelo_id == 0) return res.status(400).json({ message: "Modelo (modelo_id) es requerido!" });
      if (!cili_id || cili_id == 0) return res.status(400).json({ message: "Cilindrada (cili_id) es requerida!" });
      if (!agno || agno == 0) return res.status(400).json({ message: "Año (agno) es requerido!" });


      const products = await getProducts(
        token,    
        order_by,
        limits,
        page,
        cla_id,
        marca_id,
        modelo_id,
        cili_id,
        agno
      );

      const productsImg = await prepareHateoas(products);
      res.status(200).json(productsImg);
    }

  } catch (error) {
    console.log("Error en getAllProductsAplications:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


export default getAllProductsAplications1;