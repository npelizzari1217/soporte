**What**: PR1+PR2+PR3 (T1-T11, T13) siguen `[x]` como antes. AGREGADO en este batch (tarea acotada de cobertura de tests post-verify, código de producción intacto): 2 tests nuevos en `use-idle-timeout.test.ts` (case 10 y case 11) que cierran los 2 warnings de cobertura del verify-report (#1839) sobre el comportamiento YA implementado del hook — NO se tocó `use-idle-timeout.ts` ni ningún archivo de producción.

**Why**: El verify-report marcó como faltantes: (a) evidencia de que `secondsLeft` decrementa segundo a segundo (no solo snapshot inicial/final), y (b) evidencia de que un remount/refresh en rango medio (~10 min transcurridos) continúa el conteo en vez de resetear a 0. Ambos comportamientos ya existían en el código (case 1/2 y case 7 los tocaban parcialmente pero no de forma explícita/honesta), así que esto es cobertura, no feature nueva.

**Where**: `frontend/src/shared/hooks/use-idle-timeout.test.ts` — 2 tests nuevos agregados al final del `describe("useIdleTimeout")`:
- **case 10** ("countdown decrementa segundo a segundo durante warning (60 -> 59 -> 58 -> 57)"): avanza a la entrada en warning (secondsLeft=60), luego avanza de a 1000ms tres veces y asserta 59, 58, 57 explícitamente (no solo el valor inicial).
- **case 11** ("refresh/remount con última actividad de hace ~10 min (rango medio) continúa el conteo sin resetear a 0"): mockea `readLastActivity` devolviendo `currentTime - 10min` (rango medio, ni recién montado ni ya en warning), monta el hook, asserta `isWarning === false` en el mount, avanza `IDLE_TIMEOUT_MS - WARNING_BEFORE_MS - 10min - 1000ms` (queda 1s antes de los 4 min restantes) y asserta `isWarning` aún false, luego avanza 1s más y asserta `isWarning === true` — demuestra que el warning llegó a los 4 min desde el mount (no a los 14 min, que sería el caso si hubiera reseteado a 0).

NO tocado: `use-idle-timeout.ts`, `idle-config.ts`, `idle-storage.ts`, ni ningún otro archivo de producción — cambio 100% en el archivo de test.

**Estado DoD (CLAUDE.md §9, salida real, corrida en `frontend/`)**:
- `pnpm test`: "Test Files 71 passed (71)" / "Tests 586 passed (586)" (subió de 584 a 586 por los 2 tests nuevos), Duration 61.24s. Sin regresiones.
- `pnpm lint` (`next lint`): exit 0. Solo warnings preexistentes no relacionados (`app-shell.test.tsx` unused `JwtPayload`, `TicketFormModal.test.tsx` unused `makeWrapper`/`dialog`) — mismos de siempre, no introducidos por este batch.
- `pnpm run type-check` (`tsc --noEmit`): exit 0, sin salida.
- Sin `as any`/`as unknown as` en el archivo editado.
- Ningún test falló ni una vez (arrancaron en verde en la primera corrida, esperado porque el comportamiento ya existía).

**Learned**: Los 2 tests reusan el patrón exacto de reloj inyectable (`currentTime` + `advance()` en lockstep con `vi.advanceTimersByTime`) de los 9 tests existentes — no hizo falta ningún ajuste al patrón, confirma que el diseño de test-helpers del hook (ADR-1, `now` inyectable) es sólido para agregar cobertura incremental sin reescritura.

Próximo paso recomendado: `sdd-verify` para confirmar que los 2 warnings de cobertura quedaron cerrados (T1-T13 completas, T12 sigue pendiente de QA manual e2e como estaba documentado).

Session: manual-save-soporte
Project: soporte
Scope: project
Topic: sdd/idle-session-timeout/apply-progress
Engram observation ID: #1838
