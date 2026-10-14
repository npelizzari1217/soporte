-- Rollback de 20261013150000_tipos_operacion_tareas.
-- `operaciones_ticket` referencia el tipo por FK, así que primero se borran las entradas del
-- historial de tareas y recién después los tipos. Re-ejecutable: sin filas, no hace nada.
DELETE FROM "operaciones_ticket"
 WHERE "tipo_operacion_id" IN (
   SELECT "id" FROM "tipo_operacion"
    WHERE "codigo" IN ('TAREA_CREADA', 'TAREA_ASIGNADA', 'TAREA_COMPLETADA',
                       'TAREA_DESCOMPLETADA', 'TAREA_ELIMINADA')
 );
DELETE FROM "tipo_operacion"
 WHERE "codigo" IN ('TAREA_CREADA', 'TAREA_ASIGNADA', 'TAREA_COMPLETADA',
                    'TAREA_DESCOMPLETADA', 'TAREA_ELIMINADA');
