import mysql from "mysql2/promise";

// NOTA: este archivo no parece estar importado desde ningún otro módulo de la
// API (es casi idéntico a config/bd.js). Se corrigieron igual las credenciales
// hardcodeadas por seguridad (hallazgo C6), pero conviene confirmar con el
// equipo si se puede eliminar directamente para no mantener dos configuraciones
// de conexión duplicadas (ver hallazgo C7).
const REQUIRED_VARS = ['DB_GESTIONCAR_HOST', 'DB_GESTIONCAR_USER', 'DB_GESTIONCAR_PASSWORD'];
const faltantes = REQUIRED_VARS.filter((v) => !process.env[v]);
if (faltantes.length > 0) {
  throw new Error(`Faltan variables de entorno para la BD 'gestioncar': ${faltantes.join(', ')}. Ver .env.example.`);
}

const connection1 = mysql.createPool({
  namedPlaceholders: true,
  host: process.env.DB_GESTIONCAR_HOST,
  port: Number(process.env.DB_GESTIONCAR_PORT) || 3306,
  user: process.env.DB_GESTIONCAR_USER,
  password: process.env.DB_GESTIONCAR_PASSWORD,
  database: process.env.DB_GESTIONCAR_DATABASE || 'gestioncar',
});

console.log("Conexión a MySQL establecida.");

export default connection1;
