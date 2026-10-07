import { MembresiaEntity } from '../entities/membresia.entity';

/**
 * MembresiaResuelta — proyección de una membresía activa con su rol y
 * cliente ya resueltos (JOIN membresia→rol→cliente).
 *
 * Usada por LoginUseCase/SwitchTenantUseCase/RefreshTokenUseCase (PR3/PR4)
 * para construir el JWT sin round-trips adicionales a la DB.
 *
 * Fix post-verify C2 (sdd/matriz-permisos-por-usuario): hasta acá venía con
 * un campo `permisos: string[]` resuelto vía JOIN `rol→rolesPermisos→permiso`
 * (RBAC viejo). Ese campo NO tenía consumidores — `resolverScope`
 * (WU-7.1) ya resuelve los permisos desde la matriz nueva
 * (`IMatrizPermisosRepository`), no desde acá. Se retiró junto con el JOIN
 * porque `roles_permisos`/`permisos` son las tablas que WU-9 dropea; dejar el
 * JOIN vivo acá hubiera roto login/switch/refresh (que llaman a
 * `findActivaByUsuarioYCliente` en cada request) el día que corra el DROP.
 */
export interface MembresiaResuelta {
  clienteId: string;
  clienteNombre: string;
  rolCodigo: string;
  /** Politica del cliente (L3, C3): una membresia activa con `true` obliga al usuario a tener 2FA. */
  clienteRequiere2fa: boolean;
}

/**
 * MembresiaConUsuario — proyección de una membresía ACTIVA de un cliente con
 * los datos del usuario y el código de rol resueltos (JOIN membresia →
 * usuario, membresia → rol). Usada por `ListarUsuariosTenantUseCase`
 * (`GET /usuarios`) para poblar el selector de asignación y la vista admin
 * de usuarios del tenant — NUNCA expone `passwordHash`.
 */
export interface MembresiaConUsuario {
  membresiaId: string;
  usuarioId: string;
  nombre: string;
  apellido: string;
  email: string;
  rolCodigo: string;
}

/**
 * IMembresiaRepository — puerto de resolución de membresías para
 * autenticación (login/switch/refresh) y de alta/gestión de membresías
 * (provisioning + gestión mínima de usuarios del tenant, sdd/beta-frontend).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ (PR5).
 *
 * Tarea: T2.2 (PR2 — Auth domain + ports + hashing + token service) — R6
 */
export interface IMembresiaRepository {
  /**
   * Retorna las membresías ACTIVAS de un usuario, con rol+cliente resueltos.
   * Filtra `membresia.activo && !deleted`, `cliente.activo && !deleted`.
   * Usado por R4 (resolución 0/1/many membresías) y para poblar `membresias[]`
   * en el JWT.
   */
  findActivasByUsuario(usuarioId: string): Promise<MembresiaResuelta[]>;

  /**
   * Retorna la membresía activa de un usuario en un cliente específico, si
   * existe. Usado por R5/R8/R10 (validación de `clienteId` provisto/hint).
   */
  findActivaByUsuarioYCliente(
    usuarioId: string,
    clienteId: string,
  ): Promise<MembresiaResuelta | null>;

  /**
   * Retorna TODAS las membresías ACTIVAS del cliente dado, con el usuario y
   * el código de rol resueltos (sin `passwordHash`). Usado por
   * `ListarUsuariosTenantUseCase` (`GET /usuarios`, sdd/beta-frontend) —
   * SIEMPRE filtrado por `clienteId` explícito, nunca por el actor: es el
   * mecanismo de aislamiento estricto entre tenants.
   */
  findActivasByCliente(clienteId: string): Promise<MembresiaConUsuario[]>;

  /**
   * Busca la membresía (entidad de dominio completa, cualquier `activo`) de
   * un usuario en un cliente específico. A diferencia de
   * `findActivaByUsuarioYCliente` (proyección resuelta, solo activas, usada
   * en auth), retorna la `MembresiaEntity` cruda para que la gestión mínima
   * de usuarios (`PATCH /usuarios/:id/rol`, `DELETE /usuarios/:id/membresia`)
   * pueda mutarla (`cambiarRol`/`desactivar`) y persistirla. `null` si no
   * existe ninguna membresía de ese usuario en ese cliente — el use case lo
   * traduce a `MembresiaNoEncontradaError` (aislamiento: un ADMINISTRADOR de
   * otro cliente nunca distingue "no existe" de "existe en otro tenant").
   */
  findByUsuarioYCliente(usuarioId: string, clienteId: string): Promise<MembresiaEntity | null>;

  /**
   * Crea una nueva membresía. Usado por `CrearClienteUseCase` (R16, PR8)
   * para asignar el rol ADMINISTRADOR al admin inicial del cliente recién
   * provisionado, y por `CrearUsuarioTenantUseCase` (gestión mínima de
   * usuarios, sdd/beta-frontend).
   */
  create(membresia: MembresiaEntity): Promise<void>;

  /**
   * Persiste cambios sobre una membresía existente (upsert por id). Usado
   * por `CambiarRolUsuarioTenantUseCase` y
   * `DesactivarMembresiaUsuarioTenantUseCase` tras mutar la entidad
   * (`cambiarRol`/`desactivar`).
   */
  save(membresia: MembresiaEntity): Promise<void>;
}

/** Token de inyección de dependencias para IMembresiaRepository en NestJS. */
export const MEMBRESIA_REPOSITORY = Symbol('MEMBRESIA_REPOSITORY');
