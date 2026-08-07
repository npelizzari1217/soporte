/**
 * DTOs de entrada/salida para `ClientesController` (alta de tenant, R16).
 *
 * `class` (no `interface`) para que `class-validator` funcione con el
 * `ValidationPipe` global (ver `auth.dto.ts` para el porqué).
 *
 * Tarea: T8.4 (PR8 — CrearClienteUseCase + ClientesController)
 */
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body de `POST /clientes`. Solo ROOT (`GlobalAdminGuard`, R16). */
export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  adminNombre!: string;

  @IsString()
  @IsNotEmpty()
  adminApellido!: string;

  @IsString()
  @IsNotEmpty()
  adminPassword!: string;
}

/** Respuesta de `POST /clientes`. */
export interface ClienteResponseDto {
  id: string;
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
  activo: boolean;
}
