import { Result } from '../../../shared/domain/result';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { PresetRolNoDefinidoError } from '../../domain/errors/auth.errors';
import { obtenerPresetDeRol } from '../../domain/presets-rol';

/**
 * Input de `AplicarPresetPermisosUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — mismo aislamiento estricto que el resto del ABM.
 */
export interface AplicarPresetPermisosInput {
  clienteId: string;
  usuarioId: string;
  rolCodigo: string;
  /**
   * `true` PISA la matriz existente con el preset del rol. `false` la aplica
   * SOLO si el usuario no tiene ninguna celda en ese cliente.
   *
   * La distinción es el fix de W11. Hay dos llamadores y quieren cosas
   * opuestas, aunque el nombre del caso de uso sugiera una sola:
   *
   * - **El alta** (`CrearUsuarioTenantUseCase`) pasa `false`. Cubre dos
   *   situaciones que parecen una: alguien que nunca existió (matriz vacía,
   *   el preset la siembra) y el RE-alta de alguien dado de baja, cuya matriz
   *   la baja conservó a propósito (`desactivar-membresia` desactiva la
   *   membresía, no borra celdas). Con `true` el re-alta pisaba los recortes
   *   que un ADMINISTRADOR hubiera hecho a mano.
   * - **`PATCH /usuarios/:id/rol` con `reaplicarPreset`** pasa `true`: ahí
   *   pisar ES lo pedido, y el frontend lo confirma antes de mandarlo.
   *
   * Es la misma regla de R6 llevada al caso que se le había escapado: nada
   * pisa una matriz ajustada a mano sin que alguien lo pida explícitamente.
   */
  sobrescribir: boolean;
}

export type AplicarPresetPermisosError = PresetRolNoDefinidoError;

/**
 * AplicarPresetPermisosUseCase — `POST /usuarios/:id/permisos/aplicar-preset`
 * (ABM de la matriz, sdd/matriz-permisos-por-usuario WU-7.4, ADR-P9/ADR-P10).
 * `AdminClienteGuard` en el controller.
 *
 * Aislado a propósito, SIN saber nada de `CambiarRolUsuarioTenantUseCase`
 * (ADR-P9 §"aislamiento de R6"): resuelve el preset del `rolCodigo` recibido
 * y SOBRESCRIBE (no fusiona) la matriz del usuario en `clienteId` —
 * `permisosRepo.setPermisos` ya es reemplazo atómico e idempotente (ADR-P3).
 * `CambiarRolUsuarioTenantUseCase` lo invoca inyectado, solo bajo
 * `reaplicarPreset: true` (R6, S14) — este use case no conoce ese flujo.
 *
 * Fail EXPLÍCITO vía `obtenerPresetDeRol`: un `rolCodigo` sin entrada en
 * `PRESETS_ROL` (rol sembrado por migración sin preset agregado al código)
 * NUNCA sobrescribe con un set vacío en silencio — eso borraría la matriz de
 * cualquiera al que se le aplicara por error.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R6, R7. Ref design: ADR-P9.
 */
export class AplicarPresetPermisosUseCase {
  constructor(
    private readonly permisosRepo: Pick<
      IMatrizPermisosRepository,
      'setPermisos' | 'findByUsuarioYCliente'
    >,
  ) {}

  async execute(
    input: AplicarPresetPermisosInput,
  ): Promise<Result<void, AplicarPresetPermisosError>> {
    const presetResult = obtenerPresetDeRol(input.rolCodigo);
    if (presetResult.isFail()) {
      return Result.fail(presetResult.getError());
    }

    // El preset se resuelve ANTES de decidir si se aplica: un rol sin preset
    // tiene que fallar igual, aunque después no fuéramos a escribir nada. Si
    // no, un rol mal configurado pasaría inadvertido en todos los re-altas.
    if (!input.sobrescribir) {
      const celdasActuales = await this.permisosRepo.findByUsuarioYCliente(
        input.usuarioId,
        input.clienteId,
      );
      if (celdasActuales.length > 0) {
        return Result.ok(undefined);
      }
    }

    await this.permisosRepo.setPermisos(input.usuarioId, input.clienteId, presetResult.getValue());

    return Result.ok(undefined);
  }
}
