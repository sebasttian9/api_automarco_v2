// clasificaciones sin validacion de campos


const existCla = async (req, res, next) => {
    try {

        let clasificaciones = [ 2, 9, 12, 15, 16, 18, 22, 23, 25, 31, 37, 48, 49, 54 ];
        let resp = false;
        console.log(req.body.cla_id);
        console.log(req.body)
      // validar si el cla_id que viene a consultar esta en el array
      const id = clasificaciones.filter(clasificaciones => clasificaciones == req.body.cla_id);

      id.length ? req.existe_clasificacion = true : req.existe_clasificacion = false;
      
      
    //   res.status(200).json(id);
      next();
    } catch (error) {
      
      return res
        .status(404)
        .json({ error: 'ERROR CODIGO' });
    }
  };


  export { existCla };