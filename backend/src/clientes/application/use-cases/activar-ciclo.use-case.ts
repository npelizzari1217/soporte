import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteNotFoundError } from '../../domain/errors/clientes.errors';

/**
 * ActivarCicloUseCase — activa un ciclo del tenant resuelto (R22).
 *
 * 1. Verifica que el ciclo exista en el tenant activo (`findById` → `null` =
 *    `CicloClienteNotFoundError`).
 * 2. Llama a `activarCiclo(id)` en el repositorio, que en una sola
 *    transacción: (a) desactiva TODOS los ciclos del tenant, (b) activa el
 *    objetivo (invariante: máximo un `activo=true` por tenant).
 *
 * El tenant activo es el resuelto por `TenantContext` → `TenantGuard` — no
 * hay lógica de resolución de tenant acá.
 *
 * Tarea: T9.5 (PR9 — Ciclos: catálogo master + adopción/activación)
 */
export class ActivarCicloUseCase {
  constructor(private readonly cicloClienteRepo: ICicloClienteRepository) {}

  async execute(cicloId: string): Promise<Result<CicloClienteEntity, CicloClienteNotFoundError>> {
    const ciclo = await this.cicloClienteRepo.findById(cicloId);
    if (!ciclo) {
      return Result.fail(new CicloClienteNotFoundError(cicloId));
    }

    // activarCiclo retorna false si el ciclo no fue encontrado por la
    // transacción (carrera extrema entre el findById de arriba y este paso).
    const activado = await this.cicloClienteRepo.activarCiclo(cicloId);
    if (!activado) {
      return Result.fail(new CicloClienteNotFoundError(cicloId));
    }

    ciclo.activate();
    return Result.ok(ciclo);
  }
}
