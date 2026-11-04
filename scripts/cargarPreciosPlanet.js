import "dotenv/config";
import fs from "fs";
import connection from "../config/bdPedidosApi.js";

// Carga la lista de precios "venta verde" de Grupo Planet en
// bd_api_automarco.tbl_planet_precios (ver sql/planet_oc.sql, migracion 2026-11-04).
// La tabla se REEMPLAZA entera: un SKU que no venga en el archivo deja de tener
// precio verde y sus OC se rechazan.
//
//   cd /usr/local/apiproductos-v2 && node scripts/cargarPreciosPlanet.js lista.csv            (solo revisa)
//   cd /usr/local/apiproductos-v2 && node scripts/cargarPreciosPlanet.js lista.csv --grabar   (reemplaza la tabla)
//
// El archivo es el Excel exportado a CSV (separado por coma o punto y coma), con
// encabezado. Se usan las columnas "Codigo de Compra" y "PRECIO VTA VERDE"
// (ej. "10038-2" y " $ 5.805 ").

const COL_SKU = "CODIGO DE COMPRA";
const COL_PRECIO = "PRECIO VTA VERDE";

const normalizarEncabezado = (s) =>
  s.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// " $ 5.805 " -> 5805 ; "5.805,50" -> 5805.5
const parsePrecio = (s) => {
  const limpio = String(s).replace(/[$\s.]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : null;
};

const leerArchivo = (archivo) => {
  const lineas = fs.readFileSync(archivo, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) throw new Error("El archivo no trae filas.");

  const sep = lineas[0].includes(";") ? ";" : ",";
  const encabezado = lineas[0].split(sep).map(normalizarEncabezado);
  const iSku = encabezado.indexOf(COL_SKU);
  const iPrecio = encabezado.indexOf(COL_PRECIO);
  if (iSku < 0 || iPrecio < 0) {
    throw new Error(`No se encontraron las columnas "${COL_SKU}" y "${COL_PRECIO}" en el encabezado: ${lineas[0]}`);
  }

  const precios = new Map();
  const errores = [];
  lineas.slice(1).forEach((linea, i) => {
    const cols = linea.split(sep).map((c) => c.replace(/^"|"$/g, ""));
    const sku = (cols[iSku] || "").trim().toUpperCase();
    const precio = parsePrecio(cols[iPrecio] || "");
    const fila = i + 2;
    if (!/^\d+-[\dK]$/.test(sku)) return errores.push(`fila ${fila}: SKU invalido "${cols[iSku]}"`);
    if (!precio) return errores.push(`fila ${fila}: precio invalido "${cols[iPrecio]}" (${sku})`);
    if (precios.has(sku) && precios.get(sku) !== precio) {
      return errores.push(`fila ${fila}: ${sku} repetido con otro precio (${precios.get(sku)} y ${precio})`);
    }
    precios.set(sku, precio);
  });
  return { precios, errores };
};

const main = async () => {
  const archivo = process.argv[2];
  const grabar = process.argv.includes("--grabar");
  if (!archivo) throw new Error("Uso: node scripts/cargarPreciosPlanet.js <archivo.csv> [--grabar]");

  const { precios, errores } = leerArchivo(archivo);
  console.log(`SKU leidos: ${precios.size}`);
  if (errores.length > 0) {
    // no se graba nada a medias: se corrige el archivo y se vuelve a correr
    throw new Error(`El archivo tiene ${errores.length} fila(s) con problemas, no se grabo nada:\n  ${errores.join("\n  ")}`);
  }

  const [actuales] = await connection.query(`SELECT sku, precio FROM bd_api_automarco.tbl_planet_precios`);
  const antes = new Map(actuales.map((r) => [r.sku, Number(r.precio)]));
  const nuevos = [...precios.keys()].filter((s) => !antes.has(s));
  const quitados = [...antes.keys()].filter((s) => !precios.has(s));
  const cambiados = [...precios].filter(([s, p]) => antes.has(s) && antes.get(s) !== p);
  console.log(`En la tabla hoy: ${antes.size} | nuevos: ${nuevos.length} | cambian precio: ${cambiados.length} | se quitan: ${quitados.length}`);
  if (quitados.length > 0) console.log(`  Se quitan: ${quitados.join(", ")}`);

  if (!grabar) {
    console.log("Solo revision. Para reemplazar la tabla, correr de nuevo con --grabar.");
    return;
  }

  const db = await connection.getConnection();
  try {
    await db.beginTransaction();
    await db.query(`DELETE FROM bd_api_automarco.tbl_planet_precios`);
    const filas = [...precios].map(([sku, precio]) => [sku, precio]);
    for (let i = 0; i < filas.length; i += 500) {
      await db.query(`INSERT INTO bd_api_automarco.tbl_planet_precios (sku, precio) VALUES ?`, [filas.slice(i, i + 500)]);
    }
    await db.commit();
    console.log(`Tabla reemplazada: ${filas.length} precios.`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
};

main()
  .catch((error) => {
    console.error("Error en cargarPreciosPlanet:", error.message);
    process.exitCode = 1;
  })
  .finally(() => connection.end());
