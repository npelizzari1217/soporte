import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IUsuarioClienteModuloRepository } from '../../domain/ports/i-usuario-cliente-modulo.repository';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { TODOS_LOS_MODULOS } from '../../../shared/domain/modulos';

/** Rol (por membresía) que otorga acceso a TODOS los módulos del cliente. */
const ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/**
 * Actor mínimo requerido por resolverScope. `usuarioId` identifica al
 * usuario autenticado (para resolver su membresía en `clienteId`);
 * `isGlobalAdmin` distingue el flujo root (puede saltar a cualquier
 * cliente vivo, con o sin membresía) del flujo normal (exige membresía
 * activa en ese cliente).
 *
 * Nota vs. design: el pseudocódigo de diseño (`resolverScope(actor:
 * {isGlobalAdmin}, ...)`) no incluye `usuarioId` explícitamente, pero es
 * imprescindible para consultar `IMembresiaRepository` por usuario — se
 * agrega acá sin cambiar la semántica descripta. Los callers futuros
 * (SwitchTenantUseCase/RefreshTokenUseCase, PR4) ya cuentan con `sub` en
 * el JwtPayload decodificado para poblar este campo.
 */
export interface ResolverScopeActor {
  usuarioId: string;
  isGlobalAdmin: boolean;
}

/** Resultado de la resolución de scope: listo para poblar el JWT. */
export interface ScopeResuelto {
  clienteId: string | null;
  clienteNombre: string | null;
  rol: string | null;
  permisos: string[];
  /**
   * Módulos funcionales operables en `clienteId`. ROOT/ADMINISTRADOR/token
   * MASTER llevan TODOS; el resto, solo los asignados en ese cliente.
   */
  modulos: string[];
}

/**
 * resolverScope — única fuente de verdad de autorización de tenant.
 *
 * Reusada por LoginUseCase (PR3), SwitchTenantUseCase y RefreshTokenUseCase
 * (PR4) para decidir a qué cliente queda scopeado un access token y con qué
 * rol/permisos, dado un actor autenticado y un `clienteId` solicitado
 * (o `null` para pedir el token MASTER).
 *
 * Reglas (ADR de diseño — auth-multitenancy):
 * - `clienteId === null`: solo válido si `actor.isGlobalAdmin` → token
 *   MASTER (`cliente_id/rol/cliente_nombre = null`, `permisos = []`).
 *   Un usuario normal NO puede pedir el token master → ClienteNoAutorizado.
 * - `clienteId` provisto: el cliente DEBE existir, estar `activo` y no
 *   soft-deleted; si no → ClienteNoAutorizado (mismo error para "no existe"
 *   e "inactivo/borrado" — no se distingue para no filtrar información de
 *   existencia de tenants a un actor no autorizado).
 * - Root con cliente válido: usa la membresía en ese cliente si existe
 *   (rol/permisos de esa membresía); si no tiene membresía ahí, igual se
 *   autoriza (`rol=null`, `permisos=[]`) — su autorización de operaciones
 *   root pasa por `is_global_admin`, no por `rol`.
 * - Normal con cliente válido: EXIGE membresía activa en ese cliente
 *   específico; sin ella → ClienteNoAutorizado.
 *
 * @param actor          Usuario autenticado (id + flag root).
 * @param clienteId      Cliente solicitado, o `null` para token master.
 * @param membresiaRepo  Puerto de resolución de membresías (R4/R5).
 * @param clienteRepo    Puerto de lectura de clientes (valida vivo/activo).
 * @param modulosRepo    Puerto de resolución de módulos asignados por cliente.
 */
export async function resolverScope(
  actor: ResolverScopeActor,
  clienteId: string | null,
  membresiaRepo: IMembresiaRepository,
  clienteRepo: IClienteRepository,
  modulosRepo: IUsuarioClienteModuloRepository,
): Promise<Result<ScopeResuelto, DomainError>> {
  if (clienteId === null) {
    if (!actor.isGlobalAdmin) {
      return Result.fail(new ClienteNoAutorizadoError());
    }
    // Token MASTER (solo root): ve TODOS los módulos.
    return Result.ok({
      clienteId: null,
      clienteNombre: null,
      rol: null,
      permisos: [],
      modulos: TODOS_LOS_MODULOS(),
    });
  }

  const cliente = await clienteRepo.findById(clienteId);
  if (!cliente || !cliente.activo || cliente.isDeleted()) {
    return Result.fail(new ClienteNoAutorizadoError());
  }

  const membresia = await membresiaRepo.findActivaByUsuarioYCliente(actor.usuarioId, clienteId);

  if (!membresia && !actor.isGlobalAdmin) {
    return Result.fail(new ClienteNoAutorizadoError());
  }

  // ROOT y ADMINISTRADOR ven TODOS los módulos; el resto, solo los asignados
  // en este cliente (eje de autorización ortogonal al RBAC — feature 5.2).
  const esAdminTotal = actor.isGlobalAdmin || membresia?.rolCodigo === ROL_ADMINISTRADOR;
  const modulos = esAdminTotal
    ? TODOS_LOS_MODULOS()
    : await modulosRepo.findModulosByUsuarioYCliente(actor.usuarioId, clienteId);

  return Result.ok({
    clienteId,
    clienteNombre: cliente.nombre,
    rol: membresia?.rolCodigo ?? null,
    permisos: membresia?.permisos ?? [],
    modulos,
  });
}
