import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { PARES_VALIDOS, moduloDe, CodigoAccion } from '../../../shared/domain/acciones';

/** Rol (por membresía) que otorga acceso a TODAS las celdas del cliente. */
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
  /**
   * Zona horaria operativa del tenant resuelto (sdd/zona-horaria-por-tenant,
   * D3/D11), `null` para el token master (`clienteId === null`) — no hay
   * tenant del cual sacarla. Sale del MISMO `cliente` que este resolver ya
   * consulta más abajo (`clienteRepo.findById`), sin una query aparte.
   */
  zonaHoraria: string | null;
  rol: string | null;
  /** Códigos `MODULO:ACCION` de la matriz de permisos (R2, WU-7.1). */
  permisos: string[];
  /**
   * Módulos con AL MENOS UNA acción otorgada en `permisos` — DERIVADO, ya
   * no es una lectura independiente (ADR-P6/R2, reemplaza al eje de
   * `usuario_cliente_modulos`). Sin duplicados.
   */
  modulos: string[];
}

/**
 * Deriva `modulos` a partir de `permisos`, sin duplicados, preservando el
 * orden de primera aparición. `permisos` siempre son pares válidos del
 * catálogo (backfill/CHECK/DTO ya lo garantizan) — el cast a `CodigoAccion`
 * es seguro acá, no en el puerto (ADR-P10/P11: el puerto tipa `string[]`
 * para no acoplar el dominio de auth al catálogo de acciones).
 */
function derivarModulos(permisos: readonly string[]): string[] {
  return [...new Set(permisos.map((codigo) => moduloDe(codigo as CodigoAccion)))];
}

/**
 * resolverScope — única fuente de verdad de autorización de tenant.
 *
 * Reusada por LoginUseCase, SwitchTenantUseCase y RefreshTokenUseCase para
 * decidir a qué cliente queda scopeado un access token y con qué
 * rol/permisos, dado un actor autenticado y un `clienteId` solicitado
 * (o `null` para pedir el token MASTER).
 *
 * Reglas (R2, ADR-P6, WU-7.1 — matriz de permisos por usuario):
 * - `clienteId === null`: solo válido si `actor.isGlobalAdmin` → token
 *   MASTER (`cliente_id/rol/cliente_nombre = null`, `permisos =
 *   [...PARES_VALIDOS]` — bypass total, sin leer la matriz).
 *   Un usuario normal NO puede pedir el token master → ClienteNoAutorizado.
 * - `clienteId` provisto: el cliente DEBE existir, estar `activo` y no
 *   soft-deleted; si no → ClienteNoAutorizado (mismo error para "no existe"
 *   e "inactivo/borrado" — no se distingue para no filtrar información de
 *   existencia de tenants a un actor no autorizado).
 * - Root con cliente válido: bypass total (`permisos = [...PARES_VALIDOS]`),
 *   CON o SIN membresía en ese cliente — su autorización de operaciones
 *   root pasa por `is_global_admin`, no por `rol`. Si tiene membresía, `rol`
 *   refleja esa membresía; si no, `rol=null`.
 * - Normal con cliente válido Y membresía `ADMINISTRADOR` en ESE cliente:
 *   bypass total, igual que root, ACOTADO al cliente activo (S4) — el
 *   bypass se recalcula en cada llamada a `resolverScope`, así que un
 *   ADMINISTRADOR de cliente A que hace switch a B no bypassea en B a
 *   menos que su membresía en B también sea ADMINISTRADOR.
 * - Normal sin bypass: EXIGE membresía activa en `clienteId`; sin ella →
 *   ClienteNoAutorizado. Con ella, lee `permisosRepo.findByUsuarioYCliente`
 *   directo — 0 filas → `permisos: []` (fail-closed, S5, ningún crash).
 * - `modulos` es SIEMPRE derivado de `permisos` (`derivarModulos`), nunca
 *   una lectura aparte.
 *
 * @param actor          Usuario autenticado (id + flag root).
 * @param clienteId      Cliente solicitado, o `null` para token master.
 * @param membresiaRepo  Puerto de resolución de membresías (R4/R5).
 * @param clienteRepo    Puerto de lectura de clientes (valida vivo/activo).
 * @param permisosRepo   Puerto de lectura de la matriz de permisos por
 *                        usuario (R2, reemplaza a `IUsuarioClienteModuloRepository`).
 */
export async function resolverScope(
  actor: ResolverScopeActor,
  clienteId: string | null,
  membresiaRepo: IMembresiaRepository,
  clienteRepo: IClienteRepository,
  permisosRepo: IMatrizPermisosRepository,
): Promise<Result<ScopeResuelto, DomainError>> {
  if (clienteId === null) {
    if (!actor.isGlobalAdmin) {
      return Result.fail(new ClienteNoAutorizadoError());
    }
    // Token MASTER (solo root): bypass total, sin leer la matriz (ADR-P6).
    const permisos = [...PARES_VALIDOS] as string[];
    return Result.ok({
      clienteId: null,
      clienteNombre: null,
      zonaHoraria: null,
      rol: null,
      permisos,
      modulos: derivarModulos(permisos),
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

  // ROOT y ADMINISTRADOR de la membresía activa EN ESTE CLIENTE bypassean
  // TODAS las celdas (ADR-P6). El bypass se MATERIALIZA en el payload, no
  // solo se evalúa en el guard: `use-session.ts` del frontend solo tiene
  // rama ROOT (`is_global_admin`), no ADMINISTRADOR — si el bypass viviera
  // solo en el guard, un ADMINISTRADOR con `permisos=[]` vería la UI
  // esconder botones que el backend igual le permite (backend permisivo,
  // UI muerta). Acotado al cliente activo por construcción (S4): cada
  // llamada resuelve la membresía del `clienteId` pedido.
  const esAdminTotal = actor.isGlobalAdmin || membresia?.rolCodigo === ROL_ADMINISTRADOR;
  const permisos = esAdminTotal
    ? ([...PARES_VALIDOS] as string[])
    : await permisosRepo.findByUsuarioYCliente(actor.usuarioId, clienteId);

  return Result.ok({
    clienteId,
    clienteNombre: cliente.nombre,
    zonaHoraria: cliente.zonaHoraria.valor,
    rol: membresia?.rolCodigo ?? null,
    permisos,
    modulos: derivarModulos(permisos),
  });
}
