import nodemailer from "nodemailer";

// Envio de avisos por correo (hoy: OC de Grupo Planet que no se pudieron
// procesar). Si faltan las variables SMTP_* o NOTIFICAR_A, no se envia nada y
// solo queda en consola: el aviso nunca debe botar el proceso que lo llama.
let transporter = null;

const obtenerTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
};

// destinatarios: lista separada por coma (ej. NOTIFICAR_PLANET_A)
const enviarAviso = async ({ destinatarios, asunto, texto }) => {
  const t = obtenerTransporter();
  if (!t || !destinatarios) {
    console.error(`[aviso sin enviar - SMTP no configurado] ${asunto}\n${texto}`);
    return false;
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destinatarios,
      subject: asunto,
      text: texto,
    });
    return true;
  } catch (error) {
    console.error(`Error enviando aviso "${asunto}":`, error.message);
    return false;
  }
};

export { enviarAviso };
