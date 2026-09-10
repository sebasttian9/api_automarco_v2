

//funcion encargada de obtener los transportes
import connection from '../../../../config/bdPedidosApi.js';

const getTransports = async () => {
    const db = connection;
    try {
        const sql = `
            SELECT tran_id, tran_nombre 
            FROM automarc_automarco.tbl_transportes 
            -- WHERE tran_estado = 1 
            ORDER BY tran_id ASC
        `;

        const [rows] = await db.execute(sql);
        return rows;

    } catch (error) {
        console.error("Error en TransportModel:", error);
        return [];
    }
};

export {
    getTransports
};