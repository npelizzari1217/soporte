import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IUbicacionRepository } from '../../../reparaciones/domain/ports/i-ubicacion.repository';
import { UbicacionInvalidaError } from '../../../reparaciones/domain/errors/reparaciones.errors';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { NumeroSerieDuplicadoError } from '../../domain/errors/equipos.errors';

/** Detecta el error P2002 de Prisma (UNIQUE constraint violation) sin importar tipos de infraestructura. */
function isPrismaUniqueConstraintError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/** DTO de entrada para crear un equipo informático en el inventario (F3-Q1). */
export interface CrearEquipoDto {
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: Date | null;
  /** UUID de la ubicación física. `null`/`undefined` = sin ubicar. Si se provee, DEBE existir. */
  ubicacionId?: string | null;
}

/**
 * CrearEquipoUseCase — crea un equipo informático en el inventario del
 * tenant (F3-Q1).
 *
 * Flujo:
 * 1. Si `ubicacionId` fue provisto (no null/undefined): valida que exista y
 *    no esté eliminada — `UbicacionInvalidaError` si no. Reusa el
 *    `UBICACION_REPOSITORY` de `ReparacionesModule` (catálogo tenant-wide
 *    compartido — NO se duplica la entidad/puerto en `equipos/`).
 * 2. Si `numeroSerie` fue provisto: verifica unicidad vía repositorio
 *    (`findByNumeroSerie` excluye soft-deleted) → `NumeroSerieDuplicadoError`
 *    si duplicado.
 * 3. Crea la entidad (activo=true por defecto) y persiste en transacción.
 *    Si la DB lanza P2002 (carrera concurrente sobre el índice único
 *    parcial), se mapea igual a `NumeroSerieDuplicadoError` (defensa en
 *    profundidad, mismo criterio que la referencia probada soporte1).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.1, T12.2.
 */
export class CrearEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findByNumeroSerie' | 'save'>,
    private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findById'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    if (dto.ubicacionId) {
      const ubicacion = await this.ubicacionRepo.findById(dto.ubicacionId);
      if (!ubicacion || ubicacion.isDeleted()) {
        return Result.fail(new UbicacionInvalidaError(dto.ubicacionId));
      }
    }

    if (dto.numeroSerie !== null) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      if (existente) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
    }

    const equipo = EquipoInformaticoEntity.create({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacionId: dto.ubicacionId ?? null,
      asignadoAId: null,
    });

    try {
      await this.txRunner.run(async () => {
        await this.equipoRepo.save(equipo);
      });
    } catch (err: unknown) {
      if (dto.numeroSerie !== null && isPrismaUniqueConstraintError(err)) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
      throw err;
    }

    return Result.ok(equipo);
  }
}
