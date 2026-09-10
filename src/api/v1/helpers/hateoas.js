
import axios from 'axios'


const prepareHateoas = async (data) => {



    const resultado = await Promise.all(
        data.map(async (v) => {

                // console.log(v.empresa)
                if(v.empresa!='AUTOMARCO'){
                    const response = await axios.get('http://www.gabtec.cl/imagenUrlGestion.php?prod='+v.prod_id+'&emp='+v.empresa);
                    let imagen = response.data;
                    // console.log(imagen)
                    v.producto_imagen = imagen;
                }else{
                    v.producto_imagen = "https://www.automarco.cl/images/"+v.prod_img;
                }
                // console.log(v)
                  return v;
        //   return await fetchPostsFromTwitter(username)
        })
      )



    // const resultado = []
    // for (const prod of data) {
    //     const response = await axios.get('http://www.gabtec.cl/imagenUrlGestion.php?prod='+prod.prod_id);
    //     let imagen = response.data;
    //     console.log(imagen);
    //     prod.producto_imagen = imagen;
    //     console.log(prod)
    //     resultado.push(prod);
    // }


    
    // const results = data.map((v) => {

    // const response = axios.get('http://www.gabtec.cl/imagenUrlGestion.php?prod='+v.prod_id);
    // let imagen = response.data;
    // console.log(imagen)
    //     v.producto_imagen = imagen;

    //     console.log(v)

  
    //   return v;
    // });
  
    return resultado;
  };
  
  export default prepareHateoas;