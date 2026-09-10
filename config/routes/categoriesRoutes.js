import express from "express";

import { getAllCategory } from '../../src/api/v1/controllers/CategoryController.js';


const router = express.Router();

router.get("/category", getAllCategory);

export default router;