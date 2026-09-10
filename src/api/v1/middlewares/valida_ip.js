import registrarLog from "../models/logsModel.js"; 

// almacenamiento de accesos
let historialAccesos = {};    
let peticionesRecientes = {}; 

const LIMITE_IPS_DISTINTAS = 3; 
const VENTANA_HORAS = 24; 
const TIEMPO_ESPERA_LOG_MS = 2000; 

// elimina del almacenamiento los logs pasadas las 24 hrs
setInterval(() => {
    const ahora = Date.now();
    const tiempoLimite = ahora - (VENTANA_HORAS * 60 * 60 * 1000);

    Object.keys(historialAccesos).forEach(rut => {
        historialAccesos[rut] = historialAccesos[rut].filter(r => r.time > tiempoLimite);
        if (historialAccesos[rut].length === 0) delete historialAccesos[rut];
    });

    Object.keys(peticionesRecientes).forEach(key => {
        if (ahora - peticionesRecientes[key] > 60000) delete peticionesRecientes[key];
    });
}, 60 * 60 * 1000);

const validarIP = async (req, res, next) => {
    try {
        if (req.method === 'OPTIONS' || req.originalUrl.includes('favicon.ico')) {
            return next();
        }

        // obtener rut (solo token, estricto)
        const { rut } = req.user || {}; 
        const rutFinal = rut || "ANONIMO";

        // obtener la ip real (sin headers de prueba)
        let ipActual = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (ipActual && ipActual.includes(',')) ipActual = ipActual.split(',')[0].trim();
        if (ipActual && ipActual.includes('::ffff:')) ipActual = ipActual.split(':').pop();

        // obtener datos de la peticion
        const datosQuery = {
            url: req.originalUrl,
            method: req.method,
            body: req.body,
            params: req.query
        };

        const ahora = Date.now();

        // logica para evitar logs duplicados
        const claveUnica = `${rutFinal}-${ipActual}-${req.originalUrl}`;
        
        if (peticionesRecientes[claveUnica] && (ahora - peticionesRecientes[claveUnica] < TIEMPO_ESPERA_LOG_MS)) {
            peticionesRecientes[claveUnica] = ahora;
            return next(); 
        }
        peticionesRecientes[claveUnica] = ahora;

        let esAlerta = false; 

        if (rutFinal !== "ANONIMO") {
            const tiempoLimite = ahora - (VENTANA_HORAS * 60 * 60 * 1000);

            if (!historialAccesos[rutFinal]) historialAccesos[rutFinal] = [];

            // limpiar historial despues de un dia
            historialAccesos[rutFinal] = historialAccesos[rutFinal].filter(r => r.time > tiempoLimite);

            // revisar historial de ips
            const ipsPrevias = historialAccesos[rutFinal].map(r => r.ip);
            
            // se comprueba si la ip es nueva
            const esIpNueva = !ipsPrevias.includes(ipActual);

            // agregar al historial
            historialAccesos[rutFinal].push({ ip: ipActual, time: ahora });

            // calcular ips unicas
            const todasLasIps = historialAccesos[rutFinal].map(r => r.ip);
            const ipsUnicas = [...new Set(todasLasIps)]; 
            
            // condicion de alertas (limite superado y ip nueva)
            if (ipsUnicas.length >= LIMITE_IPS_DISTINTAS && esIpNueva) {
                
                const mensajeAlerta = `ADVERTENCIA: Usuario ${rutFinal} sumó una nueva IP (${ipActual}). Total IPs en 24h: ${ipsUnicas.length}.`;
                console.warn(mensajeAlerta);

                // payload completo con datos de seguridad
                const payloadCompleto = {
                    ...datosQuery, 
                    seguridad: {   
                        ips_detectadas: ipsUnicas,
                        alerta_activa: true,
                        motivo: "Multiples IPs"
                    }
                };

                registrarLog(
                    rutFinal, 
                    payloadCompleto, 
                    mensajeAlerta, 
                    ipActual,
                    1 
                );
                
                esAlerta = true; 
            }
        }

        // crear log si no es alerta
        if (!esAlerta) {
            registrarLog(
                rutFinal, 
                datosQuery, 
                `Acceso a ${req.method} ${req.originalUrl}`, 
                ipActual,
                0 
            );
        }

        next();

    } catch (error) {
        console.error("Error en monitorIP:", error);
        next(); 
    }
};

export default validarIP;

/*

VERSION PRODUCCION 


import registrarLog from "../models/logsModel.js"; 



export default validarIP;
*/