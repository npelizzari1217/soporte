-- WU-2 (sdd/matriz-permisos-por-usuario). Ref spec R1/R3. Ref design ADR-P2/ADR-P3.
--
-- Crea la tabla matriz de permisos por usuario, VACÍA. Nadie la lee hasta que
-- WU-7 despliegue resolverScope/AccionesGuard sobre ella — esta migración es
-- estructura pura, cero efecto de runtime. Reversible con un DROP TABLE sin
-- pérdida de dato productivo (mapa de reversibilidad, tasks WU-1..WU-3).
--
-- El CHECK enumera los 28 pares (modulo, accion) del catálogo `as const` de
-- src/shared/domain/acciones.ts (CATALOGO_MODULOS → PARES_VALIDOS), en la
-- forma concatenada `modulo || ':' || accion` (ADR-P2): cada literal del
-- array ES un CodigoAccion completo, lo que permite comparar el CHECK real
-- (leído vía pg_get_constraintdef) contra PARES_VALIDOS sin reagrupar pares
-- de a dos — test de deriva en matriz-permisos-checks.integration.spec.ts.
CREATE TABLE "usuario_cliente_permisos" (
    "usuario_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "modulo"     VARCHAR(30) NOT NULL,
    "accion"     VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usuario_cliente_permisos_pkey"
      PRIMARY KEY ("usuario_id", "cliente_id", "modulo", "accion"),
    CONSTRAINT "usuario_cliente_permisos_modulo_accion_check"
      CHECK (("modulo" || ':' || "accion") = ANY (ARRAY[
        'TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:MODIFICACION', 'TICKETS:VER_TODOS',
        'TICKETS:ASIGNAR', 'TICKETS:TRANSICIONAR', 'TICKETS:OBSERVAR', 'TICKETS:COMENTAR',
        'COMPRAS:LECTURA', 'COMPRAS:ALTAS', 'COMPRAS:MODIFICACION', 'COMPRAS:BORRADO', 'COMPRAS:APROBACION',
        'EDILICIA:LECTURA', 'EDILICIA:ALTAS', 'EDILICIA:MODIFICACION', 'EDILICIA:BORRADO',
        'EQUIPOS:LECTURA', 'EQUIPOS:ALTAS', 'EQUIPOS:MODIFICACION', 'EQUIPOS:BORRADO',
        'KB:LECTURA', 'KB:ALTAS', 'KB:MODIFICACION', 'KB:BORRADO', 'KB:VER_TODOS', 'KB:PUBLICAR',
        'DASHBOARD:LECTURA'
      ]))
);

CREATE INDEX "usuario_cliente_permisos_usuario_id_cliente_id_idx"
  ON "usuario_cliente_permisos"("usuario_id", "cliente_id");
