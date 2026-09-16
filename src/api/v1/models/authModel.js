import bcrypt from "bcryptjs";
import connection from "../../../../config/bdPedidosApi.js";

// Hash "señuelo" contra el que comparar cuando el rut no existe, para que el
// tiempo de respuesta no delate si un rut es cliente o no.
const HASH_SENUELO = bcrypt.hashSync("rut-inexistente", 10);

// Busca al cliente por rut y verifica su api-key contra el hash guardado.
// Devuelve los datos para firmar un nuevo JWT, o null si el rut no existe o
// la api-key no coincide (mismo resultado en ambos casos).
const verificarApiKey = async (rut, apiKey) => {
  try {
    const [rows] = await connection.execute(
      `SELECT rut, nombre, cli_id, api_key_hash FROM bd_api_automarco.tbl_permisos_clientes WHERE rut = ?`,
      [rut]
    );

    const fila = rows[0];
    const hashAComparar = fila?.api_key_hash || HASH_SENUELO;
    const coincide = await bcrypt.compare(apiKey, hashAComparar);

    if (!fila || !fila.api_key_hash || !coincide) return null;

    return { rut: fila.rut, nombre: fila.nombre, cli_id: fila.cli_id };
  } catch (error) {
    console.error("Error verificando api-key:", error.message);
    return null;
  }
};

const actualizarTokenCliente = async (rut, nuevoToken) => {
  await connection.execute(
    `UPDATE bd_api_automarco.tbl_permisos_clientes SET api_token = ? WHERE rut = ?`,
    [nuevoToken, rut]
  );
};

export { verificarApiKey, actualizarTokenCliente };
