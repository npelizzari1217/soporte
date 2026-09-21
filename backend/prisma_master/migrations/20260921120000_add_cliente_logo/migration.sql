-- Logo del cliente (sdd/logo-por-cliente, WU1).
--
-- Tres columnas nullable, sin default y sin CHECK todo-o-nada: un solo use
-- case (ConfigurarLogoCliente / QuitarLogoCliente, WU2) las escribe
-- atómicamente, a diferencia de `smtp_*` que acepta escritura parcial desde
-- un formulario. Cero backfill: un cliente sin logo es el estado válido.
--
-- `logo_updated_at` es DELIBERADAMENTE distinta de `updated_at` — mismo
-- criterio que `smtp_config_updated_at`: editar `nombre` invalidaría un
-- `cliente_logo_v` del JWT que seguía siendo válido (design.md D3).
ALTER TABLE "clientes"
  ADD COLUMN "logo_storage_key" VARCHAR(255),
  ADD COLUMN "logo_mime_type" VARCHAR(50),
  ADD COLUMN "logo_updated_at" TIMESTAMPTZ;
