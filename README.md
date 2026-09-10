# Api-consultas-e-inyeccion-de-pedidos-Holding-automarco
# Descripcion

Api desarrollada para la consulta de productos e inyeccion de pedidos multiempresa del holding Automarco, permite realizar consultas y pedidos de las 4 empresas, Automarco, Autotec, Gabtec, Hd, ademas permite a los usuarios realizar consultas sobre, modelos, marcas, clasificacion de productos, cilindrada, tranportes disponibles, ademas despliega informacion sobre sus sucursales para que puedan realizar pedidos evitando errores.
# Guía de Instalación y Uso

Instrucciones simples para configurar y ejecutar el servidor.

## Instalación

Para instalar las dependencias del proyecto (node_modules), se ejecuta:

```bash
npm install
```
## Iniciar
Para iniciar el servidor, usa el siguiente comando:
```Bash
node locar_server.js
```
## Cambios Hechos
### Implementacion de token de autentificación
Debido a que se necesitaba desarrollar la api para todos los clientes se implemento un token de autentificacion al rut del cliente para que puedan acceder a la api.
### Modificacion a la base de datos
> **Nota (v2):** a partir de v2/ todo esto vive en una base de datos propia,
> `bd_api_automarco`, en vez de estar repartido entre `pedidos_api` y
> `automarc_automarco`. Las tablas son `tbl_pedidos`, `tbl_pedidos_detalle`,
> `tbl_permisos_clientes` (antes `tiene_permiso`) y `tbl_logs` (antes `logs`).
> Las columnas de cada tabla son las mismas que se describen más abajo.

para que el proyecto este disponible para todos los clientes ahora se usa la base de datos bd_api_automarco, que tiene las tablas: tbl_pedidos y tbl_pedidos_detalle, esta ultima se mantiene igual, sin embargo tbl_pedidos se crea de la siguiente forma:
``` Mysql
CREATE TABLE `bd_api_automarco.tbl_pedidos` (
  `id_pedido` int(11) NOT NULL AUTO_INCREMENT,
  `fecha` datetime NOT NULL DEFAULT current_timestamp(),
  `estado` int(11) NOT NULL DEFAULT 0,
  `pedvenrut` int(11) DEFAULT NULL,
  `pedcorint` int(11) DEFAULT NULL,
  `unificado` int(11) NOT NULL DEFAULT 0,
  `tran_nombre` varchar(255) DEFAULT NULL,
  `cli_rut` varchar(15) NOT NULL,
  `cli_sec_automarco` char(2) DEFAULT NULL,
  `cli_conven_automarco` char(2) DEFAULT NULL,
  `cli_sec_autotec` char(2) DEFAULT NULL,
  `cli_conven_autotec` char(2) DEFAULT NULL,
  `cli_sec_hd` char(2) DEFAULT NULL,
  `cli_conven_hd` char(2) DEFAULT NULL,
  `cli_sec_gabtec` char(2) DEFAULT NULL,
  `cli_conven_gabtec` char(2) DEFAULT NULL,
  PRIMARY KEY (`id_pedido`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=latin1
```
Adicional a esto se creo la tabla que maneja los permisos que tienen los usuarioas para comprar en las empresas, ademas  incluye el rut y el token de autentificacion para asi poder obtener todos los datos necesarios del cliente mediante estos dos campos, esta se crea de la siguiente forma:
```Mysql
CREATE TABLE `bd_api_automarco.tbl_permisos_clientes` (
  `rut` varchar(15) NOT NULL,
  `automarco` int(11) DEFAULT 0,
  `hd` int(11) DEFAULT 0,
  `autotec` int(11) DEFAULT 0,
  `gabtec` int(11) DEFAULT 0,
  `api_token` text DEFAULT NULL,
  `fecha_actualizacion` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3
```
#### Para crear token y actualizar permisos usuarios se debe ejecutar el siguiente comando en la terminal
```Bash
node generartokendb.js
```
### Verificacion de permisos
#### Se incluyo una verficacion de permisos la cual permite:
• Ver solo productos de las empresas en las cual el cliente compra  
• Retornar un error cuando en un pedido multiempresa se incluya un producto que pertenece a una empresa para la cual no se tienen permisos.
### Se agregaron los siguientes endpoints:
• Sucursales: Despliega las sucursales de un cliente separadas por empresa, muestra la direccion, comuna y su ID.  
• Transportes: Despliega los transportes disponibles junto a su ID
### Funcion encargada de validar la ip de los usuarios
Se creo una funcion la cual verifica que la ip de un cliente coincida en cada consultas para evitar que el token de autentificacion se comparta, cada log se guarda en una base de datos junto a la qery realizada, si se detectan 3 distintas ip´s en un lapso de 24 horas se registra en la base de datos con una advertencia. la estructura de la tabla es la siguiente
```Mysql
 CREATE TABLE `bd_api_automarco.tbl_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rut` varchar(20) NOT NULL,
  `query_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`query_data`)),
  `log` text DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  `advertencia` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3
```
### Documentacion
En el archivo swagger.yaml, se encuentra la documentacion completa del funcionamiento de la api
### Cambio en productsModel y productscontroller
Se separo la logica de, consulta de productos que se encontraba en productsModel, para tener un mejor orden, ahora se encuentra en productsmodel1.js y productscontroller1.js


