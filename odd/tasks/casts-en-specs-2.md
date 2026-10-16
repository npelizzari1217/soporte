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
- [ ] **T1 — insumos, kb, sectores y dashboard** (29 + 19 + 4 + 4 = 56 → 0). Ruta: delegada (escritor
  A, en paralelo con T2: superficies disjuntas, muchos archivos no triviales).
- [ ] **T2 — csat, notificaciones, shared, sla y el `vi.fn()` de compras** (19 + 18 + 13 + 5 = 55 → 0).
  Ruta: delegada (escritor B, en paralelo con T1).
- [ ] **T3 — Cierre**: base del ratchet (la edita el padre), suite completa, roadmap, merge (decisión
  del dueño). Ruta: inline.

## Ruta y entrega
- Refactor de tests: sin TDD (no hay bugfix); la verificación es que los specs sigan pasando.
- Los escritores no tocan git ni el script del ratchet; el padre commitea una tanda por tarea.
- Previsión: ~300-500 líneas por tanda. GitHub en pausa: commits en `refactor/casts-en-specs-2` y
  merge local al final. RDD encendida: se evalúa por commit.

## Progreso
- 2026-10-16: documento creado; rama `refactor/casts-en-specs-2` desde `main` `261aeb6b`.

## Próximo paso
T1 y T2 en paralelo.
