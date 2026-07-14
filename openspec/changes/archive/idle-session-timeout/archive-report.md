# Archive Report: idle-session-timeout

> Archived: 2026-07-15
> Verdict: PASS WITH WARNINGS — 0 CRITICAL (resolved during archive phase)
> Status: CLOSED — pre-deploy actions pending (see below)

---

## Summary

Auto-logout por inactividad a los 15 minutos en el frontend Next.js, con modal de aviso countdown (60s) antes del corte. El corte reusa `POST /api/auth/logout` sin ningún cambio de backend — la revocación server-side del `rt` y la limpieza de cookies `at`/`rt` ya existía y quedó intacta (Approach A de la propuesta). Cubre: anti-bypass por refresh (inicialización desde `localStorage`), sync entre pestañas vía evento `storage`, no-op total sin sesión, y la decisión de seguridad ADR-8 (durante el aviso, solo el clic explícito en "Seguir conectado" resetea el conteo — la actividad pasiva/jitter del mouse NO lo hace).

**Riesgo de seguridad mitigado**: una estación desatendida (mostrador, oficina compartida) con sesión abierta quedaba viva hasta el vencimiento natural del `rt` (7 días). Ahora corta a los 15 min con aviso previo.

---

## Work-Units Delivered (3 PRs mergeados a master)

### PR1/3 — Constantes + storage (Fase 1, tasks T1-T4)

Files:
- `frontend/src/shared/auth/idle-config.ts` — constantes puras (`IDLE_TIMEOUT_MS=900000`, `WARNING_BEFORE_MS=60000`, `ACTIVITY_THROTTLE_MS=1000`, `IDLE_ACTIVITY_EVENTS`)
- `frontend/src/shared/auth/idle-config.test.ts`
- `frontend/src/shared/auth/idle-storage.ts` — read/write `localStorage` con guards `typeof window` + try/catch, `signalLogout()`
- `frontend/src/shared/auth/idle-storage.test.ts`

### PR2/3 — Hook `useIdleTimeout` (Fase 2, tasks T5-T6) — commit `e72e9f99`

Files:
- `frontend/src/shared/hooks/use-idle-timeout.ts` — máquina de estados `active → warning → cutoff`, `now` inyectable (ADR-1), init desde `localStorage` (ADR-2, anti-bypass), listener `storage` read-only (ADR-3, sync cross-tab), actividad pasiva ignorada durante warning (ADR-8)
- `frontend/src/shared/hooks/use-idle-timeout.test.ts` — 9 casos iniciales + 2 agregados post-verify (11 total, ver "Cobertura post-verify" abajo)

### PR3/3 — Dialog + Provider + wiring (Fase 3-4, tasks T7-T13) — commit `49c09d17`

Files:
- `frontend/src/components/shell/idle-warning-dialog.tsx` — Radix `AlertDialog`, espejo de `confirm-dialog.tsx`, no-dismiss por ESC/overlay (ADR-6)
- `frontend/src/components/shell/idle-warning-dialog.test.tsx`
- `frontend/src/shared/providers/idle-timeout-provider.tsx` — `enabled = user != null && !isLoading` (ADR-4), `handleCutoff()` con orden `signalLogout → fetch logout → assign` (ADR-5)
- `frontend/src/shared/providers/idle-timeout-provider.test.tsx`
- `frontend/src/shared/providers/providers.tsx` (EDIT) — monta `IdleTimeoutProvider` dentro de `SessionProvider`, envolviendo `TenantContextProvider`

Reusado sin cambios: `api/auth/logout/route.ts`, `middleware.ts`, `cookies.ts`, `client.ts`, `use-session.ts`, `confirm-dialog.tsx` (patrón).

### Cobertura post-verify (mismo PR3, batch adicional — ver apply-progress.md)

2 tests agregados a `use-idle-timeout.test.ts` (case 10: countdown decrementa 60→59→58→57 tick a tick; case 11: refresh en rango medio ~10min continúa el conteo sin resetear) para cerrar los 2 WARNING de cobertura del verify-report. Cero cambios en código de producción — 100% en el archivo de test. Suite subió de 584 a 586 tests.

---

## Test Results (última corrida, apply-progress)

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Frontend Vitest | 71 files | **586 passed, 0 failed** | PASS |

Lint (`next lint`): exit 0 — solo 2 warnings preexistentes no relacionados (`app-shell.test.tsx`, `TicketFormModal.test.tsx`), no introducidos por este change.
Type-check (`tsc --noEmit`): exit 0, cero errores.
Scope check: cero archivos de `backend/` tocados. `rg "as any|as unknown as"` sobre los 5 archivos fuente+test del change → 0 matches.

---

## Verify Verdict y Resolución del CRITICAL

**Veredicto del verify-report (#1839)**: PASS WITH WARNINGS.

- **1 CRITICAL** al momento del verify: el texto original del delta spec decía que CUALQUIER actividad (incluida pasiva) durante el aviso debía resetear el timer y cerrar el modal — pero `design.md` ADR-8 y la implementación deliberadamente NO resetean con actividad pasiva durante el warning, solo con clic explícito en "Seguir conectado". Contradicción spec-vs-implementación.
  - **Resuelto en fase archive (2026-07-15)**: se amendó el delta spec con un nuevo Scenario explícito ("Durante el aviso, la actividad pasiva NO reinicia el conteo (ADR-8 — seguridad)") documentando la excepción ratificada por el usuario, con rationale citando ADR-8. Este texto amendado es el que se fusionó al spec maestro. **CRITICAL cerrado — sign-off explícito registrado en el propio spec.**
- **2 WARNING** de cobertura de tests (countdown tick-a-tick, refresh en rango medio): **cerrados** en el batch post-verify (ver arriba), sin tocar código de producción.
- **T12 (QA manual e2e, 5 escenarios)**: correctamente dejado sin marcar — no automatizable con vitest. **Sigue pendiente — ver "Acciones pendientes PRE-DEPLOY" abajo.**

---

## Requirements Agregados al Spec Maestro

`openspec/specs/frontend-auth/spec.md` — nueva sección "## Idle Session Timeout" con 8 Requirements ADDED (no se modificó ningún requirement existente):

| # | Requirement | Scenarios |
|---|-------------|-----------|
| 1 | Auto-logout por inactividad tras 15 minutos | 3 (incluye la enmienda ADR-8 sobre actividad pasiva) |
| 2 | Aviso de cuenta regresiva antes del corte | 2 |
| 3 | "Seguir conectado" reinicia la sesión sin re-login | 1 |
| 4 | Corte real de sesión al agotarse el countdown | 2 |
| 5 | No-op del timer sin sesión autenticada | 2 |
| 6 | Sincronización de inactividad entre pestañas | 2 |
| 7 | Persistencia de última actividad ante refresh o remount | 2 |
| 8 | Constantes de configuración del idle-timeout | 1 |

Spec maestro pasó de 6 a 14 Requirements totales (156 → 296 líneas). Verificado: cero requirements preexistentes removidos o modificados.

---

## Acciones Pendientes PRE-DEPLOY (bloqueantes, explícitas)

1. **T12 — QA manual e2e (5 escenarios, NO automatizable con vitest)**. Antes de considerar esto producción-ready, un humano debe verificar en `pnpm dev` (o entorno de prueba):
   - (a) el modal con countdown aparece a los 14 min de inactividad real (o con los umbrales bajados temporalmente sin commitear el override);
   - (b) "Seguir conectado" cierra el modal y resetea el conteo (confirmar en Network/localStorage que NO hay logout);
   - (c) countdown a 0 dispara `POST /api/auth/logout` (Network tab) + redirect a `/login`;
   - (d) refresh a los ~10 min NO resetea el conteo (inspeccionar `localStorage['soporte:idle:last-activity']` antes/después);
   - (e) dos pestañas: actividad en una resetea la otra; corte en una redirige a la otra SIN un segundo `POST /api/auth/logout` (un solo POST, en la pestaña originante).

2. **Deploy real vía `deploy.ps1` al VPS**. Mergear a `master` NO deploya — este repo no tiene CI/CD automático. El código está en `master` (586 tests verdes) pero el VPS de producción sigue corriendo la versión anterior hasta que se ejecute el script de deploy manualmente. Sin este paso, la feature NO está activa para usuarios reales.

Ninguna de las dos acciones es responsabilidad de este archive — quedan registradas aquí como el gate real antes de dar la feature por entregada end-to-end.

---

## PRs

| PR | Contenido | Estado |
|----|-----------|--------|
| #42 | PR1/3 — constantes + storage (Fase 1) | Mergeado a master |
| #43 | (intento intermedio) | Cerrado/superado por #44-#45 |
| #44 | PR2/3 — hook `useIdleTimeout` (Fase 2) | Mergeado a master (`e72e9f99`) |
| #45 | PR3/3 — dialog + provider + wiring + cobertura post-verify (Fase 3-4) | Mergeado a master (`49c09d17`) |

Delivery strategy: `ask-on-risk` → resuelto en chained PRs (recomendado por `tasks.md` Review Workload Forecast: ~750-870 líneas totales agregadas, > 400 líneas de presupuesto de review en un solo PR).

---

## Artifact Inventory

| Artifact | Location |
|----------|----------|
| Proposal | `openspec/changes/archive/idle-session-timeout/proposal.md` |
| Spec delta (frontend-auth) | `openspec/changes/archive/idle-session-timeout/specs/frontend-auth/spec.md` |
| Design | `openspec/changes/archive/idle-session-timeout/design.md` |
| Tasks | `openspec/changes/archive/idle-session-timeout/tasks.md` |
| Apply progress | `openspec/changes/archive/idle-session-timeout/apply-progress.md` |
| Verify report | `openspec/changes/archive/idle-session-timeout/verify-report.md` |
| Archive report (this file) | `openspec/changes/archive/idle-session-timeout/archive-report.md` |
| Canonical frontend-auth | `openspec/specs/frontend-auth/spec.md` |

### Engram Observation IDs (lineage / traceability)

| Artifact | Topic Key | Observation ID |
|----------|-----------|-----------------|
| Proposal | `sdd/idle-session-timeout/proposal` | #1834 |
| Spec (delta, amended) | `sdd/idle-session-timeout/spec` | #1835 |
| Design | `sdd/idle-session-timeout/design` | #1836 |
| Tasks | `sdd/idle-session-timeout/tasks` | #1837 |
| Apply progress | `sdd/idle-session-timeout/apply-progress` | #1838 |
| Verify report | `sdd/idle-session-timeout/verify-report` | #1839 |
| Archive report (this content) | `sdd/idle-session-timeout/archive-report` | (saved by this phase) |

---

## SDD Cycle Complete

El change fue planeado, implementado (strict TDD, RED→GREEN), verificado (PASS WITH WARNINGS, 0 CRITICAL tras enmienda de spec) y archivado. El código está mergeado en `master` (586 tests verdes, lint y typecheck limpios). **NO está deployado en producción** — quedan 2 acciones pendientes explícitas antes de considerar esto entregado end-to-end: QA manual e2e (T12) y deploy vía `deploy.ps1`.
