# Verify Report — PR2 admin-general (T2.1–T2.16)

> Generado: 2026-06-30 | Verificador: sdd-verify | Rama: feat/admin-general-pr2-clientes-ciclos (PR #16)
> Artifacts leídos: spec (clientes-tenancy), tasks (obs #1607), apply-progress (obs #1610), design.md

---

## Verdict: PASS WITH WARNINGS

**0 CRITICAL — 2 WARNING — 4 SUGGESTION**

---

## Evidencia real (números, no suposiciones)

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (vitest) | 1831 tests PASS, 0 FAIL — 122 test files — 94.53s |
| `pnpm lint` | 0 errores, 0 warnings |
| `tsc --noEmit` | 0 errores |

---

## CRITICAL (0)

Ninguno. El PR puede mergearse con los warnings documentados.

---

## WARNING (2)

### W1 — adminEmail 409 test ausente
**Archivo**: `backend/src/clientes/interface/controllers/clientes.controller.spec.ts`

El DOD de T2.4 lista explícitamente `"adminEmail duplicado → 409"` como test requerido.
El spec (clientes-tenancy/POST /clientes) define el scenario "adminEmail ya registrado es rechazado con 409".
**Este test NO existe en el spec file.** Solo `db_name` duplicado y provisioning-fail están cubiertos.

Remedio: agregar en PR3 o como commit de fix:
```ts
it('adminEmail ya registrado → 409 ConflictException', async () => {
  crear.execute.mockResolvedValue(Result.fail(new ClienteConflictError('admin@empresa.com')));
  await expect(controller.create({ ...validBody, adminEmail: 'admin@empresa.com' }))
    .rejects.toThrow(ConflictException);
});
```

### W2 — PermissionsGuard y TenantGuard sin tests unitarios propios
**Archivos**: `backend/src/auth/infrastructure/guards/permissions.guard.ts`, `tenant.guard.ts`

Los tests de `CiclosController` verifican que los guards estén REGISTRADOS (metadata reflection)
pero no que EJECUTEN correctamente. Los spec scenarios:
- "USUARIO (sin ciclo:gestionar) → 403"
- "Sin auth → 401 en /ciclos"
- "X-Tenant-Id resuelve al tenant objetivo"

...son verificados solo por inspección de metadata (`Reflect.getMetadata`), no por ejecución real.
`GlobalAdminGuard` tiene 5 tests propios. `PermissionsGuard` y `TenantGuard` no tienen
archivos `*.guard.spec.ts`. Esta brecha es pre-existente (guards introducidos antes de PR2).

---

## SUGGESTION (4)

### S1 — cicloVigenteId placeholder
**Archivo**: `backend/src/clientes/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts:85`

`save()` usa `ciclo.id` como placeholder de `cicloVigenteId` (campo NOT NULL, sin FK real).
**Técnicamente correcto**: no hay FK constraint, el tickets-module no realiza lookups en master
usando este campo. Sin embargo, los ciclos creados vía admin panel no tienen entrada
correspondiente en `master.ciclos_vigentes`. Cuando ambos sistemas de ciclos se unifiquen,
habrá que migrar estos placeholders.

### S2 — Filtrado de soft-deleted en memoria
**Archivo**: `backend/src/clientes/application/use-cases/listar-clientes.use-case.ts:22`

`findAll()` devuelve TODOS los clientes (incluyendo `deleted_at IS NOT NULL`) y el use case
filtra en app layer. Funcionalmente correcto; ineficiente a escala.
Mejor: push `WHERE deleted_at IS NULL` al `PrismaClienteRepository.findAll()`.

### S3 — DTOs sin class-validator decorators
**Archivos**: `backend/src/clientes/interface/dtos/create-ciclo.dto.ts`, `create-cliente.dto.ts`

No hay `ValidationPipe` en `main.ts` y ningún DTO del proyecto usa class-validator.
El spec dice `adminEmail: string (email válido)` — no se enforcea en el HTTP boundary.
Strings de fecha no parseables generan `Invalid Date` que puede escapar la validación
de la entidad (NaN comparisons son siempre false) y resultar en HTTP 500 en vez de 400.

### S4 — Solapamiento con fechas adyacentes puede ser falso positivo
**Archivo**: `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.ts:63`

`dto.fechaFin >= existente.fechaInicio` es `true` cuando son iguales. Si ciclo A termina
el 31/12 y ciclo B empieza el 31/12, el check bloquea la creación. Depende de si negocio
considera ciclos adyacentes como solapamiento. La base spec no aclara si los rangos son
`[inicio, fin)` o `[inicio, fin]`.

---

## Checks adversariales confirmados

### cicloVigenteId placeholder: SAFE
- Campo NOT NULL, sin FK constraint (schema: `/// Soft ref → master.ciclos_vigentes.id. Sin FK`)
- `tickets/infrastructure` NUNCA hace lookup en master por `cicloVigenteId`
- Usar `ciclo.id` es determinístico, único (UUIDv7), sin violación de constraint

### /ciclos vs /ciclos-vigentes: CORRECTAMENTE SEPARADOS
- `CiclosController` → `@Controller('ciclos')` → `ciclos_cliente` del tenant ✅
- `CiclosVigentesController` → `@Controller('ciclos-vigentes')` → `master.ciclos_vigentes` ✅

### adminPassword en respuesta: NO EXPUESTO
- `ClienteResponseDto.fromEntity()` no incluye `adminPassword`, `password`, ni `passwordHash`
- Test en `clientes.controller.spec.ts:187-206` lo verifica explícitamente ✅

### ciclo:gestionar en RBAC seed: EXISTE
- `20260629100000_seed_rbac_4_roles/migration.sql:52` — permiso definido
- ADMINISTRADOR tiene `ciclo:gestionar` en sus 19 permisos (línea 115) ✅

### Guards en CiclosController: CORRECTAMENTE REGISTRADOS
- Nivel controlador: `JwtAuthGuard + TenantGuard`
- Nivel método: `PermissionsGuard + @RequirePermissions('ciclo:gestionar')`
- Metadata tests confirman registro; behavior tests ausentes (W2) ⚠️

### AuthModule exporta TenantGuard + PermissionsGuard: VERIFICADO
- `auth.module.ts:180-181` exporta ambos
- `ClientesModule` usa `forwardRef(() => AuthModule)` → DI funcional ✅

---

## Estado de tareas PR2

| Tarea | Estado | Notas |
|-------|--------|-------|
| T2.1 | ✅ | findAll() implementado en repo e interfaz |
| T2.2 | ✅ | 4 tests — ListarClientesUseCase.spec.ts |
| T2.3 | ✅ | ListarClientesUseCase — filtra en app layer |
| T2.4 | ⚠️ | 5/6 tests — falta adminEmail 409 (W1) |
| T2.5 | ✅ | GET /clientes + POST /clientes → provisioning |
| T2.6 | ✅ | CicloClienteEntity + ICicloClienteRepository |
| T2.7 | ✅ | 4 tests — ListarCiclosUseCase.spec.ts |
| T2.8 | ✅ | ListarCiclosUseCase implementado |
| T2.9 | ✅ | 6 tests — CrearCicloTenantUseCase.spec.ts |
| T2.10 | ✅ | CrearCicloTenantUseCase con overlap check |
| T2.11 | ✅ | 5 tests — ActivarCicloUseCase.spec.ts |
| T2.12 | ✅ | ActivarCicloUseCase — lanza NotFoundException |
| T2.13 | ✅ | PrismaCicloClienteRepository ($transaction atómico) |
| T2.14 | ✅ | 17 tests — CiclosController.spec.ts |
| T2.15 | ✅ | CiclosController con guards correctos |
| T2.16 | ✅ | ClientesModule wired + ciclo:gestionar en seed |

---

## Recomendación

**PR #16 puede mergearse.** Ningún CRITICAL bloquea el merge.

Antes de lanzar PR3, agregar el test faltante de W1 (adminEmail 409).
Los tests de PermissionsGuard/TenantGuard (W2) pueden agregarse en un commit de housekeeping
junto con PR3 (que toca `AuthModule`).

