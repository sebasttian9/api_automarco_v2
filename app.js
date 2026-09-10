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
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from 'path';
import clientRoutes from './config/routes/sucursalesRoutes.js';
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


app.use("/api/v2", verificarToken, validarIP, productsRouter);
app.use("/api/v2", verificarToken, validarIP, categoryRouter);
app.use("/api/v2", verificarToken, validarIP, brandsRouters);
app.use("/api/v2", verificarToken, validarIP, modelsRouter);
app.use("/api/v2", verificarToken, validarIP, cilidRouters);
app.use("/api/v2", verificarToken, validarIP, transportRoutes);
app.use("/api/v2", verificarToken, validarIP, clientRoutes);
export default app;