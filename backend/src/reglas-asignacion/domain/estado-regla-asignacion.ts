/**
 * Estado de la regla de un tipo, calculado en cada lectura (R4); nunca se guarda.
 * Fuente única: el Zod del frontend (`features/reglas-asignacion/schemas.ts`) lo espeja.
 */
export const ESTADOS_REGLA_ASIGNACION = ['SIN_REGLA', 'VALIDA', 'ROTA'] as const;

export type EstadoReglaAsignacion = (typeof ESTADOS_REGLA_ASIGNACION)[number];

/** Una fila de la pantalla de configuración: un tipo activo y el estado de su regla. */
export interface ReglaAsignacionFila {
  tipoId: string;
  codigo: string;
  nombre: string;
  modulo: string;
  responsableId: string | null;
  responsableNombre: string | null;
  estado: EstadoReglaAsignacion;
}

/** Candidato válido para ser responsable de una regla (TECNICO o COLABORADOR con el módulo). */
export interface CandidatoRegla {
  id: string;
  nombre: string;
  apellido: string;
}
