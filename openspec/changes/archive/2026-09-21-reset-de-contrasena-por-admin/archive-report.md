# Archive Report: Reset de contraseña por admin/root

**Cambio**: `reset-de-contrasena-por-admin`  
**Fecha de cierre**: 2026-09-21  
**Rama**: `feat/reset-password-frontend`  
**HEAD al cierre**: `5a5c6dc` (árbol limpio)  
**Veredicto final**: **PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING abierta (era 3 en ronda 1)

---

## Resumen ejecutivo

El ciclo SDD cierra exitosamente. Las tres unidades de trabajo (caso de uso + endpoint + frontend) están **completamente implementadas y verificadas**. Los 28 tasks están marcados `[x]` en el artefacto persisted. Las cuatro compuertas de calidad (lint, typecheck, tests en backend y frontend) pasan sin errores. El cambio está listo para entrega.

---

## Final-State Authority

Este informe registra el estado REAL del cambio AL CIERRE, 2026-09-21. Dos artefactos intermedios (`apply-progress.md` y `verify-report.md`) fueron persisted durante el ciclo, pero capturaban estados en momentos anteriores; el presente informe supercede sus afirmaciones cuando hay divergencia.

### Hechos de autoridad máxima (explícitamente señalados en el handoff del orquestrador)

| Hecho | Evidencia | Nota |
|---|---|---|
| HEAD y árbol limpio | Verificado hoy por el orquestador | Branch `feat/reset-password-frontend`, commit `5a5c6dc` |
| **W1 CERRADA** (`@MinLength(8)` sin test) | Mutación re-corrida hoy: 2 failed \| 9 passed | Commit `4c5b859` — defensor identificado y falsa alarma resuelta |
| **W2 CERRADA** (`@HttpCode(204)` sin test) | Mutación re-corrida hoy: 1 failed \| 29 passed | Commit `4c5b859` — test agregado, mutación ahora mata la aserción |
| **W3 sigue ABIERTA, a propósito** | Brecha declarada en `design.md:383` | El login del usuario con la clave nueva es composición, no observación directa. Se verifica por `scripts/reset-password.ts:6-19` como evidencia histórica del incidente |
| Tests: backend **432 archivos / 5161 tests** | Re-ejecución independiente | Cifra final. La ronda 1 del `verify-report.md` (2026-09-18, árbol `e67d787`) reportó 5157; entre esa fecha y hoy se agregaron exactamente 4 tests en `4c5b859` |
| Tests: frontend **188 archivos / 1424 tests** | Re-ejecución independiente | Cifra final. Sin cambios desde ronda 1 |

### Reconciliación de cifras entre artefactos intermedios y final

El `verify-report.md` tiene **dos rondas**:

- **Ronda 1** (§1-10, 2026-09-18, árbol `e67d787`): 5157 tests de backend, 3 WARNING abiertas
- **Ronda 2** (§11, 2026-09-21, árbol `1553d0f`): el mismo árbol `e67d787` + commit `4c5b859` (test agregado) = árbol `1553d0f` = 5161 tests, 1 WARNING abierta

Entre ronda 1 y ronda 2, **no cambió ni una sola línea de código de producción** — solo se agregó un test defensivo (`4c5b859`). La ronda 2 es adenda de la ronda 1 y su cabecera (`evidence_revision: sha256:e427…`) declara el árbol `1553d0f` como vigente. Las cifras que presenta arriba son las de ronda 2.

---

## Tareas

| Métrica | Valor | Estado |
|---|---|---|
| Tareas totales | 28 | ✅ completadas |
| Tareas implementadas | 28 | ✅ todas marcadas `[x]` |
| Tareas pendientes | 0 | ✅ ninguna |
| Bloqueantes de archivado | 0 | ✅ no hay |

**Validación**: `tasks.md` en la rama y en el árbol archivado reporta 28/28 con todas las casillas tildadas. No hay unchecked implementation tasks. El Task Completion Gate pasa sin necesidad de reconciliación excepcional.

---

## Verificación

### Compuertas de calidad (2026-09-21, con `soporte-postgres-master` levantado)

| Compuerta | Resultado | Detalle |
|---|---|---|
| `backend/ pnpm lint` | ✅ exit 0 | eslint . — sin salida |
| `backend/ pnpm typecheck` | ✅ exit 0 | tsc --noEmit — sin salida |
| `frontend/ pnpm lint` | ✅ exit 0 | next lint — sin advertencias |
| `frontend/ pnpm type-check` | ✅ exit 0 | tsc --noEmit — sin salida |
| `backend/ pnpm test` | ✅ **432 archivos / 5161 tests**, 0 fallidos | Incluye las 4 pruebas nuevas de `4c5b859` |
| `frontend/ pnpm test` | ✅ **188 archivos / 1424 tests**, 0 fallidos | Sin cambios desde ronda 1 |

Agregado de los dos paquetes: **6585**. Cuidado al releer la ronda 1 del
`verify-report.md`: ahí el agregado es **6581**, y es correcto para *esa* ronda
(5157 + 1424). El de hoy es 6585 porque `4c5b859` suma 4 tests al backend.

**Nota al leer `pnpm test` del backend**: la salida imprime un bloque
`Failed Suites 1` sobre `orden-de-arranque.spec.ts`. No es un fallo.
`test/entorno-corte-arranque.spec.ts` lanza un Vitest hijo con `execFileSync`,
borrando a propósito una variable de entorno requerida, para probar que el guard
corta el arranque; el hijo DEBE fallar y su stdout se filtra al padre. La señal
que manda es el conteo final (`432 passed (432)`, sin línea de `failed`) y el
exit code.

### Veredicto de verificación

**PASS WITH WARNINGS** (por `sdd-verify`, ronda 2). Resumen:

- **0 CRITICAL**: nada bloquea archivado
- **1 WARNING abierta**: la segunda mitad del escenario de R1 ("el usuario puede loguearse con la contraseña nueva") se verifica por composición (el endpoint devuelve 204, el usuario quedó hasheado con la instancia correcta, el login usa la misma instancia), pero no se observa en ejecución un test que pruebe el login post-reset. Este es un seguimiento conocido, no un hallazgo de este cierre — estaba anotado en ronda 1 y se confirma en ronda 2.
- **3 SUGGESTION**: anotadas en `verify-report.md:§9`, todas resueltas en la adenda de ronda 2. No se repiten acá.

---

## Artefactos sincronizados

### Delta Specs → Main Specs

El spec delta en `openspec/changes/reset-de-contrasena-por-admin/specs/usuarios-reset-password/spec.md` fue copiado (mecanismo shell, sin lectura de modelo) a `openspec/specs/usuarios-reset-password/spec.md` para crear la entrada de autoridad en el árbol de especificaciones principales.

| Paso | Acción | Resultado |
|---|---|---|
| 1. Copia mecánica | `cp` (shell) | ✅ |
| 2. Verificación diff | `diff -r` (fuente vs. destino) | ✅ empty diff (byte-identical) |

---

## Cambio archivado

| Elemento | Ubicación | Contenido |
|---|---|---|
| Carpeta cambio original | ~~`openspec/changes/reset-de-contrasena-por-admin`~~ | Movida (git mv) |
| Carpeta archivada | `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/` | ✅ Presente |
| Artefactos dentro del archivo | `exploration.md`, `proposal.md`, `specs/usuarios-reset-password/spec.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `archive-report.md` | ✅ Los ocho presentes |
| `state.yaml` | — | ⛔ **No existe, y nunca existió en este ciclo.** El dispatcher nunca lo escribió; el estado se deriva de los artefactos. No es una pérdida del archivado |
| Fuente (actividad) | Verificación post-move | ✅ Ausente (mv completado) |

**Verificación de integridad**: `diff -r` entre el snapshot pre-move y la carpeta archivada (excluido archive-report.md, que es aditivo) reportó cero diferencias. No hay truncamiento ni alteración de bytes.

---

## Honestidad de alcance

Se verificó contra `git` la adherencia a los límites del proposal:

| Afirmación de límite | Verificación | Resultado |
|---|---|---|
| WU-3 tocó SOLO `frontend/` | `git show --name-only` commits WU-3 | ✅ |
| `AdminClienteGuard` no se reescribió | `git diff main...HEAD` — ausente | ✅ |
| `backend/scripts/reset-password.ts` sin cambios | Mismo diff — ausente | ✅ |
| `toHttpException` sin tocar | Diff de `usuarios.controller.ts` — sin hunks en `:138-151` | ✅ |
| `backend/ayuda/*.md` sin cambios | Diff — ausente; deuda anotada en commit | ✅ deuda registrada en `87fdb87` |
| Email y notificaciones sin tocar | Ausentes del diff | ✅ |

El ciclo contiene un cuarto commit (`e4c8257`, `test(auth)`), no previsto en los tres work units del plan inicial. Es una corrección defensiva de un test de metadatos del guard; **no introduce código de producción**.

---

## Seguimientos (no son blockers ni deuda de este ciclo)

Registrados para ciclos posteriores si alguien necesita ampliar la superficie:

### W3: Composición vs. observación

**Origen**: `proposal.md:67`, `design.md:383`

**Estado**: Intencionalmente abierto. El escenario "el usuario puede loguearse con la contraseña nueva" se verifica por composición del contrato del sistema:

1. El endpoint devuelve 204 (credencial cambió)
2. `usuario.hashPassword()` usó la instancia de `IHashProvider` que el login verifica
3. Histórico: `scripts/reset-password.ts:6-19` documenta el incidente de hash inconsistente

Un test de integración/e2e que intente login post-reset quedaría fuera de alcance (design.md:383, "Integración/e2e: no se agregan"). **Queda como entrada natural para quien levante tests de integración del módulo de auth.** Acceso a memoria: observación `sdd/reset-de-contrasena-por-admin/archive-report` bajo `soporte`.

### S1 — Deuda ajena a este ciclo

**Ubicación**: `backend/src/auth/interface/controllers/tipos-componente.controller.spec.ts:56-62`

**Problema**: Un test de autorización de endpoint ROOT-only no puede fallar porque lee `GUARDS_METADATA` sin `?? []` y asserta con `.toContain` sobre un array posiblemente indefinido.

**Decisión**: Medido y marcado. Deuda de ciclo DIFERENTE, no de este. Requiere su propio análisis de por qué el metadata se ausenta en ese punto.

### Deuda de Ayuda

**Pausa declarada**: 2026-09-07 por decisión del dueño del repo. Vigente durante este ciclo.

**Registro**: La deuda queda anotada en el commit `87fdb87` (cuerpo del commit y en el PR) porque el cambio agrega una capacidad visible en `Admin > Usuarios`. Al levantar la pausa, ese registro es la entrada para la tanda de escritura de artículos.

**Excepción**: Si un artículo existente quedara FALSO por este cambio, corregirlo (no esperar la pausa). Este ciclo no generó ninguno.

---

## Referencias de traceabilidad

### Archivos de artefactos (openspec mode)

- **Proposal**: `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/proposal.md`
- **Specs**: `openspec/specs/usuarios-reset-password/spec.md` (main) y `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/specs/usuarios-reset-password/spec.md` (delta)
- **Design**: `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/design.md`
- **Tasks**: `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/tasks.md` (28/28 ✅)
- **Apply Progress**: `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/apply-progress.md`
- **Verify Report**: `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/verify-report.md` (ronda 2, 1 WARNING abierta, 0 CRITICAL)
- **Archive Report** (este archivo): `openspec/changes/archive/2026-09-21-reset-de-contrasena-por-admin/archive-report.md`

### Commit references

- WU-1: caso de uso → commit `46b6abc`
- WU-2: endpoint → commit `4c5b859` (incluye corrección de test de `e4c8257`)
- WU-3: frontend → commit `87fdb87`
- Corrección defensiva de test de guard → commit `e4c8257` (aislado, no de producción)
- Verificación (ronda 2) → commit `5a5c6dc` (informe)

---

## Conclusión

**Estado final**: ✅ **ARCHIVADO Y CERRADO**

El ciclo SDD para "Reset de contraseña por admin/root" se ha completado exitosamente. Todos los artefactos han sido sincronizados a sus ubicaciones de autoridad:

- El spec delta se propagó a la fuente de verdad en `openspec/specs/usuarios-reset-password/`
- La carpeta del cambio fue movida al archivo con timestamp de fecha
- Las 28 tareas implementadas están verificadas y marcadas en el artefacto persisted
- Las compuertas de calidad (lint, typecheck, tests) pasaron en verde
- El veredicto de verificación es **PASS WITH WARNINGS** con 0 CRITICAL

El cambio está listo para entrega bajo la política de repositorio ordinaria. No hay blockers técnicos.

---

**Archivado**: 2026-09-21 · **Ciclo**: reset-de-contrasena-por-admin · **Store**: openspec · **Rama origen**: feat/reset-password-frontend
