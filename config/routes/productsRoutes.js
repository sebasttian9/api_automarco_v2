import express from "express";

import {
  getStockProductsController,
  insertarPedidosRepSolController,
  getOCdefinitivaController
} from "../../src/api/v1/controllers/ProductsController.js";
import getAllProductsAplications1 from "../../src/api/v1/controllers/productscontroller1.js";

import { existCla } from "../../src/api/v1/middlewares/valida_clasificacion.js";



const router = express.Router();


router.post("/products",existCla ,getAllProductsAplications1);

 
router.post("/pedidos", insertarPedidosRepSolController);


router.get("/stock/:empresa/:codigo/:cantidad",  getStockProductsController);


router.post("/ocdefinitiva", getOCdefinitivaController);


export default router;