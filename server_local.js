import app from "./app.js";
import https from "https";
import fs from "fs";

// Puerto de v2. Distinto al de v1 (3000) para poder correr ambas versiones
// en paralelo en la misma maquina mientras se prueba v2 antes de reemplazar v1.
// v2 debe quedar accesible desde afuera en https://apiproductos.automarco.cl:3008
const PORT = process.env.PORT || 3008;

// Mismos certificados que usa v1 (server_apiproductos.js) para ese dominio.
// Configurables por si en el servidor real viven en otra ruta.
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "/etc/letsencrypt/live/apiproductos.automarco.cl/privkey.pem";
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "/etc/letsencrypt/live/apiproductos.automarco.cl/fullchain.pem";

// En el servidor de producción estos archivos existen -> levanta HTTPS, igual que v1.
// En un entorno local (o cualquier máquina sin esos certificados) no existen -> cae
// a HTTP plano automáticamente, para no romper las pruebas locales.
const hayCertificados = fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);

if (hayCertificados) {
  const credentials = {
    key: fs.readFileSync(SSL_KEY_PATH, "utf8"),
    cert: fs.readFileSync(SSL_CERT_PATH, "utf8"),
  };

  https.createServer(credentials, app).listen(PORT, () => {
    console.log(`API v2 (HTTPS) escuchando en el puerto ${PORT}`);
  });
} else {
  console.warn(`No se encontraron certificados SSL en ${SSL_KEY_PATH} — levantando en HTTP plano (uso local/desarrollo).`);

  app.listen(PORT, () => {
    console.log(`API v2 (HTTP) escuchando en el puerto ${PORT}`);
  });
}