import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteNotFoundError } from '../../domain/errors/clientes.errors';

/**
 * DesactivarCicloUseCase — desactiva un ciclo del tenant resuelto.
 *
 * Contraparte de `ActivarCicloUseCase`. A diferencia de la activación (que
 * desactiva el resto en una transacción para mantener el invariante "máximo un
 * activo"), desactivar es una operación puntual y SIN efectos colaterales: el
 * tenant simplemente queda sin ciclo activo (0 activos es un estado válido).
 * Por eso reusa el `save()` normal del repositorio en vez de una transacción
 * dedicada.
 *
 * 1. Verifica que el ciclo exista en el tenant activo (`findById` → `null` =
 *    `CicloClienteNotFoundError`).
 * 2. Marca el ciclo como inactivo y lo persiste.
 *
 * El tenant activo lo resuelve `TenantContext` → `TenantGuard`.
 */
export class DesactivarCicloUseCase {
  constructor(private readonly cicloClienteRepo: ICicloClienteRepository) {}

  async execute(cicloId: string): Promise<Result<CicloClienteEntity, CicloClienteNotFoundError>> {
    const ciclo = await this.cicloClienteRepo.findById(cicloId);
    if (!ciclo) {
      return Result.fail(new CicloClienteNotFoundError(cicloId));
    }

    ciclo.deactivate();
    await this.cicloClienteRepo.save(ciclo);
    return Result.ok(ciclo);
  }
}
