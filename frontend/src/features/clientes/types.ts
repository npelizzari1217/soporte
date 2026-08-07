/**
 * Tipos del dominio Admin > Clientes — espejo de
 * `backend/src/clientes/interface/dtos/cliente.dto.ts` (R16-R18, T8.4).
 * Exclusivo ROOT (`is_global_admin`), NUNCA por `permisos` (ortogonal —
 * mismo criterio que `JwtPayload.is_global_admin`).
 */

export interface Cliente {
  id: string;
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
  activo: boolean;
}

export interface CreateClienteDto {
  nombre: string;
  razonSocial?: string;
  cuit?: string;
  adminEmail: string;
  adminNombre: string;
  adminApellido: string;
  adminPassword: string;
}

/**
 * Body de `PATCH /clientes/:id` — edición de datos comerciales (solo ROOT).
 * Espejo de `UpdateClienteDto` (backend). NO incluye `dbName` (inmutable) ni
 * campos de admin.
 */
export interface UpdateClienteDto {
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
}
