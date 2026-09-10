import jwt from 'jsonwebtoken';

// Hallazgo C5: antes la clave estaba hardcodeada ("contraseña") y versionada en Git.
// Ahora sale de una variable de entorno (ver .env.example) y el proceso falla al
// arrancar si no está definida, en vez de arrancar con un secreto débil/expuesto.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("Falta la variable de entorno JWT_SECRET. Definila antes de iniciar el servidor (ver .env.example).");
}

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó token.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = decoded;
        next();
    } catch (error) {
        console.log("Error de token:", error.message); // Esto te ayudará a ver qué pasa en consola
        return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
};

export default verificarToken;