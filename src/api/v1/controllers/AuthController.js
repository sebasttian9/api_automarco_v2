import jwt from "jsonwebtoken";
import { verificarApiKey, actualizarTokenCliente } from "../models/authModel.js";
import { JWT_EXPIRES_IN } from "../helpers/jwtConfig.js";

const JWT_SECRET = process.env.JWT_SECRET;

// El cliente renueva su propio token usando su api-key fija (entregada una
// sola vez al crear su acceso, ver generartokendb.js), sin depender de que el
// equipo se lo regenere manualmente cada vez que vence.
const renovarTokenController = async (req, res) => {
  try {
    const { rut, api_key } = req.body;

    if (!rut || !api_key) {
      return res.status(400).json({ message: "rut y api_key son obligatorios." });
    }

    const cliente = await verificarApiKey(rut, api_key);
    if (!cliente) {
      // Mensaje genérico a propósito: no distingue "rut no existe" de
      // "api_key incorrecta", para no facilitar enumerar clientes válidos.
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    const nuevoToken = jwt.sign(
      { rut: cliente.rut, nombre: cliente.nombre, cli_id: cliente.cli_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await actualizarTokenCliente(cliente.rut, nuevoToken);

    res.status(200).json({ token: nuevoToken, expira_en: JWT_EXPIRES_IN });
  } catch (error) {
    console.error("Error renovando token:", error.message);
    res.status(500).json({ message: "No se pudo renovar el token." });
  }
};

export { renovarTokenController };
