import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloOverlapError, CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

/** ElegirCicloTenantDto — datos para adoptar un ciclo del catálogo master en el tenant. */
export interface ElegirCicloTenantDto {
  cicloVigenteId: string;
}

/**
 * ElegirCicloTenantUseCase — el ADMINISTRADOR de un tenant adopta un ciclo
 * del catálogo global (`master.ciclos_vigentes`), copiándolo (snapshot) a
 * `tenant.ciclos_cliente` con `activo=false` (R21).
 *
 * Reglas:
 * 1. El ciclo master debe existir, `activo=true` y no soft-deleted → si no,
 *    `CicloVigenteNotFoundError` (404, no elegible).
 * 2. Las fechas (snapshot del master) NO deben solapar con ciclos ACTIVOS
 *    existentes del tenant. Algoritmo de solapamiento de rangos:
 *    `nuevaInicio <= existenteFin AND nuevaFin >= existenteInicio`. Ciclos
 *    inactivos/soft-deleted del tenant NO bloquean.
 * 3. El nuevo ciclo se crea SIEMPRE con `activo=false` — la activación
 *    (`ActivarCicloUseCase`, R22) es un paso explícito y separado.
 *
 * El tenant activo es el resuelto por `TenantContext` → `TenantGuard`
 * (transparente a este use case — el repo ya opera sobre el tenant correcto).
 *
 * Tarea: T9.4 (PR9 — Ciclos: catálogo master + adopción/activación)
 */
export class ElegirCicloTenantUseCase {
  constructor(
    private readonly cicloVigenteRepo: ICicloVigenteRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
  ) {}

  async execute(
    dto: ElegirCicloTenantDto,
  ): Promise<Result<CicloClienteEntity, CicloVigenteNotFoundError | CicloOverlapError>> {
    // 1. Validar elegibilidad en el catálogo master.
    const master = await this.cicloVigenteRepo.findById(dto.cicloVigenteId);
    if (!master || !master.activo || master.isDeleted()) {
      return Result.fail(new CicloVigenteNotFoundError(dto.cicloVigenteId));
    }

    // 2. Verificar solapamiento con ciclos ACTIVOS del tenant.
    const activos = await this.cicloClienteRepo.findActivos();
    const haySolapamiento = activos.some(
      (existente) =>
        master.fechaInicio <= existente.fechaFin && master.fechaFin >= existente.fechaInicio,
    );
    if (haySolapamiento) {
      return Result.fail(new CicloOverlapError());
    }

    // 3. Snapshot de nombre/fechas + link real al master (R21).
    const ciclo = CicloClienteEntity.create({
      nombre: master.nombre,
      fechaInicio: master.fechaInicio,
      fechaFin: master.fechaFin,
      activo: false,
      cicloVigenteId: master.id,
    });

    // 4. Persistir.
    await this.cicloClienteRepo.save(ciclo);

    return Result.ok(ciclo);
  }
}
