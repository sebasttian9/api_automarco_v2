import mysql from "mysql2/promise";

// Hallazgo C7: este archivo se llamaba "bdpedidosprueba.js" (sugería que era una
// config de pruebas) pero en realidad es la conexión que usa TODO el flujo real:
// permisos (tiene_permiso), pedidos, logs, sucursales, transportes y el catálogo
// de productos por vehículo. Se renombró para que el nombre no induzca a error, y
// las credenciales (antes 'localhost' / root / sin contraseña, hardcodeadas) ahora
// salen de variables de entorno (ver .env.example).
//
// Pendiente de confirmar con el equipo: a qué host de base de datos debe apuntar
// esto en producción (¿el mismo servidor que config/bd.js, o uno distinto?).
const REQUIRED_VARS = ['DB_PEDIDOS_HOST', 'DB_PEDIDOS_USER', 'DB_PEDIDOS_PASSWORD'];
const faltantes = REQUIRED_VARS.filter((v) => !process.env[v]);
if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno para la BD principal (pedidos/permisos/logs): ${faltantes.join(', ')}. Ver .env.example.`);
}

const connection = mysql.createPool({
    namedPlaceholders: true,
    host: process.env.DB_PEDIDOS_HOST,
    port: Number(process.env.DB_PEDIDOS_PORT) || 3306,
    user: process.env.DB_PEDIDOS_USER,
    password: process.env.DB_PEDIDOS_PASSWORD,
    database: process.env.DB_PEDIDOS_DATABASE || 'bd_api_automarco'
})

console.log("Conexión a MySQL establecida (BD principal).");


export default connection;
