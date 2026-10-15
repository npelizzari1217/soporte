-- odd/throttler-postgres (T1): contadores de los limitadores de pedidos (`@nestjs/throttler`), en
-- master, compartidos entre procesos. Aditiva: una tabla nueva, sin backfill y sin seed. El codigo
-- anterior no la lee, asi que puede convivir con ella.

-- Una fila por key de storage (ya viene hasheada desde el guard). `vencimientos` guarda cuando
-- vence cada pedido contado (la cuenta es `cardinality`), `expira_en` es la ventana que se informa
-- en `X-RateLimit-Reset` y `bloqueado_hasta` el fin del bloqueo. La purga horaria filtra por
-- `expira_en`.
CREATE TABLE "throttler_contadores" (
  "clave"           TEXT          NOT NULL,
  "vencimientos"    TIMESTAMPTZ[] DEFAULT ARRAY[]::TIMESTAMPTZ[],
  "expira_en"       TIMESTAMPTZ   NOT NULL,
  "bloqueado"       BOOLEAN       NOT NULL DEFAULT false,
  "bloqueado_hasta" TIMESTAMPTZ,
  CONSTRAINT "throttler_contadores_pkey" PRIMARY KEY ("clave")
);

CREATE INDEX "throttler_contadores_expira_en_idx" ON "throttler_contadores" ("expira_en");
