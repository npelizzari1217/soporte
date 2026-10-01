import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
  SerialDeUnidadNoEditableError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para editar un componente de equipo (PATCH semántico). */
export interface EditarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/**
 * EditarComponenteUseCase — edita los datos propios de un componente de equipo
 * ACTIVO: `descripcion`, `numeroSerie` y `capacidad`.
 *
 * sdd/catalogo-unico-componentes (ADR-2): el tipo y el repuesto de un
 * componente los fija el alta y no se editan. Un `tipoComponenteCodigo` o un
 * `insumoId` sobrantes en el request no llegan hasta acá (el DTO HTTP los
 * descarta por `whitelist`) y este DTO de aplicación no los declara, así que
 * no pueden cambiar nada. Ya no hay chequeo contra MASTER.
 *
 * Flujo:
 * 1. Carga el componente → `ComponenteNoEncontradoError` si no existe o si es
 *    de otro equipo.
 * 2. Si está dado de baja → `ComponenteDadoDeBajaError` (hay que reactivarlo
 *    primero — editar y reactivar son operaciones separadas).
 * 3. Con unidad de insumo, `numeroSerie` en el PATCH → `SerialDeUnidadNoEditableError`
 *    (el serial es de la unidad y se corrige desde el insumo, ADR-7/ADR-9). Un
 *    componente legado edita su serial como siempre.
 * 4. Aplica `actualizar()` (PATCH semántico) y persiste con `editar()`: un CAS
 *    (`WHERE id AND deleted_at IS NULL`) que escribe solo esas tres columnas. Si tocó 0 filas, el
 *    componente se retiró después de leerlo (baja del equipo o retiro individual) →
 *    `ComponenteDadoDeBajaError` y nada se pisa (baja-equipo-completo ADR-5).
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 */
export class EditarComponenteUseCase {
  constructor(
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'editar'>,
  ) {}

  async execute(dto: EditarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const componente = await this.componenteRepo.findById(dto.componenteId);
    // Pertenencia: un componente de OTRO equipo se trata como no encontrado bajo
    // esta URL (no se filtra su existencia ni se permite editarlo cross-equipo).
    if (!componente || componente.equipoId !== dto.equipoId) {
      return Result.fail(new ComponenteNoEncontradoError(dto.componenteId));
    }
    if (componente.isDeleted()) {
      return Result.fail(new ComponenteDadoDeBajaError(dto.componenteId));
    }

    if (componente.unidadId !== null && dto.numeroSerie !== undefined) {
      return Result.fail(new SerialDeUnidadNoEditableError(componente.id));
    }

    componente.actualizar({
      descripcion: dto.descripcion,
      numeroSerie: dto.numeroSerie,
      capacidad: dto.capacidad,
    });

    const editado = await this.componenteRepo.editar(componente);
    if (!editado) {
      return Result.fail(new ComponenteDadoDeBajaError(componente.id));
    }
    return Result.ok(componente);
  }
}
