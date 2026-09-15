-- Migration: 20260914150000_sesion_utc_y_backfill_fechas
-- WU4 (sdd/sesion-utc-y-backfill-de-fechas), issue #173. Ref design ADR-1,
-- ADR-2, ADR-3, ADR-4. Ref tasks: 4.2.
--
-- CORRECCIÓN (review lineage `review-f4098720ccc4b038`, CRITICAL
-- `R3-r4-retry-path-unproved`): la cabecera original de este archivo (y la
-- de `prisma_master`) decía "Prisma corre cada archivo de migración dentro
-- de su propia transacción". Eso es FALSO — verificado de forma
-- independiente: una sentencia que falla a mitad de archivo puede dejar
-- sentencias previas del MISMO archivo ya commiteadas, no hay una
-- transacción que envuelva el archivo entero. Ver ADR-2 en `design.md`
-- para el detalle completo y la guarda real de ejecución
-- exactamente-una-vez (marcador `_utc_backfill_aplicado`, más abajo).
--
-- Idéntica a la migración homónima de prisma_master (WU3) salvo esta
-- cabecera y la SEGUNDA GUARDA de más abajo, específica del schema tenant:
--
--   1. ALTER DATABASE ... SET timezone TO 'UTC' sobre la base ACTUAL
--      (segunda garantía de ADR-1, independiente de `conUtc()`): mismo
--      mecanismo que prisma_master — `format('...%I...', current_database())`
--      agnóstico del nombre (los sufijos hex de tenant cambian),
--      `insufficient_privilege` (42501) degrada a `RAISE WARNING`, nunca
--      corta la migración.
--
--   2. Backfill catalogado: recorre `information_schema` buscando toda
--      columna `timestamptz` de `public`, excluye `_prisma_migrations` y le
--      resta 3 horas a cada valor cuyo microsegundo (`EXTRACT(MICROSECONDS
--      ...) % 1000`) sea 0 — el discriminador de ADR-3. Estructuralmente NO
--      puede tocar una columna `@db.Date`.
--
--   3. SEGUNDA GUARDA (ADR-3, solo tenant): las columnas `created_at` con
--      DEFAULT `clock_timestamp()` (`movimientos_insumo`, `modelos_equipo`,
--      `familias_insumo`, `unidades_medida`, `insumos`,
--      `insumos_codigos_alternativos`) tienen una fila AMBIGUA posible: si
--      la escribió la base (created_at) casi en el mismo instante en que
--      Prisma escribió `updated_at` con el bug de sesión (+3h), el delta
--      `updated_at - created_at` cae en la banda medida
--      [2:59:55, 3:00:05] — igual que si microsegundos=0 fuera Prisma. Esa
--      fila NO se toca y se reporta con `RAISE NOTICE` (tabla, columna, id).
--      Dejarla en +3h es recuperable mañana con el mismo discriminador;
--      restarle 3h de más a una fila correcta produciría un valor -3h que
--      ningún discriminador podría volver a encontrar (ADR-3: "ante la duda
--      el backfill sub-corrige").
--
--      HALLAZGO (no estaba en el diseño original): `movimientos_insumo`
--      está en la lista de las 6 por ADR-3, pero es append-only y NO TIENE
--      columna `updated_at` (ver `prisma_tenant/schema.prisma`, modelo
--      `MovimientoInsumo`) — no existe delta que calcular ahí. La guarda se
--      salta para esa tabla EN RUNTIME (detectado por catálogo, ver
--      `tiene_updated_at` más abajo — nunca hardcodeado como "excepción a
--      mano"), y su `created_at` queda cubierto solo por el discriminador
--      primario. Eso es seguro: el mapper
--      (`MovimientoInsumoMapper.toPersistence`) omite `createdAt` a
--      propósito, así que esa columna SIEMPRE la escribe la base
--      (`clock_timestamp()`), nunca Prisma — no hay escenario real en el
--      que necesite la segunda guarda.
--
-- EJECUTAR ESTE ARCHIVO DOS VECES CORROMPE LOS DATOS POR SÍ SOLO (ADR-4):
-- restar 3h no cambia los microsegundos, así que una segunda corrida
-- vuelve a identificar las mismas filas ya corregidas y les resta otras 3h.
--
-- EJECUCIÓN EXACTAMENTE-UNA-VEZ — DOS GUARDAS, NO UNA (ADR-2, R4,
-- corrección tras CRITICAL `R3-r4-retry-path-unproved`):
--   a) `_prisma_migrations` (motor de Prisma) cubre el camino ORDINARIO.
--   b) Tabla `_utc_backfill_aplicado`, escrita DENTRO del mismo DO $$ que
--      hace el backfill (mismo bloque = misma sentencia = misma
--      transacción implícita), cubre el camino FALLO-Y-REINTENTO: el DO $$
--      de más abajo es atómico por sí mismo, así que si commitea, el
--      marcador commitea junto con el desplazamiento de datos —
--      independientemente de si Prisma alcanza a escribir su propia fila
--      de bookkeeping en `_prisma_migrations` (esa escritura es una
--      operación SEPARADA, posterior). Si el proceso muere en el medio, un
--      reintento (`prisma migrate resolve` + `migrate deploy`) vuelve a
--      correr este archivo completo — sin (b), el discriminador de
--      microsegundos no cambia al restar horas y una fila ya corregida se
--      re-identifica como "escrita por Prisma" y se le resta otras 3h.
--      (b) es defensa en profundidad: NO reemplaza a (a), la complementa.
--
-- NUNCA correr este archivo a mano con `psql`; solo vía
-- `prisma migrate deploy` / `migrate:tenant` / `migrate:tenants`.
--
-- Nota sobre `SET LOCAL TimeZone`: esta migración NO fuerza el `TimeZone`
-- de la sesión antes de correr. No hace falta: `timestamptz - INTERVAL`
-- opera sobre el instante absoluto, y `EXTRACT(MICROSECONDS FROM ...)` lee
-- la parte de microsegundos del valor almacenado, ninguno de los dos
-- depende del `TimeZone` de sesión (ver ADR-4 en `design.md`). Un
-- `SET LOCAL` previo era además INERTE fuera de una transacción explícita
-- —si alguien corriera el archivo con `psql -f` (uso ya prohibido por este
-- comentario) Postgres emite `WARNING: SET LOCAL can only be used in
-- transaction blocks` porque cada sentencia de nivel superior de un
-- `psql -f` corre en autocommit— así que se quitó en vez de dejar un
-- statement sin efecto garantizado en todos los caminos de ejecución.
--
-- Tabla marcadora de una-sola-vez (guarda (b) de arriba). `CREATE TABLE
-- IF NOT EXISTS` es, en sí misma, una sentencia idempotente: no necesita
-- ninguna garantía de atomicidad — si este archivo se re-ejecutara por
-- fuera de Prisma (uso ya prohibido más arriba), esta línea puede volver
-- a correr sin riesgo. La atomicidad la necesita el PAR check+INSERT del
-- DO $$ de más abajo, que sí vive en una sola sentencia/transacción junto
-- con el backfill.
CREATE TABLE IF NOT EXISTS _utc_backfill_aplicado (
  migration         text PRIMARY KEY,
  aplicado_en       timestamptz NOT NULL,
  filas_corregidas  bigint NOT NULL
);

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING
      '[sesion-utc] ALTER DATABASE % SET timezone TO UTC fallo por insufficient_privilege (42501): el rol no es dueno de la base. La sesion sigue garantizada por conexion (conUtc). Ver verificacion post-deploy del runbook.',
      current_database();
END $$;

DO $$
DECLARE
  c record;
  fila_ambigua record;
  tiene_updated_at boolean;
  ya_aplicado boolean;
  filas_corregidas bigint := 0;
  filas_este_update bigint;
  -- Las 6 columnas clock_timestamp() de ADR-3. La guarda de delta se salta
  -- en runtime, por catálogo, para la que no tenga `updated_at`
  -- (`movimientos_insumo` hoy) — ver el hallazgo en la cabecera del
  -- archivo. No se la saca de esta lista a mano: la lista documenta la
  -- INTENCIÓN de ADR-3, la detección de `tiene_updated_at` documenta la
  -- REALIDAD del schema.
  tablas_guarda_delta CONSTANT text[] := ARRAY[
    'movimientos_insumo', 'modelos_equipo', 'familias_insumo',
    'unidades_medida', 'insumos', 'insumos_codigos_alternativos'
  ];
BEGIN
  -- Guarda (b), ver cabecera: check + INSERT en la MISMA transacción
  -- implícita que el backfill de abajo. Independiente de
  -- `_prisma_migrations` a propósito — cubre el camino fallo-y-reintento.
  SELECT EXISTS (
    SELECT 1 FROM _utc_backfill_aplicado
     WHERE migration = '20260914150000_sesion_utc_y_backfill_fechas'
  ) INTO ya_aplicado;

  IF ya_aplicado THEN
    RAISE NOTICE '[sesion-utc] backfill ya aplicado segun _utc_backfill_aplicado -- no se toca ninguna fila (reintento sin efecto sobre los datos)';
    RETURN;
  END IF;

  FOR c IN
    SELECT col.table_name, col.column_name
      FROM information_schema.columns col
      JOIN information_schema.tables t
        ON t.table_schema = col.table_schema AND t.table_name = col.table_name
     WHERE col.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND col.udt_name = 'timestamptz'
       AND col.table_name <> '_prisma_migrations'
       AND col.table_name <> '_utc_backfill_aplicado'
     -- ORDER BY LOAD-BEARING (CRITICAL-2, sdd-verify FAIL round 1):
     -- `information_schema.columns` sin ORDER BY no da ninguna garantia de
     -- orden -- devuelve el orden fisico de declaracion de columnas de
     -- CADA tabla, que esta query no controla. La segunda guarda de ADR-3
     -- (mas abajo) lee la columna `updated_at` TAL COMO ESTA en el momento
     -- de evaluarla: si el catalogo entrega `updated_at` ANTES que
     -- `created_at` para una tabla con guarda, la guarda lee un
     -- `updated_at` YA trasladado -3h, el delta cae fuera de banda, y
     -- `created_at` se sobre-corrige -3h de mas -- exactamente el
     -- resultado irreversible que ADR-3 declara no negociable. Reproducido
     -- por sdd-verify invirtiendo el orden fisico de columnas de una tabla
     -- de prueba (ver `utc-backfill-fechas.integration.spec.ts`
     -- `[CRITICAL-2]`): sin este ORDER BY, `created_at` cambia de
     -- 20:13:00.000Z a 17:13:00.000Z. La expresion `(col.column_name <>
     -- 'created_at')` es booleana (false=0 antes que true=1 en Postgres),
     -- asi que `created_at` ordena SIEMPRE primero dentro de su tabla,
     -- pase lo que pase con el orden fisico de columnas.
     ORDER BY col.table_name, (col.column_name <> 'created_at'), col.column_name
  LOOP
    IF c.column_name = 'created_at' AND c.table_name = ANY(tablas_guarda_delta) THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = c.table_name
           AND column_name = 'updated_at'
      ) INTO tiene_updated_at;

      IF tiene_updated_at THEN
        -- Reporta CADA fila ambigua (tabla, columna, id) antes de excluirla
        -- del UPDATE — mismo criterio de diseño que el resto del archivo:
        -- lo detectable queda en el log, no en silencio.
        FOR fila_ambigua IN EXECUTE format(
          'SELECT id FROM %I
            WHERE %I IS NOT NULL
              AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0
              AND (updated_at - %I) BETWEEN INTERVAL ''2 hours 59 minutes 55 seconds''
                                         AND INTERVAL ''3 hours 0 minutes 5 seconds''',
          c.table_name, c.column_name, c.column_name, c.column_name)
        LOOP
          RAISE NOTICE
            '[sesion-utc] fila ambigua sin tocar: tabla=% columna=% id=% (microsegundos=0 y delta updated_at-created_at en banda 2:59:55-3:00:05; puede ser una fila escrita por la base)',
            c.table_name, c.column_name, fila_ambigua.id;
        END LOOP;

        EXECUTE format(
          'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
            WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0
              AND NOT ((updated_at - %I) BETWEEN INTERVAL ''2 hours 59 minutes 55 seconds''
                                              AND INTERVAL ''3 hours 0 minutes 5 seconds'')',
          c.table_name, c.column_name, c.column_name, c.column_name, c.column_name, c.column_name);
        GET DIAGNOSTICS filas_este_update = ROW_COUNT;
        filas_corregidas := filas_corregidas + filas_este_update;
        CONTINUE;
      END IF;
      -- Tabla de la lista sin `updated_at` (`movimientos_insumo` hoy): sin
      -- delta que calcular, cae al UPDATE genérico de abajo.
    END IF;

    EXECUTE format(
      'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
        WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
    GET DIAGNOSTICS filas_este_update = ROW_COUNT;
    filas_corregidas := filas_corregidas + filas_este_update;
  END LOOP;

  INSERT INTO _utc_backfill_aplicado (migration, aplicado_en, filas_corregidas)
  VALUES ('20260914150000_sesion_utc_y_backfill_fechas', clock_timestamp(), filas_corregidas);
END $$;
