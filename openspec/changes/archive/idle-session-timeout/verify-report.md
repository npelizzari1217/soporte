## Verification Report

**Change**: idle-session-timeout
**Version**: spec #1835 / design.md (ADR-1..8) / tasks.md T1-T13
**Mode**: Strict TDD
**Branch**: feat/idle-timeout-pr3-provider-wiring (PR1+PR2+PR3 in working tree)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 13 |
| Tasks complete | 12 (T1-T11, T13) |
| Tasks incomplete | 1 (T12 — manual e2e QA, correctly left unchecked, not automatable) |

### Build & Tests Execution (real output, run in frontend/)
**Tests**: ✅ 584 passed / 0 failed / 0 skipped, 71 test files, Duration 67.41s
```
$ pnpm test
 RUN  v4.1.9 /home/usuario/proyectos/soporte/frontend
 Test Files  71 passed (71)
      Tests  584 passed (584)
   Start at  00:09:21
   Duration  67.41s
```

**Lint**: ✅ Passed (exit 0), only 2 pre-existing unrelated warnings (unused vars in app-shell.test.tsx / TicketFormModal.test.tsx — not introduced by this change)
```
$ pnpm lint
./src/components/shell/app-shell.test.tsx
23:15  Warning: 'JwtPayload' is defined but never used.
./src/features/tickets/components/TicketFormModal.test.tsx
73:10  Warning: 'makeWrapper' is defined but never used.
415:11  Warning: 'dialog' is assigned a value but never used.
```

**Type-check**: ✅ `tsc --noEmit` exit 0, zero output (zero errors).

**Coverage**: not available — no `--coverage` script/config in this repo. Not a failure per protocol.

**Scope check**: `git status --short` shows only `frontend/` files touched (idle-config/idle-storage/use-idle-timeout unchanged from PR1/PR2; new: idle-warning-dialog.tsx(+test), idle-timeout-provider.tsx(+test); edited: providers.tsx) + tasks.md. Zero backend files touched. `rg "as any|as unknown as"` over all 5 idle-timeout source+test files → 0 matches.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Auto-logout 15 min | Sin interacción 15min → corte | `use-idle-timeout.test.ts > case 2` | ✅ COMPLIANT |
| Auto-logout 15 min | Actividad reinicia contador (+ cierra modal si visible) | `use-idle-timeout.test.ts > case 4` (throttle only) | ⚠️ PARTIAL — see CRITICAL-1 below |
| Aviso countdown | A los 14min aparece modal secondsLeft=60 | `use-idle-timeout.test.ts > case 1`, `idle-warning-dialog.test.tsx` | ✅ COMPLIANT |
| Aviso countdown | Countdown decrementa cada segundo (60→59→...) | (none found — only initial value and final onCutoff asserted, no intermediate tick assertion) | ❌ UNTESTED |
| Seguir conectado | Click resetea timer y cierra modal | `use-idle-timeout.test.ts > case 3`, `idle-warning-dialog.test.tsx` (click test) | ✅ COMPLIANT |
| Corte real de sesión | Countdown 0 → POST /api/auth/logout + redirect /login | `idle-timeout-provider.test.tsx > case 4` (order signalLogout→fetch→assign) | ✅ COMPLIANT |
| Corte real de sesión | No debe quedar refresh silencioso posible | verified by reading `api/auth/logout/route.ts` (reused, untouched) — cookies always cleared regardless of backend response | ✅ COMPLIANT (via existing infra, no new test needed — backend not in scope) |
| No-op sin sesión | user===null → no timers/listeners | `use-idle-timeout.test.ts > case 8`, `idle-timeout-provider.test.tsx > case 1` | ✅ COMPLIANT |
| No-op sin sesión | isLoading===true → espera | `idle-timeout-provider.test.tsx > case 2` | ✅ COMPLIANT |
| Sync cross-tab | Actividad en 1 pestaña resetea las demás | `use-idle-timeout.test.ts > case 9` (storage event) | ✅ COMPLIANT |
| Sync cross-tab | Corte en 1 pestaña se propaga a todas | `idle-timeout-provider.test.tsx > case 6` | ✅ COMPLIANT |
| Persistencia ante refresh | Refresh a los 10min continúa (no resetea) desde ese punto | (none found — only tested at edges: already-expired `case 6`, and inside-warning-window `case 7`; the mid-range "still active, continues counting" branch of `scheduleTimers` has no dedicated covering test) | ⚠️ PARTIAL/UNTESTED (same code path as tested edges, low risk, but not directly asserted) |
| Persistencia ante refresh | Timestamp ya vencido → corte inmediato | `use-idle-timeout.test.ts > case 6` | ✅ COMPLIANT |
| Constantes centralizadas | IDLE_TIMEOUT_MS/WARNING_BEFORE_MS/ACTIVITY_THROTTLE_MS/events | `idle-config.test.ts` (4 assertions) | ✅ COMPLIANT |

**Compliance summary**: 11/14 scenarios fully COMPLIANT, 2 PARTIAL/UNTESTED (WARNING), 1 CRITICAL discrepancy (spec text vs. deliberate ADR-8 deviation, see below).

### Issues Found

**CRITICAL**:
1. **Spec/Design contradiction on activity-during-warning (Requirement "Auto-logout por inactividad", Scenario 2)**. The spec literally says: "WHEN ocurre un evento de mousemove, keydown, click o scroll THEN el sistema MUST reiniciar el contador... AND el modal de aviso, si estaba visible, MUST cerrarse" — i.e., ANY activity event (including passive mousemove) while the warning modal is open should reset the timer and close the modal. But `design.md` ADR-8 deliberately overrides this: "Mientras isWarning, los listeners de actividad NO resetean el timer; solo el click explícito en 'Seguir conectado' lo hace" — and the implementation (`use-idle-timeout.ts` line 154: `if (isWarningRef.current) return; // ADR-8: actividad pasiva NO resetea en warning`) follows the design, not the spec. This is a genuine, tested behavior (case 5 explicitly proves passive mousemove during warning does NOT close the modal / does NOT prevent cutoff) that contradicts the literal spec scenario text. The design's security rationale (jitter shouldn't silently extend a session) is arguably correct, but the spec document was never amended to reflect this intentional deviation — it should have been updated during the design phase (spec deltas can be revised when design finds a better tradeoff) or explicitly called out as an accepted spec exception. As written, this is a spec-vs-implementation mismatch that must be resolved before archive: either (a) amend the spec's Scenario 2 text to scope "activity resets/closes modal" to the ACTIVE state only and explicitly document the warning-state exception (referencing ADR-8), or (b) get explicit user/product sign-off that ADR-8's behavior is the accepted final behavior overriding the written scenario.

  **RESOLUTION (2026-07-15, archive phase)**: Resolved via option (a) — the delta spec's Scenario for "Auto-logout por inactividad" was amended with a new explicit Scenario "Durante el aviso, la actividad pasiva NO reinicia el conteo (ADR-8 — seguridad)" documenting the ratified exception, with rationale citing ADR-8 and explicit user sign-off dated 2026-07-15. This amended text is what was merged into the master spec `openspec/specs/frontend-auth/spec.md`. CRITICAL-1 is CLOSED.

**WARNING**:
1. Countdown decrement scenario ("60→59→...→0 cada segundo") has no dedicated test — only the initial value (60) at warning-entry and the final `onCutoff` call are asserted. The `setInterval(1000)` recompute logic in `use-idle-timeout.ts` (lines 122-130) is implemented straightforwardly but untested at the intermediate-tick level.

  **RESOLUTION**: Closed by apply-progress batch (#1838) — case 10 added to `use-idle-timeout.test.ts` asserting explicit 60→59→58→57 decrements.

2. "Refresh a los 10 minutos" (mid-range, still-active continuation from a persisted timestamp) has no dedicated test — only the two edges (already-expired, already-in-warning-window) are covered. Same `scheduleTimers` code path, low risk, but the literal spec scenario has no direct covering test.

  **RESOLUTION**: Closed by apply-progress batch (#1838) — case 11 added to `use-idle-timeout.test.ts` asserting mid-range (~10 min) refresh/remount continuation behavior. Test suite total moved from 584 to 586 passing tests.

3. `apply-progress` (#1838) does not include a literal "TDD Cycle Evidence" table in the format `strict-tdd-verify.md` expects (RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR columns per task). It does narratively document RED/GREEN status per task and per-batch DoD output, and this was independently cross-checked by re-running `pnpm test` (584/584 green), so the substance is present but not in the mandated table format. Recommend using the standard table format in future apply batches for easier audit.
4. T12 (manual e2e QA) is correctly left unchecked/pending in `tasks.md` — not a defect, but it is a real gap: before merging to production, a human must verify the 5 scenarios listed below (see "QA Manual Pendiente"). **STILL OPEN at archive time — see archive-report.md pending actions.**

**SUGGESTION**:
1. Consider adding the 2 missing WARNING-level test cases (countdown intermediate ticks, mid-range refresh continuation) to close the coverage gaps — both are low-effort additions to `use-idle-timeout.test.ts` given the existing fake-timer harness. **DONE — see WARNING resolutions above.**
2. Consider formally amending the spec doc (or adding a documented spec-exception note) for the ADR-8 deviation, so future readers of the spec don't get a false impression of the actual behavior. **DONE — see CRITICAL-1 resolution above.**

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-1 (hook API, `now` injectable, `onCutoff` pure) | ✅ Yes | Signature matches exactly; hook does no fetch/nav. |
| ADR-2 (init from localStorage, anti-bypass) | ✅ Yes (edges tested) | `readLastActivity()` used in `useEffect`, never in render. Edge cases (expired, in-warning-window) tested; mid-range continuation untested (WARNING above, now closed). |
| ADR-3 (cross-tab via `storage` event, read-only handler) | ✅ Yes | Activity propagation (hook case 9) and cutoff propagation (provider case 6) both tested; handler never re-writes to localStorage (asserted). |
| ADR-4 (provider inside SessionProvider, `enabled` guard, double-nested quirk) | ✅ Yes | `providers.tsx` composition matches exactly; `enabled = user != null && !isLoading` verified in provider cases 1-3. |
| ADR-5 (handleCutoff order: signalLogout → fetch logout → assign, idempotent) | ✅ Yes | Order + idempotency both explicitly asserted (provider cases 4, 5). `await` before `assign` confirmed in source. |
| ADR-6 (dialog non-dismissable, aria-live, focus management) | ✅ Yes | ESC prevented, no Cancel button, `role="timer"` + `aria-live="polite"`, focus forced to "Seguir conectado" via `onOpenAutoFocus` — all tested. |
| ADR-7 (config/storage module split) | ✅ Yes | Constants pure/no-window in `idle-config.ts`; I/O + guards in `idle-storage.ts`. |
| ADR-8 (passive activity ignored during warning) | ✅ Yes, spec amended to match (see CRITICAL-1 resolution) | Implementation and test (case 5) match design intent exactly; spec now reflects the exception. |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ Partial | Narrative per-task RED/GREEN in apply-progress + tasks.md checkboxes, but no literal table |
| All tasks have tests | ✅ | Every production file (idle-config, idle-storage, use-idle-timeout, idle-warning-dialog, idle-timeout-provider) has a matching `.test.ts(x)` |
| RED confirmed (tests exist) | ✅ | All 5 test files exist and were read in full |
| GREEN confirmed (tests pass) | ✅ | Re-ran `pnpm test` independently: 584/584 passed (586/586 after coverage-closing batch) |
| Triangulation adequate | ✅ | 9 cases for the hook (11 after coverage batch), 6 for dialog, 6 for provider — good variance, not single-case |
| Safety Net for modified files | ✅ | `providers.tsx` edit did not break `session-provider.test.tsx`/`tenant-context.test.tsx` (part of the 584/586 green) |

**TDD Compliance**: 5/6 checks fully passed (1 partial — table format only)

### Test Layer Distribution (this change only)
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 19 (21 after coverage batch) | 3 (`idle-config.test.ts`, `idle-storage.test.ts`, `use-idle-timeout.test.ts`) | vitest, fake timers |
| Integration | 12 | 2 (`idle-warning-dialog.test.tsx`, `idle-timeout-provider.test.tsx`) | @testing-library/react |
| E2E | 0 | 0 | none (T12 pending, manual) |
| **Total** | **31 (33 after coverage batch)** | **5** | |

### Assertion Quality
✅ All assertions verify real behavior — no tautologies, no ghost loops, no assertion-free tests found across all 5 test files. `idle-timeout-provider.test.tsx` uses `toHaveBeenCalledWith`/call-order assertions, which is appropriate here since the provider's entire responsibility is wiring/parameter-passing between hook and dialog (not incidental implementation detail). Mock/assertion ratio in the provider test (~4 module mocks vs ~12 expects) is well within acceptable bounds.

### QA Manual Pendiente (T12 — bloqueante antes de producción, no automatizable con vitest)
1. Modal con countdown aparece visualmente a los 14 min de inactividad real (o con `IDLE_TIMEOUT_MS`/`WARNING_BEFORE_MS` bajados temporalmente sin commitear el override).
2. "Seguir conectado" cierra el modal y resetea el conteo (verificar en Network/localStorage que no hay logout).
3. Countdown llegando a 0 dispara `POST /api/auth/logout` (verificar en Network tab) y redirige a `/login`.
4. Refresh del navegador a los ~10 min de inactividad NO resetea el conteo (inspeccionar `localStorage['soporte:idle:last-activity']` antes/después del refresh).
5. Dos pestañas abiertas con la misma sesión: actividad en una resetea el timer de la otra; el corte en una redirige a la otra sin un segundo `POST /api/auth/logout` (confirmar un solo POST en Network, en la pestaña originante).

### Verdict
**PASS WITH WARNINGS**
584/584 tests green at verify time (586/586 after the coverage-closing apply batch), lint/type-check clean, zero backend scope leakage, zero `as any`, all 8 requirements implemented with strong test coverage (11/14 scenarios fully compliant). The CRITICAL item (spec text contradicting ADR-8 implemented behavior) was resolved during archive phase via spec amendment (see CRITICAL-1 resolution above) — CLOSED. The 2 WARNING-level test gaps (countdown intermediate ticks, mid-range refresh continuation) were closed in the same apply batch. T12 manual QA (5 scenarios) remains pending before this is production-ready — tracked in archive-report.md as a pre-deploy blocker.

Session: manual-save-soporte
Project: soporte
Scope: project
Topic: sdd/idle-session-timeout/verify-report
Engram observation ID: #1839
