# Apply Progress: Reset de contraseña por admin/root

## WU-1 — caso de uso de reset con su spec de autorización

**Estado: completo (10/10 tareas).**

| Tarea | Estado |
|---|---|
| 1.1 `ResetearPasswordUsuarioTenantUseCase` | [x] |
| 1.2 Reset exitoso: ADMINISTRADOR y ROOT | [x] |
| 1.3 Aislamiento: membresía en otro cliente | [x] |
| 1.4 Aislamiento: usuario inexistente + defensivo `findById` nulo | [x] |
| 1.5 Disponibilidad: cuenta inactiva/soft-deleted | [x] |
| 1.6 Hash: misma instancia de `IHashProvider` | [x] |
| 1.7 Orden persistir→revocar + revocación degradada | [x] |
| 1.8 Sin restricción admin-a-admin / auto-reset | [x] |
| 1.9 Plaintext ausente del log | [x] |
| 1.10 Cierre WU-1 (lint + typecheck + tests en verde) | [x] |

### Archivos

- `backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.ts` (creado)
- `backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.spec.ts` (creado, 13 tests)

### Verificación (backend/)

- `pnpm vitest run src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.spec.ts`: 13 passed (13)
- `pnpm lint`: sin errores
- `pnpm typecheck`: sin errores
- `pnpm test` (suite completa, con `soporte-postgres-master` levantado): 432 archivos / 5150 tests passed

### Notas de alcance

- El caso de uso queda SIN cablear a ninguna ruta — es la concesión deliberada
  del corte en 3 work units (`tasks.md`, "Orden y paralelismo"). No hay DTO,
  ruta de controller ni wiring en `auth.module.ts`: eso es WU-2.
- No se tocó `frontend/`: WU-3.
- Sin deuda de Ayuda propia: WU-1 no tiene superficie visible para el usuario.

## WU-2 — endpoint `PATCH /usuarios/:id/password`

**Estado: completo (8/8 tareas).**

| Tarea | Estado |
|---|---|
| 2.1 `ResetearPasswordUsuarioDto` (DTO, sin `clienteId`) | [x] |
| 2.2 `@Patch(':id/password')` + `@UseGuards(AdminClienteGuard)` + `@HttpCode(NO_CONTENT)` en `UsuariosController` | [x] |
| 2.3 Provider `useFactory` en `auth.module.ts` | [x] |
| 2.4 Test: TECNICO/SOLICITANTE → 403 en ESTA ruta | [x] |
| 2.5 Test: `clienteId` sale del JWT, nunca del body | [x] |
| 2.6 Test: `MembresiaNoEncontradaError` → 404; `UsuarioNoDisponibleError` → 422 | [x] |
| 2.7 Test: 204 sin cuerpo | [x] |
| 2.8 Cierre WU-2 (lint + typecheck + tests en verde) | [x] |

### Archivos

- `backend/src/auth/interface/dtos/usuario-tenant.dto.ts` (modificado): agregado
  `ResetearPasswordUsuarioDto { @IsString() @MinLength(8) password }`, molde de
  `EditarUsuarioDto`, sin `clienteId` (no hay constante compartida para el
  mínimo de largo — se usa el literal `8`, igual que `CreateUsuarioTenantDto`).
- `backend/src/auth/interface/controllers/usuarios.controller.ts` (modificado):
  método `resetearPassword()` junto a `editar()`, con
  `@UseGuards(AdminClienteGuard)` propio (no heredado); `clienteId` sale de
  `actor.cliente_id`; `toHttpException` existente sin tocar; mapa de rutas del
  JSDoc de cabecera actualizado.
- `backend/src/auth/auth.module.ts` (modificado): provider `useFactory` para
  `ResetearPasswordUsuarioTenantUseCase`, molde exacto del de
  `CambiarPasswordUseCase`, más `MEMBRESIA_REPOSITORY`.
- `backend/src/auth/interface/controllers/usuarios.controller.spec.ts`
  (modificado): `buildController()` extendido con el nuevo mock en su
  posición del constructor; 7 tests nuevos bajo
  `describe('PATCH /usuarios/:id/password')`.

### Decisión de testing para R3 (403 "en esta ruta", no heredado)

`tasks.md` asigna 2.4 al spec unitario existente
(`usuarios.controller.spec.ts`, que instancia el controller directo sin
guards reales) y el propio `tasks.md`/`design.md` dejan explícito que NO se
agregan tests de integración/e2e en este ciclo. El precedente
`autorizacion.e2e.spec.ts` resuelve el mismo riesgo con un harness e2e
completo, pero eso está fuera de alcance acá.

Para probar que `@UseGuards(AdminClienteGuard)` está puesto en ESTE método
puntual — el riesgo real que señala `design.md` (los 4 guards existentes NO
son contiguos, `:197/:231/:265/:292`) — el test inspecciona la metadata que
el propio decorador de Nest deja en
`UsuariosController.prototype.resetearPassword`
(`Reflect.getMetadata(GUARDS_METADATA, ...)`, `GUARDS_METADATA` de
`@nestjs/common/constants`) y verifica que incluye `AdminClienteGuard`. Es
una inspección directa del mismo mecanismo que Nest usa en runtime para
aplicar guards — no una aproximación más débil que el e2e para este riesgo
puntual (decorador ausente o migrado a nivel de clase), aunque no sustituye
al harness e2e para otros riesgos (routing, composición con `JwtAuthGuard`/
`TenantGuard`). Se complementa con dos tests que instancian
`new AdminClienteGuard()` directo y verifican que rechaza TECNICO/SOLICITANTE
con `ForbiddenException` — el comportamiento real del guard, no un mock.

### Verificación (backend/)

- `pnpm vitest run src/auth/interface/controllers/usuarios.controller.spec.ts`: 29 passed (29)
- `pnpm lint`: sin errores
- `pnpm typecheck`: sin errores
- `pnpm test` (suite completa, con `soporte-postgres-master` levantado): 432 archivos / 5157 tests passed

### Notas de alcance

- No se tocó `frontend/`: WU-3.
- `ResetearPasswordUsuarioTenantUseCase` (WU-1) se consumió tal cual, sin
  modificarlo.
- `toHttpException` (`usuarios.controller.ts:136-148`) NO se modificó: 404 vía
  la rama existente de `MembresiaNoEncontradaError`, 422 vía el fallthrough
  para `UsuarioNoDisponibleError` (ADR-1).
- Sin deuda de Ayuda propia: WU-2 no tiene superficie visible para el
  usuario (la deuda del ciclo completo se anota en WU-3, que sí la tiene).

## WU-3 — campo de reset en `EditarUsuarioDialog`

**Estado: completo (10/10 tareas).**

| Tarea | Estado |
|---|---|
| 3.1 `editarUsuarioSchema` + `password`/`repetirPassword` + `superRefine` (ADR-6) | [x] |
| 3.2 `ResetearPasswordUsuarioDto` en `types.ts` | [x] |
| 3.3 `useResetearPasswordUsuarioTenant` + `useEditarUsuarioTenant` cede sus toasts | [x] |
| 3.4 `submit()` reescrito con la secuencia de corte de ADR-3 | [x] |
| 3.5 Test: desenlace 1 (identidad y password ok) | [x] |
| 3.6 Test: desenlace 2 (falla identidad, reset nunca se emite) | [x] |
| 3.7 Test: desenlace 3 (identidad ok, falla el reset) | [x] |
| 3.8 Test: campo vacío ⇒ el endpoint de password nunca se llama | [x] |
| 3.9 Test schema: 7 caracteres rechaza, contraseñas distintas, vacío válido | [x] |
| 3.10 Cierre WU-3 y del ciclo (lint + type-check + tests en verde, deuda de Ayuda anotada) | [x] |

### Archivos

- `frontend/src/features/usuarios/schemas.ts` (modificado): `editarUsuarioSchema`
  pasó de `z.object` a `z.object(...).superRefine(...)`, sumando `password` y
  `repetirPassword` (`z.string()`, NO `.optional()` — cadena vacía es la señal
  de "no cambiar"). El `min(8)` es el literal `8` con comentario, espejo de
  `@MinLength(8)` en `usuario-tenant.dto.ts:51` (misma convención que
  `crearUsuarioTenantSchema`, sin constante compartida).
- `frontend/src/features/usuarios/schemas.test.ts` (modificado): los tests
  existentes de `editarUsuarioSchema` necesitaron sumar
  `password: "", repetirPassword: ""` a sus objetos base porque el schema ya
  no acepta esas claves ausentes; se agregó el describe
  `"editarUsuarioSchema — reset opcional de contraseña"` con los casos de la
  tarea 3.9.
- `frontend/src/features/usuarios/types.ts` (modificado): agregado
  `ResetearPasswordUsuarioDto { password: string }`, sin `clienteId`.
- `frontend/src/features/usuarios/hooks/use-usuarios-tenant-mutations.ts`
  (modificado): `useEditarUsuarioTenant` perdió `notifySuccess`/`onError:
  notifyError` (conserva `invalidateQueries`); nuevo
  `useResetearPasswordUsuarioTenant(usuarioId)` — `PATCH .../password`, sin
  toasts, `apiFetch<void>` porque el endpoint devuelve 204 sin cuerpo.
- `frontend/src/features/usuarios/components/editar-usuario-dialog.tsx`
  (modificado): dos campos `type="password"` nuevos con hint; `submit()`
  reescrito como `async function` con la secuencia de corte de ADR-3
  (identidad primero, corte si falla; reset solo si el campo no está vacío;
  cierre condicional); toasts compuestos localmente vía `toast` de `sonner`
  + un helper `mensajeDeError()` (mismo patrón que `use-login.ts:74-81`, que
  también compone mensajes fuera de `notifyError`/`notifySuccess`).
- `frontend/src/features/usuarios/components/editar-usuario-dialog.test.tsx`
  (modificado): el test original (precarga + envío solo-identidad) queda
  intacto; se agregaron 4 tests para los desenlaces 1/2/3 de ADR-3 y el caso
  de campo vacío, con `vi.mock("sonner", ...)` (patrón de
  `comentarios-dialog.test.tsx` / `compra-cancelar-dialog.test.tsx`) para
  asertar el contenido exacto de los toasts compuestos.

### Sanity-check del test de corte (mandatorio, ver prompt de lanzamiento)

Sobre el test "desenlace 2", se comentó temporalmente el `return;` que sigue
al `catch` de la mutación de identidad (dejando que el flujo cayera al PATCH
de password igual). Resultado: el test pasó de verde a **rojo** —
`expect(passwordCalls).toBe(0)` falló con `received 1` — confirmando que el
test SÍ detecta la rotura del corte. Se revirtió el cambio inmediatamente
(`return;` restaurado) y se re-corrió la suite completa de `usuarios/`, que
volvió a los 37 tests en verde.

### Decisión de testing: dónde compone el mensaje de error (`mensajeDeError`)

`notifyError`/`notifySuccess` (`shared/lib/toast.ts`) toman un `unknown`/`string`
fijo y no admiten componer un mensaje con contexto adicional (p. ej. "... pero
la contraseña NO se cambió: <motivo>"). En vez de modificar `toast.ts` (fuera
de la lista de `File Changes` del design), se replicó localmente en el diálogo
la misma lógica de extracción de `ApiError.messages` que ya usa `notifyError`
— exactamente el patrón que `use-login.ts` (`mensajeDeErrorDeLogin`) ya usa
para componer sus propios mensajes con `toast` importado directo de `sonner`.
Es una pequeña duplicación deliberada, acotada a este archivo, en vez de tocar
un módulo compartido por 30+ consumidores fuera del alcance de este ciclo.

### Verificación (frontend/)

- `pnpm vitest run src/features/usuarios`: 37 passed (37) — 5 archivos
- `pnpm lint`: sin errores ni warnings
- `pnpm type-check` (`tsc --noEmit`): sin errores
- `pnpm test` (suite COMPLETA de frontend): 188 archivos / 1424 tests passed
- `pnpm test` (suite COMPLETA de backend, `soporte-postgres-master` levantado):
  432 archivos / 5157 tests passed — mismo número que el cierre de WU-2,
  confirmando que esta unidad no tocó ningún archivo de `backend/`

### Notas de alcance

- Ningún archivo de `backend/` se tocó en esta unidad — se consumió
  `PATCH /usuarios/:id/password` (WU-2) tal cual, sin modificarlo.
- `usuarios-admin-view.tsx` no se tocó: el diálogo ya estaba montado, no hace
  falta un control nuevo (confirmado por `design.md`, File Changes).

### Deuda de Ayuda (pausa vigente desde 2026-09-07)

`backend/ayuda/*.md` sin cambios en este ciclo, por la pausa vigente. Se deja
anotada la deuda para la tanda final de artículos, que debe cubrir:

- Un admin del tenant ahora puede establecer la contraseña de un usuario
  desde el diálogo de edición (Admin > Usuarios).
- Dejar el campo vacío NO cambia la contraseña existente.
- Establecer una contraseña nueva **revoca las sesiones abiertas** del
  usuario destino.
- El usuario puede volver a cambiarla él mismo después, desde la pantalla de
  cambio de contraseña ya existente.
- Cualquier artículo existente que describa "cómo un admin gestiona
  usuarios" puede haber quedado incompleto y debe revisarse contra esta
  capacidad nueva.

Esta misma nota va en el cuerpo del commit y del PR.
