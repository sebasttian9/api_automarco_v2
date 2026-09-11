import 'dotenv/config';
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import readline from "readline";

// Hallazgo C6/C7: antes esta conexión (y la de config/bdPedidosApi.js) apuntaba a
// 'localhost' con usuario root sin contraseña, hardcodeado. Ahora usa las mismas
// variables de entorno DB_PEDIDOS_* que el servidor, para que este script siempre
// apunte al mismo servidor de base de datos que la API (ver .env.example).
const REQUIRED_VARS = ['DB_PEDIDOS_HOST', 'DB_PEDIDOS_USER', 'DB_PEDIDOS_PASSWORD'];
const faltantes = REQUIRED_VARS.filter((v) => !process.env[v]);
if (faltantes.length > 0) {
    console.error(`Faltan variables de entorno: ${faltantes.join(', ')}. Ver .env.example.`);
    process.exit(1);
}

const dbConfig = {
    namedPlaceholders: true,
    host: process.env.DB_PEDIDOS_HOST,
    port: Number(process.env.DB_PEDIDOS_PORT) || 3306,
    user: process.env.DB_PEDIDOS_USER,
    password: process.env.DB_PEDIDOS_PASSWORD,
    database: process.env.DB_PEDIDOS_DATABASE || 'bd_api_automarco'
};

// Hallazgo C5: la clave para firmar el token debe ser la misma que usa el servidor
// para verificarlo (JWT_SECRET), nunca un valor hardcodeado en el código.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('Falta la variable de entorno JWT_SECRET (debe ser la misma que usa el servidor). Ver .env.example.');
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const preguntar = (texto) => {
    return new Promise((resolve) => {
        rl.question(texto, (respuesta) => resolve(respuesta));
    });
};

async function generarToken() {
    let connection;
    try {

        // pedir RUT
        const rutInput = await preguntar('Ingrese RUT del cliente: ');
        
        connection = await mysql.createConnection(dbConfig);
        
        // buscar rut en la tabla clientes (ahora en las 4 empresas)
        // array con las bases de datos posibles
        const basesDeDatos = [
            'automarc_automarco', 
            'autotec_ecom', 
            'autohd_automarcohd', 
            'gabteccl_sitbdd1978'
        ];
        
        let nombreCliente = "";
        let cli_id = null;
        let encontrado = false;

        for (const dbName of basesDeDatos) {
            try {
                // intenta buscar en cada base de datos
                const sqlCheck = `SELECT cli_razon_social, cli_id FROM ${dbName}.tbl_clientes WHERE cli_rut = ?`; 
                const [rows] = await connection.execute(sqlCheck, [rutInput]);

                if (rows.length > 0) {
                    nombreCliente = rows[0].cli_razon_social;
                    cli_id = rows[0].cli_id;
                    encontrado = true;
                    break; // si se encuentra se cierra el bucle
                }
            } catch (err) {
            // si no lo encuentra sigue
                continue;
            }
        }

        if (!encontrado) {
            console.log(`ERROR: El RUT ${rutInput} no existe en ninguna tabla de clientes.`);
            process.exit(1);
        }


        // define permisos por consola
        console.log("--- DEFINIR PERMISOS (s = sí, enter = no) ---");
        
        const r1 = await preguntar('¿Permiso AUTOMARCO? : ');
        const r2 = await preguntar('¿Permiso GABTEC?    : ');
        const r3 = await preguntar('¿Permiso AUTOTEC?   : ');
        const r4 = await preguntar('¿Permiso HD?        : ');

        const dbPermisos = {
            automarco: r1.toLowerCase().trim() === 's' ? 1 : 0,
            gabtec:    r2.toLowerCase().trim() === 's' ? 1 : 0,
            autotec:   r3.toLowerCase().trim() === 's' ? 1 : 0,
            hd:        r4.toLowerCase().trim() === 's' ? 1 : 0
        };

        // genera token
        const payload = { 
            rut: rutInput,
            nombre: nombreCliente,
            cli_id: cli_id
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '365d' });

      
        // insertar datos de permisos y token en la bd
        const sqlUpsert = `
            INSERT INTO bd_api_automarco.tbl_permisos_clientes (rut, api_token, automarco, gabtec, autotec, hd)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                api_token = VALUES(api_token),
                automarco = VALUES(automarco),
                gabtec = VALUES(gabtec),
                autotec = VALUES(autotec),
                hd = VALUES(hd)
        `;

        await connection.execute(sqlUpsert, [
            rutInput,
            token, 
            dbPermisos.automarco, 
            dbPermisos.gabtec, 
            dbPermisos.autotec, 
            dbPermisos.hd
        ]);


        console.log(`Cliente:  ${nombreCliente}`);
        console.log(`RUT:      ${rutInput}`);
        console.log(`Permisos: Automarco[${dbPermisos.automarco}] Gabtec[${dbPermisos.gabtec}] Autotec[${dbPermisos.autotec}] HD[${dbPermisos.hd}]`);
        console.log("\nToken Generado:");
        console.log(token);


    } catch (error) {
        console.error(" Error:", error.message);
    } finally {
        if (connection) await connection.end(); 
        rl.close();
    }
}

generarToken();