# Design: auth-cliente-nombre

## Technical Approach

Propagar el nombre del tenant al frontend via un claim nuevo `cliente_nombre`
en el JWT, derivado SIEMPRE server-side de `usuario.clienteId`. El claim se
puebla en login (entidad `cliente` ya cargada, cero queries nuevos) y se
mantiene tras refresh inyectando `IClienteRepository` en `RefreshTokenUseCase`
(Opción A confirmada). El frontend lee el claim con fallback obligatorio al
brand "Soporte". Clean Arch intacta: los use cases dependen del PUERTO de
dominio; el `AuthModule` cablea la implementación Prisma.

## Architecture Decisions

| # | Decisión | Elegido | Rechazado | Rationale |
|---|----------|---------|-----------|-----------|
| 1 | Tipo en backend | `cliente_nombre: string` (obligatorio) | opcional `?` | Login/refresh SIEMPRE cargan el `cliente` y `.nombre` es `string` no-null. El emisor garantiza el claim; hacerlo opcional debilitaría el contrato del lado que lo controla. |
| 2 | Tipo en frontend | `cliente_nombre?: string` (opcional) | obligatorio | Tokens YA emitidos no traen el claim hasta el próximo login. Opcional tolera tokens viejos sin romper el decode (degradación elegante). Asimetría deliberada: el emisor garantiza, el consumidor tolera. |
| 3 | Consistencia en refresh | Opción A: inyectar `IClienteRepository` + 1 `findById` | dejar que el claim desaparezca tras refresh | Sin Opción A el nombre "parpadea" a "Soporte" cada ~15min. 1 query/refresh es costo despreciable. |
| 4 | Cliente inactivo en refresh | Rechazar con `ClienteInactivoError` (espeja login) | ignorar `activo` y re-firmar igual | Login ya bloquea tenant suspendido. Sin esto, un tenant dado de baja seguiría refrescando access tokens por 7 días → fuga de acceso. Alinear refresh con login es consistencia Y seguridad. |
| 5 | Orden de constructor refresh | Append `clienteRepo` como 4º parámetro | reordenar args | Minimiza churn; el spec existente igual se actualiza por el nuevo mock. |
| 6 | Render sidebar | `user?.cliente_nombre ?? "Soporte"` reemplaza el texto brand; avatar inicial intacto | nombre + brand separados | El brand fijo era placeholder del W3. El nombre real ocupa su lugar; el avatar de inicial (email) no cambia. |

## Data Flow

```
LOGIN:    usuario.clienteId ─→ clienteRepo.findById ─→ cliente.nombre
                                      │ (ya cargado p/ validar activo)
                                      ▼
                          payload.cliente_nombre ─→ signJwt ─→ cookie

REFRESH:  refreshToken ─→ usuario ─→ clienteRepo.findById(usuario.clienteId)
                                      │ (NUEVO: re-valida activo)
                                      ▼
                          payload.cliente_nombre ─→ signJwt (rotación)

FRONTEND: JwtPayload.cliente_nombre ─→ Sidebar  user?.cliente_nombre ?? "Soporte"
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/auth/domain/ports/i-token.service.ts` | Modify | `JwtPayload` + `cliente_nombre: string` + doc |
| `backend/src/auth/application/use-cases/login.use-case.ts` | Modify | `cliente_nombre: cliente.nombre` en payload (:111-117), sin query nuevo |
| `backend/src/auth/application/use-cases/refresh-token.use-case.ts` | Modify | Inyectar `IClienteRepository` (4º arg); `findById(usuario.clienteId)`; re-validar `activo`; poblar claim |
| `backend/src/auth/auth.module.ts` | Modify | Factory de `RefreshTokenUseCase`: +param + `inject` `CLIENTE_REPOSITORY` (ya provisto) |
| `frontend/src/shared/api/types.ts` | Modify | `JwtPayload` + `cliente_nombre?: string` |
| `frontend/src/components/shell/sidebar.tsx` | Modify | Brand → `user?.cliente_nombre ?? "Soporte"`; actualizar doc-comment |

## Interfaces / Contracts

```typescript
// backend i-token.service.ts
interface JwtPayload {
  sub: string; cliente_id: string; email: string;
  roles: string[]; permisos: string[];
  cliente_nombre: string; // NUEVO — obligatorio (emisor garantiza)
}

// frontend types.ts
interface JwtPayload {
  /* …igual… */ cliente_nombre?: string; // NUEVO — opcional (tolera tokens viejos)
}

// refresh-token.use-case.ts — constructor (append, no reorder)
constructor(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo: IClienteRepository)
// tras cargar usuario:
const cliente = await this.clienteRepo.findById(usuario.clienteId);
if (!cliente || !cliente.activo) return Result.fail(new ClienteInactivoError());
```

## Testing Strategy (Test-First RED→GREEN)

| Pieza | Runner | Test RED |
|-------|--------|----------|
| `JwtPayload` backend | Jest (type) | Objeto tipado exige `cliente_nombre` → falla compilación hasta agregar campo |
| login use case | Jest | `signJwt` recibe payload con `cliente_nombre === cliente.nombre` (capturar payload con `mockImplementation`) |
| refresh use case | Jest | (a) `clienteRepo` mock devuelve cliente activo → claim presente; (b) cliente `activo:false` → `ClienteInactivoError`, `signJwt` NO llamado |
| `JwtPayload` frontend | Vitest | Fixture con y sin `cliente_nombre` compila (opcional) |
| sidebar | Vitest+RTL | (a) `user.cliente_nombre="ACME"` → `getByText("ACME")`; (b) sin claim → fallback `getByText("Soporte")`; avatar inicial intacto |

Mocks atómicos, sin over-mock. Refresh spec: agregar `makeClienteRepo()`
(`findById: jest.fn()`) espejando `makeUsuarioRepo`. Sidebar spec: extender el
`MOCK_USER` existente y el mock de `useSession`.

## Migration / Rollout

No migration. Degradación elegante: tokens previos sin el claim → fallback
"Soporte" hasta el próximo login. Sin feature flag.

## Slice Plan (auto-chain, < 400 líneas)

**1 PR único.** Backend (interface + login + refresh + wiring) y frontend
(types + sidebar) van juntos: cambio chico (~6 archivos, <150 líneas con tests),
acoplados por el contrato del claim. Separarlos crearía una ventana donde el
tipo backend existe sin consumidor. Commits work-unit: (1) contrato+login,
(2) refresh+wiring, (3) frontend.

## Open Questions

- Ninguna que bloquee. Confirmado: `ClienteInactivoError` ya existe y el
  controller de refresh debe mapearla (verificar en tasks/apply que el
  `auth.controller` traduce el nuevo error a 403, igual que login).
