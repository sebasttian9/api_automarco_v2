import { getTransports } from "../models/transportsModel.js";

const getAllTransportes = async (req, res) => {
    try {
        const transportes = await getTransports();

        if (!transportes || transportes.length === 0) {
            return res.status(200).json({ message: "No se encontraron transportes", data: [] });
        }

        res.status(200).json(transportes);

    } catch (error) {
        console.error("Error en getAllTransportes:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export {
    getAllTransportes
};