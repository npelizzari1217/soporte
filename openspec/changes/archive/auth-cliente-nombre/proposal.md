# Proposal: auth-cliente-nombre

## Intent / Why

El sidebar muestra hoy la marca fija "Soporte" + la inicial del email como
avatar, porque el nombre del cliente (tenant) NO viaja en el JWT. El usuario
no ve a qué organización pertenece su sesión. Queremos exponer el nombre real
del cliente con costo casi nulo.

El dato YA está disponible gratis: en el login
(`login.use-case.ts:100`) se ejecuta `clienteRepo.findById(usuario.clienteId)`
para validar `cliente.activo`, por lo que el `ClienteEntity` completo (con
`.nombre`) está en memoria ANTES de firmar el JWT. No se necesitan endpoints
ni queries nuevos en el camino de login.

**Éxito:** tras un nuevo login, el sidebar muestra el nombre del cliente;
los tokens viejos (sin el claim) siguen funcionando con el fallback actual.

Esto cierra el **W3 (Req 4 PARCIAL)** del change `frontend-shell`: el tenant
display deja de ser un placeholder.

## What changes

- **Backend (login):** agregar un claim nuevo `cliente_nombre` al `JwtPayload`,
  poblado desde `cliente.nombre` (entidad ya cargada). Cero queries nuevos.
- **Backend (token service):** extender la interface `JwtPayload`
  (`i-token.service.ts`) con `cliente_nombre: string`.
- **Frontend:** agregar `cliente_nombre?: string` (opcional) al `JwtPayload`
  de `frontend/src/shared/api/types.ts`; el sidebar muestra el nombre real
  cuando el claim existe, y mantiene el fallback brand "Soporte" + inicial
  cuando está ausente (degradación elegante OBLIGATORIA para tokens previos).

## Scope

**In:**
- Claim `cliente_nombre` en el JWT de login.
- Tipo `JwtPayload` (back y front) extendido.
- Sidebar consume el nombre con fallback robusto.
- Tests atómicos RED→GREEN (login use case, JwtPayload shape, sidebar render
  con y sin claim).

**Out:**
- Tenant switcher / dropdown.
- Endpoints o queries nuevos.
- Cualquier cambio de tenancy o enrutamiento de DB.
- `razonSocial`, `cuit` u otros campos del cliente (solo `nombre`).

## Impact

- `backend/src/auth/domain/ports/i-token.service.ts` — `JwtPayload`.
- `backend/src/auth/application/use-cases/login.use-case.ts` — poblar claim.
- `backend/src/auth/application/use-cases/refresh-token.use-case.ts` — ver Riesgos.
- `frontend/src/shared/api/types.ts` — `JwtPayload`.
- `frontend/src/components/shell/sidebar.tsx` — render + fallback.

## Risks / Open questions

1. **Claim real ≠ doc:** el claim del cliente en el código es `cliente_id`,
   NO `n`. El nuevo claim será `cliente_nombre` (sin colisión).
2. **Consistencia en refresh (DECISIÓN para design):** `RefreshTokenUseCase`
   re-firma el payload completo PERO solo desde `usuario` — NO carga el cliente
   ni inyecta `IClienteRepository`. Mantener `cliente_nombre` tras un refresh
   exige inyectar `IClienteRepository` + 1 `findById` (refresh ocurre ~cada
   15 min, costo bajo). Alternativa: no tocar refresh y dejar que el claim
   desaparezca tras el primer refresh (el fallback lo absorbe, pero el nombre
   "parpadea"). Recomendación: agregar la carga en refresh por consistencia.
3. **Seguridad:** el claim solo lleva el nombre del PROPIO cliente del usuario
   (vía `usuario.clienteId`). Sin fuga cross-tenant; `nombre` no es sensible.
