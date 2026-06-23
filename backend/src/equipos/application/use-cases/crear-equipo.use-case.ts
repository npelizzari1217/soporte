import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { NumeroSerieEquipoDuplicadoError } from '../../domain/errors/equipos.errors';

/** Detecta error P2002 de Prisma (UNIQUE constraint violation) sin importar tipos de infraestructura. */
function isPrismaUniqueConstraintError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/**
 * DTO para crear un nuevo equipo informático en el inventario.
 */
export interface CrearEquipoDto {
  /** Nombre o identificador descriptivo. Ej: "PC Contabilidad 03". */
  nombre: string;
  /**
   * Número de serie del fabricante. NULL si no disponible.
   * UNIQUE parcial: si se provee, no debe existir otro equipo con el mismo numero_serie.
   * Múltiples NULL son permitidos (solo aplica el UNIQUE WHERE NOT NULL).
   */
  numeroSerie: string | null;
  /** Fabricante. Ej: Dell, HP, Lenovo. */
  marca: string | null;
  /** Modelo comercial. */
  modelo: string | null;
  /** Fecha de compra o incorporación al inventario. */
  fechaAdquisicion: Date | null;
  /** UUID de la ubicación física del equipo. NULL si sin ubicar. */
  ubicacionId: string | null;
}

/**
 * CrearEquipoUseCase — caso de uso para crear un equipo informático en el inventario.
 *
 * Flujo:
 * 1. Si numeroSerie provisto: verifica unicidad vía repositorio → 409 si duplicado.
 *    El check app-level mira solo equipos activos (findByNumeroSerie excluye soft-deleted),
 *    consistente con el índice DB `WHERE numero_serie IS NOT NULL AND deleted_at IS NULL`.
 * 2. Crea la EquipoInformaticoEntity (activo=true por defecto, UUIDv7).
 * 3. Persiste en transacción. Si la DB lanza P2002 (race condition), se mapea a 409.
 * 4. Retorna Result.ok(equipo).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Número de serie único solo entre activos, Equipo sin número de serie es válido]
 * Decisión 2026-06-23: numero_serie único solo entre equipos con deleted_at IS NULL.
 * Tarea: 6.B.3 / 6.B.4
 */
export class CrearEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    // 1. Verificar unicidad del numero_serie entre equipos ACTIVOS (solo cuando se provee)
    if (dto.numeroSerie !== null) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      if (existente) {
        return Result.fail(new NumeroSerieEquipoDuplicadoError(dto.numeroSerie));
      }
    }

    // 2. Crear la entidad (activo=true por defecto, UUIDv7 generado por BaseEntity)
    const equipo = EquipoInformaticoEntity.create({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacionId: dto.ubicacionId,
      asignadoAId: null,
      activo: true,
    });

    // 3. Persistir en transacción.
    //    Guard P2002: si una carrera concurrente inserta el mismo numero_serie entre
    //    el check del paso 1 y el save(), la DB lanza P2002. Lo mapeamos a 409.
    try {
      await this.txRunner.run(async () => {
        await this.equipoRepo.save(equipo);
      });
    } catch (err: unknown) {
      if (dto.numeroSerie !== null && isPrismaUniqueConstraintError(err)) {
        return Result.fail(new NumeroSerieEquipoDuplicadoError(dto.numeroSerie));
      }
      throw err;
    }

    return Result.ok(equipo);
  }
}
