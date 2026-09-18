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

Pendiente.
