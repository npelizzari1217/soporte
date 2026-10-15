# Casts en los specs del backend: bajar la deuda en tandas (2026-10-16)

## Objetivo
Bajar los `as never` / `as any` de los specs del backend (594 en 111 archivos, base del ratchet
`scripts/check-casts-en-specs.mjs`) a ~230 o menos, reemplazándolos por dobles tipados contra sus
puertos, y bajar la línea base del ratchet en cada tanda.

## Problema y porqué
- `docs/roadmap-comercial.md`, "Deuda técnica conocida", fila **594 `as never`/`as any` en 111 specs**:
  "Convertir los 594 a mocks completos sigue pendiente, pero ya no puede empeorar".
- Un cast en un spec apaga el chequeo de tipos justo donde el doble tiene que respetar el contrato
  del puerto: si el puerto cambia, el test sigue compilando y miente.

## Alcance
- Solo specs del backend (`backend/**/*.spec.ts`) y `scripts/check-casts-en-specs.mjs` (base).
- Sin cambios de código de producción. Si un cast no se puede sacar sin tocar producción, queda y se
  anota en la tanda con su motivo.
- Se mantienen los casts que prueban a propósito una entrada inválida (por ejemplo, un valor fuera
  del tipo para ejercitar una validación); se anotan.
- Fuera de alcance: frontend (ya en cero) y los specs fuera de `backend/`.

## Criterios de aceptación
- CA1: cada tanda baja los casts de su módulo y no agrega ninguno en otro lado
  (`node scripts/check-casts-en-specs.mjs` en verde con la base nueva).
- CA2: los specs tocados pasan, y lint y typecheck del backend quedan en 0.
- CA3: ningún test pierde aserciones ni se saltea para sacar un cast.
- CA4: al cierre, la base queda en ~230 o menos, la suite completa del backend pasa y la fila del
  roadmap se actualiza con el número nuevo.

## Tareas (una tanda por módulo; conteo inicial entre paréntesis)
- [x] **T1 — equipos** (103 → 0). Ruta: delegada (escritor único). Commit `ccba3e5e`.
  - 11 specs; ningún cast conservado. Base del ratchet 594/111 → **491/100**.
  - Defectos de los specs que el tipado destapó (arreglados solo en specs): dobles que devolvían
    objetos sueltos en vez de `TipoTicketEntity` / `InsumoEntity`; un `ops.find(...)` que seguía con
    `undefined` pasó a un helper que falla si falta la operación; `controller.crear({} as any)` usa un
    cuerpo válido (el caso de uso está mockeado).
  - Patrones: `vi.fn<Puerto['metodo']>()` alcanza donde el caso de uso recibe `Pick<Puerto, ...>`;
    `ITenantTransactionRunner.run` genérico → objeto real `run: async <T>(fn) => fn()` + `vi.spyOn`;
    casos de uso concretos en controllers → `Object.create(Clase.prototype, { execute: ... })`; las
    propiedades extra a propósito van en una variable (sin chequeo de exceso).
  - Evidencia: `pnpm vitest run src/equipos` → 60 archivos, 869 tests antes y después; mismos conteos
    de `expect(` e `it(` por archivo; lint y typecheck 0; ratchet 491/100 (repetido por el padre); un
    spec descartable con un valor erróneo no compiló (los dobles chequean tipos). RDD: `assess` →
    medium, `review_due` false (`under_budget`, 755 líneas).
- [ ] **T2 — tickets** (90).
- [ ] **T3 — auth** (84).
- [ ] **T4 — clientes** (62).
- [ ] **T5 — compras** (51).
- [ ] **T6 — reparaciones y preventivo** (48 + 40).
- [ ] **T7 — Cierre**: suite completa, roadmap, merge (decisión del dueño). Si la base no llegó a
  ~230, se decide con el dueño si sigue con insumos, csat, kb, notificaciones y shared (~100).

## Ruta y entrega
- Ruta: T1 a T6 delegadas (escritor único por tanda, muchos archivos no triviales); T7 inline.
- Refactor de tests: sin TDD (no hay bugfix); la verificación es que los specs sigan pasando.
- Previsión: ~200-500 líneas por tanda, más de 400 en total; GitHub en pausa: un commit por tanda
  en `refactor/casts-en-specs` y merge local al final. RDD encendida: se evalúa por commit.

## Progreso
- 2026-10-16: el dueño pidió seguir con el punto 5 (casts); documento creado.
- 2026-10-16: T1 hecha (equipos, 491/100).

## Próximo paso
T2.
