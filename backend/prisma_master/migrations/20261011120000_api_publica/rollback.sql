-- Rollback de 20261011120000_api_publica.
--
-- DESTRUCTIVO: borra todas las claves de API y pierde la marca de usuario de integracion y el
-- flag de API habilitada de cada cliente. Los sistemas externos que usaban claves dejan de entrar.
--
-- El codigo que usa estas columnas y esta tabla debe estar revertido ANTES de correr este rollback.
DROP TABLE IF EXISTS "api_claves";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "es_integracion";
ALTER TABLE "clientes" DROP COLUMN IF EXISTS "api_habilitada";
