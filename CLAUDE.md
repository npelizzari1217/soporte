# CLAUDE.md — soporte

> Las reglas universales (SDD, persistencia, commits, rama+PR, TDD,
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

**En el ciclo SDD, la Ayuda va DENTRO del work unit del módulo**, nunca en una tarea final
de documentación.

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

- `openspec/` existe desde el 2026-08-30. Los ciclos desde esa fecha están ahí.
- **Los ciclos anteriores al 2026-08-30 viven solo en engram** y no se backfillearon:
  habría que reconstruir artefactos a partir de observaciones, y un artefacto inventado
  miente peor que uno ausente. Para recuperar una decisión vieja, `mem_search` →
  `mem_get_observation` con `project: "soporte"`, contra la base de WSL.
