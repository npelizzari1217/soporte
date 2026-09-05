import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { NumeroSerieDuplicadoError } from '../../domain/errors/equipos.errors';
import {
  LectorCatalogoModelos,
  validarModeloEquipoElegible,
} from '../services/validar-modelo-equipo.service';

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
  /** Ubicación física como TEXTO LIBRE (la entidad la normaliza a mayúscula). `null` = sin ubicar. */
  ubicacion?: string | null;
  /**
   * Modelo del catálogo (`modelos_equipo`). OPCIONAL: un clon armado en casa no
   * tiene modelo y se da de alta igual — simplemente no participa de la
   * compatibilidad con insumos.
   */
  modeloEquipoId?: string | null;
  importe?: number | null;
  fechaValoracion?: Date | null;
  observaciones?: string | null;
  valorResidual?: number | null;
  fechaValorResidual?: Date | null;
}

/**
 * CrearEquipoUseCase — crea un equipo informático en el inventario del
 * tenant (F3-Q1).
 *
 * Flujo:
 * 1. Si `numeroSerie` fue provisto: verifica unicidad vía repositorio
 *    (`findByNumeroSerie` excluye soft-deleted) → `NumeroSerieDuplicadoError`
 *    si duplicado.
 * 2. Si `modeloEquipoId` viene con valor: verifica contra el catálogo
 *    `modelos_equipo` que el modelo EXISTA y esté HABILITADO →
 *    `ModeloEquipoInexistenteError` / `ModeloEquipoDeshabilitadoError`. El
 *    chequeo NO es redundante con la FK: la FK atrapa el id inexistente (y mal,
 *    como un 409 genérico que no nombra el campo), pero el modelo deshabilitado
 *    tiene fila en la tabla, así que la base lo acepta en silencio.
 * 3. Crea la entidad (activo=true por defecto; `ubicacion` normalizada a
 *    mayúscula por la entidad) y persiste en transacción. Si la DB lanza P2002
 *    (carrera concurrente sobre el índice único parcial), se mapea igual a
 *    `NumeroSerieDuplicadoError` (defensa en profundidad).
 *
 * La ubicación pasó de FK (catálogo) a TEXTO LIBRE — ya no se valida contra el
 * catálogo de ubicaciones.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.1, T12.2.
 */
export class CrearEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findByNumeroSerie' | 'save'>,
    private readonly txRunner: ITenantTransactionRunner,
    // Va al final para no reordenar los args de los callers existentes (mismo
    // criterio que `EquiposController.exportarEquiposUseCase`).
    private readonly modeloEquipoRepo: LectorCatalogoModelos,
  ) {}

  async execute(dto: CrearEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    if (dto.numeroSerie !== null) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      if (existente) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
    }

    // `undefined` y `null` significan lo mismo en el alta —el clon armado en
    // casa, sin modelo de catálogo— y ninguno de los dos se valida.
    if (dto.modeloEquipoId !== undefined && dto.modeloEquipoId !== null) {
      const modeloValido = await validarModeloEquipoElegible(
        this.modeloEquipoRepo,
        dto.modeloEquipoId,
      );
      if (modeloValido.isFail()) {
        return Result.fail(modeloValido.getError());
      }
    }

    const equipo = EquipoInformaticoEntity.create({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacion: dto.ubicacion ?? null,
      modeloEquipoId: dto.modeloEquipoId ?? null,
      importe: dto.importe ?? null,
      fechaValoracion: dto.fechaValoracion ?? null,
      observaciones: dto.observaciones ?? null,
      valorResidual: dto.valorResidual ?? null,
      fechaValorResidual: dto.fechaValorResidual ?? null,
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
