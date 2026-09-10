import connection from '../../../../config/bdPedidosApi.js';

const obtenerPermisos = async (token) => {
    const db = await connection;
    try {
        const sql = `SELECT autotec, automarco, gabtec, hd FROM bd_api_automarco.tbl_permisos_clientes WHERE api_token = ?`;
        const [rows] = await db.execute(sql, [token]);
        return rows[0]; 
    } catch (e) {
        console.error("Error al obtener permisos:", e);
        return null;
    } finally {
 
    }
};

export default obtenerPermisos;