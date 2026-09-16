import 'dotenv/config';
import express from "express";
import cors from "cors";
import { logger } from "logger-express";
import modelsRouter from './config/routes/modelsRoutes.js';
import productsRouter from './config/routes/productsRoutes.js';
import categoryRouter from './config/routes/categoriesRoutes.js';
import brandsRouters from './config/routes/brandsRoutes.js';
import cilidRouters from './config/routes/cilindRoutes.js';
import transportRoutes from './config/routes/transportsroutes.js';
import verificarToken from "./src/api/v1/middlewares/autentificacion.js";
import validarIP from "./src/api/v1/middlewares/valida_ip.js";
import { lecturaLimiter } from "./src/api/v1/middlewares/rateLimiter.js";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from 'path';
import clientRoutes from './config/routes/sucursalesRoutes.js';
import authRoutes from './config/routes/authRoutes.js';
const app = express();


const swaggerDocument = YAML.load(path.join(process.cwd(), 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


app.use(express.json());
app.use(cors());
app.options("*", cors());
app.use(logger());
app.set('trust proxy', true);

app.get("/", (req,res)=>{
  res.send('Api GestionCar en linea');
});


// Sin verificarToken: es el endpoint para renovar el JWT cuando ya venció.
app.use("/api/v2", authRoutes);

app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, productsRouter);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, categoryRouter);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, brandsRouters);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, modelsRouter);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, cilidRouters);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, transportRoutes);
app.use("/api/v2", verificarToken, validarIP, lecturaLimiter, clientRoutes);
export default app;