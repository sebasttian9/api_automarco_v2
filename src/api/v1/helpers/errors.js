// Error de validación del cliente (body mal formado, referencia a un dato que no
// existe, etc.) -> el controller la traduce a 400 en vez del 500 genérico.
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export { ValidationError };
