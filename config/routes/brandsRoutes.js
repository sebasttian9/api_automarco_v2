import express from "express";

import { getAllBrands } from '../../src/api/v1/controllers/BrandsController.js';


const router = express.Router();

router.get("/brands", getAllBrands);

export default router;