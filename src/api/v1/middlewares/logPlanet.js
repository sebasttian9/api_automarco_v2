import fs from "fs";
import path from "path";

// Registro de cada peticion a POST /pedidos-planet en logs/pedidos-planet.log.
// El webhook se monta antes del logger() global (ver app.js), asi que sin esto
// no quedaba rastro de las peticiones rechazadas (401, 429, 413...) ni de las
// que no alcanzan a guardarse en tbl_planet_oc. Va PRIMERO en la ruta para
// registrar tambien las que cortan el rate limit o la autenticacion.
//
// Una linea por peticion, ej.:
// 2026-11-09T14:03:11.120Z ip=200.1.2.3 status=200 ms=842 usuario=planet oc=4700018925 items=3 bytes=812345
// 2026-11-09T14:05:40.002Z ip=200.1.2.3 status=401 ms=95 usuario=otro oc=- items=- bytes=1200 msg="No autorizado."

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "pedidos-planet.log");

// usuario del header Basic (nunca la contraseña), para distinguir credenciales malas
const usuarioBasic = (req) => {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Basic ")) return header ? "(no-basic)" : "(sin-auth)";
  const decodificado = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const sep = decodificado.indexOf(":");
  return (sep < 0 ? decodificado : decodificado.slice(0, sep)).slice(0, 50) || "(vacio)";
};

const logPlanet = (req, res, next) => {
  const inicio = Date.now();

  // guarda el message de las respuestas JSON de error para dejarlo en el log
  let mensaje = null;
  const jsonOriginal = res.json.bind(res);
  res.json = (body) => {
    if (body && body.message) mensaje = String(body.message);
    return jsonOriginal(body);
  };

  res.on("finish", () => {
    // el body solo esta parseado si la peticion paso la autenticacion
    const body = req.body || {};
    const oc = body.orden_compra?.numero ?? "-";
    const items = Array.isArray(body.items) ? body.items.length : "-";
    const linea = [
      new Date(inicio).toISOString(),
      `ip=${req.ip}`,
      `status=${res.statusCode}`,
      `ms=${Date.now() - inicio}`,
      `usuario=${usuarioBasic(req)}`,
      `oc=${String(oc).replace(/\s+/g, "_")}`,
      `items=${items}`,
      `bytes=${req.headers["content-length"] ?? "-"}`,
      mensaje && res.statusCode >= 400 ? `msg=${JSON.stringify(mensaje.slice(0, 300))}` : null,
    ].filter(Boolean).join(" ");

    console.log(`[pedidos-planet] ${linea}`);
    fs.mkdir(LOG_DIR, { recursive: true }, () => {
      fs.appendFile(LOG_FILE, linea + "\n", (error) => {
        if (error) console.error("No se pudo escribir logs/pedidos-planet.log:", error.message);
      });
    });
  });

  next();
};

export default logPlanet;
