-- odd/edilicia-obra-externa T2a: peso de las tareas de un ticket externo (S4, S9, L17).
-- - peso: porcentaje entero de la obra que representa la tarea. NOT NULL con DEFAULT 0: las tareas
--   existentes y las nuevas arrancan sin peso hasta que el usuario lo asigna.
-- - El CHECK acota cada tarea a [0, 100]. La suma de un ticket (nunca por encima de 100) la decide
--   el dominio con el lock del ticket: una suma entre filas no se expresa en un CHECK.
ALTER TABLE "tareas_ticket" ADD COLUMN "peso" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tareas_ticket" ADD CONSTRAINT "tareas_ticket_peso_check" CHECK ("peso" BETWEEN 0 AND 100);
