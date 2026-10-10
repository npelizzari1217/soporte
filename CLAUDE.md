# CLAUDE.md — soporte

> Las reglas universales (flujo de trabajo ODD, persistencia, commits, rama+PR, TDD,
> delegación, estándares de código) viven en `~/proyectos/CLAUDE.md`. Este archivo define
> solo lo específico de este proyecto: qué es, su stack, cómo se opera y sus convenciones
> propias.

---

## Qué es

**Soporte**: SaaS de ticketing **multi-tenant**. Una base de control (`soporte_master`)
registra los clientes en la tabla `clientes`; cada cliente tiene su propia base de
inquilino con datos reales. El aislamiento entre inquilinos es la propiedad crítica.

Dominio público: `soporte.sesitec.net`.

---

## Stack

Monorepo con `backend/` y `frontend/`.

| Capa | Tecnología |
|---|---|
| Backend | NestJS + TypeScript strict, arquitectura **hexagonal** |
| ORM | Prisma (solo `infrastructure/` puede importar `@prisma/client`) |
| Base | PostgreSQL en Docker, puerto **5432** |
| Errores de dominio | `Result<T, DomainError>` |
| Frontend | React + Zod (los schemas espejan al backend) |
| Tests | **Vitest** · package manager **pnpm** · no hay Jest |
| Lint | ESLint — en **cero errores** (verificado 2026-08-30) |
| Ayuda / KB | markdown en `backend/ayuda/*.md`, versionado con el código |

---

## Contexto operativo

- **Postgres corre en el contenedor Docker `soporte-postgres-master`** (puerto 5432), con
  restart policy: arranca solo al iniciar Docker Desktop. No hay `docker-compose` en el repo.
- Si la suite tira `PrismaClientKnownRequestError` masivo en los `*.integration.spec.ts`,
  **es la base caída, no el código**. Diagnóstico:
  `pnpm prisma migrate status --schema prisma_tenant/schema.prisma` → `P1001` = entorno.
- Dentro del contenedor, `psql -U postgres` **falla** (ese rol no existe):
  usar `psql -U "$POSTGRES_USER" -d postgres`.
- **`soporte_master_test` es UNA SOLA base compartida** por los specs de integración y e2e.
  Cada uno la arranca con un `TRUNCATE`. `fileParallelism: false` los ordena dentro de un
  proceso, pero entre procesos no protege nada. Por eso cada spec que trunca esa base llama
  a `usarLockMasterTest()` (`src/testing/lock-master-test.ts`) antes de su `describe`. **Un
  spec nuevo que truncue esa base tiene que llamarlo también.**
- **Las bases tenant efímeras se barren solas al arrancar la suite.** El `globalSetup` de
  `test/barrido-huerfanas.global-setup.mjs` las limpia con tres puertas fail-closed. Si el
  registro no se puede leer, **no barre nada**.
- **La base de un tenant real no se toca — y su nombre NO se hardcodea.** El sufijo hex
  cambia si el tenant se recrea. Antes de dropear cualquier base, consultar el registro:
  ```bash
  docker exec soporte-postgres-master psql -U soporte -d soporte_master -c "SELECT nombre, db_name, activo FROM clientes;"
  ```
- Higiene en specs de integración con tenant efímero — este orden importa:
  limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP falla en silencio.

---

## La Ayuda se mantiene con el código — SUSPENDIDO desde el 2026-09-07

> **En pausa por decisión del dueño del repo.** No se crean ni se actualizan artículos de
> `backend/ayuda/*.md` hasta nuevo aviso: se escriben todos juntos al final del proyecto,
> sobre la superficie ya estabilizada, en vez de reescribirlos entrega tras entrega.
>
> Lo que **sigue vigente** mientras dure la pausa:
> - **Anotar la deuda** en el mensaje del commit y en el cuerpo del PR cada vez que un
>   cambio deje la Ayuda desactualizada o pida un artículo nuevo. Se suspende la escritura,
>   no el registro: sin esa anotación, la tanda final no sabe qué cubrir.
> - **Corregir un artículo existente que un cambio vuelva FALSO.** Una Ayuda que miente es
>   peor que una que falta, y eso no depende de si se están escribiendo artículos nuevos.
>
> El `AGENTS.md` del repo lleva la misma nota, para que el revisor automático no marque la
> ausencia como hallazgo. Al levantar la pausa se borran los dos bloques y la regla de
> abajo vuelve a regir tal cual — por eso queda entera.

El módulo `KB` se llama **Ayuda** y contiene cómo se usa el sistema. Los artículos viven
como markdown en el repo y un script idempotente los sincroniza a cada tenant.

**Un cambio que altera lo que el usuario ve o hace NO está terminado hasta que la Ayuda lo
refleja, en el mismo commit, igual que los tests.**

Aplica cuando el cambio:
- agrega, saca o renombra una pantalla, un botón o un campo que el usuario usa
- cambia un flujo
- cambia el significado de un estado, un permiso o una etiqueta visible
- corrige un comportamiento que la Ayuda describía de otra forma

NO aplica a refactors internos, performance, tests o infraestructura que el usuario no percibe.

La pregunta: **¿alguien que leyó la Ayuda ayer haría algo mal hoy por culpa de este
cambio?** Si la respuesta es sí, actualizarla. Una Ayuda que miente es peor que una que
falta.

**La Ayuda va dentro de la unidad de trabajo del módulo**, nunca en una tarea final de
documentación.

---

## Comandos

| Tarea        | backend                    | frontend                   |
|--------------|----------------------------|----------------------------|
| Tests        | `pnpm test`                | `pnpm test`                |
| Un archivo   | `pnpm vitest run <ruta>`   | `pnpm vitest run <ruta>`   |
| Typecheck    | `pnpm typecheck`           | `pnpm type-check`          |
| Lint         | `pnpm lint`                | `pnpm lint`                |

Runner: **Vitest**. Package manager: **pnpm**.

`backend`: `pnpm lint` está en **cero errores**. Si tira algo, es del cambio en curso.
El alcance del lint es `eslint .` y cubre `src/**/*.ts` y `scripts/**/*.{mjs,js,ts}`.

---

## Dónde vive el historial de decisiones

Este repo aplica el reparto de la §3.3 de `~/proyectos/CLAUDE.md`: **el documento de tareas
vive en Git, la memoria vive en engram**, y el espejo de ODD es la única copia permitida.

- **Trabajo nuevo (desde el 2026-10-10) → ODD.** Cada feature lleva su documento
  `odd/tasks/<feature>.md` y su espejo en engram (`odd/<feature>/tasks`). Ver §3.3 y §6 del
  global.
- **`openspec/` es historia congelada de solo lectura.** Los ciclos SDD entre el 2026-08-30
  y el 2026-10-10 están en `openspec/changes/archive/`, y las specs vigentes en
  `openspec/specs/` siguen siendo una referencia consultable. Nada se borra, pero ninguna
  herramienta lee ya `openspec/config.yaml`.
- **Memoria → engram.** Decisiones con su porqué, hallazgos, gotchas, narrativa de
  bugfixes, resúmenes de sesión. Puede referenciar un artefacto por ruta o por sha.
- Las copias de artefactos que existieron en engram hasta el 2026-09-15 quedaron como
  **lápidas** con el título prefijado `[MIGRADO A GIT]` y un puntero al archivo. Si una
  búsqueda devuelve una, **no se lee su contenido**: se va al archivo.
- **Los ciclos anteriores al 2026-08-30 viven solo en engram** y no se backfillearon:
  habría que reconstruir artefactos a partir de observaciones, y un artefacto inventado
  miente peor que uno ausente. Para recuperar una decisión vieja, `mem_search` →
  `mem_get_observation` con `project: "soporte"`, contra la base de WSL.

---

## Una feature que implementa un punto del roadmap cita su decisión de producto

`docs/roadmap-comercial.md` tiene una sección, **"Decisiones de producto ya cerradas"**,
donde vive lo que se acordó para cada punto antes de que existiera código. Ningún paso del
flujo de trabajo lee ese archivo por sí solo. Por eso se colaron dos desviaciones.

La del punto 5 es la que hay que tener presente: el ciclo `sla-habil` (SDD) tuvo
**diez pasadas de revisión adversarial** —WU-1 tres veces, WU-2 tres, WU-3 cuatro—, con
un FAILED real encontrado por mutación, corregido y re-revisado. Y ninguna vio que el
calendario entregado es **global** cuando la decisión acordada pedía **por cliente**.

**No falló el rigor. Falló el alcance.** Cada revisión contrastó el código contra
`AGENTS.md` y contra la spec de su propio work unit. La decisión existía desde tres días
antes de que el ciclo arrancara, y nunca entró al alcance de nadie.

Por eso, cuando una feature implementa un punto del roadmap:

1. **El documento ODD de la feature (`odd/tasks/<feature>.md`) cita la decisión por ruta**
   — `docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", viñeta del
   punto.
2. **Cada viñeta de esa decisión se convierte en un criterio de aceptación con su
   verificación concreta.** No se parafrasea en prosa suelta: entra como criterio, que es
   lo que el cierre de ODD sabe contrastar.
3. Si algo de la decisión **no** se va a implementar, se declara en el documento con su
   motivo, antes de empezar. Una desviación acordada de antemano es una decisión; una
   descubierta dos meses después es un defecto.

Esto no agrega una fase ni un control nuevo: le da a la verificación del cierre de ODD
—y a `judgment-day`, cuando se usa— el insumo que le faltaba.

**Al cerrar el punto**, su viñeta en "Decisiones de producto ya cerradas" declara
**Cumplida** o **Desviación** con su motivo. No es opcional:
`scripts/check-roadmap-fresco.mjs` lo exige para todo punto marcado HECHO y falla si
falta. El check nunca juzga si la declaración es **verdadera** —eso sigue siendo juicio
humano—, solo que **exista**. Desviación declarada, sí; desviación silenciosa, no.
