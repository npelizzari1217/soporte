-- Flag por cliente que habilita la emisión de encuestas CSAT al cerrar un
-- ticket (sdd/csat, WU1). Booleano independiente, fuera del CHECK
-- todo-o-nada de `smtp_*` — mismo criterio que `smtp_secure`.
--
-- Default false: el rollout (sdd/csat/design, "Migración / rollout") enciende
-- el flag cliente por cliente, empezando por uno con SMTP verificado. Ningún
-- token se emite hasta que se prenda explícitamente.

ALTER TABLE "clientes" ADD COLUMN "csat_habilitado" BOOLEAN NOT NULL DEFAULT false;
