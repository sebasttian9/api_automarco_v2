/**
 * @swagger
 * tags:
 *   name: Brands
 *   description: API para la gestión de Marcas
 */

/**
 * @swagger
 *   definitions:
 *     Brands:
 *       type: object
 *       properties:
 *         id_marca:
 *           type: integer
 *           description: Unique identifier of the brand
 *         marca_nombre:
 *           type: string
 *           description: Name of the brand
 *       example:
 *         id_marca: 1
 *         marca_nombre: Chevrolet
 */


/**
 * @swagger
 * /Brands:
 *   get:
 *     summary: Obtener todas las Marcas
 *     tags: [Brands]
 *     parameters:
 *      - in: query
 *        name: order_by
 *        required: false
 *        schema:
 *          type: string
 *        description: Campo para elegir el orden de las marcas, puede ser "marca__asc" o "marca__desc", deben ir separado por doble _
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
 *                     $ref: "#/definitions/Brands"
 *       '400':
 *         description: Error al obtener las Marcas
 */