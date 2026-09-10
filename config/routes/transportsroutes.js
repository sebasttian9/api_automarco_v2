import express from "express";

import { getAllTransportes } from '../../src/api/v1/controllers/transportsController.js'; 

const router = express.Router(); 

// Definimos la ruta
router.get("/transportes", getAllTransportes);


export default router;