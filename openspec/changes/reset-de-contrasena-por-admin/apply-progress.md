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

Pendiente.

## WU-3 — campo de reset en `EditarUsuarioDialog`

Pendiente.
