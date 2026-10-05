-- issue #356: el token del QR se guarda EN CLARO junto al hash, para que la ficha del equipo
-- muestre siempre el QR vigente y se pueda descargar o imprimir cuantas veces haga falta.
--
-- REVIERTE LA D8 de sdd/formulario-publico-qr ("solo el hash; el token en claro nunca se
-- persiste"). Decidido por el dueno el 2026-10-05. Motivo: el token solo precarga un equipo en el
-- formulario y el QR impreso ya esta pegado fisicamente en el dispositivo, asi que quien lo ve
-- tiene el mismo acceso que el token. Cifrarlo acoplaria la columna a la rotacion de
-- EMAIL_CRYPTO_KEY sin ganancia de seguridad. El hash NO se elimina: sigue siendo la clave de
-- busqueda (findByQrHash, UNIQUE).
--
-- Aditiva y sin backfill: los QR emitidos antes de esta migracion quedan con hash y sin token
-- (la ficha pide regenerarlos una vez para verlos). Ninguna fila existente se modifica.
ALTER TABLE "equipos_informaticos"
  ADD COLUMN "qr_token" TEXT;

-- Un token sin hash no se podria resolver nunca. El inverso (hash sin token) es legitimo: son
-- los QR emitidos antes de esta migracion.
ALTER TABLE "equipos_informaticos"
  ADD CONSTRAINT "equipos_informaticos_qr_token_requiere_hash_chk"
  CHECK ("qr_token" IS NULL OR "qr_token_hash" IS NOT NULL);
