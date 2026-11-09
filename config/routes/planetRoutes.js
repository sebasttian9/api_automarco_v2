import express from "express";
import verificarBasicAuthPlanet from "../../src/api/v1/middlewares/basicAuthPlanet.js";
import logPlanet from "../../src/api/v1/middlewares/logPlanet.js";
import { planetLimiter } from "../../src/api/v1/middlewares/rateLimiter.js";
import { recibirOCPlanetController } from "../../src/api/v1/controllers/PedidosPlanetController.js";

const router = express.Router();

// Webhook de OC de Grupo Planet. Va con Basic (no JWT) y con su propio parser:
// la OC trae el PDF en base64 (hasta 25 MB), muy por sobre los 100 KB del
// express.json() global. El limite corre ANTES de la autenticacion (frena
// fuerza bruta) y la autenticacion ANTES de leer el body (no se parsean 30 MB
// de alguien sin credenciales). logPlanet va primero: deja cada peticion en
// logs/pedidos-planet.log, incluidas las rechazadas.
router.post(
  "/pedidos-planet",
  logPlanet,
  planetLimiter,
  verificarBasicAuthPlanet,
  express.json({ limit: "40mb" }),
  recibirOCPlanetController
);

export default router;
