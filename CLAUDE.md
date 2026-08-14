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

## Contexto operativo

- **Postgres corre en el contenedor Docker `soporte-postgres-master`** (puerto 5432), con
  restart policy: arranca solo al iniciar Docker Desktop. No hay `docker-compose` en el repo
  ni servicio de Windows.
- Si la suite tira `PrismaClientKnownRequestError` masivo en los `*.integration.spec.ts`,
  **es la base caída, no el código**. Diagnóstico en diez segundos:
  `pnpm prisma migrate status --schema prisma_tenant/schema.prisma` → `P1001` = entorno.
- Dentro del contenedor, `psql -U postgres` **falla** (ese rol no existe):
  usar `psql -U "$POSTGRES_USER" -d postgres`.
- **`soporte_019fdb97da747aadafb40d3efcdb0cf7` es un tenant REAL** ("Demo Soporte"),
  registrado en `soporte_master`. **Nunca borrarlo.** Antes de dropear cualquier base,
  chequear contra el registro de clientes.
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
