import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { IFamiliaInsumoRepository } from '../../../insumos/domain/ports/i-familia-insumo.repository';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  InsumoRepuestoInexistenteError,
  InsumoNoEsRepuestoError,
  FamiliaRepuestoDeshabilitadaError,
} from '../../domain/errors/equipos.errors';

/**
 * DTO de entrada para agregar un componente a un equipo.
 *
 * `insumoId` es obligatorio: el alta tiene un solo camino, vinculado a un
 * repuesto del catálogo. No hay `tipoComponenteCodigo`: el tipo se deriva
 * siempre de la familia del insumo.
 */
export interface AgregarComponenteDto {
  equipoId: string;
  insumoId: string;
  descripcion?: string | null;
  /** Ignorado cuando viene `unidadId`: el serial es el de la unidad (ADR-7). */
  numeroSerie?: string | null;
  capacidad?: string | null;
  /**
   * Unidad de insumo `SERIE` que llevará el componente. La elige el caso de uso
   * de instalación, que es quien la valida y la toma de locks; acá solo se copia.
   */
  unidadId?: string | null;
}

/**
 * AgregarComponenteUseCase — agrega un componente físico a un equipo
 * existente, siempre vinculado a un repuesto del catálogo de insumos.
 *
 * Un solo camino (sdd/catalogo-unico-componentes, WU-3): `insumoId` es
 * obligatorio. Sin él el alta se rechaza con `InsumoRepuestoInexistenteError`
 * y no se persiste nada.
 *
 * Guards, cada uno con su error de dominio propio:
 * - equipo inexistente o con borrado lógico → `EquipoNoEncontradoError`; dado de baja
 *   (`!activo`) → `EquipoDadoDeBajaError` (baja-equipo-completo R11). Se leen con
 *   `bloquearParaOperarPiezas` (LE `FOR SHARE`), por lo que `preparar()` y `execute()`
 *   exigen una transacción abierta.
 * - insumo inexistente, inactivo o soft-deleted → `InsumoRepuestoInexistenteError`
 *   (la FK no atrapa un insumo deshabilitado: la fila existe).
 * - familia inexistente o soft-deleted → `InsumoRepuestoInexistenteError`.
 * - familia con `esRepuesto: false` → `InsumoNoEsRepuestoError`.
 * - familia con `activo: false` → `FamiliaRepuestoDeshabilitadaError`.
 *
 * **El tipo se deriva de la familia**: la entidad recibe `familia.codigo` como
 * `tipoComponenteCodigo`. La familia del tenant es la única autoridad del tipo;
 * no hay consulta al catálogo MASTER. Mientras la columna
 * `tipo_componente_codigo` siga NOT NULL (hasta WU-6), la entidad sigue
 * escribiéndola con este valor derivado.
 *
 * `preparar()` valida y construye la entidad SIN escribir (ADR-7): el caso de uso
 * de instalación con unidad necesita validar primero, tomar los locks de la
 * unidad (L1 a L3) y recién después guardar el componente (L4). `execute()` es
 * `preparar()` + `save()`, sin cambio de conducta para quien no usa unidades.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 */
export class AgregarComponenteUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'save'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly familiaInsumoRepo: Pick<IFamiliaInsumoRepository, 'findById'>,
  ) {}

  async execute(dto: AgregarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const preparado = await this.preparar(dto);
    if (preparado.isFail()) {
      return preparado;
    }
    await this.componenteRepo.save(preparado.getValue());
    return preparado;
  }

  /**
   * Valida el alta y construye el componente, sin persistir nada. Con `unidadId`
   * el `numeroSerie` queda NULL: lo resuelve la unidad al leer (ADR-7).
   */
  async preparar(dto: AgregarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    // LE `FOR SHARE` (ADR-2): primer lock de la transacción del llamador. Serializa contra la
    // baja y el borrado del equipo (que toman `FOR NO KEY UPDATE`) sin bloquear otras altas.
    const equipo = await this.equipoRepo.bloquearParaOperarPiezas(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    if (!equipo.activo) {
      return Result.fail(new EquipoDadoDeBajaError(dto.equipoId));
    }

    // El use case no confía únicamente en la validación del borde HTTP.
    if (!dto.insumoId) {
      return Result.fail(new InsumoRepuestoInexistenteError(dto.insumoId ?? ''));
    }

    const insumo = await this.insumoRepo.findById(dto.insumoId);
    // `activo` y `deletedAt` son columnas INDEPENDIENTES: `softDelete()` no
    // toca `activo`, así que un insumo borrado lógicamente conserva
    // `activo: true` y pasaría un guard que solo mire `activo`.
    if (!insumo || !insumo.activo || insumo.isDeleted()) {
      return Result.fail(new InsumoRepuestoInexistenteError(dto.insumoId));
    }

    const familia = await this.familiaInsumoRepo.findById(insumo.familiaId);
    // Una familia inexistente o con baja lógica deja al repuesto sin catálogo
    // que lo respalde, y eso NO es "ser un consumible": mismo criterio que
    // `CrearInsumoUseCase`.
    if (!familia || familia.isDeleted()) {
      return Result.fail(new InsumoRepuestoInexistenteError(dto.insumoId));
    }
    if (!familia.esRepuesto) {
      return Result.fail(new InsumoNoEsRepuestoError(dto.insumoId));
    }
    if (!familia.activo) {
      return Result.fail(
        new FamiliaRepuestoDeshabilitadaError(dto.insumoId, familia.codigo, familia.nombre),
      );
    }

    const componenteResult = ComponenteEquipoEntity.create({
      equipoId: dto.equipoId,
      insumoId: insumo.id,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.unidadId ? null : (dto.numeroSerie ?? null),
      capacidad: dto.capacidad ?? null,
      unidadId: dto.unidadId ?? null,
    });
    if (componenteResult.isFail()) {
      return Result.fail(componenteResult.getError());
    }
    return Result.ok(componenteResult.getValue());
  }
}
