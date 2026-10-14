/**
 * Códigos de `tipo_operacion` del historial de las tareas de un ticket (odd/tareas-con-tecnico,
 * CA8). Los siembra la migración `20261013150000_tipos_operacion_tareas` en cada inquilino.
 */
export const TIPO_OPERACION_TAREA = {
  CREADA: 'TAREA_CREADA',
  ASIGNADA: 'TAREA_ASIGNADA',
  COMPLETADA: 'TAREA_COMPLETADA',
  DESCOMPLETADA: 'TAREA_DESCOMPLETADA',
  ELIMINADA: 'TAREA_ELIMINADA',
} as const;

/** Código de un tipo de operación de tareas. */
export type CodigoOperacionTarea = (typeof TIPO_OPERACION_TAREA)[keyof typeof TIPO_OPERACION_TAREA];
