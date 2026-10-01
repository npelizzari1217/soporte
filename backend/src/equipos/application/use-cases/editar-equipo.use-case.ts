import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';
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
  /**
   * Modelo del catálogo (`modelos_equipo`). `null` desvincula el equipo de su
   * modelo — es el caso del clon, que existe sin participar de la
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
 * EditarEquipoUseCase — edita los datos de un equipo existente (F3-Q1).
 *
 * Flujo:
 * 0. Corre entero en `txRunner.run()`; lo primero es el lock LE `FOR NO KEY UPDATE`
 *    (`bloquearParaModificar`, ADR-2): serializa contra la baja y el borrado.
 * 1. Carga el equipo → `EquipoNoEncontradoError` si no existe/eliminado, y
 *    `EquipoDadoDeBajaError` si está dado de baja (`!activo`, R11).
 * 2. Si `numeroSerie` fue provisto y difiere del actual: verifica unicidad
 *    excluyendo el propio equipo → `NumeroSerieDuplicadoError` si
 *    pertenece a OTRO equipo.
 * 3. Si `modeloEquipoId` viene con un id: verifica contra el catálogo
 *    `modelos_equipo` que el modelo EXISTA y esté HABILITADO →
 *    `ModeloEquipoInexistenteError` / `ModeloEquipoDeshabilitadoError`.
 *    `undefined` ("no lo toques") y `null` ("desvinculalo") son los dos casos
 *    válidos que NO se validan. El modelo deshabilitado no lo puede atrapar la
 *    FK: la fila existe.
 * 4. Aplica `actualizar()` (que normaliza `ubicacion` a mayúscula) y persiste (con la misma defensa P2002 que `CrearEquipoUseCase`).
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
      'bloquearParaModificar' | 'findByNumeroSerie' | 'save'
    >,
    private readonly txRunner: ITenantTransactionRunner,
    // Va al final para no reordenar los args de los callers existentes (mismo
    // criterio que `EquiposController.exportarEquiposUseCase`).
    private readonly modeloEquipoRepo: LectorCatalogoModelos,
  ) {}

  async execute(dto: EditarEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    try {
      return await this.txRunner.run(() => this.editar(dto));
    } catch (err: unknown) {
      // Comparación explícita contra las dos ausencias, no truthiness
      // (alineado con el `!== null` de `CrearEquipoUseCase`): con truthiness,
      // `numeroSerie: ''` —que el chequeo previo SÍ consulta— hacía re-lanzar
      // un P2002 real y salía como 500 en vez del 422 de negocio. `undefined`
      // es "no mandé el campo" y `null` es "borralo"; en ninguno de los dos el
      // P2002 puede venir del índice único parcial de `numero_serie`, que es
      // `WHERE numero_serie IS NOT NULL`.
      if (
        dto.numeroSerie !== undefined &&
        dto.numeroSerie !== null &&
        isPrismaUniqueConstraintError(err)
      ) {
        return Result.fail(new NumeroSerieDuplicadoError(dto.numeroSerie));
      }
      throw err;
    }
  }

  /** Cuerpo transaccional: el lock LE del equipo es lo PRIMERO que se toma (ADR-2). */
  private async editar(
    dto: EditarEquipoDto,
  ): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    const equipo = await this.equipoRepo.bloquearParaModificar(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    if (!equipo.activo) {
      return Result.fail(new EquipoDadoDeBajaError(dto.equipoId));
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

    // `undefined` no toca el modelo asignado y `null` lo desvincula: los dos
    // son válidos y no tienen nada que buscar en el catálogo.
    if (dto.modeloEquipoId !== undefined && dto.modeloEquipoId !== null) {
      const modeloValido = await validarModeloEquipoElegible(
        this.modeloEquipoRepo,
        dto.modeloEquipoId,
      );
      if (modeloValido.isFail()) {
        return Result.fail(modeloValido.getError());
      }
    }

    equipo.actualizar({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: dto.fechaAdquisicion,
      ubicacion: dto.ubicacion,
      modeloEquipoId: dto.modeloEquipoId,
      importe: dto.importe,
      fechaValoracion: dto.fechaValoracion,
      observaciones: dto.observaciones,
      valorResidual: dto.valorResidual,
      fechaValorResidual: dto.fechaValorResidual,
    });

    await this.equipoRepo.save(equipo);
    return Result.ok(equipo);
  }
}
