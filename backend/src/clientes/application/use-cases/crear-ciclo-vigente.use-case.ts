import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteOverlapError } from '../../domain/errors/clientes.errors';

/**
 * CrearCicloVigenteDto — datos para crear un nuevo ciclo vigente global.
 */
export interface CrearCicloVigenteDto {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
}

/**
 * CrearCicloVigenteUseCase — crea un nuevo ciclo vigente global en MASTER.
 *
 * Regla de dominio central: los rangos de fecha de ciclos activos (activo=true,
 * deleted_at IS NULL) NO deben solaparse. Algoritmo:
 *   nuevaInicio <= existenteFin AND nuevaFin >= existenteInicio
 *
 * Ciclos soft-deleted (deleted_at IS NOT NULL) e inactivos (activo=false) son
 * excluidos de la validación → un nuevo ciclo puede solapar con ellos.
 *
 * Retorna:
 *   - Result.ok(ciclo) si la creación fue exitosa.
 *   - Result.fail(CicloVigenteOverlapError) si hay solapamiento (HTTP 422).
 *
 * Tarea: 1.B.6
 */
export class CrearCicloVigenteUseCase {
  constructor(private readonly cicloRepo: ICicloVigenteRepository) {}

  async execute(
    dto: CrearCicloVigenteDto,
  ): Promise<Result<CicloVigenteEntity, CicloVigenteOverlapError>> {
    // 1. Obtener ciclos activos (activo=true, deletedAt=null) para validar solapamiento.
    //    Ciclos soft-deleted e inactivos (activo=false) son ignorados — alineado a spec:
    //    "Ciclos vigentes sin solapamiento" solo bloquea contra ciclos activos.
    const ciclosActivos = await this.cicloRepo.findActiveNonDeleted();

    // 2. Verificar solapamiento de rangos de fechas
    //    Algoritmo: dos rangos [A, B] y [C, D] se solapan si A <= D AND B >= C
    const haysolapamiento = ciclosActivos.some(
      (ciclo) => dto.fechaInicio <= ciclo.fechaFin && dto.fechaFin >= ciclo.fechaInicio,
    );

    if (haysolapamiento) {
      return Result.fail(new CicloVigenteOverlapError());
    }

    // 3. Crear la entidad — UUIDv7 generado en BaseEntity
    const ciclo = CicloVigenteEntity.create({
      nombre: dto.nombre,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      activo: dto.activo,
    });

    // 4. Persistir
    await this.cicloRepo.save(ciclo);

    return Result.ok(ciclo);
  }
}
