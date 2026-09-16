// Duración del JWT emitido a clientes. Se acortó de 365 a 90 días al agregar
// la renovación self-service vía api-key (POST /auth/renovar-token): ya no
// hace falta que dure tanto, y limita el daño si un token llega a filtrarse.
const JWT_EXPIRES_IN = '90d';

export { JWT_EXPIRES_IN };
