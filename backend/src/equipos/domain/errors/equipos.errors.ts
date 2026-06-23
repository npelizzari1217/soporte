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
