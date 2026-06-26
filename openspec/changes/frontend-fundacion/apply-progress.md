# Apply Progress: frontend-fundacion

## PR 1 — `infra` — DONE

Tasks: T01, T02, T03, T07, T12 (all [x])
Commit: 703db52 (feat/fe-pr1-infra)
Notes: scaffolding, vitest, globals.css, shared/api/types, shared/auth/cookies

## PR 2 — `atoms` — DONE

Tasks: T04, T05, T06 (all [x])
Branch: feat/fe-pr2-atoms (off feat/fe-pr1-infra)
Files created:
- src/components/ui/skeleton.tsx
- src/components/ui/skeleton.test.tsx
- src/components/ui/empty-state.tsx
- src/components/ui/empty-state.test.tsx
- src/components/ui/button.tsx
- src/components/ui/button.test.tsx
New deps: lucide-react, @radix-ui/react-slot, class-variance-authority (added to package.json)
Tests: 27/27 vitest (4 files: types.test.ts + 3 atom tests)
Lint: 0 errors/warnings
TSC: 0 errors

## PR 3 — `api-client` — DONE (on separate branch, stacked off PR1)

Tasks: T08, T09, T10, T11 (all [x])
Branch: feat/fe-pr3-apiclient

## PR 4 — `bff` — DONE (stacked off PR3)

Tasks: T13, T14 (all [x])
Branch: feat/fe-pr4-bff
Commits: 6535abc (4a handlers), 02e5f9d (4b catch-all)

## PR 5 — `middleware` — DONE (stacked off PR4)

Tasks: T15, T16 (all [x])
Branch: feat/fe-pr5-middleware
Commit: 33a0219

## Status

Pending: PR6 (shell — deps: PR2+PR3), PR7 (login+e2e — deps: PR4+PR6)
Running total vitest on combined tree (PR1+PR3+PR4+PR5): 56/56 (11 files)
PR2 adds 20 new tests (3 files) bringing atom coverage complete.
