import { NotFoundException } from '@nestjs/common';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ActivarCicloUseCase — activa un ciclo del tenant resuelto.
 *
 * Al activar un ciclo:
 * 1. Verifica que el ciclo existe en el tenant (findById → null = 404).
 * 2. Llama a activarCiclo(id) en el repositorio, que en una sola transacción:
 *    a. UPDATE ciclos_cliente SET activo=false WHERE id != X (desactiva todos)
 *    b. UPDATE ciclos_cliente SET activo=true WHERE id = X (activa el objetivo)
 *
 * El tenant activo es el resuelto por TenantContext → TenantGuard.
 * No hay lógica de X-Tenant-Id aquí: TenantGuard ya lo resolvió.
 *
 * Spec ref: clientes-tenancy/PATCH /ciclos/:id/activar
 * Tarea: T2.12
 */
export class ActivarCicloUseCase {
  constructor(private readonly cicloRepo: ICicloClienteRepository) {}

  async execute(cicloId: string): Promise<CicloClienteEntity> {
    // 1. Verificar existencia del ciclo en el tenant activo
    const ciclo = await this.cicloRepo.findById(cicloId);
    if (!ciclo) {
      throw new NotFoundException(`Ciclo con id "${cicloId}" no encontrado en este tenant.`);
    }

    // 2. Activar en transacción (deactivate all + activate this)
    //    activarCiclo retorna false si el ciclo no fue encontrado (race condition extrema)
    const activado = await this.cicloRepo.activarCiclo(cicloId);
    if (!activado) {
      throw new NotFoundException(`No se pudo activar el ciclo "${cicloId}".`);
    }

    // 3. Actualizar el estado local del objeto (para retornar al caller)
    ciclo.activate();
    return ciclo;
  }
}
