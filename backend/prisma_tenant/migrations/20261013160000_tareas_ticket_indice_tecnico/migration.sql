-- odd/tareas-con-tecnico, T3b (CA10): el tecnico de una tarea activa ve el ticket. El listado de
-- tickets de un actor sin TICKETS:VER_TODOS suma un EXISTS sobre tareas_ticket por tecnico_id y
-- deleted_at; sin este indice ese EXISTS recorre la tabla entera en cada pagina del listado.
-- ticket_id va al final para resolver la semi-junta con tickets desde el indice.
CREATE INDEX "tareas_ticket_tecnico_id_deleted_at_ticket_id_idx"
  ON "tareas_ticket"("tecnico_id", "deleted_at", "ticket_id");
