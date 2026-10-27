# Deuda técnica del 2026-10-15: tipos de ticket, cableado de la API v1 y rollback de `api_publica`

## Objetivo
Saldar tres filas abiertas de "Deuda técnica conocida" (`docs/roadmap-comercial.md`, sección
"Deuda técnica conocida"):

1. El alta interna de tickets acepta tipos dados de baja.
2. `TicketsModule` no exporta los casos de uso que usa la API v1.
3. El rollback de `api_publica` no se puede re-correr (lo había dejado afuera
   `odd/tasks/deuda-api-publica.md`, "Fuera de alcance").

## Problema y porqué
- `CrearTicketUseCase` (`backend/src/tickets/application/use-cases/crear-ticket.use-case.ts:114-118`)
  busca el tipo con `findById`, que no filtra `deletedAt` ni `activo`. Desde la app
  (`POST /tickets`) se pueden crear tickets con un tipo desactivado.
- Por el mismo caso de uso pasa el generador de preventivos, que siempre usa el tipo fijo
  `PREVENTIVO`. El QR, los equipos y Edilicia usan `SOPORTE` y `EDILICIA`. Hoy nada impide
  desactivar o recodificar esos tipos: si pasara, el generador fallaría en cada pasada, y sin
  avisar a nadie.
- `ApiV1Module` arma de nuevo cinco casos de uso que `TicketsModule` ya provee con las mismas
  dependencias: un cambio en ellas hay que repetirlo en los dos lados.
- `prisma_master/migrations/20261011120000_api_publica/rollback.sql:14-16` hace dos `UPDATE`
  sobre `es_integracion`, columna que el mismo archivo borra en `:17`. En la segunda corrida
  falla con `column "es_integracion" does not exist`.

## Decisión del dueño (2026-10-15)
- Los tres tipos fijos del sistema (`PREVENTIVO`, `SOPORTE`, `EDILICIA`) **no se pueden
  desactivar, ni siquiera ROOT**, y **su `codigo` no se puede cambiar**. El nombre sí.
- El resto de los tipos lo siguen gestionando ROOT o el ADMINISTRADOR del cliente
  (`AdminClienteGuard`, sin cambios). Se evaluó dejarlo solo a ROOT y se descartó.
- "Dar de baja" sigue siendo una desactivación reversible (`activo=false` + `deletedAt`, se
  reactiva con `PATCH tipos-ticket/:id/estado`).

## Alcance
- Backend: protección de los tipos fijos, rechazo de tipos inactivos en el alta, exports de
  `TicketsModule`, rollback re-ejecutable.
- Frontend: en la pantalla de tipos, los tres fijos no ofrecen desactivar ni editar el código.
- Fuera de alcance: cambiar quién gestiona los tipos, las prioridades (mismo guard, otro tema),
  y `findById` del repositorio (lo necesita la reactivación).

## Criterios de aceptación
- CA1: desactivar `PREVENTIVO`, `SOPORTE` o `EDILICIA` falla con un error de dominio, también
  para ROOT. Desactivar y reactivar cualquier otro tipo sigue funcionando.
- CA2: cambiar el `codigo` de un tipo fijo falla; cambiarle el nombre funciona.
- CA3: `CrearTicketUseCase` rechaza un tipo desactivado con `TipoTicketNoEncontradoError`
  (el mismo error que un tipo inexistente; 422). Un tipo activo sigue funcionando.
- CA4: `ApiV1Module` ya no arma `ListarTicketsUseCase`, `CrearComentarioUseCase`,
  `ListarTiposTicketUseCase`, `ListarPrioridadesUseCase` ni `ListarEstadosUseCase`: los toma
  de `TicketsModule`. Los e2e de la API v1 siguen verdes.
- CA5: correr `rollback.sql` de `api_publica` dos veces seguidas no falla, y deja el mismo
  esquema que una sola corrida.

## Precondición de deploy
Antes de desplegar, consultar en cada tenant (solo lectura) si algún tipo fijo ya está
desactivado. Si lo está, el generador de preventivos empezaría a fallar con CA3: hay que
reactivarlo antes.

## Tareas
- [x] **T1 — Tipos fijos protegidos** (bugfix, TDD). CA1, CA2 + frontend.
  - `TIPOS_TICKET_DEL_SISTEMA` en `tipos-ticket.constants.ts` (con `TIPO_CODIGO_SOPORTE` y
    `TIPO_CODIGO_EDILICIA`), error `TipoTicketDelSistemaError` → 422 (rama por defecto de
    los dos mapeadores). Reactivar un tipo fijo sigue permitido. Front: espejo en
    `frontend/src/features/catalogos/tipos-del-sistema.ts`.
  - RED (backend): `cambiar-estado-activo-…spec` y `editar-tipo-ticket…spec`, 6 casos
    `it.each` → `AssertionError: expected false to be true` (`result.isFail()`).
  - RED (front): `expected [ <button …(5)></button>, …(2) ] to have a length of 1 but got 3`
    y `expect(element).toHaveAttribute("readonly")`.
  - GREEN: backend 37/37 en los 3 specs tocados + `tickets.controller.spec` 58/58 (catálogo
    de errores 25 → 26); unitarios de `src/tickets` 692/692; front `features/catalogos`
    20/20. `eslint src/tickets`, `pnpm typecheck`, front `pnpm lint` y `type-check` limpios.
  - Pendiente: integración/e2e de `src/tickets` no corrieron — Postgres caído
    (`ECONNREFUSED 127.0.0.1:5432`, sin `docker` en WSL).
  - Los literales `'SOPORTE'`/`'EDILICIA'` de `equipos/` y `reparaciones/` quedaron como
    están: fuera de la superficie de esta tarea.
  - Commit: `3425ea81`.
- [x] **T2 — El alta rechaza tipos inactivos** (bugfix, TDD). CA3. Depende de T1.
  - `CrearTicketUseCase` rechaza `isDeleted() || !activo` con `TipoTicketNoEncontradoError`.
    `findById` sin cambios; se corrigió el comentario del puerto, que decía que devolvía
    null para los soft-deleted.
  - RED: `crear-ticket.use-case.spec.ts`, 2 casos (`desactivar()` y `activo=false`) →
    `AssertionError: expected false to be true` (`result.isFail()`).
  - GREEN: 20/20 en el spec; unitarios del backend 6490 verdes, 4 rojos en 2 specs de
    `scripts/` que necesitan Postgres (`ECONNREFUSED 127.0.0.1:5432`), ajenos al cambio.
  - No se agregó el caso e2e en `tickets.e2e.spec.ts`: con la base caída no se podía
    observar, y un e2e no corrido no es evidencia. Queda como seguimiento opcional.
  - Specs de preventivo: verdes con la base arriba (2026-10-27): integración 22/22 archivos,
    306 tests; `test/preventivo.e2e.spec.ts` 43/43.
  - Commit: `0a744303`.
- [x] **T3 — `TicketsModule` exporta los casos de uso de la API v1** (refactor). CA4.
  - Las cinco fábricas eran idénticas (mismo constructor, mismos tokens, mismo orden). Se
    exportan desde `TicketsModule` y se borraron de `ApiV1Module` con sus imports y el
    comentario viejo. `TiposTicketV1Query` y `TicketsV1Query` siguen en `ApiV1Module`.
  - Guardarraíl nuevo en `api-v1.module.spec.ts` (metadata de `@Module`, sin compilar):
    antes del cambio, 5 rojos `expected false to be true`/`toContain`; después 7/7.
  - DI sin base: un spec temporal (borrado, no commiteado) compiló
    `Shared+Auth+Tickets+ApiV1` y resolvió los dos controllers `v1` → verde. Sin los exports
    falla con `Nest can't resolve dependencies of the TiposTicketV1Query (?)`.
  - Pendiente: `test/integraciones-api-v1-*.e2e.spec.ts` y
    `test/integraciones-webhooks-encolado.e2e.spec.ts` no corrieron — Postgres caído.
  - Commit: `3e0a8732`.
- [x] **T4 — Rollback de `api_publica` re-ejecutable** (bugfix, TDD). CA5.
  - RED y GREEN observados el 2026-10-15, con Postgres arriba: con el `rollback.sql` de
    `4874ba00~1` el caso nuevo falla con `Caused by: error: column "es_integracion" does not
    exist` (`1 failed | 2 passed`); con el actual, `3 passed (3)`. Las notas de abajo son
    del primer intento, con la base caída.
  - `rollback.sql`: `ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "es_integracion" ...`
    antes de los `UPDATE`, con comentario de re-ejecutable (sin `DO $$`: el spec parte en `;`).
  - Test nuevo en `rollback-api-publica.integration.spec.ts`: corre el rollback dos veces,
    espera que la segunda resuelva y que esquema y usuarios queden igual que tras una.
  - RED: **no observado**. El spec se salta entero (`Tests 3 skipped`) con
    `connect ECONNREFUSED 127.0.0.1:5432`; no hay `docker` ni `psql` en WSL. Por lectura, la
    segunda corrida del archivo viejo falla en el primer `UPDATE` con
    `column "es_integracion" does not exist`, pero eso es razonamiento, no evidencia.
  - GREEN: **pendiente**, mismo motivo. Queda abierta hasta correr el spec con la base arriba,
    primero con el `rollback.sql` de `HEAD~1` (RED) y después con el actual (GREEN).
  - **Cerrado el 2026-10-27, con la base arriba.** RED observado: con el `rollback.sql` de
    `4874ba00~1`, "correrlo dos veces seguidas no falla..." falla con `promise rejected "error:
    column "es_integracion" does not exist"` (lo que se había razonado por lectura); 1 rojo y 2
    verdes. GREEN: con el `rollback.sql` actual, 3/3. El archivo viejo se restauró solo para la
    corrida y se devolvió (`git checkout --`).
  - Runbook (`DEPLOY-VPS-runbook.md`, "Migración y rollback" de la API pública) no dice que
    NO sea re-ejecutable: no hay nada que corregir.
  - Commit: `4874ba00`.
- [x] **T5 — Cierre**: compuertas completas (backend `pnpm lint`, `pnpm typecheck`,
  `pnpm test`; frontend `pnpm lint`, `pnpm type-check`, `pnpm test`), filas de la deuda en el
  roadmap marcadas RESUELTA, `check-roadmap-fresco` en verde.

  - 2026-10-15, con Postgres arriba: backend `pnpm test` → `Test Files 733 passed (733)`,
    `Tests 8795 passed (8795)`, exit 0 (los `FAIL orden-de-arranque.spec.ts` son el fixture que
    falla a propósito dentro de otro spec). Incluye los e2e de la API v1, webhooks, preventivo y
    tickets. Lint y typecheck del backend y las tres compuertas del frontend, verdes en la
    corrida del escritor; el cierre solo agrega documentación.
  - Roadmap: filas "El alta interna de tickets acepta tipos dados de baja" y "`TicketsModule`
    no exporta…" marcadas RESUELTA; el rollback no tenía fila ahí, se anotó en
    `odd/tasks/deuda-api-publica.md`. `check-roadmap-fresco`: "El roadmap esta fresco."

## Ruta
- Delegada: un escritor para T1-T4, porque toca más de dos archivos no triviales (disparador
  de escritura). Cada tarea cierra con su commit en `fix/deuda-tecnica-2026-10-15`.
- Revisión nativa RDD apagada (§6.2 de `~/proyectos/CLAUDE.md`).
- Previsión: menos de 400 líneas en total; estrategia de entrega `single-pr`.

## Progreso
- 2026-10-15: exploración hecha, decisión del dueño registrada, documento creado.
- 2026-10-15: T1-T3 cerradas, T4 commiteada con RED/GREEN pendientes de la base. Compuertas
  con Postgres caído (`ECONNREFUSED 127.0.0.1:5432`):
  - backend `pnpm lint`: 0 errores · `pnpm typecheck`: limpio · `pnpm test`: 6543 verdes,
    75 rojos y 2177 saltados; todos los archivos rojos son `*.integration.spec.ts`,
    `*.e2e.spec.ts` o los 2 specs de `scripts/` que usan la base (más la salida del fixture
    `orden-de-arranque`, que falla a propósito dentro de otro spec).
  - frontend `pnpm lint`: 0 · `pnpm type-check`: limpio · `pnpm test`: 2277/2277.

## Próximo paso
Merge a `main` (decisión del dueño). Antes del deploy, la precondición de arriba: ningún tipo
fijo desactivado en ningún tenant.
