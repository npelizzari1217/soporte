# Apply Progress — PR3 (admin-general)

**Branch:** `feat/admin-general-pr3-usuarios`
**Change:** `admin-general`
**Scope:** T3.1–T3.10 (backend usuarios: crear, listar, PATCH baja)
**Status:** DONE — all tasks complete, 5 commits pushed to branch

---

## Commits (work-unit, per layer)

| Commit | Hash | Descripción |
|--------|------|-------------|
| 1 | `43cc70e` | domain: extend errors + IUsuarioRepository port (T3.1) |
| 2 | `cf3bc7f` | repo: fix findByClienteId soft-delete + add create (T3.1) |
| 3 | `71e9a5f` | application: CrearUsuario, ListarUsuarios; extend BajaUsuario (T3.2–T3.6) |
| 4 | `1cf64f8` | style: prettier formatting to application use-case files |
| 5 | `403e6b2` | interface: UsuariosController POST/GET/PATCH baja + AuthModule wiring (T3.7–T3.10) |

---

## Task Checklist

### PR3 — Backend usuarios (T3.1–T3.10)

- [x] T3.1 — IUsuarioRepository: add `findByClienteId` + `create` port; fix soft-delete filter in PrismaUsuarioRepository
- [x] T3.2 — CrearUsuarioUseCase: email conflict check, rol lookup, hash password, activo=true, isGlobalAdmin=false
- [x] T3.3 — CrearUsuarioUseCase.spec: 11 tests RED→GREEN (email conflict, rol inválido, no password_hash en Result, globalAdmin invariant)
- [x] T3.4 — ListarUsuariosUseCase: delegación a findByClienteId (filtro soft-delete en repo layer)
- [x] T3.5 — ListarUsuariosUseCase.spec: test coverage
- [x] T3.6 — BajaUsuarioUseCase extendido: self-baja→AutoBajaProhibidaError (422), cross-tenant→UsuarioNoEncontradoError (404), idempotencia; BajaUsuarioDto con `requesterId` + `clienteId`
- [x] T3.7 — auth.dto.ts: `CreateUsuarioDto`, `UsuarioResponseDto`, `ROLES_VALIDOS`, `toUsuarioResponse()` (excluye passwordHash)
- [x] T3.8 — UsuariosController.spec: 19 tests RED→GREEN (POST/GET/PATCH baja + regression asignarRol)
- [x] T3.9 — UsuariosController: POST /usuarios, GET /usuarios, PATCH /usuarios/:id/baja (clienteId SIEMPRE de TenantContext)
- [x] T3.10 — AuthModule: register CrearUsuarioUseCase + ListarUsuariosUseCase providers

---

## Final Validation Numbers

```
Tests:      1395 passed / 1395 (24 integration files SKIP — no .prisma/ in worktree, pre-existing)
Lint:       OK (0 errors, 0 warnings)
TSC:        5 pre-existing TS7006 in prisma mappers (not touched by PR3); all .prisma TS2307 pre-existing
```

---

## Architecture Notes

- `clienteId` ALWAYS from `TenantContext.get()!.clienteId` — NEVER from body
- `password_hash` never exposed: `toUsuarioResponse()` maps to `UsuarioResponseDto` (no `passwordHash` field)
- `BajaUsuarioUseCase` DTO breaking change: now requires `requesterId` (self-baja guard) + `clienteId` (cross-tenant guard); `asignar-rol.use-case.spec.ts` updated accordingly
- `AutoBajaProhibidaError` + `UsuarioConflictError` added to `auth.errors.ts`
- `vi.mock()` required in `usuarios.controller.spec.ts` for `.prisma/master` indirect import via `TenantGuard → PrismaService → prisma-clients`
