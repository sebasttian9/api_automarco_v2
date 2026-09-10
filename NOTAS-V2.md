# v2/ — copia de trabajo para las correcciones pre-producción

**Creado:** 10 de septiembre de 2026

## Qué es esta carpeta

Es una copia completa del código que hoy corre en la raíz del repo (`v1`), tomada tal
cual estaba en este commit. A partir de acá se van a aplicar las correcciones críticas
detectadas en la revisión (ver `plan_pruebas_api_automarco.md` en la raíz del repo /
en el proyecto de Claude): la suplantación de RUT en `/pedidos`, la falta de validación
de permisos por empresa en pedidos, las dos inyecciones SQL (`marca_id` y `order_by`),
los secretos hardcodeados, y el resto de los hallazgos C1–C7.

## Reglas mientras convivan v1/ y v2/

- **`v1/` (la raíz del repo) queda congelada.** No se le hacen cambios de negocio
  mientras se termina v2/, salvo un incidente de producción que no pueda esperar.
  Cualquier cambio nuevo — campos, endpoints, fixes — se hace acá, en `v2/`.
- **v2/ corre en el puerto 3008**, no 3000, justamente para poder tener los dos
  procesos levantados al mismo tiempo en el mismo servidor sin que choquen
  (`server_local.js` ya se ajustó para esto). Este puerto debe quedar accesible
  **desde afuera** en `https://apiproductos.automarco.cl:3008` — hay que coordinar
  con quien administra el firewall/proxy de ese dominio para que lo abra, ya que hoy
  solo el 3000 está expuesto públicamente.
- **v2/ usa el prefijo `/api/v2`** en vez de `/api/v1` (se ajustó en `app.js` y en
  `swagger.yaml`). Es decir, mientras se prueba, la URL completa de un endpoint es
  `https://apiproductos.automarco.cl:3008/api/v2/brands`. Importante: si en el corte
  final se decide que la API definitiva siga respondiendo en `/api/v1` (para que los
  clientes actuales no tengan que cambiar su URL), hay que revertir ese prefijo a
  `/api/v1` antes de reemplazar `v1/` — o, si se decide que `/api/v2` queda para
  siempre, avisar a todos los clientes actuales para que migren su URL base.
- **v2/ apunta a la misma base de datos que v1/ hoy** (decisión tomada explícitamente
  para esta etapa). Ojo con esto en las pruebas de `/pedidos`: cualquier pedido de
  prueba que se cree contra v2/ va a escribir datos reales en las mismas tablas que
  usa v1/. Si se quiere probar sin ese riesgo, hay que apuntar la config de
  `config/bdPedidosApi.js` (y `bd.js`/`bd2.js`) de v2/ a un ambiente aparte antes
  de correr los casos de prueba de creación de pedidos.
- Cuando v2/ pase el plan de pruebas, el corte a producción implica mover v2/ a la
  raíz (o apuntar el proceso/servicio de producción a esta carpeta) y dar de baja v1/.

## Correcciones críticas ya aplicadas acá (C1–C7)

- [x] **C1** — `/pedidos` ahora toma el RUT de `req.user.rut` (el token JWT ya
  verificado), no del header `x-rut-prueba`. Ver `ProductsController.js`.
- [x] **C2** — `/pedidos` valida permisos por empresa (`tiene_permiso`, vía
  `obtenerPermisos`) antes de insertar nada: si el pedido incluye una empresa sin
  permiso, se rechaza con `403` y se hace rollback. `FRENOS` se mapea al mismo
  permiso que `GABTEC` (es la misma tabla/base de datos).
- [x] **C3** — `ModelsModel.js`: `marca_id` ahora va parametrizado (`?`), ya no se
  concatena al SQL.
- [x] **C4** — `brandsModel.js`, `categoryModel.js`, `ModelsModel.js`: `direction`
  (parte de `order_by`) ahora sale de una whitelist fija (`ASC`/`DESC`); cualquier
  otro valor cae a `ASC` por defecto.
- [x] **C5** — la clave JWT ya no está hardcodeada: sale de `process.env.JWT_SECRET`
  (`.env.example` trae la plantilla) en `autentificacion.js` y `generartokendb.js`.
  El servidor no arranca si falta esa variable.
- [x] **C6** — `config/bd.js`, `config/bd2.js` y `config/bdPedidosApi.js` ya no
  tienen host/usuario/contraseña hardcodeados: salen de variables de entorno (ver
  `.env.example`). **Pendiente de ustedes:** rotar la contraseña real que quedó
  expuesta en el historial de Git (`2wkPnhSa4x`), ya que sacarla del código no
  invalida lo que ya quedó commiteado.
- [x] **C7** — se renombró `config/bdpedidosprueba.js` → `config/bdPedidosApi.js`
  para que el nombre no sugiera que es una config de pruebas, y ahora apunta a una
  base de datos real y propia: **`bd_api_automarco`** (creada por el equipo, con las
  tablas `tbl_permisos_clientes`, `tbl_logs`, `tbl_pedidos`, `tbl_pedidos_detalle`).
  Se actualizaron todas las consultas que antes apuntaban a `automarc_automarco.tiene_permiso`,
  `automarc_automarco.logs`, `pedidos_api.tbl_pedidos` y `pedidos_api.tbl_pedidos_detalle`
  (en `verificapermiso.js`, `generartokendb.js`, `logsModel.js` y `productsModel.js`)
  para que usen `bd_api_automarco` y los nombres de tabla nuevos — las columnas se
  confirmaron una por una contra el `CREATE TABLE` real de cada tabla y son idénticas
  a las que ya esperaba el código, así que no hubo que tocar ningún nombre de columna.
  `DB_PEDIDOS_DATABASE` en `.env.example` y el valor por defecto en el código ahora
  son `bd_api_automarco`.
  **Sigue pendiente de decidir con el equipo:** a qué host debe apuntar `DB_PEDIDOS_HOST`
  en producción (dónde vive `bd_api_automarco`), y si `DB_GESTIONCAR_HOST`
  (`config/bd.js`/`bd2.js`, catálogo de marcas/categorías/modelos) es el mismo
  servidor u otro distinto. `config/bd2.js` sigue sin parecer usado por ningún otro
  archivo — confirmar si se puede eliminar directamente.

## Para levantar v2/ localmente

1. `cd v2 && npm install` (agrega la dependencia nueva `dotenv` y regenera el lockfile).
2. Copiar `.env.example` a `.env` y completar los valores reales (clave JWT y
   credenciales de las dos bases de datos).
3. `npm run dev` (o `node server_local.js`) — debería quedar escuchando en el
   puerto 3008, en `/api/v2/...`.

## Hallazgos que quedan abiertos a propósito (no bloqueantes, ver plan de pruebas)

I1 (pedido con SKU inexistente no se rechaza), I2 (falta validar `tran_id`/`cantidad`
en `/pedidos`), I3 (`/ocdefinitiva` y `/stock` sin chequeo de permisos), I4 (paginación
ignorada en `/products`), y el resto de los hallazgos "I" del plan de pruebas —
ninguno de estos se tocó en esta pasada, quedan para una siguiente ronda si el
equipo lo prioriza.
