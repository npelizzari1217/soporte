-- WU-9 · Contract (sdd/matriz-permisos-por-usuario). PUNTO DE NO RETORNO.
-- Ref design: sdd/matriz-permisos-por-usuario/design §3, "Paso 5 · Contract
-- (deploy posterior, después de confirmar paridad)". Ref tasks: WU-9.
--
-- Elimina la red de rollback del RBAC viejo, sin lectores de runtime desde
-- WU-7 (guards nuevos, AccionesGuard/AdminClienteGuard) y desde R9/WU-7.5
-- (usuario-master.checker migrado a leer la matriz). NO se aplica sola: ver
-- drop-legacy-rbac-matriz-vieja.mjs, que exige el flag --confirmar.
--
-- `roles` y `membresias.rol_id` NO se tocan (decisión #2210): el rol sigue
-- existiendo como identidad de membresía y como llave de PRESETS_ROL, solo
-- se retira el mapeo rol→permiso viejo.
--
-- Orden obligatorio: roles_permisos ANTES que permisos (roles_permisos
-- tiene FK a permisos; al revés, Postgres rechaza el DROP).
DROP TABLE IF EXISTS roles_permisos;
DROP TABLE IF EXISTS permisos;
DROP TABLE IF EXISTS usuario_cliente_modulos;
