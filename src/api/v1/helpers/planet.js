// Utilidades para interpretar la OC de Grupo Planet (POST /pedidos-planet).
// Planet envia todo como string y con formato chileno: "34.098" son $34.098
// (punto = miles) y la fecha viene como "15.07.2026" (dd.mm.yyyy).

// "34.098" -> 34098 | "1.234,5" -> 1234.5 | "" / null -> null
const parseNumeroCL = (valor) => {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;

  const normalizado = texto.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
};

// "15.07.2026" -> "2026-07-15" | formato invalido -> null
const parseFechaPlanet = (valor) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(valor || "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const fecha = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (isNaN(fecha) || fecha.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

// Clave estable para buscar la direccion de despacho en tbl_planet_despachos:
// mayusculas, sin tildes, espacios simples.
const normalizarDireccion = (valor) =>
  String(valor || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

// Codigo del local de Planet al inicio de orden_compra.cliente, que se busca en
// tbl_planet_despachos.codigo_planet: "AP0031 - Buin" -> "AP0031" |
// "AP0031" -> "AP0031" | sin ese formato -> null
const extraerCodigoCliente = (valor) => {
  const m = /^\s*([A-Za-z0-9]+)\s*(?:-|$)/.exec(String(valor || ""));
  return m ? m[1].toUpperCase() : null;
};

export { parseNumeroCL, parseFechaPlanet, normalizarDireccion, extraerCodigoCliente };
