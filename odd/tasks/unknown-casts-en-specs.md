# Casts `as unknown as` en los specs del backend (2026-10-16)

Objetivo: reemplazar los 166 `as unknown as` de 60 specs del backend por dobles tipados contra sus
puertos, y que el ratchet `scripts/check-casts-en-specs.mjs` también los cuente. Rama
`refactor/unknown-casts-en-specs` desde `main` `a1b0f3a9`. Runner: Vitest (`pnpm vitest run`).
Continúa `odd/tasks/casts-en-specs-2.md`.

## Specs
- S1 (L1): "seguí con los as unknown as". Los 166 `as unknown as` en 60 archivos
  `backend/**/*.spec.ts` (medido el 2026-10-16 con `grep -rc 'as unknown as'`).
- S2: sin cambios de código de producción. Queda un cast, anotado con su motivo, cuando:
  (a) el test prueba a propósito una entrada inválida (`undefined as unknown as string`,
  `'3' as unknown as number`); (b) el test lee una propiedad que el tipo no declara, para probar que
  no existe (`as unknown as Record<string, unknown>`); o (c) sacarlo exige tocar producción.
- S3: ningún test pierde aserciones ni se saltea: mismos conteos de `it(`/`expect(` por archivo, y
  los specs tocados pasan.
- S4: lint y typecheck del backend en 0 al cerrar cada tanda.
- S5 (supuesto, a confirmar al cierre): el ratchet pasa a contar también `as unknown as`, con base
  igual a los casts conservados por S2, para que la deuda no vuelva a crecer sin que nadie lo vea.
- S6: al cierre, la suite completa del backend pasa y la fila de deuda del roadmap se actualiza.

## Tasks
| ID | Specs | Alcance | Ruta | Estado | Commit |
|---|---|---|---|---|---|
| T1 | S1-S4 | auth (52/16), clientes (10/3), equipos (8/5), calendario-laboral (5/5), kb, sectores, respuestas-predefinidas (1/1 c/u) | delegada (escritor A, en paralelo con T2: superficies disjuntas, ~80 casts cada una) | pendiente | — |
| T2 | S1-S4 | compras (28/2), insumos (22/12), tickets (17/2), shared (14/5), csat (3/3), publico (2/2), integraciones, importacion-legacy (1/1 c/u) | delegada (escritor B, en paralelo con T1) | pendiente | — |
| T3 | S5-S6 | ratchet (lo edita el padre), suite completa, roadmap, merge (decisión del dueño) | inline | pendiente | — |

## Log
- L1 (2026-10-16, dueño): "seguí con los as unknown as".
- 2026-10-16: medición: 59 son `as unknown as Ctor[n]` (parámetros de constructor de controllers, en
  4 archivos), 13 `ReturnType<typeof ...>`, 8 `typeof`, 7 `PrismaService`, 6 `ExecutionContext`.
  Algunos prueban entradas inválidas (S2a/S2b). Frontend: cero. Entrega: GitHub en pausa, commits en
  la rama y merge local al final. RDD encendida: se evalúa por commit.
