import {
    getCilindrada 
} from '../models/cilindModel.js';


const getAllCilindrada = async (req, res) => {
    // console.log(req.query);
  
    try {
    
        const { order_by } = req.query;
        // console.log(order_by);

      const cilindradas = await getCilindrada(order_by);
    //   const productsWithHateoas = await prepareHateoas(products);
      res.status(200).json(cilindradas);
    } catch (error) {
      console.log("error", error);
    }
  };


  export {
    getAllCilindrada
  }