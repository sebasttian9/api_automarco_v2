import app from "./app.js";

// Puerto de v2. Distinto al de v1 (3000) para poder correr ambas versiones
// en paralelo en la misma maquina mientras se prueba v2 antes de reemplazar v1.
// v2 debe quedar accesible desde afuera en https://apiproductos.automarco.cl:3008
const PORT = process.env.PORT || 3008;

// Levantamos el servidor en modo HTTP normal (sin certificados SSL)
app.listen(PORT, () => {
  console.log(`API v2 escuchando en el puerto ${PORT}`);
});