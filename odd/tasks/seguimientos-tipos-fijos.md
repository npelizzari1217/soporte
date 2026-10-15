# Seguimientos de los tipos fijos (2026-10-15)

## Objetivo
Cerrar los dos seguimientos que dejó `odd/tasks/deuda-tecnica-2026-10-15.md`:

1. Un e2e que pruebe de punta a punta que `POST /tickets` rechaza un tipo desactivado (CA3 de
   esa feature, que hoy solo prueban los unitarios).
2. Una sola fuente para los códigos de los tipos fijos: `equipos/`, `reparaciones/` y el seeder
   de tenants usan literales propios en vez de las constantes de
   `backend/src/tickets/domain/tipos-ticket.constants.ts`.

## Por qué
- Un unitario con mocks no prueba el cableado real (controller, mapeo de errores, repositorio).
- Si un código fijo cambiara en un solo lugar, los flujos que lo resuelven por literal quedarían
  apuntando a otro tipo sin que nada falle al compilar.

## Criterios de aceptación
- CA1: `tickets.e2e.spec.ts` tiene un caso que desactiva un tipo (no fijo) y verifica que
  `POST /tickets` con ese `tipoId` responde 422 y no crea el ticket.
- CA2: `crear-ticket-soporte.use-case.ts`, `crear-ticket-edilicio.use-case.ts` y
  `tenant-seeder.adapter.ts` toman `TIPO_CODIGO_SOPORTE` y `TIPO_CODIGO_EDILICIA` de
  `tipos-ticket.constants.ts`. Ningún literal `'SOPORTE'`/`'EDILICIA'` de código de tipo queda
  fuera de ese archivo (los de comentarios y el módulo `EDILICIA` de `modulos.ts` no cuentan:
  son otra cosa).

## Tareas
- [x] **T1 — E2e del alta con tipo desactivado** (test sobre comportamiento ya corregido; no hay
  RED posible contra el código actual: se verifica que el test falla si se revierte el chequeo).
  - Caso nuevo en `tickets.e2e.spec.ts` (describe de catálogos): crea un tipo no fijo, lo desactiva
    por `PATCH /catalogos/tipos-ticket/:id/estado`, `POST /tickets` → 422 y `ticket.count` del tipo = 0.
  - Mordida: con la condición de `crear-ticket.use-case.ts` reducida a `if (!tipoTicket)` el caso
    falla con `AssertionError: expected 201 to be 422` (`tickets.e2e.spec.ts:1380`). Ojo: revertir
    solo `!tipoTicket.activo` no alcanza, porque `desactivar()` también hace soft delete y
    `isDeleted()` lo sigue rechazando. Archivo restaurado con `git checkout`.
  - Verde tras restaurar: `tickets.e2e.spec.ts` 30/30.
  - Commit: `ceb07495`.
- [x] **T2 — Constantes únicas** (refactor; la evidencia son los tests existentes en verde).
  - `crear-ticket-soporte.use-case.ts` y `crear-ticket-edilicio.use-case.ts` importan la constante;
    `tenant-seeder.adapter.ts` siembra `SOPORTE`/`EDILICIA` con las constantes (los `modulo:
    'EDILICIA'` quedan: son módulo, no código de tipo).
  - `pnpm vitest run src/preventivo src/equipos src/reparaciones src/clientes/infrastructure/tenant-seeder`:
    93 archivos, 1156 tests en verde.
  - `rg -n "'(SOPORTE|EDILICIA)'" backend/src --glob '!*.spec.ts'`: solo quedan comentarios, los
    `modulo: 'EDILICIA'`/`MODULOS` y `tipos-ticket.constants.ts`.
  - Commit: `e276e3ff`.
- [x] **T3 — Cierre**: compuertas del backend (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
  - `pnpm lint`: exit 0, cero errores.
  - `pnpm typecheck`: exit 0.
  - `pnpm test`: exit 0, 733 archivos y 8796 tests en verde. Las tres líneas
    `FAIL orden-de-arranque.spec.ts` del log son el fixture `test/fixtures/entorno/`, que otro spec
    corre en un vitest hijo sin la variable requerida a propósito; no cuentan en el resumen.

## Ruta
- Delegada: un escritor (lectura que prepara la escritura del e2e, más varios archivos).
- RDD apagada. Previsión: menos de 100 líneas; `single-pr`.

## Progreso
- 2026-10-15: documento creado.
- 2026-10-15: T1 hecha (ruta delegada).
- 2026-10-15: T2 hecha (ruta delegada).
- 2026-10-15: T3 hecha: compuertas del backend en verde. CA1 y CA2 cumplidos.

## Próximo paso
Revisión del dueño; push, PR y merge son decisión suya.
