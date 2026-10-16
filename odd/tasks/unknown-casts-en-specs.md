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
| T1 | S1-S4 | auth (52/16), clientes (10/3), equipos (8/5), calendario-laboral (5/5), kb, sectores, respuestas-predefinidas (1/1 c/u) | delegada (escritor A, en paralelo con T2: superficies disjuntas, ~80 casts cada una) | hecha: 80 → 9 (S2) | `b82f1780` |
| T2 | S1-S4 | compras (28/2), insumos (22/12), tickets (17/2), shared (14/5), csat (3/3), publico (2/2), integraciones, importacion-legacy (1/1 c/u) | delegada (escritor B, en paralelo con T1) | hecha: 81 → 2 (S2a) | `4d041157` |
| T3 | S5-S6 | ratchet (lo edita el padre), suite completa, roadmap, merge (decisión del dueño) | inline | hecha | `5692abbd`, `f8c6957c` |

## Log
- L1 (2026-10-16, dueño): "seguí con los as unknown as".
- 2026-10-16: medición: 59 son `as unknown as Ctor[n]` (parámetros de constructor de controllers, en
  4 archivos), 13 `ReturnType<typeof ...>`, 8 `typeof`, 7 `PrismaService`, 6 `ExecutionContext`.
  Algunos prueban entradas inválidas (S2a/S2b). Frontend: cero. Entrega: GitHub en pausa, commits en
  la rama y merge local al final. RDD encendida: se evalúa por commit.
- 2026-10-16, T1 (`b82f1780`): 80 → 9. Conservados: S2a en `permisos.util.spec.ts:84`,
  `acciones.guard.spec.ts:97`, `refresh-token.use-case.spec.ts:198`,
  `agregar-componente.use-case.spec.ts:151`; S2b en `usuario.entity.spec.ts:102,108` y
  `equipos.dto.spec.ts:276,353`; S2c en `recuperacion-password.module.spec.ts:83` (lee el
  `storageService` protegido de un guard que arma la DI, sin subclase posible). Defecto destapado: el
  fixture de selección de `auth.controller.spec.ts` no tenía `ticket`, y `toEqual` lo ignoraba.
  En `calendario-laboral.repositorios.integration.spec.ts` el reemplazo de `$transaction` tipa
  `any` (el archivo ya lo usaba) en vez de castear. Evidencia: 32 archivos, 496 tests antes y
  después (spot check del padre igual); conteos `it(`/`expect(` iguales; typecheck 0.
- 2026-10-16, T2 (`4d041157`): 81 → 2, los dos S2a (`importacion-legacy/paquete.spec.ts:33`,
  `puntaje-csat.spec.ts:37`). Los `codigo` no declarados de `insumos.dto.spec.ts` pasaron a
  `toHaveProperty`/`not.toHaveProperty`, sin cast. Defectos destapados: `fakeOperacion` de
  `tickets.controller.spec.ts` era un objeto suelto (ahora `OperacionTicketEntity.reconstitute`), el
  doble de `IUsuarioMasterChecker` no tenía `getAutorizacionModulos` ni `listarTecnicosAsignables`, y
  `exportar-tickets` usaba un resultado falso en vez de `Result.ok`. Evidencia: 28 archivos, 517 tests
  antes y después; conteos iguales; typecheck y lint 0 en todo el backend.
- 2026-10-16, corrección de T1 (`5692abbd`): el cast S2c de `recuperacion-password.module.spec.ts` se
  sacó con acceso por corchetes (`guard['storageService']`), el mismo patrón que usó T2. Quedan 10 en
  8 archivos, todos S2a/S2b. Spot check del padre: 29 archivos, 522 tests; typecheck y lint 0.
- 2026-10-16, T3 (`f8c6957c`): el ratchet cuenta `as unknown as` (regex
  `\bas\s+unknown\s+as\b`); base 0/0 → 9/7 (mide solo `backend/src`; el de
  `backend/scripts/importacion-legacy` queda fuera, como antes). Prueba de falla en una copia
  `mktemp -d` con un `as unknown as` agregado: el script nuevo falla ("SUBIERON — 10 en 8"), el viejo
  pasaba. Roadmap: la fila de deuda dice 9 en 7. `prettier --check` del script ya fallaba antes del
  cambio (no se tocó).
- 2026-10-16: `check-roadmap-fresco` falla en `main` por antigüedad del ancla (`7286b64f`, 79 commits,
  umbral 75): ya pasaba antes de esta feature, y arreglarlo pide re-contrastar el roadmap contra el
  código. Queda fuera de alcance; se reporta al dueño.
- 2026-10-16, cierre: suite completa del backend en verde (741 archivos, 8877 tests). Diff contra
  `main` revisado (§4.2): 63 archivos, specs más el script del ratchet, el roadmap y este documento;
  sin `.only`/`.skip`, secretos ni código de producción. RDD: `assess --base-ref fe632685
  --committed-only` → medium, `review_due` false (`under_budget`). El dueño pidió "cuando pase la
  suite, mergealo a main": merge local a `main`. Deuda aparte: el helper `espiado` repetido en los
  specs de controllers; el ancla vencida de `check-roadmap-fresco`.
