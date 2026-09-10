import {
    getBrands 
} from '../models/brandsModel.js';


const getAllBrands = async (req, res) => {
    // console.log(req.query);
  
    try {
    
        const { order_by } = req.query;
        // console.log(order_by);

      const brands = await getBrands(order_by);
    //   const productsWithHateoas = await prepareHateoas(products);
      res.status(200).json(brands);
    } catch (error) {
      console.log("error", error);
    }
  };


  export {
    getAllBrands
  }