# Design: Sesión UTC en Postgres y backfill de las fechas corridas 3h

> Ciclo SDD `sesion-utc-y-backfill-de-fechas` — issue #173. Tipo de trabajo: **corrección de defecto**.
> Insumos: `proposal.md`, `exploration.md` (espejo engram id 4410).

## Technical Approach

Dos garantías independientes de que la sesión Postgres es UTC — una que viaja en la **cadena de
conexión** (versionada en git, con guarda estructural de ESLint) y otra que vive en la **base**
(`ALTER DATABASE ... SET timezone`) — más una **corrección de datos empaquetada como migración
Prisma numerada**, que reutiliza `_prisma_migrations` como garantía de ejecución exactamente-una-vez
y hace que la ventana atómica del deploy sea gratis: ya existe, es el bloque
`Stop-Service` → `migrate:master` → `migrate:tenants` → `Start-Service` de `deploy.ps1`.

Ningún mapper se toca: el fix corrige el driver para las 44 tablas por igual (exploración §4).

---

## Invariante que habilita todo el diseño (verificado contra el código)

**Cuando la migración de backfill se aplica a una base, esa base tiene CERO filas escritas después
del fix.** Prueba, para los tres caminos posibles:

| Camino | Evidencia |
|---|---|
| `soporte_master` + tenants activos | `deploy.ps1:206` detiene los servicios ANTES de `migrate:master` (:210) y `migrate:tenants` (:213); nadie escribe durante la ventana |
| Tenant inactivo reactivado más tarde | `ReactivarClienteUseCase:41` corre `migrationRunner.run(dbName)` **antes** de `save()` (fail-closed, deliberado y con spec propia); y `TenantGuard` da 403 a un cliente no activo (`auth.e2e.spec.ts:523`) — no hay tráfico previo a la migración |
| Tenant nuevo | `ProvisionarTenantDatabaseUseCase:46-50`: `createDatabase` → `migrate` → `seed`. La migración corre sobre tablas vacías; el seed inserta después |

**Consecuencia**: el backfill NO necesita fecha de corte. Lo que lo rompería es reanudar tráfico
hacia un tenant antes de migrarlo, o escribir en una base tenant por fuera de la app. Ese orden en
`ReactivarClienteUseCase` es ahora una **precondición de este diseño**, no solo una decisión previa.

---

## ADR-1 — Dónde se fuerza la zona de sesión

**Decisión: las tres cosas — flag por conexión + `ALTER DATABASE` sobre las bases existentes +
`ALTER DATABASE` en el alta de tenant.** Es el approach 3 de la exploración, con la guarda
estructural que le faltaba.

| Pieza | Qué cubre |
|---|---|
| Helper único `conUtc(url)` que agrega `options=-c TimeZone%3DUTC`, usado por los 4 pools de producción y por `scripts/migrate-tenants.js` | Todo el tráfico de la app; visible y revisable en git |
| Regla ESLint `no-restricted-syntax` que prohíbe `new Pool(` fuera de `shared/infrastructure/persistence/utc-connection-string.ts` | **La guarda estructural**: un adapter futuro que abra un pool sin el helper no compila el lint |
| `ALTER DATABASE <db> SET timezone TO 'UTC'` en la migración (bases existentes) | `psql` manual, el CLI de Prisma, los scripts de `backend/scripts/`, y cualquier conexión futura con otra URL |
| El mismo `ALTER DATABASE` en `PostgresAdminService.createDatabase`, inmediatamente después del `CREATE DATABASE` y sobre el mismo pool admin | **Requisito R5**: un tenant nuevo nace en UTC antes de que corran `migrate` y `seed` |

**Alternativas rechazadas.** *Solo el flag por conexión*: las URLs viven en `.env`, que no está en
git, así que el CLI de Prisma y cualquier `psql` quedan fuera de alcance; y sin la regla ESLint
repite exactamente el patrón que mantuvo el defecto invisible semanas. *Solo `ALTER DATABASE`*: un
ajuste de base no deja rastro en el repo ni en un code review, no se reproduce al restaurar un
`pg_dump` de una sola base en una base creada a mano (solo `pg_dumpall` o `pg_dump --create`
arrastran `pg_db_role_setting`), y desaparece si alguien recrea la base sin el paso.

El `ALTER DATABASE` de la migración va dentro de un bloque `DO` con
`format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database())` — nunca hardcodea el
nombre (los sufijos hex de tenant cambian) — y captura `insufficient_privilege` con `RAISE WARNING`
en vez de fallar: cortar una migración con los servicios detenidos es peor que quedarse con la
primera garantía, que ya cubre el 100% del tráfico de la app. El runbook agrega la verificación
post-deploy (`SHOW timezone` en sesión nueva).

## ADR-2 — Mecanismo de ejecución exactamente-una-vez

**Decisión: migración Prisma numerada, una por schema (`prisma_master` y `prisma_tenant`), con el
`ALTER DATABASE` y el backfill en el MISMO archivo.**

| Opción | Tradeoff | Decisión |
|---|---|---|
| (a) Migración numerada | `_prisma_migrations` ya garantiza y auditá ejecución única por base; llega sola a master, a cada tenant activo, al tenant reactivado y al tenant nuevo; **no requiere tocar el hueco de backfill de `deploy.ps1`**, así que la atomicidad sale gratis | **Elegida** |
| (b) Script standalone + fila marcadora | Guarda de una-sola-vez escrita a mano (hay que meter marcador y UPDATE en la misma transacción, por base); el marcador necesita una tabla, que necesita… una migración; no alcanza al tenant reactivado; agrega cableado nuevo en `deploy.ps1` | Rechazada **como mecanismo único** — ver el addendum de más abajo: SÍ se adoptó como defensa en profundidad, no como reemplazo |

**Un solo archivo por schema, no dos migraciones.**

**Corrección (review lineage `review-f4098720ccc4b038`, CRITICAL `R3-r4-retry-path-unproved`,
2026-09-14).** Este párrafo decía "Prisma corre cada archivo en su propia transacción" como
justificación de que un solo archivo alcanzaba para la atomicidad. **Eso es falso** — verificado de
forma independiente con Prisma 7.10.0: una migración `CREATE TABLE paso_uno; SELECT 1/0; CREATE TABLE
paso_dos` deja `paso_uno` **vivo** tras el fallo. No hay una transacción que envuelva el archivo
entero.

Lo que SÍ es cierto, y es la razón real por la que el archivo único sigue de pie: el bloque `DO $$`
del backfill es la ÚLTIMA sentencia del archivo, y un `DO $$` **es una sola sentencia** — por lo tanto
atómico por sí mismo, con o sin transacción de archivo completo. Separar el `ALTER DATABASE` del
backfill en dos migraciones seguiría admitiendo un estado parcial —sesión ya en UTC, datos sin
corregir, +3h a la vista— que ADR-5 prohíbe, así que las dos correcciones se mantienen en el mismo
archivo por **orden de deploy**, no por atomicidad de archivo.

**La ventana real, y por qué hacía falta una segunda guarda.** Si el `DO $$` del backfill COMMITEA
pero el proceso muere antes de que Prisma deje registrado el éxito en `_prisma_migrations` (esa
escritura de bookkeeping es una operación SEPARADA, posterior a la transacción de datos), un operador
que corre `prisma migrate resolve` + `migrate deploy` para recuperarse vuelve a ejecutar el archivo
completo — y el discriminador de microsegundos (ADR-3) no cambia al restar horas, así que una fila ya
corregida vuelve a calificar como "escrita por Prisma" y se le resta otras 3h. R4 se había certificado
corriendo `prisma migrate deploy` dos veces sobre un primer apply que SALIÓ BIEN, que no ejercita este
camino en absoluto.

**Guarda agregada: tabla `_utc_backfill_aplicado`, escrita DENTRO del mismo `DO $$` que hace el
backfill.** Mismo bloque, misma sentencia, misma transacción implícita: si el bloque commitea, el
marcador commitea junto con el desplazamiento de datos, sin depender de si `_prisma_migrations` llega
a registrar el éxito. Esto retoma la opción (b) de la tabla de arriba, pero **como defensa en
profundidad, no como reemplazo** de (a): `_prisma_migrations` sigue cubriendo el camino ordinario
(incluido el tenant reactivado, donde (b) sola no alcanzaría), y el marcador cierra específicamente el
hueco fallo-y-reintento que (a) sola no cubre. El check (¿ya está el marcador?) va PRIMERO en el
bloque, antes de tocar cualquier fila; si ya está, el bloque hace `RAISE NOTICE` y `RETURN` — un no-op
limpio.

**El SQL es idéntico en los dos schemas salvo la cabecera**, porque recorre el catálogo en vez de
enumerar tablas:

```sql
-- Marcador: sentencia propia, CREATE TABLE IF NOT EXISTS es idempotente por
-- construcción y no necesita compartir transacción con nada.
CREATE TABLE IF NOT EXISTS _utc_backfill_aplicado (
  migration        text PRIMARY KEY,
  aplicado_en      timestamptz NOT NULL,
  filas_corregidas bigint NOT NULL
);

DO $$ DECLARE
  c record;
  ya_aplicado boolean;
  filas_corregidas bigint := 0;
  filas_este_update bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM _utc_backfill_aplicado WHERE migration = '<esta_migracion>'
  ) INTO ya_aplicado;

  IF ya_aplicado THEN
    RAISE NOTICE '[sesion-utc] backfill ya aplicado -- no se toca ninguna fila';
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
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
        WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
    GET DIAGNOSTICS filas_este_update = ROW_COUNT;
    filas_corregidas := filas_corregidas + filas_este_update;
  END LOOP;

  INSERT INTO _utc_backfill_aplicado (migration, aplicado_en, filas_corregidas)
  VALUES ('<esta_migracion>', clock_timestamp(), filas_corregidas);
END $$;
```

(Sin `SET LOCAL TimeZone`: ver el addendum de ADR-4 más abajo — la aritmética del backfill no
depende del `TimeZone` de sesión, y ese `SET LOCAL` era además inerte fuera de una transacción
explícita.)

Tres propiedades que se obtienen del catálogo y no de una lista: cubre las 44 tablas sin riesgo de
omisión; **estructuralmente no puede tocar `@db.Date`** (`Feriado.fecha`, ADR-4/#2542, fuera de
alcance por el proposal) porque el filtro es `udt_name = 'timestamptz'`; y excluye
`_prisma_migrations`, escrita por el motor de migraciones y ajena al defecto.

`current_database()` hace el SQL agnóstico del nombre, y `format(%I)` es el quoting correcto para
identificadores (mismo criterio que `quoteIdentifier` en `postgres-admin.service.ts:82`).

## ADR-3 — El discriminador y su segunda guarda

El discriminador es **por valor, no por columna**, y por eso no hace falta saber qué camino escribió
cada fila (mapper explícito, `@default(now())` resuelto en cliente, o `DEFAULT` de la base):

| Microsegundos | Quién escribió | Certeza | Acción |
|---|---|---|---|
| `% 1000 <> 0` | Postgres | **Absoluta** — un `Date` de JS tiene resolución de milisegundos | No se toca |
| `% 1000 = 0` | Prisma | 999/1000 | Se le resta 3h |

Sobre los 195 valores escritos por la base se esperan ~0,2 clasificaciones erróneas.

**Segunda guarda, solo para las 6 columnas `clock_timestamp()`** (`movimientos_insumo`,
`modelos_equipo`, `familias_insumo`, `unidades_medida`, `insumos`, `insumos_codigos_alternativos` —
todas `created_at`). En esas filas `created_at` lo escribe la base y `updated_at` lo escribe Prisma
(+3h) con el instante calculado en JS un par de milisegundos ANTES, así que el delta al insertar es
poco menor que 3h — exactamente lo medido: `02:59:59.998391`, `02:59:59.997748`, `02:59:59.998854`.
La guarda excluye la fila cuando

```sql
updated_at - created_at BETWEEN INTERVAL '2 hours 59 minutes 55 seconds'
                            AND INTERVAL '3 hours 0 minutes 5 seconds'
```

Es una guarda **de exclusión**: solo se consulta sobre filas que el discriminador primario ya marcó
como "escritas por Prisma", es decir sobre esa población de ~0,2 filas. No excluye las filas
anteriores a las migraciones de #159/#172 en esas mismas tablas (ahí `created_at` también lo escribió
Prisma y el delta es el tiempo real transcurrido, fuera de la banda), que sí se corrigen.

**Caso ambiguo — qué hace exactamente el backfill.** Microsegundos `% 1000 = 0` (parece Prisma) y
delta dentro de la banda (parece base): **no se toca la fila**, y la migración la reporta con
`RAISE NOTICE` (tabla, id, columna) para que quede en el log del deploy. La asimetría es deliberada
y no es negociable: dejar una fila en +3h reproduce el estado actual, ya conocido y todavía
detectable por el mismo discriminador; restarle 3h a una fila correcta crea un valor −3h que
**ningún discriminador podrá volver a encontrar**. Ante la duda, el backfill sub-corrige.

**Addendum (sdd-verify FAIL round 1, decisión del dueño 2026-09-14) — R7 y el margen de
milisegundos.** El mismo mecanismo que motiva la segunda guarda (`updated_at` de Prisma calculado en
JS un par de milisegundos antes de que la base evalúe `clock_timestamp()` para `created_at` del
mismo INSERT) hace que, tras el fix, **toda fila nueva** de estas 5 tablas nazca con `updated_at`
levemente anterior a `created_at` — hoy invisible porque el defecto de +3h lo enmascara. R7
(`fechas-sesion-utc` spec) pasa de exigir `updated_at >= created_at` estricto a tolerar hasta 1
segundo de diferencia: el requisito existe para detectar un desvío de tres horas, no de
milisegundos, y la tolerancia estricta era inalcanzable por construcción para estas tablas. Ver
`spec.md` para el detalle y la evidencia de producción.

**Addendum (sdd-verify FAIL round 1) — orden de `information_schema.columns` en el loop
catalogado.** El loop `FOR c IN SELECT ...` de ambos `migration.sql` (ADR-2) no tenía `ORDER BY`:
`information_schema.columns` sin orden explícito no garantiza nada, y en la práctica devuelve el
orden físico de declaración de columnas de cada tabla. La segunda guarda de esta ADR lee la columna
`updated_at` **tal como está en el momento en que se evalúa** — si el catálogo entrega `updated_at`
antes que `created_at`, la guarda lee un valor ya trasladado −3h y la fila ambigua se sobre-corrige,
justo el resultado que este ADR declara no negociable. Corregido agregando
`ORDER BY table_name, (column_name <> 'created_at'), column_name` a ambas migraciones (`created_at`
ordena siempre primero dentro de su tabla, sin importar el orden físico de columnas), con test de
regresión dedicado en el spec de tenant (`[CRITICAL-2]`).

## ADR-4 — El backfill no pasa por Prisma

**Confirmado, y con un margen mayor que el que pedía la exploración.** La corrección es SQL puro
dentro de un archivo de migración: **ningún valor de JavaScript cruza el límite del driver**, así
que el bug de serialización de `@prisma/adapter-pg` no puede dispararse — es estrictamente más
fuerte que usar `pg` crudo, que igual serializa parámetros. Además:

- La aritmética es `timestamptz - INTERVAL '3 hours'`: campos de hora, absolutos, independientes de
  la zona de sesión y de DST. `EXTRACT(MICROSECONDS FROM ...)` (el discriminador de ADR-3) tampoco
  depende del GUC — lee la parte de microsegundos del valor almacenado.
- **Regla que queda vigente para este repo**: cualquier script futuro que corrija timestamps usa
  `pg` crudo, nunca `@prisma/client`. Precedentes: `backfill-correo-clientes.mjs:233` y
  `scripts/migrate-tenants.js:41`.

**Corrección (CRITICAL `R3-r4-retry-path-unproved`, 2026-09-14) — se quitó `SET LOCAL TimeZone =
'UTC'`.** Como el punto anterior ya establece, ningún cálculo del backfill depende del `TimeZone` de
sesión — el `SET LOCAL` no aportaba corrección, solo intención documental. Y era además **inerte**
fuera de una transacción explícita: si alguien corriera el archivo con `psql -f` (uso ya prohibido por
la cabecera del propio archivo), cada sentencia de nivel superior corre en autocommit y Postgres emite
`WARNING: SET LOCAL can only be used in transaction blocks` — verificado empíricamente. Dentro de
`prisma migrate deploy` (el único camino permitido) y dentro de `pg.Pool.query()` con el archivo
completo como una sola llamada (como hacen los specs de integración) el `SET LOCAL` SÍ tomaba efecto
sin warning — pero como no hacía falta para la corrección, se retiró en vez de dejar una sentencia
cuyo comportamiento depende de CÓMO se ejecute el archivo.

**Diferencia explícita con `backfill-correo-clientes.mjs` — y su corrección.** Aquél es idempotente
**por construcción**: su guarda (`smtp_password_cifrada IS NULL`, reevaluada en el propio `UPDATE`,
líneas 176-185) deja de cumplirse tras la primera corrida. **El discriminador de microsegundos de
ADR-3 sigue sin poder serlo por construcción**: restar 3h no cambia los microsegundos, así que una
segunda corrida del `UPDATE` vuelve a identificar las mismas filas y les resta otras 3h — esa
propiedad no cambió y es la razón de ser de la guarda. Lo que sí cambió (ver addendum de ADR-2): el
ARCHIVO completo ya no depende únicamente de una garantía externa (`_prisma_migrations`) para ser
seguro ante una segunda corrida — la tabla `_utc_backfill_aplicado`, escrita en la misma transacción
implícita que el `UPDATE`, hace que reejecutar el archivo (con o sin `_prisma_migrations` de por
medio) sea un no-op para los datos. El spec de integración de master, que antes afirmaba
explícitamente que correr el SQL dos veces corrompe, ahora documenta lo contrario (`[3.2]`,
corregido tras esta review) — y agrega un caso nuevo (`[R3/R4-retry]`, en ambos specs) que reproduce
el escenario real: no una segunda corrida manual, sino fallo-y-reintento vía
`prisma migrate resolve` + `migrate deploy`.

## ADR-5 — Orden de deploy y ventana atómica

**El cambio no agrega ningún paso al deploy: entra por `migrate:master` (:210) y `migrate:tenants`
(:213), que ya están dentro de la ventana.** El hueco de backfill (:216-255) queda intacto.

```
Stop-Service (:206)          <- nadie escribe a partir de aca
  migrate:master (:210)      <- ALTER DATABASE + backfill en soporte_master
  migrate:tenants (:213)     <- lo mismo en cada tenant activo (fan-out por clientes.db_name)
Start-Service (:258)         <- arranca el build NUEVO, con el flag UTC
```

El orden está **forzado**, no elegido: el código viejo nunca ve datos corregidos (se detiene antes de
las migraciones) y el código nuevo nunca ve datos sin corregir (arranca después). Los builds del
backend y del frontend ya ocurren antes del `Stop-Service` (:183-191), así que la ventana sigue
siendo de segundos.

**Separar el fix del backfill deja el sistema PEOR, y esto no es negociable**: backfill sin fix ⇒ la
lectura de Prisma resta otras 3h y todo se muestra **−6h**; fix sin backfill ⇒ las ~1614 filas
históricas se muestran **+3h**. Cualquiera de los dos es un estado nuevo, peor que el actual. La
consecuencia práctica para la cadena de PRs: **los PRs de conexión y los de migración no se
despliegan por separado**; se mergean todos y recién entonces corre un único `deploy.ps1`.

## ADR-6 — Rollback de datos (dump como precondición operativa)

Un `git revert` **no deshace el backfill**. El único rollback de datos es el restore. Estado
verificado en el VPS:

| Hecho medido | Consecuencia de diseño |
|---|---|
| Postgres corre como servicio Windows nativo `postgresql-x64-16`; `pg_dump.exe` 16.14 en `C:\Program Files\PostgreSQL\16\bin\` | Hay herramienta; no hay que instalar nada |
| Las bases son chicas: `soporte_master` 9127 kB, los dos tenants 10 MB c/u; 17 GB libres en `C:` | El costo del dump **no es una restricción**: segundos |
| **`deploy.ps1` no menciona `pg_dump` ni `backups`** | Hoy **no existe backup automático**. El dump es un paso operativo explícito, no algo que el pipeline haga |
| Los dumps de `C:\soporte\backups\` son del **2026-08-20, 25 días** | **No sirven como punto de rollback** de este cambio |
| Hay un archivo de 0 bytes llamado `                 datname                  _predeploy_20260820.dump` | El método ad-hoc anterior leyó la salida de `psql` **sin `-t -A`** y tomó el encabezado como nombre de base. Un loop que emite un dump fantasma de 0 bytes puede igual de silenciosamente **saltearse una base real** |
| `C:\soporte\` acumula scripts operativos sin versionar (`rotate-jwt.ps1`, `_vps-fix-*.ps1`) | El script de dump **se versiona en el repo**, no se suma a esa pila |

**Decisión: `predeploy-dump.ps1` nuevo, versionado en la raíz del repo junto a `deploy.ps1`**, 100%
ASCII y sin BOM (regla §2.2 de `proyectos/CLAUDE.md`), documentado en `DEPLOY-VPS-runbook.md`. Su
alta en la tabla de scripts PowerShell de `proyectos/CLAUDE.md` es un commit en el repo padre, fuera
de esta cadena de PRs: queda como acción del operador.

Contrato del script:

1. **Detiene los dos servicios** y los deja detenidos. Así el punto de restore es exacto: sin esto,
   entre el dump y el `Stop-Service` de `deploy.ps1` la app sigue escribiendo y esas filas se
   corrigen pero no están en el dump. `deploy.ps1` es tolerante (`Stop-Service -Force` sobre un
   servicio detenido es un no-op).
2. **Enumera las bases desde el registro, nunca hardcodeadas**:
   `SELECT db_name FROM clientes WHERE activo = true AND deleted_at IS NULL`, ejecutado con
   `psql -t -A` (o vía `node -e` con `pg`, como ya hace `deploy.ps1:234`). Más `soporte_master`.
   Cada nombre se valida contra `^[a-z_][a-z0-9_]*$` antes de componer el comando — el mismo
   whitelist de `assertValidIdentifier` (`postgres-admin.service.ts:27`). Un nombre que no valide
   **aborta**, no se saltea.
3. **Dumpea** cada base a `C:\soporte\backups\utc-backfill-<yyyyMMdd-HHmmss>\<db>.dump` en formato
   custom (`-Fc`).
4. **Verifica antes de devolver el control**: cantidad de archivos = cantidad de bases enumeradas;
   cada archivo con tamaño > 0; `pg_restore --list` exitoso sobre cada uno y con las tablas
   esperadas presentes (`clientes` en master, `tickets` en cada tenant). Imprime una tabla
   base → bytes → entradas del TOC.
5. **Fail-closed**: si cualquier verificación falla, **rearranca los servicios**, no abre la ventana
   y sale con código distinto de cero. El sistema queda exactamente como estaba.

**Por qué no dentro de `deploy.ps1`**: el operador tiene que *leer* la verificación y recién entonces
consentir la ventana. Un dump automático dentro del script se verificaría a sí mismo con los
servicios ya detenidos, que es la falla del 2026-08-20 ya documentada en el propio `deploy.ps1`
(:239-244) — deploy cortado con los servicios abajo.

**Procedimiento de restore** (los dos pasos, siempre juntos): `Stop-Service` → por cada base
`pg_restore --clean --if-exists --no-owner -d <db> <archivo>.dump` → `git revert` de la cadena de
PRs, rebuild y redeploy → `Start-Service`. **Revertir el código sin restaurar los datos deja las
filas ya corregidas mostrándose −3h.** Recordatorio del runbook (:256): `EMAIL_CRYPTO_KEY` se
respalda junto con la base o las credenciales SMTP no se recuperan.

**Residuo declarado**: el restore vuelve al instante del dump; la actividad posterior a ese instante
se pierde. Con los servicios detenidos por el propio script, esa ventana es cero.

## ADR-7 — Cómo el test de regresión fuerza una sesión no-UTC

El Docker local corre `TimeZone=UTC` y es **ciego al defecto por construcción**
(`ticket-fecha-cierre-timestamptz.integration.spec.ts:84-101` ya lo deja escrito). Un `SET TIME ZONE`
dentro de una conexión ya abierta prueba la expresión SQL, pero **no prueba la cadena de conexión**,
que es justo lo que este cambio corrige. Por eso:

**Base efímera configurada como producción.** El spec crea una base efímera (precedente:
`test/barrido-huerfanas.global-setup.mjs`), le aplica
`ALTER DATABASE <efimera> SET timezone TO 'America/Sao_Paulo'` y recién entonces abre pools nuevos
contra ella. Una sesión nueva hereda el ajuste: es la réplica exacta de producción, sin tocar
`soporte_master_test` ni `soporte_tenant_test` (no hace falta `usarLockMasterTest()`). Higiene del
repo: limpiar filas → `close()` → `dropDatabase`.

| Test | RED hoy | GREEN después |
|---|---|---|
| Round-trip: escribir `new Date()` vía cliente Prisma construido por `PrismaService` y leerlo con `pg` crudo | desvío = **10800 s** | desvío = **0** |
| Lectura: columna con `DEFAULT clock_timestamp()` leída por Prisma vs. leída por `pg` crudo | desvío = **−10800 s** | desvío = **0** |
| `SHOW timezone` en sesión nueva tras aplicar la migración | `America/Sao_Paulo` | `UTC` |
| Fitness: `new Pool(` fuera del helper | la regla ESLint no existe | `pnpm lint` falla si alguien lo intenta |
| Backfill: fixtures con µs=0, µs≠0, y un ambiguo (µs=0 + delta en banda) | — | mueve exactamente las de µs=0 fuera de banda; no toca el ambiguo |
| Caracterización: el SQL corrido dos veces | — | **corrompe** (documenta por qué la guarda es `_prisma_migrations`) |
| Una-sola-vez: dos `prisma migrate deploy` seguidos | — | una sola fila en `_prisma_migrations`, filas sin cambio |

El spec del backfill **lee el `migration.sql` real del disco y lo ejecuta**, no una copia — mismo
criterio que `backfill-correo-clientes.spec.ts`, que importa el módulo real para que las dos
implementaciones no diverjan en silencio.

RED por la razón correcta: el primer test falla hoy con desvío 10800 s (no por error de conexión ni
de schema), y `sdd-verify` exige la tabla de TDD Cycle Evidence RED → GREEN → REFACTOR.

---

## Data Flow

```
ESCRITURA                          HOY                        DESPUES
  mapper -> Date JS --------> adapter-pg (naive) ---> Postgres
                                   sesion Sao_Paulo           sesion UTC
                                   guarda +3h                 guarda el instante real

LECTURA
  Postgres (clock_timestamp) -> adapter-pg ---------> Date JS
                                   resta 3h de mas            devuelve el instante real

DATO HISTORICO   1614 valores +3h --[migracion numerada, SQL puro, -3h]--> instante real
                                     guarda: _prisma_migrations (una vez por base)
```

## File Changes

| Archivo | Acción | Descripción | Líneas aprox. |
|---|---|---|---|
| `backend/src/shared/infrastructure/persistence/utc-connection-string.ts` | Create | Helper único `conUtc(url)`; único lugar autorizado a construir `Pool` | 35 |
| `backend/eslint.config.*` | Modify | `no-restricted-syntax`: `new Pool(` solo en el helper | 20 |
| `backend/src/shared/infrastructure/persistence/prisma.service.ts` | Modify | Pools master (:37) y tenant (:60) vía helper | 6 |
| `backend/src/clientes/infrastructure/postgres-admin.service.ts` | Modify | `ALTER DATABASE` tras `CREATE DATABASE` (:37) + pool admin vía helper | 12 |
| `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` | Modify | Pool del seeder (:219) vía helper | 4 |
| `backend/scripts/migrate-tenants.js` | Modify | Pool del fan-out (:41) vía helper | 4 |
| `backend/prisma_master/migrations/<ts>_sesion_utc_y_backfill_fechas/migration.sql` | Create | `ALTER DATABASE` + backfill catalogado | 95 |
| `backend/prisma_tenant/migrations/<ts>_sesion_utc_y_backfill_fechas/migration.sql` | Create | Idéntico salvo cabecera | 95 |
| Specs (unit del helper, integración round-trip, integración backfill, `postgres-admin`) | Create/Modify | Ver ADR-7 | 725 |
| `predeploy-dump.ps1` | Create | Dump verificado, fail-closed, ASCII sin BOM | 110 |
| `DEPLOY-VPS-runbook.md` | Modify | Ventana atómica, dump como precondición, verificación `SHOW timezone`, restore | 70 |
| `deploy.ps1` | Sin cambios | El backfill entra por `migrate:master`/`migrate:tenants` | 0 |

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit | `conUtc()` agrega el parámetro una sola vez, preserva usuario/clave/path, tolera URL con query previa | Vitest, sin base |
| Fitness | Ningún `new Pool(` fuera del helper | Regla ESLint; `pnpm lint` |
| Integración | Round-trip Prisma↔`pg` bajo base efímera en `America/Sao_Paulo`; `SHOW timezone` post-migración | Vitest + base efímera + `pg` |
| Integración | Backfill: fixtures µs=0 / µs≠0 / ambiguo; doble corrida corrompe; `migrate deploy` dos veces es no-op | Ejecuta el `migration.sql` real |
| Unit | `createDatabase` emite el `ALTER DATABASE` con el identificador quoteado | Mock de `Pool` (precedente en `postgres-admin.service.spec.ts`) |
| Manual (VPS) | Los tickets del barrido preventivo quedan en `01:00` local | Criterio de éxito del proposal |

## Threat Matrix

Aplica parcialmente: el diseño agrega un script PowerShell que **compone invocaciones de subproceso
(`pg_dump`) con nombres de base leídos de la base**, y SQL dinámico con `format(%I)`.

| Boundary | Aplicabilidad | Respuesta de diseño | RED planeado |
|---|---|---|---|
| Documentation-like paths | **N/A** — no hay clasificación ni ejecución de archivos por extensión | — | — |
| Git repository selection | **N/A** — el `git pull` de `deploy.ps1` no se toca | — | — |
| Commit state | **N/A** — sin automatización de commits | — | — |
| Push state | **N/A** — sin automatización de push | — | — |
| PR commands | **N/A** — sin automatización de PR | — | — |
| *(agregada)* Composición de argumentos de subproceso: enumeración de bases para `pg_dump` | **Aplicable** | Enumerar con `psql -t -A` o `pg` (nunca salida con encabezado); validar cada nombre contra `^[a-z_][a-z0-9_]*$`; abortar —no saltear— ante un nombre inválido; verificar cantidad y tamaño > 0 de los dumps | El repo **no tiene harness de PowerShell**: la guarda es una aserción en runtime del propio script, no un test. **Gap declarado y aceptado** |
| *(agregada)* SQL dinámico con identificadores (`format %I`) | **Aplicable** | `format('%I')` (mismo criterio que `quoteIdentifier`), filtrado por `information_schema` a `public` + `BASE TABLE`, `_prisma_migrations` excluida explícitamente | Spec de integración: tras la migración, `_prisma_migrations.started_at/finished_at` sin cambio; ninguna columna `date` tocada |

## Migration / Rollout

Un solo despliegue. Precondición operativa: `predeploy-dump.ps1` verificado en verde (ADR-6). Luego
`deploy.ps1` sin modificaciones; el backfill entra por las migraciones. Verificación post-deploy en
el runbook: `SHOW timezone` en sesión nueva por base, y un round-trip de lectura contra
`clock_timestamp()`. Rollback: restore del dump **junto con** el revert del código, nunca uno solo.

## Delivery — corte sugerido para `sdd-tasks`

`delivery_strategy: auto-chain`, presupuesto 400 líneas por PR. Total estimado ≈ **1175 líneas** ⇒
riesgo **Alto**, cadena obligatoria.

| WU | Contenido | Líneas aprox. |
|---|---|---|
| WU1 | Helper `conUtc` + regla ESLint + `prisma.service.ts` + spec unit + spec de integración round-trip (RED→GREEN) | ~320 |
| WU2 | `postgres-admin.service.ts` (incluye `ALTER DATABASE`, **R5**) + `tenant-seeder.adapter.ts` + `migrate-tenants.js` + specs | ~115 |
| WU3 | Migración `prisma_master` + spec de integración del backfill (discriminador, ambiguo, doble corrida, una-sola-vez) | ~325 |
| WU4 | Migración `prisma_tenant` + spec de las 6 columnas `clock_timestamp()` y la guarda del delta | ~235 |
| WU5 | `predeploy-dump.ps1` + `DEPLOY-VPS-runbook.md` | ~180 |

Los WU3 y WU4 **no se despliegan sin** WU1+WU2 (ADR-5). La deuda de Ayuda se anota en el mensaje de
commit y en el cuerpo del PR de cada WU que altere lo que el usuario ve (pausa vigente desde
2026-09-07).

## Open Questions

- [ ] Propiedad de `soporte_master`: si el rol de `DATABASE_URL_MASTER` no es dueño de la base, el
      `ALTER DATABASE` emite WARNING y queda solo la garantía por conexión. Se resuelve en la
      verificación post-deploy del runbook, no bloquea el diseño.
- [ ] El alta de `predeploy-dump.ps1` en la tabla de scripts PowerShell de `proyectos/CLAUDE.md` es
      un commit en el repo padre, fuera de esta cadena.
