import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
  ComponenteVinculadoTipoInmutableError,
  TipoComponenteCodigoRequeridoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para editar un componente de equipo (PATCH semántico). */
export interface EditarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
  /** `undefined` = no tocar. Si se provee, no puede ser vacío (campo obligatorio del dominio). */
  tipoComponenteCodigo?: string;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/**
 * EditarComponenteUseCase — edita los datos de un componente de equipo
 * ACTIVO (listado enriquecido de componentes).
 *
 * Flujo:
 * 1. Carga el componente → `ComponenteNoEncontradoError` si no existe.
 * 2. Si está dado de baja → `ComponenteDadoDeBajaError` (hay que
 *    reactivarlo primero — editar y reactivar son operaciones separadas,
 *    mismo criterio que "un registro suspendido no se edita a ciegas").
 * 3. Si `tipoComponenteCodigo` fue provisto Y DIFIERE del actual (mandar el
 *    mismo código que ya tiene no pide cambiar nada — `ComponenteEditDialog`
 *    SIEMPRE manda este campo, lo haya tocado el usuario o no, así que
 *    rechazar por sola presencia dejaba de solo lectura a todo componente
 *    VINCULADO; hallazgo de revisión automática):
 *    - si el componente está VINCULADO a un repuesto (`insumoId != null`): se
 *      rechaza con `ComponenteVinculadoTipoInmutableError` — su tipo lo
 *      determina la familia del repuesto, no un PATCH (WU-3, hallazgo de
 *      revisión automática; ver JSDoc de ese error).
 *    - si no: verifica que exista+esté `activo` en el catálogo MASTER (mismo
 *      checker que `AgregarComponenteUseCase`) → `TipoComponenteInactivoError`
 *      si no.
 * 4. Aplica `actualizar()` (PATCH semántico) y persiste.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (listado enriquecido de
 * componentes — editar).
 */
export class EditarComponenteUseCase {
  constructor(
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'save'>,
    private readonly tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'estaActivo'>,
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

    if (dto.tipoComponenteCodigo !== undefined) {
      if (!dto.tipoComponenteCodigo) {
        return Result.fail(new TipoComponenteCodigoRequeridoError());
      }
      // Solo un cambio REAL de tipo pisa las reglas de abajo: mandar el
      // mismo código que ya tiene el componente no es un pedido de cambio.
      // `ComponenteEditDialog` manda este campo SIEMPRE (nunca `undefined`),
      // así que rechazar por sola presencia dejaba de solo lectura a todo
      // componente vinculado el día que alguien editara solo la descripción.
      if (dto.tipoComponenteCodigo !== componente.tipoComponenteCodigo) {
        if (componente.insumoId != null) {
          return Result.fail(new ComponenteVinculadoTipoInmutableError(dto.componenteId));
        }
        const activo = await this.tipoComponenteMasterChecker.estaActivo(dto.tipoComponenteCodigo);
        if (!activo) {
          return Result.fail(new TipoComponenteInactivoError(dto.tipoComponenteCodigo));
        }
      }
    }

    componente.actualizar({
      tipoComponenteCodigo: dto.tipoComponenteCodigo,
      descripcion: dto.descripcion,
      numeroSerie: dto.numeroSerie,
      capacidad: dto.capacidad,
    });

    await this.componenteRepo.save(componente);
    return Result.ok(componente);
  }
}
