import { Result } from '../../../shared/domain/result';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';

/**
 * Input de `DesactivarMembresiaUsuarioTenantUseCase`. `clienteId` es
 * OBLIGATORIO y SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT
 * del ADMINISTRADOR) — mecanismo de aislamiento (spec §5).
 */
export interface DesactivarMembresiaUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
}

/**
 * DesactivarMembresiaUsuarioTenantUseCase — `DELETE /usuarios/:id/membresia`
 * (gestión mínima de usuarios, sdd/beta-frontend/spec §5). Permiso
 * `usuario:gestionar` + `rol:asignar` (ADMINISTRADOR), enforced por el
 * controller.
 *
 * Desactiva la membresía (`MembresiaEntity.desactivar()` — baja lógica de
 * ACCESO, idempotente) SIN borrar el usuario global ni la fila de membresía
 * (historial/auditoría preservados, mismo criterio que el resto del
 * dominio). Busca por `(usuarioId, clienteId)` — `MembresiaNoEncontradaError`
 * (404) si no existe, mismo aislamiento estricto que
 * `CambiarRolUsuarioTenantUseCase`.
 *
 * Ref spec: sdd/beta-frontend/spec §5.
 */
export class DesactivarMembresiaUsuarioTenantUseCase {
  constructor(
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findByUsuarioYCliente' | 'save'>,
  ) {}

  async execute(
    input: DesactivarMembresiaUsuarioTenantInput,
  ): Promise<Result<MembresiaEntity, MembresiaNoEncontradaError>> {
    const membresia = await this.membresiaRepo.findByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    membresia.desactivar();
    await this.membresiaRepo.save(membresia);

    return Result.ok(membresia);
  }
}
