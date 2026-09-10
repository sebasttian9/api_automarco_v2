import connect from '../../../../config/bd.js';

// Hallazgo C4: 'direction' (parte de order_by) se concatenaba directo al SQL sin
// validar, permitiendo inyeccion SQL via query string (?order_by=...).
const DIRECCIONES_VALIDAS = ['ASC', 'DESC'];

const getBrands = async (order_by = "nombre__ASC") => {
    const db = await connect();
    try {

      const [, directionRaw] = order_by.split("__");
      const direction = DIRECCIONES_VALIDAS.includes((directionRaw || '').toUpperCase())
        ? directionRaw.toUpperCase()
        : 'ASC';

      // 'direction' sale de una whitelist fija (ASC/DESC), nunca se concatena texto libre.
      const [rows] = await db.execute(`SELECT marca_id, marca_nombre FROM automarc_automarco.tbl_marcas_2 where marca_estado = 1 order by marca_nombre ${direction}`);

      return rows;
    } catch (error) {
        console.error('Error al obtener datos:', error);
        return [];
    } finally {
        db.end();
    }

  };



  export {

    getBrands

  };
