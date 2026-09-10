import mysql from 'mysql2/promise';

// Hallazgo C6: antes el host, usuario y contraseña reales de esta base de datos
// estaban escritos en este archivo y versionados en Git. Ahora salen de variables
// de entorno (ver .env.example). Falla rápido si faltan, en vez de intentar
// conectarse con datos vacíos.
const REQUIRED_VARS = ['DB_GESTIONCAR_HOST', 'DB_GESTIONCAR_USER', 'DB_GESTIONCAR_PASSWORD'];

const connect = async () => {

    const faltantes = REQUIRED_VARS.filter((v) => !process.env[v]);
    if (faltantes.length > 0) {
        throw new Error(`Faltan variables de entorno para la BD 'gestioncar': ${faltantes.join(', ')}. Ver .env.example.`);
    }

    try {

        const connection = await mysql.createPool({
            namedPlaceholders: true,
            host: process.env.DB_GESTIONCAR_HOST,
            port: Number(process.env.DB_GESTIONCAR_PORT) || 3306,
            user: process.env.DB_GESTIONCAR_USER,
            password: process.env.DB_GESTIONCAR_PASSWORD,
            database: process.env.DB_GESTIONCAR_DATABASE || 'gestioncar'

        });

        console.log('Conexión a MySQL establecida.');
        return connection;

    } catch (error) {

        console.error('Error al conectar a MySQL:', error);
        throw error;

    }



}


export default connect;
