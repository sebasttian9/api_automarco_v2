import connect from '../../../../config/bd.js';

// Hallazgo C3/C4: 'marca_id' venia concatenado directo al SQL, y 'direction'
// (parte de order_by) tampoco se validaba. Ambos permitian inyeccion SQL via
// query string (?marca_id=... , ?order_by=...).
const DIRECCIONES_VALIDAS = ['ASC', 'DESC'];

const getModels = async (order_by = "nombre__ASC", marca_id = 0) => {
    const db = await connect();
    try {

      const [, directionRaw] = order_by.split("__");
      const direction = DIRECCIONES_VALIDAS.includes((directionRaw || '').toUpperCase())
        ? directionRaw.toUpperCase()
        : 'ASC';

      const marcaIdNum = Number(marca_id) || 0;

      const params = [];
      let queryMarca = '';
      if (marcaIdNum > 0) {
        queryMarca = ' and marca_id = ?';
        params.push(marcaIdNum);
      }

      // 'direction' sale de una whitelist fija (ASC/DESC) y 'marca_id' va parametrizado:
      // ninguno de los dos llega a la consulta como texto libre del cliente.
      const [rows] = await db.execute(
        `SELECT id_mod, mod_id, marca_id, marca FROM automarc_automarco.tbl_modelos_marcas_2 WHERE estado = 1 ${queryMarca} order by id_mod ${direction}`,
        params
      );

      return rows;
    } catch (error) {
        console.error('Error al obtener datos:', error);
        return [];
    } finally {
        db.end();
    }

  };



  export {

    getModels

  };
