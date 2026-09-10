import express from "express";

import { getAllModels } from '../../src/api/v1/controllers/ModelsController.js';


const router = express.Router();

router.get("/models", getAllModels);

export default router;