import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Limita por cliente (rut del JWT), no por IP: varios usuarios de una misma
// empresa pueden compartir salida a internet (NAT) y no deberían compartir cupo.
// Si por algún motivo no hay rut (no debería pasar, verificarToken ya corre
// antes), cae a la IP (normalizada con ipKeyGenerator para que direcciones
// IPv6 equivalentes no esquiven el límite).
const porCliente = (req) => (req.user && req.user.rut) || ipKeyGenerator(req.ip);

const responderLimiteExcedido = (req, res) => {
    res.status(429).json({
        message: "Demasiadas solicitudes. Intenta de nuevo en unos segundos."
    });
};

// Lectura: consultas de productos, stock, sucursales, etc.
const lecturaLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: porCliente,
    handler: responderLimiteExcedido,
});

// Escritura: creación de pedidos (RepSol y Disam). Más estricto porque nadie
// genera decenas de pedidos reales por minuto.
const escrituraLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: porCliente,
    handler: responderLimiteExcedido,
});

// Auth (POST /auth/renovar-token): va sin verificarToken (el JWT puede estar
// vencido), así que acá no hay req.user -> se limita por el rut que venga en
// el body. Límite bajo a propósito: es el blanco típico de fuerza bruta contra
// la api-key.
const porRutEnBody = (req) => (req.body && req.body.rut) || ipKeyGenerator(req.ip);

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: porRutEnBody,
    handler: responderLimiteExcedido,
});

export { lecturaLimiter, escrituraLimiter, authLimiter };
