import {
    getCategories 
} from '../models/categoryModel.js';


const getAllCategory = async (req, res) => {
    // console.log(req.query);
  
    try {
    
        const { order_by } = req.query;
        console.log(order_by);

      const categories = await getCategories(order_by);
    //   const productsWithHateoas = await prepareHateoas(products);
      res.status(200).json(categories);
    } catch (error) {
      console.log("error", error);
    }
  };


  export {
    getAllCategory
  }