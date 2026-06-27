# Tasks: auth-cliente-nombre

> Change: `auth-cliente-nombre`
> Spec: `openspec/changes/auth-cliente-nombre/specs/auth-rbac/spec.md`,
>       `openspec/changes/auth-cliente-nombre/specs/frontend-shell/spec.md`
> Design: `openspec/changes/auth-cliente-nombre/design.md`
> Delivery: 1 PR único — ~3 commits work-unit
> TDD: RED → GREEN. Cada tarea de test debe fallar antes de su contraparte de impl.

---

## Leyenda de dependencias

- `→` = depende de (no puede iniciarse sin que la anterior esté completa)
- `//` = puede ejecutarse en paralelo con otra tarea del mismo work-unit
- `[Jest]` / `[Vitest+RTL]` = runner
- `[TEST]` = fase RED; `[IMPL]` = fase GREEN; `[GREEN]` = verificación final

---

## Work-Unit 1 — Contrato JwtPayload + Login

Commit sugerido: `feat(auth): add cliente_nombre claim to JwtPayload and LoginUseCase`

### WU1-T1 [TEST] — Nuevo test RED: `login.use-case.spec.ts` — claim `cliente_nombre`

**Runner:** Jest
**Archivo:** `backend/src/auth/application/use-cases/login.use-case.spec.ts`
**Requisito:** spec-auth-rbac § "Login exitoso incluye `cliente_nombre` correcto en el JWT"

Qué agregar:
- Actualizar la factory `makeCliente()` existente para aceptar un parámetro `nombre` (default `'Empresa Test'`), de modo que el valor del claim sea verificable.
- Nuevo `it` dentro de `describe('Login exitoso')`:
  `"incluye cliente_nombre igual a cliente.nombre en el payload del JWT"`.
  Usar `tokenService.signJwt.mockImplementation((payload) => { capturedPayload = payload; return 'signed.jwt.token'; })`.
  Hacer `clienteRepo.findById.mockResolvedValue(makeCliente('Acme Corp'))`.
  Después de `useCase.execute(...)`, assert: `expect(capturedPayload!.cliente_nombre).toBe('Acme Corp')`.
- Nuevo `it`: `"cliente_nombre del JWT corresponde solo al cliente del usuario autenticado"`.
  Dos clientes en scope: se resuelve que `clienteRepo.findById` retorna el correcto porque el use case lo llama con `usuario.clienteId`. Verificar que `capturedPayload!.cliente_nombre` coincide solo con el nombre del cliente del usuario.

**Mocks:** `makeClienteRepo()` ya existe en este spec — usarlo directamente.
**Dependencia:** ninguna (este test falla en RED porque `JwtPayload` no tiene `cliente_nombre` aún).

---

### WU1-T2 [IMPL] — `i-token.service.ts`: agregar `cliente_nombre: string` a `JwtPayload`

**Depende de:** WU1-T1 (test RED debe estar escrito)
**Archivo:** `backend/src/auth/domain/ports/i-token.service.ts`
**Requisito:** spec-auth-rbac § "JwtPayload backend incluye `cliente_nombre` como campo requerido"

Cambios:
- Agregar `cliente_nombre: string;` como campo de `JwtPayload` (después de `permisos`).
- Actualizar el JSDoc del bloque `JwtPayload`: documentar `cliente_nombre` como "nombre del tenant del usuario (emisor garantiza; no nullable)".
- NO agregar el campo como opcional (`?`). El backend garantiza siempre el valor.
- Verificar que `signJwt(payload: JwtPayload)` y `verifyJwt` reflejan el tipo actualizado sin cambios adicionales.

Líneas estimadas: ~3-5 líneas netas de cambio.

---

### WU1-T3 [IMPL] — `login.use-case.ts`: poblar `cliente_nombre` en el payload

**Depende de:** WU1-T2 (el campo debe existir en `JwtPayload` para que compile)
**Archivo:** `backend/src/auth/application/use-cases/login.use-case.ts`
**Requisito:** spec-auth-rbac § "Login emite JWT con `cliente_nombre` del cliente del usuario"

Cambios:
- En el bloque de construcción del payload (líneas 111-117 actuales), agregar `cliente_nombre: cliente.nombre` al objeto `JwtPayload`.
- La variable `cliente` ya está cargada en línea 100 (`clienteRepo.findById`); el campo `nombre` es `string` no-null en `ClienteEntity`.
- Cero queries adicionales. Cero cambios estructurales.
- Actualizar el JSDoc del `execute()` step 5: mencionar `cliente_nombre` junto a los demás claims.

Líneas estimadas: ~2-3 líneas netas.

---

### WU1-T4 [GREEN] — Verificar tests de login

**Depende de:** WU1-T3
**Comando:** `cd backend && npx jest login.use-case.spec --no-coverage`
**Criterio:** todos los tests del describe `LoginUseCase` pasan (sin regresiones).

---

## Work-Unit 2 — Refresh + Wiring + Activo + Controller 403

Commit sugerido: `feat(auth): inject IClienteRepository into RefreshTokenUseCase; validate activo; map 403`

**Precondición:** WU1 completo (JwtPayload tiene `cliente_nombre: string`).

### WU2-T1 [TEST] — Actualizar `refresh-token.use-case.spec.ts` (RED)

**Runner:** Jest
**Archivo:** `backend/src/auth/application/use-cases/refresh-token.use-case.spec.ts`
**Requisito:** spec-auth-rbac §§ "Refresh exitoso mantiene `cliente_nombre`" y "Refresh con cliente inactivo rechazado"

Cambios requeridos (el spec actualmente construye `RefreshTokenUseCase` con 3 args — esto va a romper en compilación/runtime cuando el constructor exija 4):

1. **Agregar import** de `IClienteRepository` y `ClienteInactivoError` al spec.

2. **Agregar factory `makeClienteRepo()`** (espejando el estilo de `makeUsuarioRepo()`):
   ```typescript
   const makeClienteRepo = (): jest.Mocked<IClienteRepository> => ({
     findById: jest.fn(),
     findByDbName: jest.fn(),
     findAll: jest.fn(),
     save: jest.fn().mockResolvedValue(undefined),
     delete: jest.fn().mockResolvedValue(undefined),
   });
   ```

3. **Agregar factory `makeCliente()`** (usando `ClienteEntity.create()`):
   ```typescript
   const makeCliente = (nombre = 'Acme Corp', activo = true): ClienteEntity =>
     ClienteEntity.create({ nombre, razonSocial: null, cuit: null, dbName: 'acme', activo });
   ```

4. **Declarar `clienteRepo`** en el scope del describe y actualizar `beforeEach`:
   - `clienteRepo = makeClienteRepo();`
   - `useCase = new RefreshTokenUseCase(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo);` (4 args)

5. **Actualizar todos los tests de renovación exitosa** para incluir el mock del clienteRepo:
   En todos los `it(...)` del describe `'Renovación exitosa (rotación)'` donde `usuarioRepo.findById.mockResolvedValue(makeUsuario(...))` es llamado, agregar también:
   `clienteRepo.findById.mockResolvedValue(makeCliente());`
   (sin esto los tests existentes fallarán en rojo por `clienteRepo.findById` retornando `undefined`).

6. **Nuevo `it`** en `'Renovación exitosa (rotación)'`:
   `"incluye cliente_nombre en el JWT firmado durante el refresh"`:
   - `clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'))`.
   - Capturar payload via `tokenService.signJwt.mockImplementation`.
   - Assert: `capturedPayload!.cliente_nombre === 'Beta SA'`.

7. **Nuevo describe `'Rechazo si cliente inactivo'`** con dos `it`:
   - `"retorna ClienteInactivoError si el cliente está inactivo"`:
     `clienteRepo.findById.mockResolvedValue(makeCliente('X', false))`.
     Assert: `result.isFail()`, `result.getError() instanceof ClienteInactivoError`.
   - `"NO emite JWT ni nuevo refresh token si el cliente está inactivo"`:
     `clienteRepo.findById.mockResolvedValue(makeCliente('X', false))`.
     Assert: `tokenService.signJwt` NOT called.

**Mocks atómicos:** se mockea solo el puerto `IClienteRepository`; no se toca la implementación Prisma.
**Dependencia:** WU1-T2 (JwtPayload debe incluir `cliente_nombre` para que el tipo compile en los tests nuevos).

---

### WU2-T2 [TEST] — Agregar test RED a `auth.controller.spec.ts` — 403 en refresh

**Runner:** Jest
**Archivo:** `backend/src/auth/interface/controllers/auth.controller.spec.ts`
**Requisito:** spec-auth-rbac § "Refresh expirado o revocado…" + design nota sobre controller mapeo 403
**Puede correr en paralelo con:** WU2-T1

Cambios:
- En el describe `'POST /auth/refresh'`, agregar nuevo `it`:
  `"lanza ForbiddenException (403) cuando el cliente está inactivo"`.
  `refreshUseCase.execute.mockResolvedValue(Result.fail(new ClienteInactivoError()));`.
  `await expect(controller.refresh({ refreshToken: 'valid-token' })).rejects.toThrow(ForbiddenException);`.
- Verificar que `ClienteInactivoError` ya está importado en este spec (línea 18 — sí está).

Líneas estimadas: ~8-10 líneas.

---

### WU2-T3 [IMPL] — `refresh-token.use-case.ts`: inyectar clienteRepo, re-validar activo, poblar claim

**Depende de:** WU2-T1 y WU2-T2 (tests RED escritos)
**Archivo:** `backend/src/auth/application/use-cases/refresh-token.use-case.ts`
**Requisito:** spec-auth-rbac §§ "Refresh exitoso mantiene `cliente_nombre`" y diseño Opción A

Cambios:
1. **Importar** `IClienteRepository` desde `'../../../clientes/domain/ports/i-cliente.repository'`.
2. **Importar** `ClienteInactivoError` (ya importado `TokenExpiradoError`, `TokenRevocadoError`, `TokenInvalidoError` — agregar a esa lista).
3. **Constructor:** agregar 4º parámetro: `private readonly clienteRepo: IClienteRepository`.
   Respetar el orden existente: `(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo)`.
4. **Después del bloque "5. Cargar usuario"** (tras verificar `usuario.activo`):
   ```typescript
   // 5b. Verificar que el cliente (tenant) siga activo (espeja el check de login)
   const cliente = await this.clienteRepo.findById(usuario.clienteId);
   if (!cliente || !cliente.activo) {
     return Result.fail(new ClienteInactivoError());
   }
   ```
5. **En el objeto `payload`** (paso 6 actual), agregar: `cliente_nombre: cliente.nombre`.
6. **Actualizar JSDoc** del `execute()`: agregar "5b. Re-valida cliente activo → ClienteInactivoError" y mencionar `cliente_nombre` en el step 6.

Líneas estimadas: ~15-20 líneas netas.

---

### WU2-T4 [IMPL] — `auth.module.ts`: cablear `CLIENTE_REPOSITORY` en la factory de `RefreshTokenUseCase`

**Depende de:** WU2-T3 (constructor ya requiere 4 args)
**Archivo:** `backend/src/auth/auth.module.ts`
**Requisito:** design § "File Changes — auth.module.ts"

Cambios en el provider de `RefreshTokenUseCase`:
```typescript
{
  provide: RefreshTokenUseCase,
  useFactory: (
    refreshTokenRepo: IRefreshTokenRepository,
    usuarioRepo: IUsuarioRepository,
    tokenService: ITokenService,
    clienteRepo: IClienteRepository,  // NUEVO
  ) => new RefreshTokenUseCase(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo),
  inject: [REFRESH_TOKEN_REPOSITORY, USUARIO_REPOSITORY, TOKEN_SERVICE, CLIENTE_REPOSITORY],
  //                                                                      ^^^^^^^^^^^^^^^^^ NUEVO
},
```
`CLIENTE_REPOSITORY` y `IClienteRepository` ya están importados en este módulo (líneas 31-35 y 55). No se necesita ningún provider nuevo.

Líneas estimadas: ~5-7 líneas.

---

### WU2-T5 [IMPL] — `auth.controller.ts`: mapear `ClienteInactivoError` → 403 en `refresh()`

**Depende de:** WU2-T2 (test RED escrito)
**Puede correr en paralelo con:** WU2-T3 y WU2-T4 (no hay deps entre sí)
**Archivo:** `backend/src/auth/interface/controllers/auth.controller.ts`
**Requisito:** design § "auth.controller debe mapear `ClienteInactivoError` → 403 también en el endpoint de refresh"

Cambios en el método `refresh()`:
```typescript
if (result.isFail()) {
  const error = result.getError();
  if (error instanceof ClienteInactivoError) {           // NUEVO
    throw new ForbiddenException(error.message);          // NUEVO
  }
  if (
    error instanceof TokenExpiradoError || ...
  ) { ... }
  throw new UnauthorizedException('Token inválido');
}
```
`ClienteInactivoError` ya está importado (línea 44) y `ForbiddenException` también (línea 28).

Líneas estimadas: ~3-4 líneas.

---

### WU2-T6 [GREEN] — Verificar tests de refresh + controller

**Depende de:** WU2-T3 + WU2-T4 + WU2-T5
**Comando:** `cd backend && npx jest refresh-token.use-case.spec auth.controller.spec --no-coverage`
**Criterio:** todos los tests de los dos specs pasan (sin regresiones en los tests preexistentes).

---

## Work-Unit 3 — Frontend: tipo + sidebar

Commit sugerido: `feat(frontend): add cliente_nombre to JwtPayload (optional); sidebar shows tenant name`

**Precondición:** WU1 completo (el contrato backend está definido; el frontend puede implementar en paralelo pero tipado en paralelo con WU1 no estrictamente bloqueado).

### WU3-T1 [TEST] — Crear `frontend/src/shared/api/types.spec.ts` (RED)

**Runner:** Vitest
**Archivo:** `frontend/src/shared/api/types.spec.ts` ← ARCHIVO NUEVO
**Requisito:** spec-auth-rbac § "JwtPayload frontend refleja el campo como opcional"

Contenido del spec:
```typescript
import type { JwtPayload } from './types';

describe('JwtPayload — contrato de tipo', () => {
  it('acepta payload sin cliente_nombre (tokens legados)', () => {
    const payload: JwtPayload = {
      sub: 'uuid-1',
      cliente_id: 'c-uuid',
      email: 'a@b.com',
      roles: [],
      permisos: [],
    };
    expect(payload.cliente_nombre).toBeUndefined();
  });

  it('acepta payload con cliente_nombre (tokens nuevos)', () => {
    const payload: JwtPayload = {
      sub: 'uuid-1',
      cliente_id: 'c-uuid',
      email: 'a@b.com',
      roles: [],
      permisos: [],
      cliente_nombre: 'Acme Corp',
    };
    expect(payload.cliente_nombre).toBe('Acme Corp');
  });
});
```
Este spec falla en RED porque `JwtPayload` no tiene `cliente_nombre` aún → TypeScript type error en el segundo `it` al asignar la propiedad, o al menos el campo no está declarado.

Mocks: ninguno.

---

### WU3-T2 [TEST] — Crear `frontend/src/components/shell/sidebar.spec.tsx` (RED)

**Runner:** Vitest + RTL
**Archivo:** `frontend/src/components/shell/sidebar.spec.tsx` ← ARCHIVO NUEVO
**Requisito:** spec-frontend-shell §§ "Header del sidebar muestra el nombre real del cliente", "Fallback obligatorio cuando `cliente_nombre` está ausente", "String vacío en `cliente_nombre` activa el fallback", "El avatar con la inicial del email sigue presente"

Mocks requeridos:
- `vi.mock('@/shared/hooks/use-session')` — mockear `useSession` para controlar `user`.
- `vi.mock('next/navigation', () => ({ usePathname: vi.fn().mockReturnValue('/tickets') }))`.

Factory de `MOCK_USER` (extiende el JwtPayload base):
```typescript
const BASE_USER = {
  sub: 'u1', cliente_id: 'c1', email: 'juan@ejemplo.com', roles: [], permisos: [],
};
```

Tests:
1. `it('muestra cliente_nombre cuando está presente')`:
   `useSession.mockReturnValue({ user: { ...BASE_USER, cliente_nombre: 'Acme Corp' }, isLoading: false, can: () => false })`.
   `render(<Sidebar />)`.
   `expect(screen.getByText('Acme Corp')).toBeInTheDocument()`.
   `expect(screen.queryByText('Soporte')).not.toBeInTheDocument()`.

2. `it('muestra fallback "Soporte" cuando cliente_nombre está ausente')`:
   `useSession.mockReturnValue({ user: { ...BASE_USER }, isLoading: false, can: () => false })`.
   `expect(screen.getByText('Soporte')).toBeInTheDocument()`.

3. `it('muestra fallback "Soporte" cuando cliente_nombre es string vacío')`:
   `useSession.mockReturnValue({ user: { ...BASE_USER, cliente_nombre: '' }, isLoading: false, can: () => false })`.
   `expect(screen.getByText('Soporte')).toBeInTheDocument()`.
   `expect(screen.queryByText('')).not.toBeInTheDocument()`.

4. `it('el avatar con la inicial del email sigue presente cuando hay cliente_nombre')`:
   `useSession.mockReturnValue({ user: { ...BASE_USER, cliente_nombre: 'Acme Corp' }, isLoading: false, can: () => false })`.
   `expect(screen.getByText('J')).toBeInTheDocument()`. // inicial de 'juan@ejemplo.com'
   `expect(screen.getByText('Acme Corp')).toBeInTheDocument()`.

5. `it('no renderiza el string "undefined" en ningún caso')`:
   `useSession.mockReturnValue({ user: null, isLoading: false, can: () => false })`.
   `render(<Sidebar />)`.
   `expect(screen.queryByText('undefined')).not.toBeInTheDocument()`.

**Puede correr en paralelo con:** WU3-T1

---

### WU3-T3 [IMPL] — `frontend/src/shared/api/types.ts`: agregar `cliente_nombre?: string`

**Depende de:** WU3-T1 (test RED escrito)
**Archivo:** `frontend/src/shared/api/types.ts`
**Requisito:** spec-auth-rbac § "JwtPayload frontend refleja el campo como opcional"

Cambios:
- Agregar `cliente_nombre?: string;` al interface `JwtPayload` (después de `permisos`).
- Actualizar el JSDoc del bloque `JwtPayload`: documentar `cliente_nombre` como "nombre del tenant — opcional para tolerar tokens emitidos antes de auth-cliente-nombre (degradación elegante)".

Líneas estimadas: ~3-4 líneas.

---

### WU3-T4 [IMPL] — `frontend/src/components/shell/sidebar.tsx`: consumir `cliente_nombre` con fallback

**Depende de:** WU3-T3 (el tipo debe estar actualizado para que compile sin error TS)
**Archivo:** `frontend/src/components/shell/sidebar.tsx`
**Requisito:** spec-frontend-shell §§ "Sidebar muestra `cliente_nombre` cuando el claim está presente" y "Fallback obligatorio"

Cambios:
1. En el `<span>` que hoy contiene `Soporte` (línea 55):
   Reemplazar el texto literal `Soporte` con `{user?.cliente_nombre || 'Soporte'}`.
   Usar `||` (no `??`) porque el string vacío `""` debe activar el fallback (spec § "String vacío activa el fallback").

2. Actualizar el doc-comment del componente (línea 7-8):
   Eliminar la nota `"no switcher or dropdown because clienteNombre is not yet in JwtPayload (follow-up change: auth-cliente-nombre)"`.
   Reemplazar por: `"Shows tenant name from JWT claim cliente_nombre; falls back to brand 'Soporte' for legacy tokens."`.

3. No modificar la lógica del avatar (`userInitial`), el nav ni el footer.

Líneas estimadas: ~5-8 líneas.

---

### WU3-T5 [GREEN] — Verificar tests de frontend

**Depende de:** WU3-T3 + WU3-T4
**Comandos:**
```
cd frontend && npx vitest run src/shared/api/types.spec.ts
cd frontend && npx vitest run src/components/shell/sidebar.spec.tsx
```
**Criterio:** los 7 tests nuevos (2 en types + 5 en sidebar) pasan; no hay regresiones.

---

## Orden de ejecución completo

```
WU1-T1  →  WU1-T2  →  WU1-T3  →  WU1-T4
                 ↓
           WU2-T1
           WU2-T2   (// con WU2-T1)
                 ↓ (ambos completos)
           WU2-T3  →  WU2-T4
           WU2-T5   (// con WU2-T3/T4)
                 ↓ (T4 + T5 completos)
           WU2-T6

WU3-T1  →  WU3-T3  →  WU3-T4  →  WU3-T5
WU3-T2  //                 ↑ depende de T3
```

WU3 puede iniciarse en paralelo con WU1 para los tests (WU3-T1, WU3-T2 son independientes), pero WU3-T3 e impl forward dependen de que WU1-T2 esté completo (JwtPayload backend define el contrato que el frontend replica).

---

## Archivos afectados (resumen)

| Archivo | Acción | Work-Unit |
|---------|--------|-----------|
| `backend/src/auth/domain/ports/i-token.service.ts` | Modify | WU1 |
| `backend/src/auth/application/use-cases/login.use-case.ts` | Modify | WU1 |
| `backend/src/auth/application/use-cases/login.use-case.spec.ts` | Modify (test) | WU1 |
| `backend/src/auth/application/use-cases/refresh-token.use-case.ts` | Modify | WU2 |
| `backend/src/auth/application/use-cases/refresh-token.use-case.spec.ts` | Modify (test) | WU2 |
| `backend/src/auth/auth.module.ts` | Modify | WU2 |
| `backend/src/auth/interface/controllers/auth.controller.ts` | Modify | WU2 |
| `backend/src/auth/interface/controllers/auth.controller.spec.ts` | Modify (test) | WU2 |
| `frontend/src/shared/api/types.ts` | Modify | WU3 |
| `frontend/src/shared/api/types.spec.ts` | Create (test) | WU3 |
| `frontend/src/components/shell/sidebar.tsx` | Modify | WU3 |
| `frontend/src/components/shell/sidebar.spec.tsx` | Create (test) | WU3 |

---

## Review Workload Forecast

| Métrica | Valor |
|---------|-------|
| Total de tareas | 15 (5 test + 5 impl + 2 green + 3 paralelo) |
| Pares TEST/IMPL | 6 pares: WU1×1, WU2×2, WU3×2 + tipos |
| Archivos de impl modificados | 7 |
| Archivos de test (2 nuevos, 3 modificados) | 5 |
| Líneas impl estimadas | ~35–48 |
| Líneas test estimadas | ~165–220 |
| **Total líneas estimadas** | **~200–268** |
| Presupuesto 400 líneas | **SÍ, dentro del límite** |
| Chained PRs recomendado | No — 1 PR único es viable |
| Decisión necesaria antes de apply | **No** — tamaño aprobado, 1 PR |

Nota: los 3 commits work-unit son recomendados para que el PR sea revisable por secciones, pero van en el mismo branch y se squash-merge si el revisor lo prefiere.
