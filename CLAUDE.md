# CLAUDE.md — soporte

## [Overrides / Modificaciones para este proyecto]

Este proyecto lo desarrolla **una sola persona**. No hay revisor, no hay maintainer separado
del autor, y no se usan pull requests: se trabaja en ramas de integración que se mergean
directo a `main`. Las reglas globales que asumen un flujo de PR con revisión externa **no
aplican acá** y no deben inyectarse en los prompts de los sub-agentes.

### Anulaciones

- **Anulación — skill `branch-pr`**: NO aplica. No se crean pull requests, no hay issue-first,
  no hay labels `type:*`, no hay gates de GitHub Actions que bloqueen merges. Sus reglas
  provienen del repo *Gentle AI* (`Gentleman-Programming/agent-teams-lite`) y son ajenas a
  este proyecto.

- **Anulación — skill `chained-pr`**: NO aplica. No se parten los cambios a las 400 líneas,
  no existe `size:exception` y no hay tracker PR ni PRs hijos. El tamaño de una rama lo
  decide el autor.

- **Anulación — skill `issue-creation`**: NO aplica. No hay plantillas obligatorias, ni
  `status:needs-review` / `status:approved`, ni un maintainer que apruebe antes de trabajar.
  Mismo origen ajeno que las anteriores.

- **Anulación — Review Workload Guard del orquestador SDD**: NO se ejecuta. No se consulta
  el `Review Workload Forecast` de `sdd-tasks` para decidir chained PRs, y no se pide
  autorización de tamaño antes de `sdd-apply`.

- **Anulación — `delivery_strategy`**: no se pregunta ni se resuelve por caso. Es fijo:
  **rama larga de integración, un solo merge a `main`**. Los work units van como commits
  disciplinados dentro de esa rama.

### Lo que SÍ se mantiene

- **`work-unit-commits` SIGUE VIGENTE.** No es ceremonia de PR: es la disciplina de que un
  commit represente un comportamiento entregable, con sus tests en el mismo commit. Su valor
  no depende de que exista un revisor — sostiene el `git bisect`, permite revertir una unidad
  sin arrastrar otras, y hace que la rama se pueda releer meses después.

- Todo el resto de las reglas globales (tipado estricto, testing obligatorio, TDD,
  documentación, reporte honesto) sigue igual.

## Delegar a subagentes (OBLIGATORIO)

**Siempre que una tarea se pueda delegar, se delega.** El hilo principal coordina y
sintetiza; no es el que lee medio repositorio ni el que escribe cada archivo.

La razón no es de estilo: el contexto del orquestador es finito y es el recurso más
caro de la sesión. Cada archivo que el hilo principal lee "de paso" es contexto que
después le falta para decidir bien. Un subagente lee cincuenta archivos, devuelve
diez líneas de conclusión, y se lleva el costo con él.

Delegar SIEMPRE que aplique:

- Explorar o mapear algo que requiere abrir **4 o más archivos**.
- Escribir **2 o más archivos** no triviales.
- Cualquier lectura cuyo único fin sea preparar una escritura.
- Investigación amplia (comparar enfoques, rastrear un patrón por todo el repo).
- Tareas **independientes entre sí**: van en paralelo, un subagente cada una.

Se resuelve en el hilo principal, sin delegar:

- Leer 1 a 3 archivos para decidir o verificar algo puntual.
- Un cambio mecánico de un solo archivo, ya entendido, sin diseño pendiente.
- Comandos de estado (`git`, `docker`, `curl`, correr la suite).

Reglas de la delegación:

- **Un solo escritor por archivo.** Dos subagentes que tocan el mismo archivo se
  pisan. Si van en paralelo, repartir archivos disjuntos o usar worktrees aislados.
- **El subagente no commitea ni cambia de rama.** Deja el trabajo en el working tree
  y el orquestador integra.
- El prompt del subagente viaja **autocontenido**: rutas, convenciones, criterio de
  terminado y formato del reporte. Un subagente no ve esta conversación.
- **El reporte de un subagente no es prueba.** Antes de dar algo por verde, el
  orquestador verifica por su cuenta (correr los tests, leer el diff). Ya pasó en
  este proyecto que un reporte en verde tapaba un test que no mordía.

## SDD es el camino por defecto (OBLIGATORIO)

**Todo trabajo sustantivo pasa por un ciclo SDD, ejecutado por sus subagentes de fase.**
No se implementa "directo" salvo que sea un arreglo mecánico de un archivo ya entendido.

Esto ANULA la regla global de que SDD se elige solo por pedido explícito o propuesta
aceptada: en este proyecto es el default, decidido por el usuario el 2026-08-19.

Cada fase la ejecuta su subagente dedicado vía la herramienta Agent, **nunca invocando la
skill** (las `sdd-*/SKILL.md` traen `delegate_only: true`: si las cargás como skill, sos el
orquestador y tenés que delegar). El `model` es obligatorio en cada llamada:

| Fase | Agente | Modelo |
|---|---|---|
| explore | `sdd-explore` | sonnet |
| propose | `sdd-propose` | **opus** |
| spec | `sdd-spec` | sonnet |
| design | `sdd-design` | **opus** |
| tasks | `sdd-tasks` | sonnet |
| apply | `sdd-apply` | sonnet |
| verify | `sdd-verify` | sonnet |
| archive | `sdd-archive` | haiku |

`spec` y `design` son el ÚNICO paralelismo declarado: las dos leen el proposal y no dependen
entre sí. Todo lo demás va en serie — y `apply` en particular **no admite instancias
paralelas**: `apply-progress` es un registro único con merge secuencial y el ledger de
intentos bloquea con `active_attempt`.

### Lo que este proyecto anula del flujo SDD

- **Artifact store: `engram`.** No existe `openspec/` y no debe crearse. Por lo tanto **no se
  invoca el dispatcher nativo** (`gentle-ai sdd-status` / `sdd-continue`): solo lee artefactos
  OpenSpec y siempre reporta `artifactStore: openspec`, así que no vería nada. El estado se
  resuelve por topic keys con `mem_search` → `mem_get_observation`.
- **`sdd-tasks` NO emite `Review Workload Forecast`** (ni presupuesto de 400 líneas, ni chain
  strategy, ni `size:exception`).
- **`sdd-apply` NO ejecuta su gate de "Review Workload Decision"**. Ojo: si el prompt de
  lanzamiento no se lo dice, el agente puede auto-bloquearse leyendo el forecast del artefacto.
  Hay que desactivárselo explícitamente.
- La Ayuda va DENTRO del work unit del módulo, nunca en una tarea final de documentación.

### Antes de cada `sdd-apply`

Reclamar el turno en el ledger: `gentle-ai sdd-attempt acquire` con `--change`, `--request-id`,
`--work-unit` y `--evidence-goal`; lanzar solo con `state: proceed` y pasarle el `token` al
subagente para que no colisione consigo mismo. Cerrar con `settle` después.

**Si `acquire` devuelve `settle_obligation`, se le relaya al usuario TEXTUAL antes de lanzar el
work unit.** No es un aviso a sopesar: un intento es un recurso gastable y descubrir la demanda
recién en el `settle` lo quema sin forma de recuperarlo.

## Contexto operativo

- **Postgres corre en el contenedor Docker `soporte-postgres-master`** (puerto 5432), con
  restart policy: arranca solo al iniciar Docker Desktop. No hay `docker-compose` en el repo
  ni servicio de Windows.
- Si la suite tira `PrismaClientKnownRequestError` masivo en los `*.integration.spec.ts`,
  **es la base caída, no el código**. Diagnóstico en diez segundos:
  `pnpm prisma migrate status --schema prisma_tenant/schema.prisma` → `P1001` = entorno.
- Dentro del contenedor, `psql -U postgres` **falla** (ese rol no existe):
  usar `psql -U "$POSTGRES_USER" -d postgres`.
- **La base de un tenant real no se toca — y su nombre NO se hardcodea.** El sufijo hex se
  genera al provisionar, así que **cambia si el tenant se recrea**: cualquier literal que
  escribas hoy miente mañana. La fuente de verdad es el registro de clientes, no este archivo.
  Antes de dropear cualquier base, consultalo:

  ```bash
  docker exec soporte-postgres-master psql -U soporte -d soporte_master -c "SELECT nombre, db_name, activo FROM clientes;"
  ```

  Todo `db_name` que aparezca ahí es una base REAL. Al 2026-08-22 hay una sola, "Demo Soporte"
  (`soporte_01a0253ef26f78b88b02d5161410d8fd`), pero ese valor es una foto del día, no la regla.
  Nunca lo copies a un script ni al prompt de un subagente: ya pasó que un nombre viejo se
  propagó a la lista negra de `backend/scripts/regenerar-entorno.mjs` porque venía copiado
  textual de acá.
- Higiene de DB en specs de integración con tenant efímero — este orden importa:
  limpiar filas → `app.close()` → `dropDatabase`. Al revés, el pool sigue vivo y Postgres
  rechaza el DROP **en silencio**, dejando la base huérfana.

## Comandos

| | backend | frontend |
|---|---|---|
| Tests | `pnpm test` | `pnpm test` |
| Un archivo | `pnpm vitest run <ruta>` | `pnpm vitest run <ruta>` |
| Typecheck | `pnpm typecheck` | `pnpm type-check` |
| Lint | `pnpm lint` | `pnpm lint` |

Runner: **Vitest** (no Jest). Package manager: **pnpm**.

> `backend`: `pnpm lint` arrastra **5 errores prettier preexistentes** en
> `src/equipos/application/use-cases/editar-componente.use-case.spec.ts`, no relacionados con
> ningún cambio en curso. Cero errores nuevos es el criterio, no cero errores.

## La Ayuda se mantiene con el código (OBLIGATORIO)

El módulo `KB` se llama **Ayuda** para el usuario y contiene **cómo se usa el sistema**.
(La base de conocimiento tal como se pensó originalmente —casos resueltos y su
recurrencia— quedó para más adelante, cuando exista historial que la alimente.)

Los artículos **NO viven solo en la base**: viven como archivos markdown en el repo y
un script idempotente los sincroniza a cada tenant. Esa es justamente la razón de que
estén ahí — un artículo que solo existe en una tabla de producción no se puede mantener
desde un cambio de código, y queda desactualizado el día uno.

**Regla: un cambio que altera lo que el usuario ve o hace NO está terminado hasta que
la Ayuda lo refleja.** En el MISMO commit, igual que los tests.

Aplica cuando el cambio:

- agrega, saca o renombra una pantalla, un botón o un campo que el usuario usa;
- cambia un flujo (qué pasos hay que dar para lograr algo);
- cambia el significado de un estado, un permiso o una etiqueta visible;
- corrige un comportamiento que la Ayuda describía de otra forma.

NO aplica a refactors internos, performance, tests o cambios de infraestructura que el
usuario no percibe.

Ante la duda, la pregunta es una sola: **¿alguien que leyó la Ayuda ayer haría algo mal
hoy por culpa de este cambio?** Si la respuesta es sí, actualizala.

Si un cambio deja un artículo obsoleto y no se puede arreglar en el mismo commit, decilo
explícitamente en el reporte. Nunca lo dejes pasar en silencio: una Ayuda que miente es
peor que una Ayuda que falta, porque la primera se sigue con confianza.
