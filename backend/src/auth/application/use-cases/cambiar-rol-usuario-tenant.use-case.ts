import { Result } from '../../../shared/domain/result';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import {
  MembresiaNoEncontradaError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';

/**
 * Input de `CambiarRolUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — es el mecanismo de aislamiento: la búsqueda de la
 * membresía SIEMPRE está scopeada a este cliente.
 *
 * `reaplicarPreset` (R6, confirmado por el usuario — #2220): por DEFAULT
 * (ausente o `false`) este endpoint SOLO cambia `rol_id` — la matriz de
 * permisos del usuario en este cliente queda IDÉNTICA, para no pisar en
 * silencio ajustes finos que un ADMINISTRADOR ya haya hecho a mano en la
 * grilla (S13). Con `true`, SOBRESCRIBE (no fusiona) las filas de matriz de
 * ese usuario+cliente con el preset del rol DESTINO (S14) — el frontend debe
 * pedir confirmación explícita antes de mandar este flag (fuera del alcance
 * de este use case).
 */
export interface CambiarRolUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  rolCodigo: string;
  reaplicarPreset?: boolean;
}

export type CambiarRolUsuarioTenantError =
  RolNoEncontradoError | MembresiaNoEncontradaError | PresetRolNoDefinidoError;

/**
 * CambiarRolUsuarioTenantUseCase — `PATCH /usuarios/:id/rol` (gestión mínima
 * de usuarios, sdd/beta-frontend/spec §5; R6 sdd/matriz-permisos-por-usuario).
 * `AdminClienteGuard` en el controller.
 *
 * Valida el `rolCodigo` ANTES de buscar la membresía (fail-fast, mismo
 * criterio que `CrearUsuarioTenantUseCase`). Busca la membresía por
 * `(usuarioId, clienteId)` — si no existe, `MembresiaNoEncontradaError`
 * (404): un ADMINISTRADOR de otro cliente nunca distingue "usuario
 * inexistente" de "usuario existe pero en otro tenant" (aislamiento
 * estricto, spec §5).
 *
 * Aislamiento de R6 (ADR-P9): este use case NO conoce `PRESETS_ROL` ni la
 * matriz — solo INVOCA `AplicarPresetPermisosUseCase` (inyectado) bajo
 * condición, cuando `reaplicarPreset === true`. Si esa invocación falla
 * (`PresetRolNoDefinidoError`), el rol YA quedó cambiado y persistido —
 * deliberado: el fallo del preset no debe revertir el cambio de rol, que es
 * la operación principal del endpoint; el ADMINISTRADOR reintenta solo la
 * aplicación del preset.
 *
 * Ref spec: sdd/beta-frontend/spec §5; sdd/matriz-permisos-por-usuario/spec
 * R6, S13, S14. Ref design: ADR-P9 §"aislamiento de R6".
 */
export class CambiarRolUsuarioTenantUseCase {
  constructor(
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findByUsuarioYCliente' | 'save'>,
    private readonly roleRepo: Pick<IRoleRepository, 'findByCodigo'>,
    private readonly aplicarPresetPermisosUseCase: Pick<AplicarPresetPermisosUseCase, 'execute'>,
  ) {}

  async execute(
    input: CambiarRolUsuarioTenantInput,
  ): Promise<Result<MembresiaEntity, CambiarRolUsuarioTenantError>> {
    const rol = await this.roleRepo.findByCodigo(input.rolCodigo);
    if (!rol) {
      return Result.fail(new RolNoEncontradoError(input.rolCodigo));
    }

    const membresia = await this.membresiaRepo.findByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    membresia.cambiarRol(rol.id);
    await this.membresiaRepo.save(membresia);

    if (input.reaplicarPreset === true) {
      const presetResult = await this.aplicarPresetPermisosUseCase.execute({
        clienteId: input.clienteId,
        usuarioId: input.usuarioId,
        rolCodigo: input.rolCodigo,
      });
      if (presetResult.isFail()) {
        return Result.fail(presetResult.getError());
      }
    }

    return Result.ok(membresia);
  }
}
