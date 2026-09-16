import express from "express";
import { renovarTokenController } from "../../src/api/v1/controllers/AuthController.js";
import { authLimiter } from "../../src/api/v1/middlewares/rateLimiter.js";

const router = express.Router();

// Sin verificarToken a propósito: el cliente puede llegar acá justo porque
// su JWT ya venció. Se autentica con rut + api_key en el body.
router.post("/auth/renovar-token", authLimiter, renovarTokenController);

export default router;
