-- Rollback de 20261003140000_solicitantes_externos.
--
-- DESTRUCTIVO: borra los datos personales de todos los solicitantes externos. Corre ANTES que el
-- rollback de la WU-7 solo si ningun ticket los referencia: con `tickets.solicitante_externo_id`
-- (WU-7) aplicada, la FK RESTRICT hace fallar el DROP; revertir la WU-7 primero.
DROP INDEX IF EXISTS "solicitantes_externos_email_idx";
DROP TABLE IF EXISTS "solicitantes_externos";
