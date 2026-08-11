import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoNoEncontradoError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';

/** Detecta el error P2002 de Prisma (UNIQUE constraint violation) sin importar tipos de infraestructura. */
function isPrismaUniqueConstraintError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/** DTO de entrada para editar un equipo (PATCH semántico, campos `undefined` no se tocan). */
export interface EditarEquipoDto {
  equipoId: string;
  nombre?: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  fechaAdquisicion?: Date | null;
  /** Ubicación como TEXTO LIBRE (la entidad la normaliza a mayúscula). */
  ubicacion?: string | null;
  importe?: number | null;
  fechaValoracion?: Date | null;
  observaciones?: string | null;
  valorResidual?: number | null;
  fechaValorResidual?: Date | null;
}

/**
 * EditarEquipoUseCase — edita los datos de un equipo existente (F3-Q1).
 *
 * Flujo:
 * 1. Carga el equipo → `EquipoNoEncontradoError` si no existe/eliminado.
 * 2. Si `numeroSerie` fue provisto y difiere del actual: verifica unicidad
 *    excluyendo el propio equipo → `NumeroSerieDuplicadoError` si
 *    pertenece a OTRO equipo.
 * 3. Aplica `actualizar()` (que normaliza `ubicacion` a mayúscula) y persiste
 *    en transacción (con la misma defensa P2002 que `CrearEquipoUseCase`).
 *
 * La ubicación pasó de FK (catálogo) a TEXTO LIBRE — ya no se valida.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.1, T12.2.
 */
export class EditarEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<
      IEquipoInformaticoRepository,
      'findById' | 'findByNumeroSerie' | 'save'
    >,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    if (
      dto.numeroSerie !== undefined &&
      dto.numeroSerie !== null &&
      dto.numeroSerie !== equipo.numeroSerie
    ) {
      const existente = await this.equipoRepo.findByNumeroSerie(dto.numeroSerie);
      if (existente && existente.id !== equipo.id) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
    }

    equipo.actualizar({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacion: dto.ubicacion,
      importe: dto.importe,
      fechaValoracion: dto.fechaValoracion,
      observaciones: dto.observaciones,
      valorResidual: dto.valorResidual,
      fechaValorResidual: dto.fechaValorResidual,
    });

    try {
      await this.txRunner.run(async () => {
        await this.equipoRepo.save(equipo);
      });
    } catch (err: unknown) {
      if (dto.numeroSerie && isPrismaUniqueConstraintError(err)) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
      throw err;
    }

    return Result.ok(equipo);
  }
}
