import { Result } from '../../../shared/domain/result';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';
import { celdaReemplazadaPorTipo } from '../../../tickets/domain/permisos-tipo-ticket';
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
 *
 * Celdas de tickets (odd/tasks/permisos-por-tipo-ticket.md, T7, D5 d): las que pasaron a los
 * permisos por tipo (`celdaReemplazadaPorTipo`: `TICKETS:*` y `EDILICIA:LECTURA|ALTAS|MODIFICACION`)
 * ya no deciden nada y dejan de editarse acá. El reemplazo las CONSERVA como estaban, sin importar
 * lo que traiga el pedido: se retiran de la base en una etapa posterior (T9) y, mientras tanto, son
 * el origen del backfill y de un rollback. No se rechazan con 422 para no romper a un llamador que
 * las reenvía tal como las leyó; la respuesta devuelve lo que quedó guardado.
 */
export class AsignarPermisosUsuarioTenantUseCase {
  constructor(
    private readonly permisosRepo: Pick<
      IMatrizPermisosRepository,
      'setPermisos' | 'findByUsuarioYCliente'
    >,
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

    const actuales = await this.permisosRepo.findByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    const celdas = [
      ...input.celdas.filter((celda) => !celdaReemplazadaPorTipo(celda)),
      ...actuales.filter(celdaReemplazadaPorTipo),
    ];
    await this.permisosRepo.setPermisos(input.usuarioId, input.clienteId, celdas);

    return Result.ok(celdas);
  }
}
