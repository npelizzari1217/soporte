import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
} from '../../domain/errors/clientes.errors';

/**
 * CrearCicloTenantDto — datos para crear un ciclo de gestión en el tenant.
 */
export interface CrearCicloTenantDto {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}

/**
 * CrearCicloTenantUseCase — crea un nuevo ciclo de gestión en el tenant resuelto.
 *
 * Reglas de dominio:
 * 1. fecha_fin > fecha_inicio (invariante de CicloClienteEntity).
 * 2. Las fechas NO deben solapar con ciclos ACTIVOS existentes del tenant.
 * 3. El nuevo ciclo se crea con activo=FALSE por defecto (activación es separada).
 *
 * El tenant es el resuelto por TenantContext → TenantGuard (transparente al use case).
 *
 * Retorna:
 * - Result.ok(ciclo) si la creación fue exitosa.
 * - Result.fail(CicloVigenteInvalidDatesError) si fecha_fin <= fecha_inicio.
 * - Result.fail(CicloVigenteOverlapError) si hay solapamiento con ciclo activo.
 *
 * Spec ref: clientes-tenancy/POST /ciclos
 * Tarea: T2.10
 */
export class CrearCicloTenantUseCase {
  constructor(private readonly cicloRepo: ICicloClienteRepository) {}

  async execute(
    dto: CrearCicloTenantDto,
  ): Promise<Result<CicloClienteEntity, CicloVigenteOverlapError | CicloVigenteInvalidDatesError>> {
    // 1. Validar fechas y crear la entidad (CicloClienteEntity.create valida fecha_fin > fecha_inicio)
    let ciclo: CicloClienteEntity;
    try {
      ciclo = CicloClienteEntity.create({
        nombre: dto.nombre,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        activo: false, // SIEMPRE inactivo al crear — activación es acción separada
      });
    } catch (err) {
      if (err instanceof CicloVigenteInvalidDatesError) {
        return Result.fail(err);
      }
      throw err;
    }

    // 2. Verificar solapamiento con ciclos ACTIVOS del tenant
    const todos = await this.cicloRepo.findAll();
    const ciclosActivos = todos.filter((c) => c.activo && c.deletedAt === null);

    const haysolapamiento = ciclosActivos.some(
      (existente) => dto.fechaInicio <= existente.fechaFin && dto.fechaFin >= existente.fechaInicio,
    );

    if (haysolapamiento) {
      return Result.fail(new CicloVigenteOverlapError());
    }

    // 3. Persistir
    await this.cicloRepo.save(ciclo);

    return Result.ok(ciclo);
  }
}
