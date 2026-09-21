-- Rollback de 20260921120000_add_cliente_logo.
--
-- DESTRUCTIVO: borra la referencia al logo de TODOS los clientes que lo
-- tengan cargado. El binario en disco (LocalDiskFileStorage) NO se borra
-- acá — queda huérfano en `storage/clientes/{clienteId}/{uuid}` hasta una
-- limpieza manual del filesystem, si se la considera necesaria.
--
-- El código que lee/escribe estas columnas (ClienteMapper, ClienteEntity,
-- ConfigurarLogoCliente/QuitarLogoCliente/VerLogoCliente, WU2) debe estar
-- revertido ANTES de correr este rollback — de lo contrario el mapper queda
-- esperando columnas que ya no existen.
ALTER TABLE "clientes"
  DROP COLUMN IF EXISTS "logo_storage_key",
  DROP COLUMN IF EXISTS "logo_mime_type",
  DROP COLUMN IF EXISTS "logo_updated_at";
