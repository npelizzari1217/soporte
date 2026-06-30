/**
 * CreateClienteDto — body de la request POST /clientes.
 * Incluye los datos del cliente y del usuario administrador inicial.
 *
 * Tarea: T2.5 (extiende 1.D.2 con campos de provisioning completo)
 */
export class CreateClienteDto {
  nombre!: string;
  razonSocial!: string | null;
  cuit!: string | null;
  dbName!: string;

  /** Email del usuario administrador inicial del cliente. */
  adminEmail!: string;
  /** Nombre del usuario administrador inicial. */
  adminNombre!: string;
  /** Apellido del usuario administrador inicial. */
  adminApellido!: string;
  /**
   * Contraseña del admin inicial (texto plano — se hashea server-side).
   * NUNCA se almacena ni se devuelve en la respuesta.
   */
  adminPassword!: string;
}
