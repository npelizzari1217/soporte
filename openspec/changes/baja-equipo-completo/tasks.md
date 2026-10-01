# Tasks: baja de equipo completo

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera porque el ciclo tiene 70 escenarios, 8 testigos de locks, 5 casos de
> concurrencia y 17 work units, y `sdd-verify` necesita el mapa escenario → tarea. Recortar
> cobertura para entrar en el presupuesto sería peor que declarar el excedente.

> **TDD en este ciclo: apagado como regla general, ENCENDIDO en WU-3.** El ciclo mezcla una
> feature (baja de equipo completo) con una **corrección de defecto** (`DELETE /equipos/:id`
> borra equipos con piezas activas y deja unidades `INSTALADA` huérfanas). Por
> `~/proyectos/CLAUDE.md` §6.3, el orquestador inyecta **STRICT TDD** al lanzar `sdd-apply` y
> `sdd-verify` de WU-3, aunque `strict_tdd` diga `false`. El resto de los WU corre en modo
> estándar: el test viaja en el mismo commit que el código.

> **Ayuda: escritura suspendida** (`CLAUDE.md` del repo). Se corrige solo lo que el cambio vuelve
> **falso** (ADR-9): `backend/ayuda/equipos-listado.md` en WU-15 (filtro de la lista) y
> `backend/ayuda/permisos-y-roles.md` en WU-11 (endpoint de baja: de tres a cuatro trabajos que
> mueven stock). Los demás WU con UI anotan la deuda en commit y PR: *"Ayuda pendiente: artículo
> nuevo sobre el flujo de baja de equipo, el botón renombrado 'Eliminar equipo (cargado por error)'
> y la ficha de un equipo dado de baja"*. Los WU de backend sin cambio visible dicen "sin deuda".

> **Este ciclo implementa un punto del roadmap** (viñeta "Baja de equipo completo" de "Decisiones
> de producto ya cerradas", `docs/roadmap-comercial.md`). La spec ya convirtió cada sub-viñeta en
> un requerimiento (R1 a R17). WU-17 declara **Cumplida** o **Desviación** y corre
> `node scripts/check-roadmap-fresco.mjs`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~6.600 (+/−) en total; entre 300 y 430 por WU |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker con 17 PR hijos en cadena lineal (el hint del diseño preveía 8; se parten para que código y tests entren juntos bajo 400 y para que la migración vaya primero) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Por qué "No" a la decisión:** el dueño confirmó auto-chain con feature-branch-chain y la política
de tamaño (partir en costura limpia con código y tests juntos; `size:exception` solo si partir los
separa, con `size:exception: N lineas, <por qué>` en el cuerpo del commit). El diseño no tiene
preguntas abiertas que bloqueen. Las dos pendientes (texto exacto del banner de la ficha; si el
409 se reintenta solo en el frontend) se resuelven en WU-17 y WU-16 con el default del diseño
(banner con fecha, categoría, motivo y destino; aviso y refetch, sin reintento automático).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Migración tenant, schema, entidad, mapper, errores | PR 1 → tracker | `cd backend && pnpm vitest run src/equipos/domain src/equipos/infrastructure/persistence/prisma/equipo-informatico.mapper` | Base `soporte_tenant_test` migrada; spec de constraints contra Postgres real | Migración aditiva (queda aplicada); entidad y errores sin callers nuevos |
| 2 | Repo de equipos: LE, `registrarBaja`, `save()` sin `activo` | PR 2 → wu01 | `cd backend && pnpm vitest run src/equipos/infrastructure/persistence/prisma` | Integración sobre base efímera | Métodos aditivos en el puerto y el repo; `save()` revertible |
| 3 | **BUGFIX** borrado con piezas activas (STRICT TDD) | PR 3 → wu02 | `cd backend && pnpm vitest run src/equipos/application/use-cases/eliminar-equipo src/equipos/interface` | Integración + e2e `DELETE /equipos/:id` + T5 | Un use case, un mapeo y una etiqueta de botón |
| 4 | Guards con LE: editar equipo, agregar y reactivar componente | PR 4 → wu03 | `cd backend && pnpm vitest run src/equipos/application/use-cases` | Integración de guards sobre equipo dado de baja + T4 | Tres use cases y sus fakes |
| 5 | Guards con LE: retirar y ticket; CAS de `EditarComponente` | PR 5 → wu04 | `cd backend && pnpm vitest run src/equipos` | Integración de ediciones viejas + T7, T8 | Dos use cases + `editar()` del repo de componentes |
| 6 | Insumos: clasificador, `serialesExistentes`, `devolverDesdeEquipo` | PR 6 → wu05 | `cd backend && pnpm vitest run src/insumos/application/services src/insumos/infrastructure/persistence/prisma` | Integración de `serialesExistentes` | Servicio y puerto aditivos; `devolverAlDeposito` delega |
| 7 | Insumos: `registrarDevolucionesDeEquipo` y `diagnosticar…` | PR 7 → wu06 | `cd backend && pnpm vitest run src/insumos/application/use-cases/registrar-entrada` | Integración sobre base efímera | Dos métodos aditivos |
| 8 | `DarDeBajaEquipoUseCase` con atomicidad y wiring | PR 8 → wu07 | `cd backend && pnpm vitest run src/equipos/application/use-cases/dar-de-baja` | N/A: unitario con fakes (la integración llega en WU-9/10) | Un use case + providers; sin ruta |
| 9 | Integración de la baja: A, B, leyenda, registro del equipo | PR 9 → wu08 | `cd backend && pnpm vitest run src/equipos/application/use-cases/dar-de-baja-equipo.integration` | Postgres real, invariante `SERIE` | Solo tests y helper |
| 10 | Integración: atomicidad, legados, causas juntas, testigos T1–T3, T6 | PR 10 → wu09 | `cd backend && pnpm vitest run src/equipos/application/use-cases/dar-de-baja-equipo src/equipos/infrastructure --testNamePattern "baja"` | `pg_locks` + `pg_blocking_pids` deterministas | Solo tests |
| 11 | HTTP: resumen y baja, tickets abiertos, errores, DTO; Ayuda de permisos | PR 11 → wu10 | `cd backend && pnpm vitest run src/equipos/interface src/equipos/application/use-cases/resumen-baja` | Controller con reflexión de decoradores | Rutas, DTO, use case de resumen |
| 12 | e2e HTTP de la baja | PR 12 → wu11 | `cd backend && pnpm vitest run src/equipos/interface/controllers/dar-de-baja-equipo.e2e` | e2e supertest sobre tenant efímero | Solo tests |
| 13 | Concurrencia de resultado (a)–(e) | PR 13 → wu12 | `cd backend && pnpm vitest run src/equipos/application/use-cases/baja-equipo.concurrencia` | Carreras reales con 10 iteraciones por caso | Solo tests |
| 14 | Lista y exportación con `incluirBajas`; `baja` en el DTO | PR 14 → wu13 | `cd backend && pnpm vitest run src/equipos/application/use-cases/listar-equipos src/equipos/application/use-cases/exportar-equipos src/equipos/interface` | e2e de lista y exportación | Parámetro aditivo con default `false` |
| 15 | Frontend: filtro de la lista y Ayuda del listado | PR 15 → wu14 | `cd frontend && pnpm vitest run src/features/equipos` | Componente con MSW | Casilla, hook y botón; Ayuda del listado |
| 16 | Frontend: diálogo de baja | PR 16 → wu15 | `cd frontend && pnpm vitest run src/features/equipos/components/equipo-baja` | Diálogo con MSW (resumen, 422 con piezas, 409) | Dos componentes nuevos + cableado del botón |
| 17 | Frontend: ficha de solo lectura; cierre del roadmap | PR 17 → wu16 | `cd frontend && pnpm vitest run src/features/equipos` y `node scripts/check-roadmap-fresco.mjs` | Ficha de equipo dado de baja con MSW | Banner, prop `equipoActivo`; el roadmap vuelve a "Pendiente" |

| WU | Estimación | Riesgo | Corte previsto si se pasa |
|---|---|---|---|
| 1 | ~420 (schema 10, migración 50, entidad 90, errores 50, mapper 30, specs 190) | Medio | Entidad y su spec / migración, mapper y constraints |
| 2 | ~380 | Medio | Puerto + locks / `registrarBaja` y `save()` |
| 3 | ~420 (tests RED 230, fix 80, T5 70, frontend 40) | Medio | Fix + tests / T5 y botón |
| 4 | ~400 | Medio | Editar equipo / agregar y reactivar |
| 5 | ~400 | Medio | Retirar y ticket / CAS de `EditarComponente` |
| 6 | ~410 | Medio | Clasificador + `serialesExistentes` / `devolverDesdeEquipo` |
| 7 | ~380 | Medio | Unit / integración |
| 8 | ~400 | Alto | Use case / spec (no separar: código con su test) |
| 9 | ~400 | Bajo | Opción A / opción B |
| 10 | ~420 | Medio | Atomicidad y legados / testigos |
| 11 | ~400 | Medio | Resumen / baja + Ayuda |
| 12 | ~330 | Bajo | — |
| 13 | ~400 | Alto | Casos (a)(b) / (c)(d)(e) |
| 14 | ~380 | Medio | Lista / exportación |
| 15 | ~330 | Bajo | — |
| 16 | ~420 | Medio | Form / diálogo |
| 17 | ~300 | Bajo | — |

## Cadena de PR y dependencias

Ramas: `feat/baja-equipo-completo-wu01` a `feat/baja-equipo-completo-wu17`. El tracker
`feat/baja-equipo-completo` ya contiene los commits de planificación. **Cada PR hijo apunta a la
rama del PR inmediatamente anterior**; solo el tracker se integra a `main`. Si un hijo muestra
cambios del anterior, la base está mal: retargetear o rebasar.

`main` ← tracker ← wu01 ← wu02 ← wu03 ← … ← wu17

| WU | Depende de | Motivo |
|---|---|---|
| 1 | — | Columnas, entidad y errores que usa todo lo demás. Va primero por pedido del dueño |
| 2 | 1 | Los métodos de lock y `registrarBaja` operan sobre las columnas y la entidad |
| 3 | 2 | El fix usa `bloquearParaModificar` y los errores de WU-1 |
| 4 | 2 | Los guards usan `bloquearParaModificar` / `bloquearParaOperarPiezas` |
| 5 | 4 | Mismo patrón; los testigos viven en el mismo spec que T4 |
| 6 | 1 | Independiente de equipos en código, pero la cadena es lineal |
| 7 | 6 | Usa `clasificarPiezaDevuelta` y `devolverDesdeEquipo` |
| 8 | 2, 5, 7 | Orquesta LE, stock y `registrarBaja` |
| 9 | 8 | Integración sobre el use case ya cableado |
| 10 | 9 | Reutiliza el helper de fixtures de WU-9 |
| 11 | 8 (base física: wu10) | Rutas sobre el use case; usa los cinco errores |
| 12 | 11 | e2e sobre las rutas |
| 13 | 8 (base física: wu12) | Carreras sobre el use case (la cadena lineal las ubica después del e2e) |
| 14 | 11 | `incluirBajas` y `baja` en el DTO de respuesta |
| 15 | 14 | El frontend consume el parámetro y el campo |
| 16 | 11, 15 | El diálogo consume resumen y baja; reusa tipos y schemas de WU-15 |
| 17 | 16 | La ficha usa el diálogo y cierra el roadmap |

## Recordatorios operativos

- **Migrar las bases de test y de desarrollo** (WU-1 en adelante; sin esto la suite tira
  `PrismaClientKnownRequestError` en los `*.integration.spec.ts`):
  - Test: `cd backend && DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test pnpm migrate:tenant`
  - Desarrollo (todos los tenants del registro): `cd backend && pnpm migrate:tenants`
  - Regenerar el cliente tenant después de tocar `schema.prisma` (el script exacto sale de
    `backend/package.json`).
  - `P1001` en `pnpm prisma migrate status --schema prisma_tenant/schema.prisma` = base caída
    (entorno), no código.
- **`usarLockMasterTest()`**: todo spec e2e o de integración que trunque `soporte_master_test` lo
  llama antes de su `describe`. Un spec nuevo que trunque esa base tiene que llamarlo también.
- **Higiene de tenant efímero**: limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP
  falla en silencio. Nunca se toca ni se hardcodea la base de un tenant real.
- **Testigos de locks deterministas** (patrón de `retirar-reactivar-unidad.concurrencia.integration.spec.ts:200-245`
  (read-only)): un cliente externo retiene un lock; `pg_blocking_pids` con espera acotada hasta ver
  la baja bloqueada; sondas de `pg_locks` por `relation` y `locktype = 'advisory'`; sonda
  `FOR UPDATE NOWAIT` desde un testigo en su propia transacción revertida. **Nunca carreras de dos
  clientes para fijar el orden de locks.** Las carreras reales solo existen en WU-13, para el
  resultado, no para el orden.
- **Specs sin casts**: ningún `as never` ni `as any` nuevo (CI ratchet). Se usan fakes tipados,
  `unstubbed()` y `vi.spyOn`. Todo fake que implemente un puerto ampliado agrega los métodos nuevos
  con tipos reales.
- **Gates de backend** (cada WU de backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run <dirs>
  && pnpm test`, **y** `node scripts/check-casts-en-specs.mjs`. **Gates de frontend**:
  `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`.
- **Conventional Commits, sin atribución de IA. No commitear desde esta fase de tasks**; apply
  commitea por WU. Cada WU anota la deuda de Ayuda (o "sin deuda") en el cuerpo del commit.
- **Specs de `openspec/specs/`**: no se editan en apply; el alta de la spec `equipos-baja-completa`
  y los deltas los hace `sdd-archive`.
- **Orden de locks (ADR-2/3)**: LE → L0 → LC → L1 → L2 → L3 → L4. LE de la baja y del borrado es
  `FOR NO KEY UPDATE`; el de las altas, reactivación, retiro y ticket es `FOR SHARE`. Nunca
  `FOR UPDATE` (deadlock contra `FOR KEY SHARE` de los INSERT con FK; lo fija T6).

---

## WU-1 — Migración tenant, schema, entidad, mapper y errores

**Branch**: `feat/baja-equipo-completo-wu01` · **Base**: tracker (`feat/baja-equipo-completo`)

- [x] 1.1 `backend/prisma_tenant/schema.prisma`: en `EquipoInformatico` agregar `bajaDestino`, `bajaCategoria`, `bajaMotivo`, `bajaFecha`, `bajaUsuarioId` con `@map` a `baja_destino`, `baja_categoria`, `baja_motivo`, `baja_fecha`, `baja_usuario_id` (tipos de ADR-1; `baja_usuario_id` sin relación). (Req: R8)
- [x] 1.2 Crear `backend/prisma_tenant/migrations/20261001120000_equipos_informaticos_baja/migration.sql`: las cinco columnas `NULL`, `CHECK` de catálogo de `baja_destino` y de `baja_categoria`, y `equipos_informaticos_baja_coherente_check` exacto de ADR-1 (activo ⇒ sin datos; inactivo ⇒ sin datos **o** con `destino`, `categoria`, `fecha`, `usuario` y `motivo` si la categoría es `OTRA`). Sin backfill. (Req: R8)
- [x] 1.3 Migrar y regenerar: `cd backend && DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test pnpm migrate:tenant`, luego `pnpm migrate:tenants` para las bases de desarrollo y regenerar el cliente tenant. Verificar con `pnpm prisma migrate status --schema prisma_tenant/schema.prisma` ("up to date"). Anotar los comandos en el cuerpo del PR.
- [x] 1.4 `backend/src/equipos/domain/entities/equipo-informatico.entity.ts`: exportar `CATEGORIAS_BAJA_EQUIPO`, `ETIQUETAS_CATEGORIA_BAJA` (`Vejez`, `Donación`, `Rotura`, `Otra`), `DESTINOS_BAJA_EQUIPO` (= `DESTINOS_RETIRO_COMPONENTE`), `componerLeyendaBaja(nombre, categoria, texto)`, `largoMaximoTextoBaja(nombre, categoria)` (= `500 − (nombre.length + 23 + etiqueta.length)`), y `darDeBaja({ destino, categoria, motivo, usuarioId, fecha })` (lanza si `!activo`). Quitar `deactivate()` y `activate()`. Campos `baja*` en props y getters. (Req: R4, R5, R8)
- [x] 1.5 Spec `backend/src/equipos/domain/entities/equipo-informatico.entity.spec.ts` (ampliar): ver nombres en el mapa (leyenda con y sin texto, 500 exactos, 501 con `largoMaximo`, `OTRA` sin texto o con espacios, categoría fuera del catálogo, `darDeBaja` guarda los cinco campos, `darDeBaja` sobre no vigente lanza, nombre de 255 y `Donación` ⇒ espacio 214).
- [x] 1.6 `backend/src/equipos/domain/errors/equipos.errors.ts`: `EquipoDadoDeBajaError`, `EquipoConComponentesActivosError(cantidad)`, `MotivoBajaEquipoInvalidoError(largoMaximo?)`, `BajaEquipoConPiezasProblematicasError(piezas)`, `EquipoModificadoDuranteLaBajaError`. (Todos en este WU para que los RED de WU-3 fallen por comportamiento y no por símbolo faltante.)
- [x] 1.7 `backend/src/equipos/infrastructure/persistence/prisma/equipo-informatico.mapper.ts`: mapear los cinco campos en `toDomain` y `toPersistence` (create). Spec `equipo-informatico.mapper.spec.ts`: ida y vuelta con y sin datos de baja.
- [x] 1.8 Reemplazar `deactivate()` por `darDeBaja(...)` (o reconstituir la entidad con datos de baja) en `backend/src/preventivo/application/use-cases/generar-preventivos.use-case.spec.ts:46`, `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.spec.ts:169` y `backend/src/equipos/application/use-cases/exportar-equipos.use-case.spec.ts:58`, con fakes tipados.
- [x] 1.9 Spec de constraints `backend/src/equipos/infrastructure/persistence/prisma/equipos-informaticos-baja.constraints.integration.spec.ts` (tenant efímero; `usarLockMasterTest()` solo si trunca master): compara `CATEGORIAS_BAJA_EQUIPO` y `DESTINOS_BAJA_EQUIPO` del dominio contra los `CHECK` de la base; rechaza vigente con datos de baja; rechaza dado de baja con datos incompletos y `OTRA` sin motivo; admite dado de baja sin ningún dato (rama histórica) y con datos completos.
- [x] 1.10 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos src/preventivo && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: leyenda sin texto, 500 y 501 (parte de dominio); `OTRA` sin texto y categoría
inválida (parte de dominio); registro de la baja en la entidad.
**PR boundary**: ~420 líneas, base tracker. Corte si pasa: entidad + errores + su spec / migración,
mapper y constraints. La migración es aditiva: puede quedar aplicada tras un revert.
**Ayuda**: sin deuda (sin cambio visible).
Commit sugerido: `feat(equipos): columnas de baja, entidad y errores de la baja de equipo completo`.

## WU-2 — Repositorio de equipos: LE, `registrarBaja` y `save()` sin `activo`

**Branch**: `feat/baja-equipo-completo-wu02` · **Base**: wu01

- [x] 2.1 `backend/src/equipos/domain/ports/i-equipo-informatico.repository.ts`: `bloquearParaModificar(id)`, `bloquearParaOperarPiezas(id)` (ambos `Promise<EquipoInformaticoEntity | null>`, requieren transacción) y `registrarBaja(equipo): Promise<boolean>`, con el contrato en JSDoc (LE, `FOR NO KEY UPDATE` vs `FOR SHARE`, por qué nunca `FOR UPDATE`). (Req: R15)
- [x] 2.2 `prisma-equipo-informatico.repository.ts`: implementar ambos locks: `exigirTransaccionActiva`, `$queryRaw SELECT id FROM equipos_informaticos WHERE id = $1::uuid FOR NO KEY UPDATE|FOR SHARE`, `findUnique` por el mapper; `null` si no existe (el borrado lógico lo decide el caller).
- [x] 2.3 `save()`: quitar `activo` y `baja_*` de la rama `update`; la rama `create` los conserva. (Req: R8)
- [x] 2.4 `registrarBaja(equipo)`: `updateMany WHERE id = ? AND activo = true AND deleted_at IS NULL` que escribe `activo = false` y las cinco columnas; devuelve `false` si tocó 0 filas. Es el único escritor de baja. (Req: R8, R9)
- [x] 2.5 Reescribir `backend/src/equipos/infrastructure/persistence/prisma/prisma-equipos.integration.spec.ts:271-273`: `save()` de una entidad leída antes de la baja **no** reactiva el equipo ni toca `baja_*` (ediciones viejas, caso a); `registrarBaja` escribe los cinco campos; segunda llamada devuelve `false` y deja intactos los datos originales; equipo con borrado lógico devuelve `false`.
- [x] 2.6 Spec `backend/src/equipos/infrastructure/persistence/prisma/prisma-equipo-informatico.locks.integration.spec.ts` (tenant efímero): ambos métodos lanzan fuera de una transacción; devuelven `null` para un id inexistente y la entidad (con `deletedAt`) para uno borrado; compatibilidad de locks con sondas deterministas: `FOR SHARE` retenido no bloquea un `INSERT` con FK (`FOR KEY SHARE`) al equipo ni otro `FOR SHARE`, pero sí espera a `FOR NO KEY UPDATE`; `FOR NO KEY UPDATE` retenido no bloquea el `INSERT` con FK (base de T6).
- [x] 2.7 Agregar los tres métodos con tipos reales a todo fake que implemente `IEquipoInformaticoRepository` (`rg -n "IEquipoInformaticoRepository" backend/src --glob "*.spec.ts"`), usando `unstubbed()` donde no se usan.
- [x] 2.8 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/infrastructure/persistence/prisma src/equipos/application && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: registro de la baja (persistencia); sin reactivación por `save()` (ediciones
viejas, caso a); equipo ya dado de baja (backstop CAS).
**PR boundary**: ~380 líneas, base wu01. Corte si pasa: puerto + locks / `registrarBaja` + `save()`.
Revert: métodos aditivos; `save()` vuelve al upsert completo.
**Ayuda**: sin deuda.
Commit sugerido: `feat(equipos): locks de equipo y registrarBaja como unico escritor de la baja`.

## WU-3 — BUGFIX: el borrado de un equipo respeta las piezas activas (STRICT TDD: RED first)

**Branch**: `feat/baja-equipo-completo-wu03` · **Base**: wu02

> **STRICT TDD: RED first.** El orquestador inyecta `STRICT TDD MODE IS ACTIVE. Test runner:
> pnpm vitest run. You MUST follow strict-tdd.md.` al lanzar apply y verify de este WU. Las tareas
> 3.1 a 3.4 escriben los tests y se corren **contra el código actual, que hoy borra**; el RED
> observado se anota en `openspec/changes/baja-equipo-completo/apply-progress.md` (tabla **TDD
> Cycle Evidence**: tarea, test, comando, RED observado, GREEN observado, REFACTOR) **antes** de
> tocar `eliminar-equipo.use-case.ts`. Sin esa tabla, `sdd-verify` rechaza el WU.

- [x] 3.1 RED unit en `backend/src/equipos/application/use-cases/eliminar-equipo.use-case.spec.ts`: con un componente activo devuelve `fail(EquipoConComponentesActivosError)` con `cantidad = 1` y no llama a `softDelete`; equipo dado de baja ⇒ `fail(EquipoDadoDeBajaError)`; sin componentes activos ⇒ `ok` y borra; inexistente o con `deletedAt` ⇒ `EquipoNoEncontradoError`; el chequeo corre dentro de `txRunner.run()` tras `bloquearParaModificar`. Correr `pnpm vitest run` sobre el archivo y registrar los fallos observados en `apply-progress.md`. (Req: R13)
- [x] 3.2 RED integración `backend/src/equipos/application/use-cases/eliminar-equipo.integration.spec.ts` (tenant efímero; `usarLockMasterTest()` si trunca master; higiene: filas → `app.close()` → `dropDatabase`): el equipo con la unidad `INSTALADA` sigue sin borrado lógico, el componente sigue activo y la unidad sigue `INSTALADA`; borrar un equipo dado de baja se rechaza y el equipo sigue visible; borrar un equipo sin piezas activas pone `deletedAt`. Correr y registrar el RED. (Req: R13)
- [x] 3.3 RED e2e en `backend/src/equipos/interface/controllers/eliminar-equipo.e2e.spec.ts` (`usarLockMasterTest()` antes del `describe`): `DELETE /equipos/:id` con pieza activa ⇒ 422 con la cantidad; sobre equipo dado de baja ⇒ 422; sin piezas ⇒ 2xx y la ficha responde 404; sin `EQUIPOS:BORRADO` ⇒ 403 (regresión). Correr y registrar el RED. (Req: R13)
- [x] 3.4 Confirmar y dejar por escrito en `apply-progress.md` que 3.1 a 3.3 fallan **por el comportamiento** (hoy borra y devuelve éxito) y no por un error de compilación o de fixture. Recién entonces se escribe 3.5.
- [x] 3.5 GREEN `backend/src/equipos/application/use-cases/eliminar-equipo.use-case.ts`: correr entero en `txRunner.run()`; `bloquearParaModificar(id)` primero (`null` o `deletedAt` ⇒ `EquipoNoEncontradoError`); `!activo` ⇒ `EquipoDadoDeBajaError`; `findActiveByEquipoId(id).length > 0` ⇒ `EquipoConComponentesActivosError(cantidad)`; si no, `softDelete`. Ningún `Result.fail` después de una escritura. (Req: R13)
- [x] 3.6 `backend/src/equipos/interface/controllers/equipos.controller.ts`: mapear `EquipoDadoDeBajaError` y `EquipoConComponentesActivosError` a 422 explícito en `toHttpException` (el resto de los errores se mapea en WU-11); el 422 del borrado informa `cantidad`. Spec del controller: ambos mapeos. Los tests 3.1 a 3.3 pasan a GREEN; anotar el GREEN en `apply-progress.md`.
- [x] 3.7 Testigo **T5** en `backend/src/equipos/infrastructure/persistence/prisma/eliminar-equipo.orden-de-locks.integration.spec.ts` (patrón determinista): un cliente externo toma LE `FOR SHARE` e inserta un componente sin commit; el `DELETE` queda bloqueado (`pg_blocking_pids` acotado); tras el COMMIT del externo responde `EquipoConComponentesActivosError` y el equipo no tiene borrado lógico. (Req: R13, R15)
- [x] 3.8 REFACTOR + frontend: en `frontend/src/features/equipos/components/equipo-detail-view.tsx` el botón del borrado pasa a "Eliminar equipo (cargado por error)" con la descripción "Solo para equipos cargados por error. Si tiene piezas instaladas, dalo de baja."; ningún otro botón lleva "Dar de baja" en este WU (lo reintroduce WU-16). Actualizar su test (`equipo-detail-view.test.tsx`) y el 422 del borrado (mensaje con la cantidad). Anotar REFACTOR en `apply-progress.md`. (Req: R13)
- [x] 3.9 Ayuda: `rg -n -i "dar de baja|borrar|eliminar" backend/ayuda` y corregir en el mismo commit todo artículo que describa el botón como baja o diga que se puede borrar un equipo con piezas (queda **falso**); si no hay ninguno, anotarlo en el PR.
- [x] 3.10 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos && pnpm test` y `node scripts/check-casts-en-specs.mjs`. Frontend: `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`. Adjuntar la tabla TDD Cycle Evidence en el PR.

**Escenarios**: Borrar con piezas activas; Borrar un equipo cargado por error; Borrar un equipo
dado de baja; Botón renombrado (etiqueta del borrado).
**PR boundary**: ~420 líneas, base wu02. Corte si pasa: fix + 3.1 a 3.3 / T5 y botón. Revert: un use
case, un mapeo y una etiqueta; el defecto reaparece (documentado en ADR-11).
**Ayuda**: corregida si 3.9 encontró algo falso; deuda: artículo del botón renombrado.
Commit sugerido: `fix(equipos): el borrado rechaza equipos con piezas activas o dados de baja`.

## WU-4 — Guards con LE: editar equipo, agregar y reactivar componente

**Branch**: `feat/baja-equipo-completo-wu04` · **Base**: wu03

- [x] 4.1 Specs `backend/src/equipos/application/use-cases/editar-equipo.use-case.spec.ts`: equipo `!activo` ⇒ `EquipoDadoDeBajaError` y nada se guarda; inexistente o borrado ⇒ `EquipoNoEncontradoError`; la lectura es `bloquearParaModificar` dentro de `txRunner`. (Req: R11, R8)
- [x] 4.2 `editar-equipo.use-case.ts`: correr entero en `txRunner.run()`; `bloquearParaModificar` primero; guard `!activo`; `save()` ya no puede reactivar (WU-2). (Req: R11, R8)
- [x] 4.3 Specs `agregar-componente.use-case.spec.ts`, `instalar-componente-desde-deposito.use-case.spec.ts` y `agregar-componente-sin-descuento.use-case.spec.ts`: sobre equipo dado de baja, los tres caminos (instalar con unidad, instalar con insumo `NINGUNO`, alta sin descuento) devuelven `EquipoDadoDeBajaError` sin crear componente ni mover stock; el fake expone `bloquearParaOperarPiezas` y no `findById`. (Req: R11)
- [x] 4.4 `agregar-componente.use-case.ts`: `preparar()` toma `bloquearParaOperarPiezas(id)` (LE `FOR SHARE`) como **primer** lock de la transacción (`null` o `deletedAt` ⇒ `EquipoNoEncontradoError`; `!activo` ⇒ `EquipoDadoDeBajaError`). Confirmar con `rg` que los tres caminos pasan por `preparar()`. (Req: R11, R15)
- [x] 4.5 `reactivar-componente.use-case.ts` y su spec: el chequeo del equipo pasa **dentro** de la transacción con `bloquearParaOperarPiezas`; `!activo` ⇒ `EquipoDadoDeBajaError` sin tocar el componente ni la unidad `DESCARTADA`. (Req: R11; delta `componentes-catalogo-unico`)
- [x] 4.6 Fakes de `{editar-equipo,agregar-componente,reactivar-componente}.use-case.spec.ts` y de los specs que los componen: `findById` → `bloquearPara*`, `txRunner` donde antes no había; sin casts. **Regresión del delta**: los tests existentes de `reactivar-componente.use-case.spec.ts` y de su integración (`rg -n "reactivar" backend/src/equipos --glob "*.spec.ts" -l`) siguen verdes **sin cambiar sus aserciones**; listar en `apply-progress.md` el nombre de los 8 tests que cubren los escenarios previos del delta.
- [x] 4.7 Integración `backend/src/equipos/application/use-cases/equipo-dado-de-baja.guards.integration.spec.ts` (tenant efímero; helper que crea un equipo dado de baja por `registrarBaja`): `EditarEquipo` con la entidad leída antes de la baja devuelve error y el equipo sigue `activo = false` con sus `baja_*`; agregar componente con y sin descuento rechazado sin componente nuevo ni movimiento; reactivar un componente `DESCARTE` con unidad "S1" `DESCARTADA` rechazado, componente retirado y "S1" `DESCARTADA`. (Req: R8, R11)
- [x] 4.8 Testigo **T4** en `backend/src/equipos/application/use-cases/baja-equipo.orden-de-locks.integration.spec.ts` (archivo nuevo; lo amplían WU-5 y WU-10): el externo retiene LE `FOR NO KEY UPDATE`; `InstalarComponenteDesdeDeposito` (con unidad) y `ReactivarComponente` esperan (`pg_blocking_pids`); todavía no tienen `RowShareLock` en `insumos` ni ningún advisory. (Req: R15)
- [x] 4.9 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/application/use-cases && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: Editar un equipo dado de baja; Agregar un componente; Reactivar un componente de un
equipo dado de baja (ambas specs); Sin reactivación (por la edición); regresión de los 8
escenarios previos del delta de reactivar.
**PR boundary**: ~400 líneas, base wu03. Corte si pasa: editar equipo / agregar y reactivar.
**Ayuda**: sin deuda (la UI no cambia aún).
Commit sugerido: `feat(equipos): un equipo dado de baja no admite edicion ni altas ni reactivacion`.

## WU-5 — Guards con LE: retirar y ticket; CAS de `EditarComponente`

**Branch**: `feat/baja-equipo-completo-wu05` · **Base**: wu04

- [x] 5.1 `retirar-componente.use-case.ts` y su spec: toma `bloquearParaOperarPiezas(id)` (LE `FOR SHARE`) primero; solo toma el lock, sin guard de `activo` (sus piezas ya están retiradas en un equipo dado de baja); fake sin `findById`. (Req: R15)
- [x] 5.2 `crear-ticket-soporte.use-case.ts`: con `equipoId`, `bloquearParaOperarPiezas(id)` al comienzo de `run()` **antes** del advisory de numeración; `null`, `deletedAt` o `!activo` ⇒ `EquipoInvalidoError` como hoy. Spec `crear-ticket-soporte.use-case.spec.ts` (incluye el `:169` de WU-1): ticket sobre equipo dado de baja rechazado; el fake falsea `bloquearParaOperarPiezas`. (Req: R10)
- [x] 5.3 Verificar con `rg -n "ComponenteDadoDeBajaError" backend/src/equipos` si el error existe; si no, crearlo en `backend/src/equipos/domain/errors/equipos.errors.ts` y mapearlo a 422 en `equipos.controller.ts`. Puerto `i-componente-equipo.repository.ts`: `editar(componente): Promise<boolean>`. (Req: R11)
- [x] 5.4 `prisma-componente-equipo.repository.ts`: `editar()` = `updateMany WHERE id = ? AND deleted_at IS NULL` que escribe **solo** `descripcion`, `numero_serie`, `capacidad` y `updated_at`. `editar-componente.use-case.ts` usa `editar()` en lugar de `save()`; 0 filas ⇒ `ComponenteDadoDeBajaError`. Spec unitario del use case: `editar` devolviendo `false` ⇒ `fail`; nunca llama a `save`. (Req: R8, R11)
- [x] 5.5 Integración de ediciones viejas, caso (b), `backend/src/equipos/application/use-cases/editar-componente.integration.spec.ts`: entidad leída antes de una baja de equipo o de un retiro individual ⇒ `ComponenteDadoDeBajaError` y el componente sigue retirado con sus `baja_*` y `deletedAt` intactos; edición normal de un componente activo escribe solo los tres campos. (Req: R8, R11)
- [x] 5.6 Testigos **T7** (el externo retiene LE `FOR NO KEY UPDATE`; `RetirarComponente` espera; sin `RowShareLock` en `insumos` ni advisory) y **T8** (idem; `CrearTicketSoporte` espera; sin advisory de numeración ni `RowExclusiveLock` en `tickets`) en `baja-equipo.orden-de-locks.integration.spec.ts`. (Req: R10, R15)
- [x] 5.7 Fakes de `IComponenteEquipoRepository` en los specs que lo implementan: agregar `editar`; sin casts.
- [x] 5.8 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: Ticket nuevo sobre equipo dado de baja; ediciones viejas de componente (ADR-5,
sin escenario propio, protege R8).
**PR boundary**: ~400 líneas, base wu04. Corte si pasa: retirar y ticket / CAS de `EditarComponente`.
**Ayuda**: sin deuda.
Commit sugerido: `feat(equipos): ticket y retiro toman el lock del equipo; editar componente con CAS`.

## WU-6 — Insumos: clasificador, `serialesExistentes` y `devolverDesdeEquipo`

**Branch**: `feat/baja-equipo-completo-wu06` · **Base**: wu05

- [ ] 6.1 Crear `backend/src/insumos/application/services/clasificar-pieza-devuelta.ts`: `CAUSAS_PIEZA_NO_DEVOLVIBLE` (`INSUMO_BORRADO`, `FAMILIA_NO_REPUESTO`, `SERIAL_REQUERIDO`, `SERIAL_INVALIDO`, `SERIAL_REPETIDO`, `SERIAL_DUPLICADO`) y `clasificarPiezaDevuelta()` pura (sin I/O). Spec `clasificar-pieza-devuelta.spec.ts`: cada causa; legado con serial válido sin causa; insumo deshabilitado y familia no vigente **se admiten**; insumo borrado en `DESCARTE` no aplica. (Req: R6, R7)
- [ ] 6.2 `backend/src/insumos/domain/ports/i-unidad-insumo.repository.ts` + `prisma-unidad-insumo.repository.ts`: `serialesExistentes(insumoId, normalizados): Promise<Set<string>>` (sin lock propio; autoritativo bajo L2 del llamador). Integración `prisma-unidad-insumo.repository.seriales-existentes.integration.spec.ts`: devuelve los existentes normalizados, ignora otros insumos, lista vacía sin consulta. (Req: R7)
- [ ] 6.3 `operaciones-unidad-insumo.service.ts`: tipo `LegadoEnEquipo` y `devolverDesdeEquipo(conUnidad, legados, o, causasPrevias?)` (ADR-3 paso 3): fotos sin lock; `bloquearInsumos` de la unión ordenada (L1 repetido sin esperar, luego L2 de todos); bajo L2 `serialesExistentes` ⇒ causa `SERIAL_DUPLICADO`; **unir** con `causasPrevias` y, si no está vacía, `DevolucionConPiezasProblematicasError` con todas **antes de L3 y sin escribir**; L3 por id; valida transiciones (cada unidad `INSTALADA` **en el equipo dado de baja**); escribe `RETIRO_A_DEPOSITO` e `INGRESO` con `equipoId`. `devolverAlDeposito` delega con `legados = []`. P2002 residual ⇒ causa `SERIAL_DUPLICADO` cuando el serial identifica la pieza. (Req: R2, R6, R7, R15)
- [ ] 6.4 Spec `operaciones-unidad-insumo.service.spec.ts`, bloques de `:786-855` y `:893`: lote mixto (unidades + legados); varias unidades en una transacción; una unidad que ya no está `INSTALADA` rechaza el lote sin cambios; unidad `INSTALADA` en **otro** equipo rechaza el lote; `descartarInstaladas` con varias unidades (`DESCARTADA` + evento `DESCARTE`, sin movimientos); causas previas + `SERIAL_DUPLICADO` unidas **sin escribir**; orden de locks L1 → L2 → L3 por id; `devolverAlDeposito` conserva su comportamiento (regresión). (Req: R2, R3, R6, R15)
- [ ] 6.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application/services src/insumos/infrastructure/persistence/prisma && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: delta `unidades-insumo-serie` (4): Varias unidades en una transacción; Falla en una
del lote; Descartar varias unidades en una transacción; Unidad instalada en otro equipo.
**PR boundary**: ~410 líneas, base wu05. Corte si pasa: 6.1 + 6.2 / 6.3 + 6.4.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): devolucion en lote desde un equipo con causas unidas`.

## WU-7 — Insumos: `registrarDevolucionesDeEquipo` y `diagnosticarDevolucionesDeEquipo`

**Branch**: `feat/baja-equipo-completo-wu07` · **Base**: wu06

- [ ] 7.1 `registrar-entrada-insumo.use-case.ts`: `registrarDevolucionesDeEquipo({ equipoId, usuarioId, motivo, piezas })` dentro de la transacción del llamador (ADR-3): L1 de **todos** los insumos distintos ordenados por id (también los `NINGUNO`); `clasificarPiezaDevuelta` bajo L1 aplicando `validarInsumoElegible` sin `exigirHabilitado` y `validarCondicionAdmitida(USADO, { admitirFamiliaNoVigente: true })`; junta **todas** las causas en `causasPrevias` sin cortar; `operaciones.devolverDesdeEquipo(...)`; ENTRADA `USADO` de cantidad 1 por pieza `NINGUNO` con `asentar` (sin L2, sin lock nuevo). Devuelve `Map<componenteId, movimientoId>`. (Req: R2, R6, R7)
- [ ] 7.2 Mismo archivo: `diagnosticarDevolucionesDeEquipo(piezas)` sin transacción ni locks: `findById` del insumo (el `seguimiento` sale de la entidad) y de la familia, `unidadRepo.serialesExistentes` sin lock, `clasificarPiezaDevuelta`; devuelve las causas de **todas** las piezas. (Req: R6)
- [ ] 7.3 Spec unitario `registrar-entrada-insumo.use-case.devoluciones-de-equipo.spec.ts` con fakes `Pick` tipados: dos `NINGUNO` del mismo insumo ⇒ dos ENTRADAs con su `equipoId` y leyenda; insumo deshabilitado y familia no vigente admitidos; insumo borrado ⇒ causa; causas juntas (`INSUMO_BORRADO` + `SERIAL_REQUERIDO` + `FAMILIA_NO_REPUESTO`) sin cortar; orden de locks (L1 de todos antes de cualquier L2); sin L2 para `NINGUNO`; `diagnosticar…` no pide transacción. (Req: R2, R6, R7)
- [ ] 7.4 Integración `backend/src/insumos/application/use-cases/registrar-devoluciones-de-equipo.integration.spec.ts` (tenant efímero; invariante con `insumos/testing/invariante-serie.ts` (read-only) tras cada caso): dos unidades `INSTALADA` + un `NINGUNO` + un insumo deshabilitado vuelven a `EN_DEPOSITO` `USADO` con evento y ENTRADA; una pieza con insumo borrado ⇒ `Result.fail` y **ningún** cambio (conteos de movimientos y eventos, unidades `INSTALADA`); varias unidades en una transacción. (Req: R2, R6)
- [ ] 7.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: delta de unidades (Varias unidades en una transacción, a nivel de insumos);
Insumo deshabilitado (a nivel de insumos); causas juntas (parte de insumos).
**PR boundary**: ~380 líneas, base wu06. Corte si pasa: unit / integración.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): registrar devoluciones de un equipo en una sola transaccion`.

## WU-8 — `DarDeBajaEquipoUseCase`: atomicidad, leyenda y wiring

**Branch**: `feat/baja-equipo-completo-wu08` · **Base**: wu07

- [ ] 8.1 Crear `backend/src/equipos/application/use-cases/dar-de-baja-equipo.use-case.ts` (`FalloBajaDeEquipo extends Error { errorDeDominio }` interna): **fuera** de la transacción: equipo existe (`EquipoNoEncontradoError`), `!activo` ⇒ `EquipoDadoDeBajaError`, categoría válida, `OTRA` con texto recortado, leyenda ≤ 500 (`MotivoBajaEquipoInvalidoError` con `largoMaximo`), `diagnosticarDevolucionesDeEquipo` con `STOCK_USADO` ⇒ `BajaEquipoConPiezasProblematicasError` con **todas** las piezas. (Req: R1, R4, R5, R6, R9)
- [ ] 8.2 Mismo use case, **dentro** de `txRunner.run()` en el orden de ADR-3: (1) `bloquearParaModificar` + recheck; (2) releer componentes activos, conjunto distinto ⇒ `EquipoModificadoDuranteLaBajaError`; (3A) `registrarDevolucionesDeEquipo` o (3B) `descartarInstaladas(itemsConUnidad ordenados por unidadId, …)`; (4) componentes **ordenados por id**: `componente.retirar({ destino, motivo: leyenda, usuarioId, bajaMovimientoId })` + CAS `componenteRepo.retirar()`; (5) `equipo.darDeBaja(...)` + `registrarBaja()`. Todo `Result.fail` interno se **lanza** como `FalloBajaDeEquipo` (y `FalloOperacionDeUnidad`) y se desenvuelve afuera como `Result.fail`; ninguna rama devuelve `fail` tras una escritura. Cero piezas ⇒ pasos 3 y 4 no hacen nada. (Req: R2, R3, R4, R6, R8, R9, R15)
- [ ] 8.3 `backend/src/equipos/equipos.module.ts`: registrar el use case con sus dependencias (equipos repos, `RegistrarEntradaInsumoUseCase`, `OperacionesUnidadInsumo`, `txRunner`, `ahora`); verificar con el spec de wiring existente o con un test de resolución del módulo.
- [ ] 8.4 Spec `dar-de-baja-equipo.use-case.spec.ts` (fakes tipados, `unstubbed()`, `vi.spyOn`): orden de llamadas LE → stock → L4 por id → equipo; mismo destino en todas las piezas; la misma leyenda en `bajaMotivo` y en el motivo pasado a stock; `Result.fail` interno ⇒ excepción ⇒ `fail` afuera sin llamar a `registrarBaja`; conjunto cambiado ⇒ `EquipoModificadoDuranteLaBajaError`; cero piezas; equipo ya dado de baja y borrado lógico; `OTRA` sin texto o con espacios; categoría inválida; 500 y 501 con `largoMaximo`; `DESCARTE` no exige seriales ni toca stock; seriales por `componenteId`; `registrarBaja` `false` ⇒ `fail` y rollback. (Req: R1 a R9)
- [ ] 8.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/application/use-cases && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: R1, R4, R5, R6, R8 y R9 a nivel unitario (el detalle con Postgres llega en WU-9 y
WU-10).
**PR boundary**: ~400 líneas, base wu07. **No separar** use case y spec: código con su test.
Corte solo si pasa de 400: errores de borde (8.4 últimos casos) a WU-9.
**Ayuda**: sin deuda (sin ruta ni UI).
Commit sugerido: `feat(equipos): caso de uso de baja de equipo completo, atomico y con leyenda unica`.

## WU-9 — Integración de la baja: opción A, opción B, leyenda y registro

**Branch**: `feat/baja-equipo-completo-wu09` · **Base**: wu08

- [ ] 9.1 Helper `backend/src/equipos/testing/baja-equipo.fixtures.ts`: arma el tenant efímero con equipo, insumos `NINGUNO` y `SERIE`, unidades `INSTALADA` y componentes (con y sin unidad, legados); expone el invariante `SERIE` (`insumos/testing/invariante-serie.ts` (read-only)) para llamarlo tras cada baja. (Req: R2, R3)
- [ ] 9.2 Integración `dar-de-baja-equipo.opcion-a.integration.spec.ts` (`usarLockMasterTest()` si trunca master; higiene: filas → `app.close()` → `dropDatabase`): `STOCK_USADO` con un `NINGUNO` (saldo USADO 0→1, ENTRADA con `equipoId` y leyenda, componente enlazado a esa ENTRADA); dos componentes del mismo insumo `NINGUNO` (dos ENTRADAs, saldo +2); unidad "S1" `EN_DEPOSITO` `USADO` sin equipo con serial, evento `RETIRO_A_DEPOSITO`, ENTRADA que referencia "S1"; insumo deshabilitado; categoría `ROTURA` sin texto completa. (Req: R2, R5)
- [ ] 9.3 Integración `dar-de-baja-equipo.opcion-b.integration.spec.ts`: `DESCARTE` con tres componentes (todos con `bajaDestino = DESCARTE`, ninguno con otro); `NINGUNO` (saldo USADO 2) + unidad "S1" ⇒ "S1" `DESCARTADA` con evento `DESCARTE` y leyenda, cero movimientos, saldo en 2; saldo NUEVO 3/USADO 0 sin asiento negativo; insumo con baja lógica no bloquea; legado `SERIE` sin serial se descarta sin crear unidad. (Req: R1, R3, R7)
- [ ] 9.4 Integración de leyenda `dar-de-baja-equipo.leyenda.integration.spec.ts`: `baja_motivo` de los componentes = `movimientos_insumo.motivo` = `eventos_unidad_insumo.motivo` = `Baja del equipo «PC-Caja-3» — Donación: a la escuela N° 12`; sin texto = `Baja del equipo «PC-1» — Vejez`; texto de exactamente N caracteres ⇒ leyenda de 500 y baja completa; N+1 ⇒ `MotivoBajaEquipoInvalidoError` con `largoMaximo = N` y **nada** cambia. (Req: R4)
- [ ] 9.5 Integración `dar-de-baja-equipo.registro.integration.spec.ts`: el equipo queda `activo = false` con destino, categoría, texto "no enciende", fecha y usuario "u1"; con dos unidades `INSTALADA`, tras cualquiera de los dos destinos no queda ninguna `INSTALADA` con ese `equipoId` ni componente activo; equipo sin piezas (o con todas retiradas) ⇒ solo cambia el equipo, sin movimientos ni eventos; segunda baja ⇒ `EquipoDadoDeBajaError` y los datos originales no cambian; equipo con borrado lógico ⇒ no encontrado. (Req: R8, R9)
- [ ] 9.6 Regresión R16: test (o referencia verificada con `rg -n "INSTALADA" backend/src/insumos --glob "*cambiar-seguimiento*"`) de que cambiar un insumo `SERIE` con la unidad "S1" `INSTALADA` a `NINGUNO` se rechaza; si el spec existente ya lo cubre, anotar su ruta y nombre en `apply-progress.md`; si no, agregarlo en `backend/src/insumos/application/use-cases/cambiar-seguimiento-insumo.integration.spec.ts`. (Req: R16)
- [ ] 9.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos src/insumos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: R2 (4), R3 (3), R4 (4, tres lugares), R8 (2 de integración), R9 (3), R16 (1), R1
(Todas las piezas con el mismo destino).
**PR boundary**: ~400 líneas (casi solo tests), base wu08. Corte si pasa: opción A / opción B.
**Ayuda**: sin deuda.
Commit sugerido: `test(equipos): integracion de la baja de equipo completo con Postgres real`.

## WU-10 — Integración: atomicidad, legados, causas juntas y testigos T1–T3, T6

**Branch**: `feat/baja-equipo-completo-wu10` · **Base**: wu09

- [ ] 10.1 Integración `dar-de-baja-equipo.atomicidad.integration.spec.ts` (reusa 9.1): equipo con un `NINGUNO` válido, una unidad "S1" y una pieza de insumo borrado ⇒ error que nombra el componente; el equipo sigue `activo = true`, los tres componentes activos, "S1" `INSTALADA`, **ningún** movimiento ni evento nuevo. (Req: R6, R7)
- [ ] 10.2 Mismo spec: dos insumos borrados + un legado `SERIE` sin serial ⇒ el error lista **los tres** componentes con su causa. (Req: R6)
- [ ] 10.3 Mismo spec, "Falla al marcar el equipo": repo de equipos envuelto con `vi.spyOn` que hace devolver `false` a `registrarBaja` ⇒ revierte ENTRADAs, cambios de unidad, eventos y marcas de componente; conteos iguales a los previos. (Req: R6)
- [ ] 10.4 Mismo spec, "fallo después de escribir": un serial legado que ya existe y **saltea** el diagnóstico de afuera (repo espía de `serialesExistentes` afuera) ⇒ falla bajo L2, antes de L3, y revierte la devolución de unidades. (Req: R6, R7)
- [ ] 10.5 Integración `dar-de-baja-equipo.legados.integration.spec.ts`: legado `SERIE` con serial "LEG-1" crea la unidad `EN_DEPOSITO` `USADO` con su ENTRADA y retira el componente con `STOCK_USADO`; sin serial ⇒ rechaza listando serial requerido; "x1" y "X 1" ⇒ ambos por serial duplicado y ninguna unidad creada; serial "a1" con "A1" ya existente ⇒ lista el componente y nada cambia; ninguna unidad en serie pendiente; insumo borrado frena `STOCK_USADO` e informa `INSUMO_BORRADO`. (Req: R7)
- [ ] 10.6 Causas juntas (R6): un componente con insumo borrado y un legado con serial ya existente ⇒ el 422 lista `INSUMO_BORRADO` y `SERIAL_DUPLICADO`, **tanto** por el diagnóstico de afuera **como** por el camino transaccional (diagnóstico salteado con repo espía). (Req: R6, R7)
- [ ] 10.7 Testigos de locks en `baja-equipo.orden-de-locks.integration.spec.ts` (patrón determinista, sin carreras de dos clientes): **T1** (externo con LE `FOR SHARE`: la baja espera; sin `RowShareLock` en `insumos`, sin advisory); **T2** (externo con advisory `insumo-stock:<X>`: la baja ya tiene `RowShareLock` en `equipos_informaticos` e `insumos`, **no** `RowExclusiveLock` en `componentes_equipo`/`movimientos_insumo`/`unidades_insumo`; `FOR UPDATE NOWAIT` sobre los componentes tiene éxito); **T3** (externo con `FOR NO KEY UPDATE` de una unidad: la baja ya tiene el advisory de sus insumos, ninguna ENTRADA `NINGUNO` antes de L3); **T6** (la baja retenida en L2 con LE tomado; un segundo cliente hace `INSERT INTO movimientos_insumo (… equipo_id …)` del mismo equipo con `lock_timeout` corto y **no** se bloquea: fija `FOR NO KEY UPDATE` frente a `FOR UPDATE`). (Req: R15)
- [ ] 10.8 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: R6 (3), R7 (6), testigos de orden de R15.
**PR boundary**: ~420 líneas (solo tests), base wu09. Corte si pasa: 10.1 a 10.6 / 10.7.
**Ayuda**: sin deuda.
Commit sugerido: `test(equipos): atomicidad, seriales legados y orden de locks de la baja`.

## WU-11 — HTTP: resumen y baja, tickets abiertos, errores y DTO

**Branch**: `feat/baja-equipo-completo-wu11` · **Base**: wu10

- [ ] 11.1 Puerto `backend/src/equipos/domain/ports/i-ticket-soporte.repository.ts`: `contarAbiertosPorEquipo(equipoId, estadosTerminales: readonly string[]): Promise<number>`; `prisma-ticket-soporte.repository.ts`: `ticketSoporte.count({ where: { equipoId, deletedAt: null, ticket: { deletedAt: null, estado: { codigo: { notIn } } } } })`. Integración: `RESUELTO` cuenta abierto, `CERRADO` y `CANCELADO` no, tickets borrados no. Fakes del puerto agregan el método. (Req: R10)
- [ ] 11.2 Crear `backend/src/equipos/application/use-cases/resumen-baja-equipo.use-case.ts` (sin locks, fuera de transacción): `{ equipoId, nombre, ticketsAbiertos, largoMaximoTexto: Record<Categoria, number>, piezas: [{ componenteId, descripcion, insumoId, insumoNombre, unidadId, numeroSerie, seguimiento, requiereSerial, serialSugerido, causaQueImpideDevolver }] }`; `serialSugerido` = serial de texto válido (recortado, 1–255) o `null`; pasa `[...ESTADOS_TERMINALES]`. Spec unitario: 2 abiertos + 1 cerrado ⇒ 2; `causaQueImpideDevolver` con `clasificarPiezaDevuelta`; `largoMaximoTexto` por categoría coincide con `largoMaximoTextoBaja`; equipo ya dado de baja ⇒ `EquipoDadoDeBajaError`. (Req: R7, R10, R14)
- [ ] 11.3 `backend/src/equipos/interface/dtos/equipos.dto.ts`: `DarDeBajaEquipoHttpDto { destino, categoria, motivo?, seriales? }` (`@IsIn` sobre las constantes del dominio, `@MaxLength(500)`, `@ArrayMaxSize(200)`, `componenteId` uuid sin repetidos ⇒ 400); `EquipoDetalleResponseDto`/`EquipoResponseDto` suman `baja`. Ampliar `equipos.dto.spec.ts`: destino "REGALO" o ausente ⇒ 400; categoría ausente o "OTROS" ⇒ 400; motivo de 501 caracteres crudos ⇒ 400; `seriales` con `componenteId` repetido ⇒ 400; clave `destino` por pieza **descartada** por el `ValidationPipe` (`whitelist`); pedido con destinos por pieza y sin destino de primer nivel ⇒ 400. (Req: R1, R5, R17)
- [ ] 11.4 `equipos.controller.ts` + `equipos.module.ts`: `POST /equipos/:id/baja` (responde 200 con `EquipoDetalleResponseDto`) y `GET /equipos/:id/baja/resumen`, ambos `@RequiereAcciones('EQUIPOS:BORRADO')`, sin chequeos inline; mapeo explícito en `toHttpException`: `EquipoDadoDeBajaError` 422, `EquipoConComponentesActivosError` 422 con `cantidad`, `MotivoBajaEquipoInvalidoError` 422 con `largoMaximo`, `BajaEquipoConPiezasProblematicasError` 422 con cuerpo `{ statusCode, message, code: 'BAJA_EQUIPO_PIEZAS_PROBLEMATICAS', piezas: [{ componenteId, insumoId, causa }] }` (objeto a `UnprocessableEntityException`), `EquipoModificadoDuranteLaBajaError` 409. (Req: R6, R12)
- [ ] 11.5 Spec del controller `equipos.controller.spec.ts`: reflexión confirma `EQUIPOS:BORRADO` en los dos handlers nuevos y que `GET /equipos` conserva `EQUIPOS:LECTURA`; cada error nuevo mapea a su código y cuerpo; el 422 de piezas lleva `code` y `piezas`. (Req: R12)
- [ ] 11.6 Ayuda: `backend/ayuda/permisos-y-roles.md:156-168`: "Hay tres trabajos que mueven el stock" pasa a **cuatro** y se agrega la baja completa con `BORRADO` de **Equipos** (devuelve o descarta todas las piezas); ajustar "Fuera de esos tres casos". Verificar con `rg -n "tres trabajos|esos tres" backend/ayuda`. (Req: R12)
- [ ] 11.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: Destino inválido (DTO); Categoría ausente o inválida (DTO); Destino solo por pieza
(DTO); Aviso con tickets abiertos (resumen); Sin permiso (reflexión).
**PR boundary**: ~400 líneas, base wu10 (la cadena es lineal; el código depende de WU-8). Corte si
pasa: resumen + tickets abiertos / baja + errores + Ayuda.
**Ayuda**: `permisos-y-roles.md` corregida en este commit; deuda: artículo del flujo de baja.
Commit sugerido: `feat(equipos): endpoints de baja y resumen de baja de equipo completo`.

## WU-12 — e2e HTTP de la baja

**Branch**: `feat/baja-equipo-completo-wu12` · **Base**: wu11

- [ ] 12.1 e2e `backend/src/equipos/interface/controllers/dar-de-baja-equipo.e2e.spec.ts` (`usarLockMasterTest()` antes del `describe`; tenant efímero; higiene: filas → `app.close()` → `dropDatabase`): 403 con `EQUIPOS:LECTURA` sin `BORRADO` y nada cambia; `BORRADO` **sin ningún permiso de INSUMOS** completa `STOCK_USADO` y registra las ENTRADAs; destino "REGALO" ⇒ 400 y nada cambia; categoría ausente u "OTROS" ⇒ 400; `OTRA` sin texto o con espacios ⇒ 422; `OTRA` con "reciclado para repuestos" ⇒ 200 con la leyenda; texto N+1 ⇒ 422 con `largoMaximo`; 422 con `piezas` (`code`, `componenteId`, `insumoId`, `causa`) y nada cambia; `GET …/baja/resumen` con `ticketsAbiertos` y `largoMaximoTexto`; destino por pieza ignorado (ambos `DESCARTE`) y solo por pieza ⇒ 400; baja con 2 tickets abiertos ⇒ 200 y los tickets siguen abiertos referenciando al equipo; segunda baja ⇒ 422 con datos originales intactos; equipo con borrado lógico ⇒ 404; la ficha de un equipo dado de baja responde con componentes retirados, historial y `baja`; ticket nuevo sobre equipo dado de baja ⇒ rechazo. (Req: R1, R4, R5, R7, R9, R10, R11, R12, R17)
- [ ] 12.2 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/interface && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: R12 (2), R17 (2), R9 (2 por HTTP), R10 (Baja con tickets abiertos), R11 (Ficha visible),
R5 (OTRA con texto), R4 (501 por HTTP).
**PR boundary**: ~330 líneas, base wu11. Sin corte previsto.
**Ayuda**: sin deuda.
Commit sugerido: `test(equipos): e2e de la baja de equipo completo`.

## WU-13 — Concurrencia de resultado (a)–(e)

**Branch**: `feat/baja-equipo-completo-wu13` · **Base**: wu12

- [ ] 13.1 Crear `backend/src/equipos/application/use-cases/baja-equipo.concurrencia.integration.spec.ts` con un helper `repetir(10, caso)`: cada iteración sobre un tenant efímero limpio; afirma **sin `40P01`**, sin error de sistema, y el invariante `SERIE` (`insumos/testing/invariante-serie.ts` (read-only)) en verde. (Req: R15)
- [ ] 13.2 Caso **(a)**: baja `STOCK_USADO` de "E1" (componentes de los insumos `SERIE` X e Y) contra `InstalarComponenteDesdeDeposito` en "E2" de unidades de Y y de X en orden inverso: ambas terminan; por insumo las unidades `EN_DEPOSITO` por condición igualan el saldo del libro. (Req: R15)
- [ ] 13.3 Caso **(b)**: baja de "E1" contra `InstalarComponenteDesdeDeposito` **en E1**, una vez con unidad y otra con insumo `NINGUNO`: o la instalación comitea antes y la baja da 409 o retira la pieza, o la instalación da `EquipoDadoDeBajaError`; nunca queda un componente activo ni una unidad `INSTALADA` en el equipo dado de baja. (Req: R15, R8)
- [ ] 13.4 Caso **(c)**: baja contra alta sin descuento sobre el mismo equipo; mismo resultado que (b). (Req: R15)
- [ ] 13.5 Caso **(d)**: dos bajas del mismo equipo a la vez: exactamente una se completa, la otra da `EquipoDadoDeBajaError` y no hay movimientos duplicados. (Req: R15)
- [ ] 13.6 Caso **(e)**: baja contra `CrearTicketSoporte` del mismo equipo: o el ticket existe y la baja lo cuenta como abierto (resumen) y lo conserva, o el ticket se rechaza (`EquipoInvalidoError`). (Req: R10, R15)
- [ ] 13.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/application/use-cases/baja-equipo.concurrencia && pnpm test` y `node scripts/check-casts-en-specs.mjs`. Correr el spec **tres veces seguidas** para descartar flakiness y declarar el resultado en el PR.

**Escenarios**: R15 (3): Baja contra instalación sobre los mismos insumos; Dos bajas simultáneas
del mismo equipo; Baja contra agregar componente. Más R10 (ticket vs. baja).
**PR boundary**: ~400 líneas (solo tests), base wu12. Corte si pasa: (a)(b) / (c)(d)(e).
**Ayuda**: sin deuda.
Commit sugerido: `test(equipos): concurrencia de la baja contra instalaciones, altas y tickets`.

## WU-14 — Lista y exportación con `incluirBajas`; `baja` en el DTO

**Branch**: `feat/baja-equipo-completo-wu14` · **Base**: wu13

- [ ] 14.1 `i-equipo-informatico.repository.ts` + `prisma-equipo-informatico.repository.ts`: `findAllIncluyendoDadosDeBaja()` (vigentes y dados de baja, sin borrados lógicos). Fakes del puerto agregan el método. (Req: R11)
- [ ] 14.2 `listar-equipos.use-case.ts`: `incluirDadosDeBaja` (default `false`); `exportar-equipos.use-case.ts`: mismo filtro, columna de estado con "Baja" para el dado de baja, y actualizar su JSDoc ("sin parámetros" ya no vale). Specs unitarios: `listar-equipos.use-case.spec.ts` y `exportar-equipos.use-case.spec.ts` (filtro por defecto oculta; desactivado muestra ambos con "Baja"). (Req: R11)
- [ ] 14.3 `equipos.controller.ts` + DTO de query: `GET /equipos?incluirBajas=` y `GET /equipos/export?incluirBajas=` (`parsearBooleanQuery`, default `false`), ambos con `EQUIPOS:LECTURA`; los selectores de tickets, preventivo y movimientos siguen recibiendo solo vigentes. `EquipoResponseDto` incluye `baja`. (Req: R11)
- [ ] 14.4 e2e `backend/src/equipos/interface/controllers/equipos-incluir-bajas.e2e.spec.ts` (`usarLockMasterTest()` antes del `describe`): lista por defecto solo con el vigente; `incluirBajas=true` con ambos y `baja` en el dado de baja; exportación por defecto y con el filtro, "Baja" en la columna de estado; `PATCH /equipos/:id` sobre equipo dado de baja ⇒ 422 y el equipo no cambia; `POST /equipos/:id/componentes` con y sin descuento ⇒ 422 sin componente ni stock; reactivar un componente retirado ⇒ 422. (Req: R8, R11)
- [ ] 14.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos && pnpm test` y `node scripts/check-casts-en-specs.mjs`.

**Escenarios**: Oculto por defecto; Visible con etiqueta (datos); Exportación con el filtro;
Editar un equipo dado de baja; Agregar un componente; Reactivar un componente (HTTP); Sin
reactivación (HTTP).
**PR boundary**: ~380 líneas, base wu13. Corte si pasa: lista / exportación.
**Ayuda**: sin deuda en este WU (la Ayuda del listado se corrige en WU-15, cuando el filtro es visible
para el usuario).
Commit sugerido: `feat(equipos): listado y exportacion con filtro de equipos dados de baja`.

## WU-15 — Frontend: filtro de la lista y Ayuda del listado

**Branch**: `feat/baja-equipo-completo-wu15` · **Base**: wu14

- [ ] 15.1 `frontend/src/features/equipos/types.ts` y `schemas.ts`: campo `baja` (`destino`, `categoria`, `motivo`, `fecha`, `usuarioId` o `null`) en el equipo, y `CATEGORIAS_BAJA_EQUIPO` como espejo del dominio (la autoridad es el DTO del backend). (Req: R8, R11)
- [ ] 15.2 `frontend/src/features/equipos/hooks/use-equipos.ts`: `useEquipos(enabled, { incluirBajas })` con clave `["equipos", { incluirBajas }]` (la invalidación por `["equipos"]` sigue cubriéndola). (Req: R11)
- [ ] 15.3 `frontend/src/features/equipos/components/equipos-list-view.tsx`: casilla "Mostrar equipos dados de baja", **apagada por defecto**; etiqueta "Baja" en las filas dadas de baja; `ExportarCsvButton` recibe el mismo parámetro; actualizar el comentario de `:98-102` ("sin parámetros"). (Req: R11)
- [ ] 15.4 Tests Vitest + MSW `equipos-list-view.test.tsx`: por defecto solo el vigente (la petición no manda `incluirBajas`); al tildar la casilla se piden ambos y el dado de baja lleva "Baja"; el botón de exportación pide el mismo parámetro que la lista; la invalidación por `["equipos"]` refresca ambas claves. (Req: R11)
- [ ] 15.5 Ayuda `backend/ayuda/equipos-listado.md`: reescribir la sección "Sin filtros" (el listado ya tiene el filtro "Mostrar equipos dados de baja", apagado por defecto) y la exportación ("Como el listado no tiene filtros…" ⇒ la exportación sigue el filtro). Verificar con `rg -n -i "sin filtros|no tiene filtros|dados de baja" backend/ayuda/equipos-listado.md`; `mantenimiento-preventivo.md` queda como está (revisado: sigue verdadero). (Req: R11)
- [ ] 15.6 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`.

**Escenarios**: Oculto por defecto; Visible con etiqueta; Exportación con el filtro (frontend).
**PR boundary**: ~330 líneas, base wu14. Sin corte previsto. Revert: casilla, hook y botón; la Ayuda
del listado vuelve a su texto (que quedaría falso: revertir ambos juntos).
**Ayuda**: `equipos-listado.md` corregida en este commit; deuda: artículo del flujo de baja.
Commit sugerido: `feat(equipos): filtro Mostrar equipos dados de baja en la lista`.

## WU-16 — Frontend: diálogo de baja

**Branch**: `feat/baja-equipo-completo-wu16` · **Base**: wu15

- [ ] 16.1 `frontend/src/features/equipos/schemas.ts` y `types.ts`: schemas Zod del body de la baja, del resumen (`GET …/baja/resumen`) y del 422 de piezas (`ApiError.raw.piezas`, sin tocar `apiFetch`). (Req: R6, R14)
- [ ] 16.2 `frontend/src/features/equipos/hooks/use-equipo-mutations.ts` y un hook `use-resumen-baja-equipo.ts`: mutación `POST /equipos/:id/baja` que invalida `["equipos"]` y el detalle; consulta del resumen con `staleTime: 0`. (Req: R10, R14)
- [ ] 16.3 Crear `frontend/src/features/equipos/components/equipo-baja-form.tsx` (presentational): radios de destino ("Devolver todas las piezas al stock (como usadas)" / "Descartar todas las piezas"); select de categoría; textarea con contador `largoMaximoTexto[categoria]`, obligatoria con "Otra"; inputs de serial solo para `requiereSerial` y `STOCK_USADO`, precargados con `serialSugerido`; con `DESCARTE`, campo "Escribí el nombre del equipo para confirmar". (Req: R5, R7, R14)
- [ ] 16.4 Crear `frontend/src/features/equipos/components/equipo-baja-dialog.tsx` (container): resumen con cantidad de piezas, destino de cada una y el aviso "El equipo tiene N tickets abiertos; van a seguir abiertos y apuntando a este equipo."; piezas con `causaQueImpideDevolver` mostradas y confirmar deshabilitado en `STOCK_USADO`; confirmación por nombre habilitada con `valor.trim() === nombre` solo con `DESCARTE`; 422 de piezas listadas con su causa; 409 con aviso y refetch del resumen (sin reintento automático). (Req: R6, R10, R14)
- [ ] 16.5 `equipo-detail-view.tsx`: el botón "Dar de baja" abre el diálogo nuevo; el borrado conserva "Eliminar equipo (cargado por error)" (WU-3); ningún otro botón lleva "Dar de baja". (Req: R13, R14)
- [ ] 16.6 Tests Vitest + Testing Library + MSW `equipo-baja-dialog.test.tsx` y `equipo-detail-view.test.tsx`: resumen "PC-1" con 4 piezas y 1 ticket abierto ⇒ muestra 4, "devolver al stock" y 1 ticket; `STOCK_USADO` confirma con un solo botón y envía la baja; con `DESCARTE` el botón sigue deshabilitado con "PC-2" y se habilita con "PC-1" (y con espacios en los extremos); serial precargado desde `serialSugerido`; piezas del 422 listadas; 409 refresca el resumen; contador por categoría; botón renombrado y "Dar de baja" único. (Req: R13, R14)
- [ ] 16.7 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`.

**Escenarios**: Resumen; Devolver confirma con un botón; Descartar exige el nombre; Botón
renombrado.
**PR boundary**: ~420 líneas, base wu15. Corte si pasa: formulario + schemas / diálogo + cableado.
**Ayuda**: Ayuda pendiente: artículo nuevo sobre el flujo de baja de equipo (destinos, categoría y
motivo, serial de piezas legadas, confirmación por nombre) y el botón renombrado; anotar en commit y
PR (pausa vigente). Sin artículo falso.
Commit sugerido: `feat(equipos): dialogo de baja de equipo completo`.

## WU-17 — Frontend: ficha de solo lectura y cierre del roadmap

**Branch**: `feat/baja-equipo-completo-wu17` · **Base**: wu16

- [ ] 17.1 `equipo-detail-view.tsx`: con `activo = false`, banner con fecha, categoría, motivo y destino de la baja; se ocultan agregar, editar, dar de baja y eliminar. (Req: R8, R11)
- [ ] 17.2 `frontend/src/features/equipos/components/equipo-componentes-section.tsx`: prop `equipoActivo`; con `false` se ocultan retirar y reactivar (la fila retirada sigue mostrando el destino del retiro). (Req: R11)
- [ ] 17.3 Tests `equipo-detail-view.test.tsx` y `equipo-componentes-section.test.tsx`: ficha de equipo dado de baja con banner y sin acciones; vigente con todas; los componentes retirados y su historial siguen visibles; **regresión del delta** "Interfaz de reactivar": un componente retirado con `STOCK_USADO` no ofrece reactivar y la fila indica el destino. (Req: R8, R11)
- [ ] 17.4 Cierre del roadmap en `docs/roadmap-comercial.md`: la viñeta "Baja de equipo completo" de "Decisiones de producto ya cerradas" pasa a **Cumplida** (evidencia: ciclo `baja-equipo-completo`, rutas `POST /equipos/:id/baja` y `GET /equipos/:id/baja/resumen`, diálogo de baja) o **Desviación** con su motivo si apply o verify encontraron algo no implementado; declarar también que las exclusiones de R17 son decisión y no desviación.
- [ ] 17.5 Correr `node scripts/check-roadmap-fresco.mjs` y confirmar que pasa.
- [ ] 17.6 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/equipos && pnpm test`, más `node scripts/check-roadmap-fresco.mjs`.

**Escenarios**: Ficha visible (frontend); Interfaz de reactivar (regresión del delta); Sin
reactivación (UI).
**PR boundary**: ~300 líneas, base wu16. Revert: banner y prop `equipoActivo`; el roadmap vuelve a
"Pendiente".
**Ayuda**: Ayuda pendiente: la ficha de un equipo dado de baja (banner, acciones ocultas); anotar en
commit y PR (pausa vigente).
Commit sugerido: `feat(equipos): ficha de solo lectura del equipo dado de baja y cierre en el roadmap`.

---

## Mapa escenario → tarea

Cada escenario de las tres specs (57 + 4 + 9 = **70**) con la tarea que lo cubre y el test
nombrado (título `it()` o `test()` a usar). La tarea primaria va primero.

### `equipos-baja-completa` (57)

| Req | Escenario | Tarea(s) | Test nombrado |
|---|---|---|---|
| R1 | Destino inválido | 11.3, 12.1, 8.4 | `rechaza destino "REGALO" con 400` (dto spec); `POST baja con destino REGALO responde 400 y nada cambia` (e2e) |
| R1 | Todas las piezas con el mismo destino | 9.3, 8.4 | `DESCARTE retira los tres componentes con bajaDestino DESCARTE` |
| R2 | Insumo NINGUNO | 9.2 | `STOCK_USADO registra una ENTRADA USADO con equipoId y leyenda y enlaza el componente` |
| R2 | Dos componentes del mismo insumo NINGUNO | 9.2 | `dos componentes del mismo insumo generan dos ENTRADAs y el saldo USADO sube en 2` |
| R2 | Unidad SERIE | 9.2, 7.4 | `la unidad S1 vuelve EN_DEPOSITO USADO con evento RETIRO_A_DEPOSITO y ENTRADA` |
| R2 | Insumo deshabilitado | 9.2, 7.3, 7.4 | `admite un insumo NINGUNO deshabilitado y suma 1 al saldo USADO` |
| R3 | Descartar piezas NINGUNO y SERIE | 9.3 | `DESCARTE deja S1 DESCARTADA con evento DESCARTE, sin movimientos y saldo USADO en 2` |
| R3 | Sin asiento negativo | 9.3 | `DESCARTE no cambia el numero de movimientos ni los saldos NUEVO 3 y USADO 0` |
| R3 | Insumo borrado no bloquea el descarte | 9.3 | `DESCARTE con insumo de baja logica se completa` |
| R4 | Misma leyenda en los tres lugares | 9.4 | `baja_motivo, movimientos.motivo y eventos.motivo son identicos a la leyenda esperada` |
| R4 | Leyenda sin texto libre | 9.4, 1.5 | `la leyenda sin texto es "Baja del equipo «PC-1» — Vejez"` |
| R4 | Leyenda de exactamente 500 caracteres | 9.4, 1.5 | `texto de N caracteres: la leyenda guardada mide 500` |
| R4 | Leyenda de 501 caracteres | 9.4, 1.5, 8.4, 12.1 | `texto de N+1 rechaza con largoMaximo N y no cambia nada` |
| R5 | OTRA sin texto | 8.4, 1.5, 12.1 | `OTRA con texto vacio o solo espacios rechaza y nada cambia` |
| R5 | OTRA con texto | 12.1, 8.4 | `OTRA con "reciclado para repuestos" completa y la leyenda lo incluye` |
| R5 | Categoría ausente o inválida | 11.3, 12.1, 1.5 | `rechaza categoria ausente y categoria "OTROS"` |
| R5 | Categoría sin texto en la opción A | 9.2, 8.4 | `STOCK_USADO con ROTURA y sin texto se completa` |
| R6 | Una pieza falla y no cambia nada | 10.1 | `una pieza con insumo borrado: nada cambia y el error nombra el componente` |
| R6 | El error lista todas las piezas problemáticas | 10.2, 10.6 | `lista los tres componentes con su causa` |
| R6 | Falla al marcar el equipo | 10.3, 8.4 | `registrarBaja devuelve false: revierte entradas, unidades, eventos y marcas` |
| R7 | Legado SERIE con serial | 10.5 | `legado con serial LEG-1 crea unidad EN_DEPOSITO USADO con su ENTRADA` |
| R7 | Legado SERIE sin serial | 10.5 | `legado sin serial rechaza por SERIAL_REQUERIDO y nada cambia` |
| R7 | Serial repetido dentro de la misma baja | 10.5 | `"x1" y "X 1" rechaza ambos por serial duplicado sin crear unidades` |
| R7 | Serial ya existente en el insumo | 10.5, 10.4 | `serial "a1" con "A1" existente rechaza listando el componente` |
| R7 | Descartar un legado SERIE sin serial | 9.3, 10.5 | `DESCARTE de legado sin serial no crea unidad` |
| R7 | Insumo borrado frena la devolución | 10.5, 10.1 | `STOCK_USADO con insumo borrado lista INSUMO_BORRADO` |
| R8 | Registro de la baja | 9.5, 2.5, 1.5 | `el equipo queda activo=false con destino, categoria, texto, fecha y usuario u1` |
| R8 | Sin reactivación | 4.7, 2.5, 14.4, 17.3 | `EditarEquipo con entidad vieja no reactiva el equipo dado de baja` |
| R8 | Sin unidades instaladas tras la baja | 9.5, 13.3 | `ninguna unidad INSTALADA ni componente activo tras la baja` |
| R9 | Equipo sin piezas activas | 9.5, 8.4 | `equipo sin piezas activas cambia solo el equipo` |
| R9 | Equipo ya dado de baja | 9.5, 12.1, 2.5 | `segunda baja rechaza y conserva los datos originales` |
| R9 | Equipo con borrado lógico | 9.5, 12.1 | `equipo con borrado logico responde no encontrado` |
| R10 | Aviso con tickets abiertos | 11.2, 16.6 | `2 tickets abiertos y 1 cerrado informa ticketsAbiertos = 2` |
| R10 | Baja con tickets abiertos | 12.1, 13.6 | `la baja con 2 tickets abiertos se completa y siguen abiertos` |
| R10 | Ticket nuevo sobre equipo dado de baja | 5.2, 12.1 | `CrearTicketSoporte sobre equipo dado de baja se rechaza` |
| R11 | Oculto por defecto | 14.4, 14.2, 15.4 | `la lista por defecto muestra solo el vigente` |
| R11 | Visible con etiqueta | 15.4, 14.4 | `con la casilla tildada se muestran ambos y el dado de baja lleva "Baja"` |
| R11 | Exportación con el filtro | 14.4, 14.2, 15.4 | `el CSV por defecto solo trae el vigente y con el filtro trae "Baja"` |
| R11 | Ficha visible | 12.1, 17.3 | `la ficha de un equipo dado de baja responde con componentes retirados y datos de baja` |
| R11 | Editar un equipo dado de baja | 4.7, 4.1, 14.4 | `editar un equipo dado de baja se rechaza y no cambia` |
| R11 | Agregar un componente | 4.7, 4.3, 14.4 | `agregar con o sin descuento sobre equipo dado de baja se rechaza` |
| R11 | Reactivar un componente de un equipo dado de baja | 4.7, 4.5 | `reactivar componente de equipo dado de baja: sigue retirado y S1 DESCARTADA` |
| R12 | Sin permiso | 11.5, 12.1 | `POST baja exige EQUIPOS:BORRADO` (reflexión); `403 sin BORRADO y nada cambia` (e2e) |
| R12 | Con BORRADO y sin permisos de insumos | 12.1 | `BORRADO sin permisos de INSUMOS completa STOCK_USADO y registra las ENTRADAs` |
| R13 | Borrar con piezas activas (RED actual, GREEN esperado) | 3.1, 3.2, 3.3, 3.5, 3.7 | `con un componente activo devuelve fail EquipoConComponentesActivosError(1)`; `la unidad sigue INSTALADA`; T5 |
| R13 | Borrar un equipo cargado por error | 3.2, 3.3 | `sin componentes activos el equipo queda con borrado logico y la ficha responde 404` |
| R13 | Borrar un equipo dado de baja | 3.2, 3.3 | `borrar un equipo dado de baja se rechaza y la ficha sigue visible` |
| R13 | Botón renombrado | 3.8, 16.6 | `el borrado dice "Eliminar equipo (cargado por error)" y solo la baja dice "Dar de baja"` |
| R14 | Resumen | 16.6 | `PC-1 con 4 piezas y 1 ticket muestra 4, "devolver al stock" y 1 ticket` |
| R14 | Devolver confirma con un botón | 16.6 | `STOCK_USADO envia la baja con un solo clic` |
| R14 | Descartar exige el nombre | 16.6 | `con PC-2 el boton sigue deshabilitado y con PC-1 se habilita` |
| R15 | Baja contra instalación sobre los mismos insumos | 13.2, 10.7 | `(a) baja de E1 contra instalacion en E2 en orden inverso: sin 40P01` + T1, T2, T3 |
| R15 | Dos bajas simultáneas del mismo equipo | 13.5 | `(d) exactamente una baja se completa y la otra da EquipoDadoDeBajaError` |
| R15 | Baja contra agregar componente | 13.3, 13.4, 4.8 | `(b) y (c) nunca queda un componente activo ni una unidad INSTALADA en el equipo dado de baja` + T4 |
| R16 | El cambio a NINGUNO con una unidad instalada se rechaza | 9.6 | `cambiar a NINGUNO con una unidad INSTALADA se rechaza` |
| R17 | Destino por pieza | 12.1, 11.3 | `el destino por pieza se ignora y ambos componentes quedan con DESCARTE` |
| R17 | Destino solo por pieza | 12.1, 11.3 | `sin destino de primer nivel responde 400 y nada cambia` |

### Delta `unidades-insumo-serie` (4)

| Escenario | Tarea(s) | Test nombrado |
|---|---|---|
| Varias unidades en una transacción | 6.4, 7.4 | `devolverDesdeEquipo devuelve varias unidades en una transaccion` |
| Falla en una del lote | 6.4 | `una unidad que ya no esta INSTALADA rechaza el lote y ninguna cambia` (`:893`) |
| Descartar varias unidades en una transacción | 6.4 | `descartarInstaladas descarta varias con evento DESCARTE y sin movimientos` |
| Unidad instalada en otro equipo | 6.4 | `una unidad INSTALADA en otro equipo rechaza el lote y ninguna cambia` |

### Delta `componentes-catalogo-unico` (9)

| Escenario | Tarea(s) | Test nombrado |
|---|---|---|
| Reactivar tras devolver al stock | 4.6 | Test existente de `reactivar-componente.use-case.spec.ts`, sin cambiar aserciones |
| Reactivar tras descartar | 4.6 | Ídem |
| Reactivar un retiro legado | 4.6 | Ídem |
| Interfaz de reactivar | 17.3, 4.6 | `un componente retirado con STOCK_USADO no ofrece reactivar y la fila indica el destino` |
| Reactivar un componente con unidad descartada | 4.6 | Test existente homónimo (spec o integración), sin cambiar aserciones |
| Reactivar con unidad de un insumo que volvió a NINGUNO | 4.6 | Ídem |
| Reactivar un componente cuya unidad se recuperó | 4.6 | Ídem |
| Reactivar un componente legado sin unidad | 4.6 | Ídem |
| Reactivar un componente de un equipo dado de baja | 4.5, 4.7 | `reactivar componente de equipo dado de baja: sigue retirado y S1 DESCARTADA` |

Verificación del mapa: 57 + 4 + 9 = **70 escenarios**, ninguno huérfano (R1 2, R2 4, R3 3, R4 4,
R5 4, R6 3, R7 6, R8 3, R9 3, R10 3, R11 7, R12 2, R13 4, R14 3, R15 3, R16 1, R17 2). Los 8
testigos T1–T8 están en 3.7 (T5), 4.8 (T4), 5.6 (T7, T8) y 10.7 (T1, T2, T3, T6); los casos de
concurrencia (a)–(e) en 13.2 a 13.6.
