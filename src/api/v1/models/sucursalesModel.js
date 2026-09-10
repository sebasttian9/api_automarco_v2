
//funcion para obtener sucursales los clientes
import connection from "../../../../config/bdPedidosApi.js";

const obtenerSucursalesEmpresa = async (rut) => {
  try {
    const sql = `
      SELECT 'AUTOMARCO' as empresa, cli_sec as codigo, cli_direccion as direccion, cli_comuna as comuna 
      FROM automarc_automarco.tbl_clientes 
      WHERE cli_rut = ? 
      
      UNION
      
      SELECT 'GABTEC' as empresa, cli_sec as codigo, cli_direccion as direccion, cli_comuna as comuna 
      FROM gabteccl_sitbdd1978.tbl_clientes 
      WHERE cli_rut = ?
      
      UNION
      
      SELECT 'AUTOTEC' as empresa, cli_sec as codigo, cli_direccion as direccion, cli_comuna as comuna 
      FROM autotec_ecom.tbl_clientes 
      WHERE cli_rut = ?
      
      UNION
      
      SELECT 'HD' as empresa, cli_sec as codigo, cli_direccion as direccion, cli_comuna as comuna 
      FROM autohd_automarcohd.tbl_clientes 
      WHERE cli_rut = ?
    `;

    const [rows] = await connection.execute(sql, [rut, rut, rut, rut]);
    
    return rows;
  } catch (error) {
    console.error("Error obteniendo sucursales:", error);
    return [];
  }
};

export {
    obtenerSucursalesEmpresa
};