/**
 * @swagger
 * tags:
 *   name: Category
 *   description: API para la gestión de categorias
 */

/**
 * @swagger
 *   definitions:
 *     Category:
 *       type: object
 *       properties:
 *         id_cla:
 *           type: integer
 *           description: Unique identifier of the category
 *         clasificacion_nombre:
 *           type: string
 *           description: Name of the category
 *       example:
 *         id_cla: 6
 *         clasificacion_nombre: Alternador
 */


/**
 * @swagger
 * /category:
 *   get:
 *     summary: Obtener todas las categorias
 *     tags: [Category]
 *     responses:
 *       '200':
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: "#/definitions/Category"
 *       '400':
 *         description: Error al obtener las categorias
 */