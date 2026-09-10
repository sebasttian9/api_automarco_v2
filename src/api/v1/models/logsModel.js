
//funcion para registrar logs

import connection from "../../../../config/bdPedidosApi.js";

const registrarLog = async (rut, queryData, logMensaje, ip, advertencia = 0) => {
    try {
        const queryString = queryData ? JSON.stringify(queryData) : '{}';
        const rutFinal = rut || "ANONIMO";
        const ipFinal = ip || "0.0.0.0";

        
        await connection.execute(
            `INSERT INTO bd_api_automarco.tbl_logs (rut, query_data, log, ip, advertencia, fecha)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [rutFinal, queryString, logMensaje, ipFinal, advertencia]
        );

    } catch (error) {
        console.error("❌ Error guardando log en BD:", error.message);
    }
};

export default registrarLog;