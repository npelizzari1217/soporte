-- Dropea `tipos_componente` (master).
--
-- Cambio `catalogo-unico-componentes`: el catalogo de tipos de componente dejo de existir
-- y `componentes_equipo` ya no referencia ningun tipo por codigo. La tabla quedo sin
-- lectores ni escritores.
--
-- IRREVERSIBLE (ADR-5): mismo release que el retiro del codigo, sin `rollback.sql`.
-- Revertir exige restaurar el dump de predeploy de `soporte_master`.
DROP TABLE "tipos_componente";
