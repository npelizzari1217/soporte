import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * CreateClienteDto — body de la request POST /clientes.
 * Incluye los datos del cliente y del usuario administrador inicial.
 *
 * Tarea: T2.5 (extiende 1.D.2 con campos de provisioning completo)
 *   + tech-debt-validation-pipe (class-validator)
 */
export class CreateClienteDto {
  @IsString()
  nombre!: string;

  @IsOptional()
  @IsString()
  razonSocial!: string | null;

  @IsOptional()
  @IsString()
  cuit!: string | null;

  /** Email del usuario administrador inicial del cliente. */
  @IsEmail()
  adminEmail!: string;
  /** Nombre del usuario administrador inicial. */
  @IsString()
  adminNombre!: string;
  /** Apellido del usuario administrador inicial. */
  @IsString()
  adminApellido!: string;
  /**
   * Contraseña del admin inicial (texto plano — se hashea server-side).
   * NUNCA se almacena ni se devuelve en la respuesta.
   */
  @IsString()
  @MinLength(8)
  adminPassword!: string;
}
