import connect from '../../../../config/bd.js';

const getCilindrada = async (order_by = "nombre__ASC") => {
    const db = await connect();
    try {

      const [attribute, direction] = order_by.split("__");

      console.log(direction);

        // Consulta para obtener todos los usuarios
        const [rows, fields] = await db.execute(`SELECT cilin_id, cilindrada FROM automarc_automarco.tbl_cilindrada2 order by cilin_id asc`);
        // console.log('Todos los usuarios:', rows);


    
      return rows;
    } catch (error) {
        console.error('Error al obtener datos:', error);
    } finally {
        db.end();
    }

  };



  export {

    getCilindrada

  };