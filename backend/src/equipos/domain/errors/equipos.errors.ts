import { DomainError } from '../../../shared/domain/result';

// ─── Errores de validación ────────────────────────────────────────────────────

/**
 * Error de validación: se intentó crear un ComponenteEquipo sin especificar
 * el tipo de componente.
 *
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo — tipo_componente_id NOT NULL]
 * Tarea: 6.A.1 / 6.A.2
 */
export class TipoComponenteIdRequeridoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_ID_REQUERIDO';

  constructor() {
    super(
      'El campo tipo_componente_id es obligatorio para crear un ComponenteEquipo. ' +
        'Debe proveer el UUID del tipo de componente correspondiente.',
    );
  }
}

// ─── Errores de búsqueda ──────────────────────────────────────────────────────

/**
 * Error de búsqueda: el tipo de componente con el id indicado no existe en el catálogo.
 * HTTP 404 semántico.
 *
 * Distinto de TipoComponenteInactivoError (422): este error se devuelve cuando
 * findById → null (el UUID no existe en tipos_componente).
 * TipoComponenteInactivoError se devuelve cuando el registro existe pero activo=FALSE.
 *
 * Ref spec: [SPEC:equipos/Tabla tipos_componente]
 * Tarea: 6.B-ajuste / split error tipo-componente no-encontrado vs inactivo
 */
export class TipoComponenteNoEncontradoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_NO_ENCONTRADO';

  constructor(tipoComponenteId: string) {
    super(
      `Tipo de componente con id "${tipoComponenteId}" no encontrado en el catálogo. ` +
        'Verificar que el UUID sea correcto.',
    );
  }
}

/**
 * Error de búsqueda: el equipo informático no existe o fue eliminado.
 * HTTP 404 semántico.
 *
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos]
 * Tarea: 6.B.3 / 6.B.4
 */
export class EquipoInformaticoNoEncontradoError extends DomainError {
  readonly code = 'EQUIPO_INFORMATICO_NO_ENCONTRADO';

  constructor(equipoId: string) {
    super(`Equipo informático con id "${equipoId}" no encontrado o fue eliminado (soft delete).`);
  }
}

/**
 * Error de conflicto: ya existe un equipo con el número de serie provisto.
 * HTTP 409 semántico.
 *
 * Ref spec: [SPEC:equipos/Número de serie único cuando provisto]
 * Tarea: 6.B.3 / 6.B.4
 */
export class NumeroSerieEquipoDuplicadoError extends DomainError {
  readonly code = 'NUMERO_SERIE_EQUIPO_DUPLICADO';

  constructor(numeroSerie: string) {
    super(
      `Ya existe un equipo informático con número de serie "${numeroSerie}". ` +
        'El número de serie debe ser único (UNIQUE WHERE NOT NULL).',
    );
  }
}

/**
 * Error de validación: el equipo referenciado no existe, está inactivo o fue eliminado.
 * HTTP 422 semántico.
 *
 * Ref spec: [SPEC:equipos/equipo_id referenciado debe existir y estar activo]
 * Tarea: 6.B.1 / 6.B.2
 */
export class EquipoInvalidoError extends DomainError {
  readonly code = 'EQUIPO_INVALIDO';

  constructor(equipoId: string) {
    super(
      `El equipo "${equipoId}" no existe, está inactivo (activo=FALSE) o fue eliminado. ` +
        'Solo se pueden referenciar equipos activos y no eliminados.',
    );
  }
}

/**
 * Error de validación: se intentó crear un componente con un tipo de componente inactivo.
 * HTTP 422 semántico.
 *
 * Ref spec: [SPEC:equipos/Tipo de componente inactivo no bloquea componentes existentes]
 * Tarea: 6.B.5 / 6.B.6
 */
export class TipoComponenteInactivoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_INACTIVO';

  constructor(tipoComponenteId: string) {
    super(
      `El tipo de componente "${tipoComponenteId}" está inactivo (activo=FALSE). ` +
        'No se puede crear un componente de equipo con un tipo inactivo.',
    );
  }
}

/**
 * Error de búsqueda: el componente de equipo no existe o fue eliminado.
 * HTTP 404 semántico.
 *
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo]
 * Tarea: 6.B.5 / 6.B.6
 */
export class ComponenteEquipoNoEncontradoError extends DomainError {
  readonly code = 'COMPONENTE_EQUIPO_NO_ENCONTRADO';

  constructor(componenteId: string) {
    super(
      `Componente de equipo con id "${componenteId}" no encontrado o fue eliminado (soft delete).`,
    );
  }
}

/**
 * Error de validación: el asignado_a_id no corresponde a un usuario activo del tenant.
 * HTTP 422 semántico.
 *
 * Ref spec: [SPEC:equipos/asignado_a_id validado como usuario activo del tenant]
 * Tarea: 6.B.5 / 6.B.6
 */
export class AsignadoEquipoInvalidoError extends DomainError {
  readonly code = 'ASIGNADO_INVALIDO';

  constructor(usuarioId: string) {
    super(
      `El usuario "${usuarioId}" no existe en master.usuarios con activo=TRUE, ` +
        'no fue encontrado o no pertenece al tenant. No se puede asignar el equipo.',
    );
  }
}

/**
 * Error de validación: el ticket no es de tipo SOPORTE.
 * HTTP 422 semántico.
 *
 * Ref spec: [SPEC:equipos/Satélite ticket_soporte para tickets IT]
 * Tarea: 6.B.1 / 6.B.2
 */
export class TicketNoEsSoporteError extends DomainError {
  readonly code = 'TICKET_NO_ES_SOPORTE';

  constructor(tipoCodigo: string) {
    super(
      `El ticket tiene tipo "${tipoCodigo}" pero CrearTicketSoporteUseCase requiere tipo SOPORTE. ` +
        'Usá el use case correspondiente al tipo de ticket.',
    );
  }
}
