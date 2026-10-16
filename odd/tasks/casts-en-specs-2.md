# Casts en los specs del backend, segunda vuelta: los 116 que quedan (2026-10-16)

## Objetivo
Llevar a cero (o al mínimo justificado) los `as never` / `as any` que quedan en los specs del backend
(116 en 31 archivos, base del ratchet `scripts/check-casts-en-specs.mjs`), con dobles tipados contra
sus puertos, y bajar la base del ratchet. Continúa `odd/tasks/casts-en-specs.md` (merge `e48d13c1`).

## Pedido
- L1 (2026-10-16, dueño): "seguí con los casts que quedan".

## Alcance
- Solo specs del backend (`backend/**/*.spec.ts`) y `scripts/check-casts-en-specs.mjs` (base).
- Sin cambios de código de producción. Un cast que no se puede sacar sin tocar producción, o que
  prueba a propósito una entrada inválida, queda y se anota con su motivo.
- Supuesto: "los casts que quedan" son los 116 que cuenta el ratchet. Los 168 `as unknown as` (que el
  ratchet no cuenta) quedan fuera de esta vuelta, como deuda aparte. Se incluye el `vi.fn()` sin tipar
  de `exportar-compras.use-case.spec.ts:73`, anotado como deuda en la primera vuelta.

## Criterios de aceptación
- CA1: cada tanda baja los casts de sus módulos y no agrega ninguno en otro lado
  (`node scripts/check-casts-en-specs.mjs` en verde con la base nueva).
- CA2: los specs tocados pasan, y lint y typecheck del backend quedan en 0.
- CA3: ningún test pierde aserciones ni se saltea (mismos conteos de `it(`/`expect(` por archivo).
- CA4: al cierre, la suite completa del backend pasa y la fila del roadmap se actualiza.

## Tareas
- [x] **T1 — insumos, kb, sectores y dashboard** (56 → 0). Ruta: delegada (escritor A, en paralelo con
  T2: superficies disjuntas, muchos archivos no triviales). Commit `3b7b6681`.
  - 16 specs; ningún cast conservado. Controllers de insumos y sectores: `buildController()` con
    casos de uso del prototipo real (`espiado`) y `execute.mockResolvedValue` por test; kb con un
    helper `usuario(sub, permisos): JwtPayload` completo.
  - Defectos destapados (arreglados solo en specs): el test de stock de
    `movimientos-insumo.controller.spec.ts` no tenía `admiteUsadoEnReingreso`, `seguimiento` ni
    `pendientesDeSerie` en el fixture, y `toEqual` ignora los `undefined`: esos campos nunca se
    verificaban; ahora sí. `listar-kb-articulos` devolvía `{ id }` en vez de `KbArticuloEntity`.
  - Evidencia: `pnpm vitest run src/insumos src/kb src/sectores src/dashboard` → 129 archivos, 2069
    tests antes y después; mismos conteos de `it(`/`expect(` por archivo; lint y typecheck 0.
- [x] **T2 — csat, notificaciones, shared, sla y el `vi.fn()` de compras** (55 → 0). Ruta: delegada
  (escritor B, en paralelo con T1). Commit `c37075da`.
  - 16 specs; ningún cast conservado (los de `tenant-context.spec.ts` no probaban entrada inválida:
    `prismaClient` es `unknown`). `TenantContext` real con `vi.spyOn` en `get`/`bind`; el guard del
    throttler con `ThrottlerStorage` tipado y `Reflector` real; `exportar-compras` con
    `vi.fn<ICompraRepository['findPaginaConItems']>()`.
  - Defectos destapados (arreglados solo en specs): `obtener-csat-ticket` devolvía un objeto suelto en
    vez de `EncuestaSatisfaccionEntity`; cuatro dobles de `TenantContext.get()` devolvían solo
    `{ clienteId }`; en `sla-sweep.scheduler` el cliente falso tiene el prototipo real y el esperado
    se arma con la misma fábrica.
  - Evidencia: `pnpm vitest run src/csat src/notificaciones src/shared src/sla <exportar-compras>` → 76
    archivos, 719 tests antes y después; mismos conteos; lint y typecheck 0.
  - Los dos escritores corrieron prettier sobre archivos del otro (solo formato); `prettier --check`
    sobre los 32 archivos, limpio.
- [x] **T3 — Cierre**: base del ratchet (la edita el padre), suite completa, roadmap, merge (decisión
  del dueño). Ruta: inline.
  - Ratchet: base 116/31 → **0/0** (`8cb43761`); el script da "0 en 0 archivos (base: 0 en 0)".
  - Roadmap: la fila de deuda dice 0 y anota los `as unknown as` que quedan (166 en 60 specs).
  - Lint y typecheck 0; `check-roadmap-fresco` en verde. RDD: `assess --base-ref f394daa0
    --committed-only` → medium, `review_due` false (`under_budget`).
  - Deuda menor: el helper `espiado` está copiado en 11 specs de controllers (4 de la primera vuelta);
    se puede llevar a `src/testing/mocks.ts`.
  - Suite completa del backend: 741 archivos, 8877 tests, todos en verde (exit 0).
  - Diff contra `main` revisado (§4.2): solo specs, script del ratchet, roadmap y este documento; sin
    `.only`/`.skip`, secretos ni código de producción.

## Ruta y entrega
- Refactor de tests: sin TDD (no hay bugfix); la verificación es que los specs sigan pasando.
- Los escritores no tocan git ni el script del ratchet; el padre commitea una tanda por tarea.
- Previsión: ~300-500 líneas por tanda. GitHub en pausa: commits en `refactor/casts-en-specs-2` y
  merge local al final. RDD encendida: se evalúa por commit.

## Progreso
- 2026-10-16: documento creado; rama `refactor/casts-en-specs-2` desde `main` `261aeb6b`.
- 2026-10-16: T1 y T2 hechas; ratchet en 0/0.
- 2026-10-16: suite completa en verde; el dueño pidió "cuando pase la suite, mergealo a main". Merge
  local a `main`.

## Próximo paso
Ninguno en esta feature. Deuda aparte: los 166 `as unknown as` en 60 specs y el helper `espiado`
repetido.
