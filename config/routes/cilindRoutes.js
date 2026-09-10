import express from "express";

import { getAllCilindrada } from '../../src/api/v1/controllers/CilindController.js';


const router = express.Router();

router.get("/cilindrada", getAllCilindrada);

export default router;