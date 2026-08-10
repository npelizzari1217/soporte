/**
 * Tipos del dominio Admin > Usuarios/Membresías — espejo de
 * `backend/src/auth/interface/dtos/usuario-tenant.dto.ts` (T4.7,
 * `sdd/beta-frontend/spec` §5). Distinto de `UsuarioAsignable`
 * (`features/tickets/types.ts`, usado por el selector de "Asignar ticket")
 * aunque comparten el mismo endpoint `GET /usuarios` — acá el foco es
 * gestión (crear/cambiar rol/desactivar), no solo lectura para un selector.
 *
 * Aislamiento estricto (spec §5): NINGÚN DTO de este feature declara
 * `clienteId` — el backend SIEMPRE usa `actor.cliente_id` del JWT, nunca un
 * valor de la request (`ValidationPipe` global con `whitelist:true` lo
 * descartaría si llegara). El front replica esa restricción por diseño: los
 * tipos de abajo no tienen ese campo, así que no hay forma de enviarlo.
 */

export interface UsuarioTenant {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
  email?: string;
}

export interface CreateUsuarioTenantDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  rolCodigo: string;
}

export interface CambiarRolUsuarioDto {
  rolCodigo: string;
}

/**
 * Body de `PATCH usuarios/:id` — edita SOLO nombre y/o apellido (identidad
 * global del usuario). El `email` NO se edita (identidad de acceso única).
 */
export interface EditarUsuarioDto {
  nombre?: string;
  apellido?: string;
}

export interface UsuarioTenantMembresia {
  usuarioId: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  membresiaId: string;
  activo: boolean;
}

/**
 * Rol del catálogo GLOBAL RBAC (`GET /roles`, item 3 backend-gaps — antes
 * hardcodeado acá como `ROLES_TENANT`). Compartido por todos los tenants,
 * sin variación por cliente.
 */
export interface Role {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}
