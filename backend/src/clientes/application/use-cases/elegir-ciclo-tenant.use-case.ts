import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import {
  CicloVigenteNotFoundError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

/**
 * ElegirCicloTenantDto — datos para elegir un ciclo del catálogo master en el tenant.
 */
export interface ElegirCicloTenantDto {
  cicloVigenteId: string;
}

/**
 * ElegirCicloTenantUseCase — reemplaza CrearCicloTenantUseCase (ADR-3).
 *
 * El tenant ya NO crea un ciclo de cero: elige uno del catálogo master
 * (`ciclos_vigentes`), copiando (snapshot) nombre/fechas y referenciando el
 * `cicloVigenteId` real (ADR-4/ADR-5). El ciclo elegido se crea inactivo —
 * la activación es un paso aparte (ADR-7).
 *
 * Reglas (ADR-6):
 * 1. El ciclo master debe existir, estar `activo=true` y `deletedAt=null`
 *    → si no, `CicloVigenteNotFoundError` (404, no elegible).
 * 2. Las fechas (snapshot del master) NO deben solapar con ciclos ACTIVOS
 *    existentes del tenant (mismo algoritmo A<=D && B>=C que el use case
 *    original; ciclos inactivos/soft-deleted del tenant no bloquean).
 * 3. El nuevo ciclo se crea con activo=FALSE por defecto.
 *
 * El tenant es el resuelto por TenantContext → TenantGuard (transparente al use case).
 *
 * Spec ref: ciclos-master-tenant/design ADR-3/ADR-4/ADR-6, POST /ciclos
 * Tarea: T3.6
 */
export class ElegirCicloTenantUseCase {
  constructor(
    private readonly cicloVigenteRepo: ICicloVigenteRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
  ) {}

  async execute(
    dto: ElegirCicloTenantDto,
  ): Promise<Result<CicloClienteEntity, CicloVigenteNotFoundError | CicloVigenteOverlapError>> {
    // 1. Validar elegibilidad en el catálogo master (ADR-6)
    const master = await this.cicloVigenteRepo.findById(dto.cicloVigenteId);
    if (!master || !master.activo || master.deletedAt !== null) {
      return Result.fail(new CicloVigenteNotFoundError(dto.cicloVigenteId));
    }

    // 2. Verificar solapamiento con ciclos ACTIVOS del tenant
    const todos = await this.cicloClienteRepo.findAll();
    const ciclosActivos = todos.filter((c) => c.activo && c.deletedAt === null);

    const haySolapamiento = ciclosActivos.some(
      (existente) =>
        master.fechaInicio <= existente.fechaFin && master.fechaFin >= existente.fechaInicio,
    );

    if (haySolapamiento) {
      return Result.fail(new CicloVigenteOverlapError());
    }

    // 3. Snapshot de nombre/fechas + link real al master (ADR-4/ADR-5)
    const ciclo = CicloClienteEntity.create({
      nombre: master.nombre,
      fechaInicio: master.fechaInicio,
      fechaFin: master.fechaFin,
      activo: false,
      cicloVigenteId: master.id,
    });

    // 4. Persistir
    await this.cicloClienteRepo.save(ciclo);

    return Result.ok(ciclo);
  }
}
