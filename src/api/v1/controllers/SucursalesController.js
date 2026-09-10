import { obtenerSucursalesEmpresa } from "../models/sucursalesModel.js";


const getSucursalesController = async (req, res) => {
  try {
    
    
    const tokenData = req.user; 

    if (!tokenData || !tokenData.rut) {
        return res.status(401).json({ message: "No autorizado: Token inválido o sin RUT asociado" });
    }

    const rutCliente = tokenData.rut;


    const resultados = await obtenerSucursalesEmpresa(rutCliente);

 //agrupa las sucursales por empresa
    const sucursalesPorEmpresa = resultados.reduce((acc, curr) => {
        const { empresa, codigo, direccion, comuna } = curr; 
        
        if (!acc[empresa]) {
            acc[empresa] = [];
        }
        
        if (direccion) {
            acc[empresa].push({ 
                codigo: codigo, 
                direccion: direccion.trim(),
                comuna: comuna ? comuna.trim() : "" // validación extra por seguridad
            });
        }
        
        return acc;
    }, {});

    res.status(200).json({
        rut: rutCliente,
        sucursales: sucursalesPorEmpresa
    });

  } catch (error) {
    console.error("Error crítico obteniendo sucursales:", error);
    res.status(500).json({ message: "Error interno del servidor al obtener sucursales" });
  }
};

export { getSucursalesController }; 