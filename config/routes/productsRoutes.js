import express from "express";

import {
  getStockProductsController,
  insertarPedidosRepSolController,
  getOCdefinitivaController,
  getProductbyIdController,
  getInfoTRController,
  getVolumetriaWmsController,
  getAllRecetasController,
  getImagenesProductosController
} from "../../src/api/v1/controllers/ProductsController.js";
import getAllProductsAplications1 from "../../src/api/v1/controllers/productscontroller1.js";
import { insertarPedidosDisamController } from "../../src/api/v1/controllers/PedidosDisamController.js";

import { existCla } from "../../src/api/v1/middlewares/valida_clasificacion.js";
import { escrituraLimiter } from "../../src/api/v1/middlewares/rateLimiter.js";



const router = express.Router();


router.post("/products",existCla ,getAllProductsAplications1);


router.post("/pedidos", escrituraLimiter, insertarPedidosRepSolController);

router.post("/ordenes-disam", escrituraLimiter, insertarPedidosDisamController);


router.get("/stock/:empresa/:codigo/:cantidad",  getStockProductsController);


router.post("/ocdefinitiva", getOCdefinitivaController);

router.get("/buscar-prod/:id", getProductbyIdController);
router.get("/cod-publicacion/:id", getInfoTRController);
router.get("/dimensiones/:producto", getVolumetriaWmsController);
router.get("/recetas", getAllRecetasController);
router.get("/imagenes-productos", getImagenesProductosController);


export default router;