import express from "express";




import { getSucursalesController } from "../../src/api/v1/controllers/SucursalesController.js";

const router = express.Router();


router.get("/sucursales", getSucursalesController);

export default router;