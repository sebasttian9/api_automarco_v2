-- ============================================================================
-- Tablas para POST /api/v2/pedidos-planet (webhook de OC de Grupo Planet)
-- Base: bd_api_automarco (la misma de tbl_pedidos / tbl_pedidos_detalle).
--
-- Grupo Planet reintenta hasta 3 veces si no recibe 200 y despues avisa a su
-- equipo. Cada OC se guarda completa ANTES de procesarla; si falla queda con
-- estado 'con_error' y su motivo, y un reintento (o reenvio) la reprocesa.
-- ============================================================================

-- 1) Una fila por OC recibida (idempotencia por numero_oc).
CREATE TABLE IF NOT EXISTS bd_api_automarco.tbl_planet_oc (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_oc          VARCHAR(30)  NOT NULL,              -- orden_compra.numero
  fecha_oc           DATE         NULL,                  -- orden_compra.fecha (viene dd.mm.yyyy)
  cliente            VARCHAR(150) NULL,                  -- orden_compra.cliente
  codigo_cliente     VARCHAR(50)  NULL,                  -- codigo del local tomado de cliente ("AP0031 - Buin" -> AP0031)
  moneda            VARCHAR(10)  NULL,
  proveedor_rut      VARCHAR(15)  NULL,                  -- nosotros, segun Planet
  proveedor_codigo   VARCHAR(20)  NULL,
  despacho_centro    VARCHAR(150) NULL,
  despacho_direccion VARCHAR(255) NULL,
  total_neto         DECIMAL(14,2) NULL,
  total_bruto        DECIMAL(14,2) NULL,
  payload            LONGTEXT     NOT NULL,              -- JSON recibido, SIN pdf_base64
  pdf_path           VARCHAR(255) NULL,                  -- el PDF se guarda en disco (PLANET_PDF_DIR)
  estado             ENUM('recibida','procesada','con_error') NOT NULL DEFAULT 'recibida',
  error_detalle      TEXT         NULL,                  -- motivo si estado = con_error
  alertas            TEXT         NULL,                  -- avisos no bloqueantes (ej. diferencia de precio)
  pedidos            VARCHAR(255) NULL,                  -- correlativos generados, ej. "93-139965, 93-27841"
  intentos           INT UNSIGNED NOT NULL DEFAULT 1,    -- sube si la misma OC se vuelve a enviar
  fecha_recepcion    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_proceso      DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_planet_oc_numero (numero_oc),
  KEY idx_planet_oc_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Items de cada OC, tal como vinieron + lo que se resolvio al procesar.
CREATE TABLE IF NOT EXISTS bd_api_automarco.tbl_planet_oc_items (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  oc_id           INT UNSIGNED NOT NULL,
  item            VARCHAR(10)  NULL,                     -- items[].item ("001")
  codigo_planet   VARCHAR(40)  NULL,                     -- items[].codigo (codigo de Planet)
  orden_servicio  VARCHAR(40)  NULL,                     -- items[].orden_servicio (nuestro SKU, si lo mandan)
  descripcion     VARCHAR(255) NULL,
  cantidad        INT          NULL,
  um              VARCHAR(10)  NULL,
  precio_oc       DECIMAL(14,2) NULL,                    -- precio neto de la OC, SIN descuento aplicado
  descuento_oc    DECIMAL(5,2) NULL,                     -- items[].descuento_porcentaje
  sku             VARCHAR(40)  NULL,                     -- SKU nuestro resuelto
  empresa         VARCHAR(20)  NULL,                     -- AUTOMARCO / AUTOTEC / GABTEC / FRENOS / HD
  precio_lista    DECIMAL(14,2) NULL,                    -- nuestro precio de lista al momento de procesar
  descuento       DECIMAL(5,2) NULL,
  PRIMARY KEY (id),
  KEY idx_planet_items_oc (oc_id),
  CONSTRAINT fk_planet_items_oc FOREIGN KEY (oc_id)
    REFERENCES bd_api_automarco.tbl_planet_oc (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Equivalencia codigo de Planet -> SKU nuestro. Solo se usa cuando la OC
--    viene con items[].orden_servicio vacio (como en el ejemplo de su documento).
CREATE TABLE IF NOT EXISTS bd_api_automarco.tbl_planet_productos (
  codigo_planet VARCHAR(40) NOT NULL,
  sku           VARCHAR(40) NOT NULL,
  PRIMARY KEY (codigo_planet)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Local de Planet -> sucursal (cli_sec) del cliente Planet, por empresa
--    (los codigos de sucursal NO coinciden entre empresas).
--    Se busca primero por codigo_planet = codigo al inicio de orden_compra.cliente
--    ("AP0031 - Buin" -> AP0031, ver extraerCodigoCliente en helpers/planet.js);
--    si no hay fila, por direccion_normalizada = despacho.direccion en MAYUSCULAS,
--    sin tildes y con espacios simples (ver normalizarDireccion).
--    Para GABTEC y FRENOS se usa la fila de GABTEC (comparten sucursal).
CREATE TABLE IF NOT EXISTS bd_api_automarco.tbl_planet_despachos (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  direccion_normalizada VARCHAR(255) NOT NULL,
  empresa               VARCHAR(20)  NOT NULL,           -- AUTOMARCO / AUTOTEC / GABTEC / HD
  cli_sec               VARCHAR(10)  NOT NULL,
  descripcion           VARCHAR(150) NULL,               -- nota libre, ej. "AutoPlanet Santa Cruz"
  codigo_planet         VARCHAR(50)  NULL,               -- codigo del local de Planet, ej. AP0031
  PRIMARY KEY (id),
  UNIQUE KEY uk_planet_despacho (direccion_normalizada, empresa),
  UNIQUE KEY uk_planet_despacho_codigo (codigo_planet, empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ejemplo de carga (ajustar con los datos reales de Planet):
-- INSERT INTO bd_api_automarco.tbl_planet_despachos (direccion_normalizada, empresa, cli_sec, descripcion, codigo_planet)
-- VALUES ('RAMON SANFURGO 190 SANTA CRUZ', 'AUTOMARCO', '12', 'AutoPlanet Santa Cruz', 'AP0012');

-- ============================================================================
-- MIGRACION 2026-09-29: solo si las tablas ya se habian creado con la version
-- anterior de este archivo (sin descuento_oc). Planet confirmo que el precio
-- viene SIN descuento y el descuento aparte en items[].descuento_porcentaje.
-- ============================================================================
-- ALTER TABLE bd_api_automarco.tbl_planet_oc_items
--   ADD COLUMN descuento_oc DECIMAL(5,2) NULL AFTER precio_oc;

-- ============================================================================
-- MIGRACION 2026-09-29 (b): numero y fecha de la OC del cliente en el pedido.
-- El proceso que completa la inyeccion en la DMZ los escribe en la observacion
-- con formato "OC:{oc_numero}:{oc_fecha como ddmmaaaa}" (ej. OC:4700018925:15072026)
-- para que salgan en la factura. Nulas para los pedidos que no traen OC.
-- Correr ANTES de habilitar /pedidos-planet (/pedidos no las necesita).
-- ============================================================================
ALTER TABLE bd_api_automarco.tbl_pedidos
  ADD COLUMN oc_numero VARCHAR(30) NULL,
  ADD COLUMN oc_fecha  DATE        NULL;

-- ============================================================================
-- MIGRACION 2026-10-05: sucursal por codigo del local (orden_compra.cliente).
-- Correr ANTES de subir la version de la API que la usa: el INSERT/UPDATE de
-- tbl_planet_oc escribe codigo_cliente.
-- En una base nueva NO correr esta seccion: los CREATE TABLE de arriba ya traen
-- estas columnas e indices.
-- tbl_planet_despachos.codigo_planet ya fue agregada a mano en produccion; el
-- ADD COLUMN de abajo es solo para bases donde todavia no existe.
-- Antes del indice unico, revisar que no haya duplicados:
--   SELECT codigo_planet, empresa, COUNT(*) FROM bd_api_automarco.tbl_planet_despachos
--   WHERE codigo_planet IS NOT NULL GROUP BY codigo_planet, empresa HAVING COUNT(*) > 1;
-- ============================================================================
-- ALTER TABLE bd_api_automarco.tbl_planet_despachos
--   ADD COLUMN codigo_planet VARCHAR(50) NULL;
ALTER TABLE bd_api_automarco.tbl_planet_despachos
  ADD UNIQUE KEY uk_planet_despacho_codigo (codigo_planet, empresa);
ALTER TABLE bd_api_automarco.tbl_planet_oc
  ADD COLUMN codigo_cliente VARCHAR(50) NULL AFTER cliente;

-- ============================================================================
-- MIGRACION 2026-11-04: precio venta verde.
-- Las OC de Planet se facturan al precio "venta verde" (neto, con el descuento ya
-- aplicado): el pedido va con ese precio y descuento 0. Un SKU que no este en
-- esta tabla rechaza la OC (422 + correo a NOTIFICAR_PLANET_A).
-- La tabla se reemplaza entera con scripts/cargarPreciosPlanet.js <archivo.csv>.
-- Correr ANTES de subir la version de la API que la usa.
-- ============================================================================
CREATE TABLE IF NOT EXISTS bd_api_automarco.tbl_planet_precios (
  sku          VARCHAR(40)   NOT NULL,                   -- nuestro SKU, ej. "10038-2"
  precio       DECIMAL(14,2) NOT NULL,                   -- precio venta verde, neto con descuento
  fecha_carga  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- precio verde con el que se genero el pedido (precio_lista sigue siendo nuestra lista)
ALTER TABLE bd_api_automarco.tbl_planet_oc_items
  ADD COLUMN precio_verde DECIMAL(14,2) NULL AFTER precio_lista;

-- ============================================================================
-- MIGRACION envio del PDF de la OC (scripts/envioPdfPlanet.js, cron).
-- YA APLICADA EN PRODUCCION (se hizo a mano; se documenta aca el 2026-11-04).
-- oc_pdf_enviado: 1 cuando el correo con el PDF salio; NULL/0 = pendiente.
-- ============================================================================
-- ALTER TABLE bd_api_automarco.tbl_pedidos
--   ADD COLUMN oc_pdf_enviado     TINYINT(1) NULL,
--   ADD COLUMN oc_pdf_fecha_envio DATETIME   NULL;
