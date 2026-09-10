import {
    getModels 
} from '../models/ModelsModel.js';


const getAllModels = async (req, res) => {
    // console.log(req.query);
  
    try {
    
        const { order_by, marca_id } = req.query;
        // console.log(order_by);

      const models = await getModels(order_by,marca_id);
    //   const productsWithHateoas = await prepareHateoas(products);
      res.status(200).json(models);
    } catch (error) {
      console.log("error", error);
    }
  };


  export {
    getAllModels
  }