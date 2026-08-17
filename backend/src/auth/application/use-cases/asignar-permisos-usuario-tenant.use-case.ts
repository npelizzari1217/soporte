import { Result } from '../../../shared/domain/result';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import {
  CeldaPermisoInvalidaError,
  MembresiaNoEncontradaError,
} from '../../domain/errors/auth.errors';

/**
 * Input de `AsignarPermisosUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO
 * y SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — mecanismo de aislamiento estricto: las celdas se
 * reemplazan SIEMPRE dentro del cliente del token, nunca en otro tenant.
 */
export interface AsignarPermisosUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  celdas: string[];
}

export type AsignarPermisosUsuarioTenantError =
  CeldaPermisoInvalidaError | MembresiaNoEncontradaError;

/**
 * AsignarPermisosUsuarioTenantUseCase — `PATCH /usuarios/:id/permisos` (ABM
 * de la matriz, sdd/matriz-permisos-por-usuario WU-7.4, ADR-P10).
 * `AdminClienteGuard` en el controller. Semántica de REEMPLAZO TOTAL, no de
 * fusión (mismo criterio que `setModulos` del ABM viejo).
 *
 * Flujo (mismo orden fail-fast que tenía el ABM viejo de módulos, retirado en
 * WU-7.6):
 * 1. Valida que TODAS las celdas ∈ `PARES_VALIDOS` — `CeldaPermisoInvalidaError`
 *    (422) si alguna no existe. Defensa en profundidad detrás del `@IsIn`
 *    del DTO — el CHECK de la DB es la última red (ADR-P10).
 * 2. Valida que exista una membresía ACTIVA del usuario en `clienteId`
 *    (`findActivaByUsuarioYCliente`) — `MembresiaNoEncontradaError` (404) si
 *    no: un ADMINISTRADOR nunca distingue "usuario inexistente" de "existe en
 *    otro tenant" (aislamiento estricto).
 * 3. Reemplaza el set de celdas (`permisosRepo.setPermisos`, atómico e
 *    idempotente, ADR-P3).
 */
export class AsignarPermisosUsuarioTenantUseCase {
  constructor(
    private readonly permisosRepo: Pick<IMatrizPermisosRepository, 'setPermisos'>,
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
  ) {}

  async execute(
    input: AsignarPermisosUsuarioTenantInput,
  ): Promise<Result<string[], AsignarPermisosUsuarioTenantError>> {
    const celdasValidas: readonly string[] = PARES_VALIDOS;
    const invalidas = input.celdas.filter((celda) => !celdasValidas.includes(celda));
    if (invalidas.length > 0) {
      return Result.fail(new CeldaPermisoInvalidaError(invalidas));
    }

    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    await this.permisosRepo.setPermisos(input.usuarioId, input.clienteId, input.celdas);

    return Result.ok(input.celdas);
  }
}
