import crypto from "crypto";
import bcrypt from "bcryptjs";

// Autenticacion Basic para el webhook de Grupo Planet (POST /pedidos-planet).
// Planet no usa nuestro JWT: su documento (punto 6.2) exige Basic, con un
// usuario/contraseña que nosotros les entregamos. La contraseña se guarda
// hasheada con bcrypt en PLANET_BASIC_PASS_HASH, nunca en texto plano.
//
// Generar el hash:
//   node -e "console.log(require('bcryptjs').hashSync('LA_CONTRASEÑA', 10))"

const PLANET_USER = process.env.PLANET_BASIC_USER;
const PLANET_PASS_HASH = process.env.PLANET_BASIC_PASS_HASH;

// compara sin filtrar por tiempo de respuesta cuantos caracteres coinciden
const igualesSeguro = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const rechazar = (res) => {
  res.set("WWW-Authenticate", 'Basic realm="pedidos-planet"');
  return res.status(401).json({ message: "No autorizado." });
};

const verificarBasicAuthPlanet = async (req, res, next) => {
  if (!PLANET_USER || !PLANET_PASS_HASH) {
    console.error("Faltan PLANET_BASIC_USER / PLANET_BASIC_PASS_HASH en el entorno: /pedidos-planet queda cerrado.");
    return res.status(503).json({ message: "Servicio no configurado." });
  }

  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Basic ")) return rechazar(res);

  const decodificado = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const separador = decodificado.indexOf(":");
  if (separador < 0) return rechazar(res);

  const usuario = decodificado.slice(0, separador);
  const password = decodificado.slice(separador + 1);

  const usuarioOk = igualesSeguro(usuario, PLANET_USER);
  const passwordOk = await bcrypt.compare(password, PLANET_PASS_HASH);
  if (!usuarioOk || !passwordOk) return rechazar(res);

  // mismo formato que deja verificarToken, para logs / rate limit
  req.user = { rut: process.env.PLANET_CLIENTE_RUT || "PLANET", nombre: "GRUPO PLANET" };
  next();
};

export default verificarBasicAuthPlanet;
