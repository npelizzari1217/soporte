# Tasks: ciclos-master-tenant — Fases 2 y 3 (backend)

> Alcance: SOLO Fase 2 (CRUD catálogo master) y Fase 3 (elegir+activar tenant + lectura activo).
> Fuente: design (engram `sdd/ciclos-master-tenant/design` #1720), decisiones (#1718), proposal (#1719).
> TDD estricto RED→GREEN por criterio, atómico (sin ramificarse). Constitución: soft-delete obligatorio, sin `as any`, conventional commits sin AI attribution.

Convención de marcado: `[P]` = puede correr en paralelo con otras tareas `[P]` del mismo bloque. Sin marca = secuencial (depende de la tarea anterior).

---

## FASE 2 — CRUD catálogo master (`ciclos_vigentes`, `CiclosVigentesController`)

> **Estado: [x] COMPLETA (T2.1–T2.8)** — apply ejecutado, ver engram `sdd/ciclos-master-tenant/apply-progress-fase2`.
> Suite completa: 135 test files / 1970 tests passed (baseline previo 132/1938, +32 tests, 0 regresiones). `pnpm lint` limpio. `tsc --noEmit` limpio.

### [x] T2.1 — Dominio: comportamiento en `CicloVigenteEntity` [P]
**Satisface:** ADR-1/ADR-2 (design), base para T2.4/T2.5.
**Archivos:**
- `backend/src/clientes/domain/entities/ciclo-vigente.entity.ts`
- `backend/src/clientes/domain/entities/ciclo-vigente.entity.spec.ts`

**[RED]** Agregar tests en el spec existente:
- `rename('')` o whitespace → lanza error de validación (nombre vacío).
- `rename('Nuevo nombre')` → `entity.nombre === 'Nuevo nombre'`, `updatedAt` cambia.
- `reschedule(fechaFin <= fechaInicio)` → lanza `CicloVigenteInvalidDatesError`.
- `reschedule(fechas válidas)` → getters actualizados, `updatedAt` cambia.
- `activate()` → `entity.activo === true`.
- `deactivate()` → `entity.activo === false`.

**[GREEN]** Implementar en la entidad: `rename(nombre: string): void`, `reschedule(fechaInicio: Date, fechaFin: Date): void` (revalida invariante, lanza `CicloVigenteInvalidDatesError`), `activate(): void`, `deactivate(): void`. Todos llaman `this.touch()` (heredado de `BaseEntity`, ya `protected`).

---

### [x] T2.2 — Dominio: error `CicloVigenteNotFoundError` [P]
**Satisface:** contrato 404 de PATCH/DELETE `/ciclos-vigentes/:id`.
**Archivos:** `backend/src/clientes/domain/errors/clientes.errors.ts`

**[RED]** No hay spec dedicado a errores en este módulo (patrón existente: se testean vía el use case que los lanza — cubierto en T2.4/T2.5). Task atómica: agregar la clase primero, los tests que la ejercitan viven en T2.4/T2.5.

**[GREEN]**
```ts
export class CicloVigenteNotFoundError extends DomainError {
  readonly code = 'CICLO_VIGENTE_NOT_FOUND';
  constructor(id: string) {
    super(`Ciclo vigente con id "${id}" no encontrado.`);
  }
}
```

---

### [x] T2.3 — Application: `ListarCiclosVigentesUseCase`
**Depende de:** ninguna (usa puerto existente `findAllNonDeleted`).
**Satisface:** GET `/ciclos-vigentes`.
**Archivos:**
- `backend/src/clientes/application/use-cases/listar-ciclos-vigentes.use-case.ts` (nuevo)
- `backend/src/clientes/application/use-cases/listar-ciclos-vigentes.use-case.spec.ts` (nuevo)

**[RED]** Tests (mock `ICicloVigenteRepository`):
- `execute()` sin args → llama `findAllNonDeleted()`, retorna el array tal cual.
- retorna `[]` si el repo retorna `[]` (no lanza).
- incluye ciclos con `activo=false` (no filtra client-side — delega todo al repo).

**[GREEN]** Clase plain, constructor `(private readonly cicloRepo: ICicloVigenteRepository)`, `execute(): Promise<CicloVigenteEntity[]>` → `return this.cicloRepo.findAllNonDeleted()`.

---

### [x] T2.4 — Application: `EditarCicloVigenteUseCase`
**Depende de:** T2.1 (rename/reschedule/activate/deactivate), T2.2 (error).
**Satisface:** PATCH `/ciclos-vigentes/:id`, ADR-2 (no propaga a tenants).
**Archivos:**
- `backend/src/clientes/application/use-cases/editar-ciclo-vigente.use-case.ts` (nuevo)
- `backend/src/clientes/application/use-cases/editar-ciclo-vigente.use-case.spec.ts` (nuevo)

**[RED]** Tests (mock repo con `findById`, `findActiveNonDeleted`, `save`):
- `id` no existe → `findById` retorna `null` → `Result.fail(CicloVigenteNotFoundError)`.
- solo `nombre` presente → aplica `rename`, `save()` llamado, no toca fechas.
- `fechaInicio`/`fechaFin` presentes y válidas, ciclo queda `activo=true`, NO solapa con otros activos (excluyendo el propio id) → `Result.ok`, `save()` llamado.
- `fechaFin <= fechaInicio` → `Result.fail(CicloVigenteInvalidDatesError)` (no llama `save`).
- fechas nuevas SOLAPAN con otro ciclo activo (excluyendo el propio id de la comparación) → `Result.fail(CicloVigenteOverlapError)`.
- cambiar fechas cuando el ciclo editado quedará `activo=false` → NO revalida solapamiento (coherente con `CrearCicloVigenteUseCase`: solo bloquea contra activos).
- `activo: true/false` presente → aplica `activate()`/`deactivate()`.
- editar NO reescribe `ciclos_cliente` — este use case no conoce ni importa `ICicloClienteRepository` (test de arquitectura simple: constructor solo recibe `ICicloVigenteRepository`).

**[GREEN]** `execute(id, { nombre?, fechaInicio?, fechaFin?, activo? })`: `findById` → 404 si null; aplicar `rename`/`reschedule`/`activate|deactivate` según campos presentes; si cambian fechas y `entity.activo === true`, revalidar contra `findActiveNonDeleted()` filtrando `c.id !== id`; `save()`.

---

### [x] T2.5 — Application: `DesactivarCicloVigenteUseCase` [P respecto a T2.4 tras T2.1/T2.2]
**Depende de:** T2.1 (softDelete heredado ya existe), T2.2.
**Satisface:** DELETE `/ciclos-vigentes/:id` (ADR-1, soft-delete).
**Archivos:**
- `backend/src/clientes/application/use-cases/desactivar-ciclo-vigente.use-case.ts` (nuevo)
- `backend/src/clientes/application/use-cases/desactivar-ciclo-vigente.use-case.spec.ts` (nuevo)

**[RED]** Tests:
- `id` no existe → `Result.fail(CicloVigenteNotFoundError)`, `save()` NO llamado.
- `id` existe → `entity.softDelete()` (deletedAt seteado) + `save()` llamado con la entidad actualizada → `Result.ok(undefined)`.
- el use case JAMÁS llama `cicloRepo.delete()` (assert `repo.delete` no invocado — guardia explícita contra baja física, ADR-1).

**[GREEN]** `execute(id): Promise<Result<void, CicloVigenteNotFoundError>>` → `findById` → 404 si null; `entity.softDelete()`; `save(entity)`; `Result.ok(undefined)`.

---

### [x] T2.6 — DTO: `UpdateCicloVigenteDto` [P]
**Satisface:** body de PATCH `/ciclos-vigentes/:id`.
**Archivos:** `backend/src/clientes/interface/dtos/update-ciclo-vigente.dto.ts` (nuevo)

**[RED/GREEN combinado — DTO es declarativo, sin lógica propia; se valida vía el test de integración del controller en T2.7.**
```ts
export class UpdateCicloVigenteDto {
  @IsString() @IsNotEmpty() @IsOptional() nombre?: string;
  @IsDateString() @IsOptional() fechaInicio?: string;
  @IsDateString() @IsOptional() fechaFin?: string;
  @IsBoolean() @IsOptional() activo?: boolean;
}
```

---

### [x] T2.7 — Interface: `CiclosVigentesController` — GET, PATCH, DELETE
**Depende de:** T2.3, T2.4, T2.5, T2.6.
**Satisface:** contratos de endpoints Fase 2 completos.
**Archivos:**
- `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts`
- `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.spec.ts`

**[RED]** Agregar al spec existente (sigue el patrón de `ciclos.controller.spec.ts`: metadata + comportamiento):
- `GET /ciclos-vigentes` → 200, retorna `CicloVigenteResponseDto[]` (mapea `ListarCiclosVigentesUseCase.execute()`).
- `PATCH /ciclos-vigentes/:id` con dto válido → 200 `CicloVigenteResponseDto` con campos actualizados.
- `PATCH .../:id` cuando use case retorna `Result.fail(CicloVigenteNotFoundError)` → 404 `NotFoundException`.
- `PATCH .../:id` cuando retorna `Result.fail(CicloVigenteInvalidDatesError)` → 422 `UnprocessableEntityException`.
- `PATCH .../:id` cuando retorna `Result.fail(CicloVigenteOverlapError)` → 422 `UnprocessableEntityException`.
- `DELETE /ciclos-vigentes/:id` → 204 (`@HttpCode(204)`), sin body.
- `DELETE .../:id` cuando use case retorna `Result.fail(CicloVigenteNotFoundError)` → 404.
- Metadata: `GET`, `PATCH`, `DELETE` tienen `@UseGuards(GlobalAdminGuard)` aplicado a nivel de método (igual patrón que `create()` existente).
- Metadata: los 3 métodos heredan `JwtAuthGuard` de la clase (ya cubierto, no repetir si el test de clase ya existe).

**[GREEN]** Inyectar los 3 use cases nuevos en el constructor. Implementar:
```ts
@Get()
@UseGuards(GlobalAdminGuard)
async listar(@Query('incluirInactivos') incluirInactivos?: string): Promise<CicloVigenteResponseDto[]>

@Patch(':id')
@UseGuards(GlobalAdminGuard)
async editar(@Param('id') id: string, @Body() dto: UpdateCicloVigenteDto): Promise<CicloVigenteResponseDto>
// mapea CicloVigenteNotFoundError→404, CicloVigenteInvalidDatesError/CicloVigenteOverlapError→422

@Delete(':id')
@UseGuards(GlobalAdminGuard)
@HttpCode(HttpStatus.NO_CONTENT)
async desactivar(@Param('id') id: string): Promise<void>
// mapea CicloVigenteNotFoundError→404
```
Nota: el query `incluirInactivos` es opcional para este scope — si no se usa aún en `ListarCiclosVigentesUseCase.execute()` (que no lo recibe, T2.3), simplemente ignorarlo o no exponerlo en el controller (el use case ya filtra soft-deleted por defecto). No agregar lógica no cubierta por T2.3.

---

### [x] T2.8 — Wiring: `clientes.module.ts` (Fase 2)
**Depende de:** T2.3, T2.4, T2.5, T2.7.
**Archivos:** `backend/src/clientes/clientes.module.ts`

**[RED]** No aplica test unitario propio — cubierto por el arranque del módulo en tests e2e existentes (si los hay) o por el propio test de integración del controller (T2.7) que instancia el controller con los use cases reales si hay un spec de módulo. Si no existe test de wiring, este paso es GREEN-only (mecánico) pero DEBE ejecutarse `pnpm build`/`nest build` o el test-suite completo para detectar errores de DI en runtime.

**[GREEN]**
- Importar `ListarCiclosVigentesUseCase`, `EditarCicloVigenteUseCase`, `DesactivarCicloVigenteUseCase`.
- Registrar como providers factory `inject: [CICLO_VIGENTE_REPOSITORY]` (mismo patrón que `CrearCicloVigenteUseCase`).
- Inyectar en `CiclosVigentesController` (constructor ya actualizado en T2.7).
- No exportar (no consumidos fuera del módulo por ahora).

---

## FASE 3 — Elegir + activar en tenant + lectura del activo (`CiclosController`)

### T3.1 — Dominio: `cicloVigenteId` en `CicloClienteEntity` (admin) [P]
**Satisface:** ADR-5 (link real sube al dominio).
**Archivos:**
- `backend/src/clientes/domain/entities/ciclo-cliente.entity.ts`
- (spec de la entidad no existe como archivo separado — cubrir en T3.6/T3.4 con las entidades creadas ahí; si se prefiere aislar, crear `ciclo-cliente.entity.spec.ts` nuevo)

**[RED]** Crear/extender test:
- `CicloClienteEntity.create({..., cicloVigenteId: 'uuid-x'})` → `entity.cicloVigenteId === 'uuid-x'`.
- `CicloClienteEntity.reconstitute({..., cicloVigenteId: 'uuid-x'}, id, createdAt, updatedAt, deletedAt)` → getter expone el valor persistido.

**[GREEN]** Agregar `cicloVigenteId: string` a `CicloClienteAdminProps`; getter `get cicloVigenteId(): string { return this.props.cicloVigenteId; }`. `create`/`reconstitute` ya reciben `props` completo — no requieren cambio de firma, solo el shape de `CicloClienteAdminProps`.

---

### T3.2 — Guard: `PermissionsOrGlobalAdminGuard` (nuevo, resuelve riesgo #1)
**Depende de:** ninguna (guard standalone, sigue el patrón de `PermissionsGuard`/`AdminOrGlobalGuard`).
**Satisface:** "guard de POST /ciclos" — acepta `is_global_admin` (operador global via `X-Tenant-Id`) O el permiso declarado por `@RequirePermissions(...)` (aquí `ciclo:gestionar`, ADMINISTRADOR del cliente).
**Por qué NO reusar `AdminOrGlobalGuard` tal cual:** ese guard chequea `roles.includes('ADMINISTRADOR')` (nombre de rol), no el permiso real `ciclo:gestionar` del JWT. Acoplar a nombre de rol es frágil si RBAC evoluciona (ej. otro rol gana `ciclo:gestionar`). Este guard nuevo generaliza el patrón: lee el mismo metadata `PERMISSIONS_KEY` que `PermissionsGuard` (vía `@RequirePermissions`, sin decorators nuevos) y agrega el bypass `is_global_admin` — reusa la MISMA convención de permisos, no la de roles.
**Archivos:**
- `backend/src/auth/infrastructure/guards/permissions-or-global-admin.guard.ts` (nuevo)
- `backend/src/auth/infrastructure/guards/permissions-or-global-admin.guard.spec.ts` (nuevo)

**[RED]** Tests (modelo: `permissions.guard` + `admin-or-global.guard.spec.ts`):
- `is_global_admin: true`, `permisos: []`, metadata requiere `['ciclo:gestionar']` → `canActivate` retorna `true` (bypass).
- `is_global_admin: false`, `permisos: ['ciclo:gestionar']` → `true` (ADMINISTRADOR del cliente).
- `is_global_admin: false`, `permisos: []` (rol regular, ej. TECNICO/USUARIO) → lanza `ForbiddenException`.
- `is_global_admin: false`, `permisos: ['ticket:crear']` (tiene otro permiso pero no el requerido) → `ForbiddenException`.
- sin metadata `PERMISSIONS_KEY` (endpoint sin `@RequirePermissions`) → pass-through `true` (igual que `PermissionsGuard`).
- `request.user` es `null` → `ForbiddenException`.
- `is_global_admin: true` Y `permisos` incluye el requerido → `true` (ambos caminos válidos a la vez, no debe fallar).

**[GREEN]**
```ts
@Injectable()
export class PermissionsOrGlobalAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | null>(PERMISSIONS_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Acceso denegado: usuario no autenticado');

    if (user.is_global_admin === true) return true;

    const missing = required.filter((p) => !user.permisos.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`Acceso denegado: permisos faltantes [${missing.join(', ')}]`);
    }
    return true;
  }
}
```

---

### T3.3 — Puerto: `findActive()` en `ICicloClienteRepository` (admin) [P]
**Satisface:** ADR-8 / `ObtenerCicloActivoUseCase`.
**Archivos:** `backend/src/clientes/domain/ports/i-ciclo-cliente.repository.ts`

**[RED]** No aplica test de interfaz TS pura — se cubre por T3.7 (use case) y T3.4 (implementación).

**[GREEN]** Agregar al puerto: `findActive(): Promise<CicloClienteEntity | null>;` con doc "Retorna el ciclo activo (`activo=true`, `deletedAt=null`) del tenant resuelto, o `null` si no hay ninguno."

---

### T3.4 — Infraestructura: `PrismaCicloClienteRepository` — fix placeholder + `findActive`
**Depende de:** T3.1, T3.3.
**Satisface:** ADR-5 (elimina placeholder línea 85), ADR-8 (findActive).
**Archivos:**
- `backend/src/clientes/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts`
- `backend/src/clientes/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.spec.ts` (crear si no existe; si es solo integración con Prisma real, usar el patrón de mocks existente en el repo de tickets o test de integración liviano)

**[RED]** Tests:
- `toDomain` mapea `row.cicloVigenteId` → `entity.cicloVigenteId` (requiere el getter de T3.1).
- `save()` en `create` persiste `cicloVigenteId: ciclo.cicloVigenteId` (el valor REAL de la entidad) — NO `ciclo.id`. Test: mock del prisma client, assert `create.data.cicloVigenteId === entidad.cicloVigenteId` con `cicloVigenteId !== entidad.id`.
- `findActive()` consulta `findFirst({ where: { activo: true, deletedAt: null } })` y mapea a entidad si existe.
- `findActive()` retorna `null` si no hay ninguno activo.

**[GREEN]**
- `toDomain`: agregar `cicloVigenteId: row.cicloVigenteId` al objeto de props.
- `save().create`: reemplazar `cicloVigenteId: ciclo.id` (línea 85) por `cicloVigenteId: ciclo.cicloVigenteId`.
- Agregar `async findActive(): Promise<CicloClienteEntity | null> { const row = await this.client.cicloCliente.findFirst({ where: { activo: true, deletedAt: null } }); return row ? PrismaCicloClienteRepository.toDomain(row) : null; }`.

**Riesgo cubierto:** eliminar el placeholder rompe cualquier código que hoy asuma `cicloVigenteId === id` (no debería haber ninguno productivo — sin datos, decisión #5).

---

### T3.5 — DTO: `ElegirCicloDto` [P]
**Satisface:** nuevo body de POST `/ciclos` (ADR-3).
**Archivos:** `backend/src/clientes/interface/dtos/elegir-ciclo.dto.ts` (nuevo)

```ts
export class ElegirCicloDto {
  @IsUUID() @IsNotEmpty() cicloVigenteId!: string;
}
```
Sin test propio (declarativo) — validado en integración del controller (T3.8).

---

### T3.6 — Application: `ElegirCicloTenantUseCase` (reemplaza `CrearCicloTenantUseCase`)
**Depende de:** T3.1, T3.5.
**Satisface:** ADR-3/ADR-4/ADR-6 — elegir del catálogo con validación + snapshot + link real.
**Archivos:**
- `backend/src/clientes/application/use-cases/elegir-ciclo-tenant.use-case.ts` (nuevo)
- `backend/src/clientes/application/use-cases/elegir-ciclo-tenant.use-case.spec.ts` (nuevo, reemplaza el contrato de `crear-ciclo-tenant.use-case.spec.ts`)

**[RED]** Tests (mock `ICicloVigenteRepository` master + `ICicloClienteRepository` admin tenant):
- `cicloVigenteId` no existe en master (`findById` → `null`) → `Result.fail(CicloVigenteNotFoundError)`, `tenantRepo.save` NO llamado.
- `cicloVigenteId` existe pero `activo === false` → `Result.fail(CicloVigenteNotFoundError)` (no elegible, ADR-6).
- `cicloVigenteId` existe pero `deletedAt !== null` → `Result.fail(CicloVigenteNotFoundError)`.
- `cicloVigenteId` existe, `activo=true`, `deletedAt=null` → snapshot: `entity.nombre === master.nombre`, `entity.fechaInicio === master.fechaInicio`, `entity.fechaFin === master.fechaFin`, `entity.cicloVigenteId === master.id`, `entity.activo === false`.
- fechas del master elegido SOLAPAN con un ciclo activo del tenant → `Result.fail(CicloVigenteOverlapError)` (reusa algoritmo `A<=D && B>=C`).
- ciclos inactivos/soft-deleted del tenant NO bloquean por solapamiento (mismo criterio que `CrearCicloTenantUseCase` original).
- éxito → `tenantRepo.save(ciclo)` llamado una vez, `Result.ok(ciclo)`.

**[GREEN]**
```ts
export class ElegirCicloTenantUseCase {
  constructor(
    private readonly cicloVigenteRepo: ICicloVigenteRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
  ) {}

  async execute({ cicloVigenteId }: { cicloVigenteId: string }): Promise<Result<CicloClienteEntity, CicloVigenteNotFoundError | CicloVigenteOverlapError>> {
    const master = await this.cicloVigenteRepo.findById(cicloVigenteId);
    if (!master || !master.activo || master.deletedAt !== null) {
      return Result.fail(new CicloVigenteNotFoundError(cicloVigenteId));
    }

    const todos = await this.cicloClienteRepo.findAll();
    const activos = todos.filter((c) => c.activo && c.deletedAt === null);
    const solapa = activos.some((c) => master.fechaInicio <= c.fechaFin && master.fechaFin >= c.fechaInicio);
    if (solapa) return Result.fail(new CicloVigenteOverlapError());

    const ciclo = CicloClienteEntity.create({
      nombre: master.nombre,
      fechaInicio: master.fechaInicio,
      fechaFin: master.fechaFin,
      activo: false,
      cicloVigenteId: master.id,
    });
    await this.cicloClienteRepo.save(ciclo);
    return Result.ok(ciclo);
  }
}
```
Nota: `CicloVigenteInvalidDatesError` ya no puede ocurrir aquí (las fechas vienen validadas del master) — no incluir en la unión de errores salvo que `CicloClienteEntity.create` lo exija por firma (revisar en implementación; si TS lo exige por el `throw` interno, envolver en try/catch igual que el use case viejo, aunque en la práctica nunca dispara).

---

### T3.7 — Application: `ObtenerCicloActivoUseCase` [P respecto a T3.6, después de T3.3/T3.4]
**Depende de:** T3.3 (puerto `findActive`).
**Satisface:** ADR-8 — lectura del activo, GET `/ciclos/activo`.
**Archivos:**
- `backend/src/clientes/application/use-cases/obtener-ciclo-activo.use-case.ts` (nuevo)
- `backend/src/clientes/application/use-cases/obtener-ciclo-activo.use-case.spec.ts` (nuevo)

**[RED]** Tests:
- hay ciclo activo → `execute()` retorna la entidad (delega a `findActive()`).
- no hay ciclo activo → `execute()` retorna `null` (no lanza).

**[GREEN]** `execute(): Promise<CicloClienteEntity | null> { return this.cicloRepo.findActive(); }`.

---

### T3.8 — Interface: `CiclosController` — GET /ciclos/activo, POST elegir, guard swap
**Depende de:** T3.2, T3.5, T3.6, T3.7.
**Satisface:** ADR-3, ADR-6, ADR-7 (sin cambios en activar), ADR-8, riesgo #1 (guard), riesgo #5 (orden de rutas).
**Archivos:**
- `backend/src/clientes/interface/controllers/ciclos.controller.ts`
- `backend/src/clientes/interface/controllers/ciclos.controller.spec.ts`

**[RED]** Reescribir/extender el spec existente (rompe el contrato viejo de `create()` — reescribir esos tests al nuevo contrato PRIMERO, RED, antes de tocar el controller, según ADR-3):
- **Routing:** `GET /ciclos/activo` declarado ANTES de cualquier ruta con `:id` (test de metadata de orden de rutas, o test de integración con `supertest`/Nest testing module verificando que `GET /ciclos/activo` no cae en un handler paramétrico).
- `GET /ciclos/activo` sin guard de permisos (solo hereda `JwtAuthGuard, TenantGuard` de clase) → metadata: NO tiene `PermissionsGuard`/`PermissionsOrGlobalAdminGuard` a nivel de método.
- `GET /ciclos/activo` con ciclo activo existente → 200 `CicloResponseDto`.
- `GET /ciclos/activo` sin ciclo activo (`ObtenerCicloActivoUseCase` retorna `null`) → 204 (sin body) — o 200 con `null`, decidir consistente con el contrato del diseño (`200 | 204 sin activo`); usar `@HttpCode` condicional o retornar `null` con 200. **Elegir 200 + `null` en el body es más simple en Nest (evita manipular Response manualmente); documentar la elección en el JSDoc del método.**
- rol regular (sin `ciclo:gestionar`, sin `is_global_admin`) → `GET /ciclos/activo` 200 (accesible), `GET /ciclos` (listar) → 403 (sigue protegido). Cubre riesgo #5 del diseño explícitamente.
- `POST /ciclos` con `{ cicloVigenteId }` válido → 201 `CicloResponseDto` con `activo: false` (delega a `ElegirCicloTenantUseCase`).
- `POST /ciclos` cuando el use case retorna `Result.fail(CicloVigenteNotFoundError)` → 404 `NotFoundException`.
- `POST /ciclos` cuando retorna `Result.fail(CicloVigenteOverlapError)` → 422 `UnprocessableEntityException`.
- `POST /ciclos` response NO incluye `cicloVigenteId` (mismo criterio que hoy, infra no se filtra).
- `POST /ciclos` y `PATCH /ciclos/:id/activar` tienen `@UseGuards(PermissionsOrGlobalAdminGuard)` en vez de `PermissionsGuard` (metadata test).
- `POST /ciclos` — operador global (`is_global_admin: true`, `permisos: []`) vía `X-Tenant-Id` → guard permite (no 403) — test de guard aislado ya cubre esto en T3.2, aquí solo verificar el metadata/wiring correcto en el controller.
- `POST /ciclos` — ADMINISTRADOR del cliente (`is_global_admin: false`, `permisos: ['ciclo:gestionar']`) → guard permite.
- `POST /ciclos` — rol regular (sin permiso, sin global) → guard rechaza (403) — cubierto en T3.2, referenciar aquí solo si se agrega test de integración end-to-end del controller con el guard real (no mockeado).
- `PATCH /ciclos/:id/activar` **sin cambios de comportamiento** (ADR-7) — solo actualizar el test de guard metadata (`PermissionsOrGlobalAdminGuard` en vez de `PermissionsGuard`); el resto de los tests de activar (existencia, tenant aislado) permanecen igual.
- `listar()` (GET /ciclos) **sin cambios** — sigue con `PermissionsGuard` + `ciclo:gestionar` (el diseño NO pidió el guard combinado ahí, solo en elegir/activar).

**[GREEN]**
- Reemplazar import/inyección de `CrearCicloTenantUseCase` por `ElegirCicloTenantUseCase`; agregar `ObtenerCicloActivoUseCase` al constructor.
- Declarar `@Get('activo')` **antes** del método `listar()`/`create()`/`activar()` en el código fuente (orden de registro de rutas en Nest sigue el orden de declaración de métodos — mover el método arriba en la clase, no solo en el archivo).
- `activo()`: `const ciclo = await this.obtenerCicloActivoUseCase.execute(); return ciclo ? CicloResponseDto.fromEntity(ciclo) : null;` — sin `@UseGuards` adicional a nivel de método.
- `create()`: cambiar `@Body() dto: CreateCicloDto` → `@Body() dto: ElegirCicloDto`; `@UseGuards(PermissionsGuard)` → `@UseGuards(PermissionsOrGlobalAdminGuard)`; llamar `elegirCicloTenantUseCase.execute({ cicloVigenteId: dto.cicloVigenteId })`; mapear `CicloVigenteNotFoundError` → `NotFoundException`, `CicloVigenteOverlapError` → `UnprocessableEntityException`.
- `activar()`: solo cambiar `@UseGuards(PermissionsGuard)` → `@UseGuards(PermissionsOrGlobalAdminGuard)`. Sin más cambios (ADR-7).
- `listar()`: sin cambios.

---

### T3.9 — Cleanup: remover código muerto `CreateCicloDto` / `CrearCicloTenantUseCase`
**Depende de:** T3.8 (nada referencia ya al contrato viejo).
**Satisface:** riesgo #3 del diseño (deuda de wiring).
**Archivos a eliminar:**
- `backend/src/clientes/interface/dtos/create-ciclo.dto.ts`
- `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.ts`
- `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.spec.ts`

**[RED/GREEN]** No aplica RED (es una eliminación, no una feature). Verificación: correr el test-suite completo tras borrar — cero referencias colgantes (`grep -r CreateCicloDto`/`CrearCicloTenantUseCase` en `backend/src` debe dar 0 resultados fuera de este cleanup). Si `clientes.module.ts` aún importa/registra `CrearCicloTenantUseCase`, resolver en T3.10 antes de borrar el archivo (orden real: T3.10 primero swap de providers, T3.9 después borra archivos — invertir el orden de ejecución si hace falta, ambas tareas son parte del mismo commit atómico).

---

### T3.10 — Wiring: `clientes.module.ts` (Fase 3)
**Depende de:** T3.6, T3.7, T3.8.
**Archivos:** `backend/src/clientes/clientes.module.ts`

**[GREEN]**
- Reemplazar el provider `CrearCicloTenantUseCase` por `ElegirCicloTenantUseCase`, `inject: [CICLO_VIGENTE_REPOSITORY, CICLO_CLIENTE_ADMIN_REPOSITORY]`.
- Agregar provider `ObtenerCicloActivoUseCase`, `inject: [CICLO_CLIENTE_ADMIN_REPOSITORY]`.
- Actualizar `exports: [...]` — quitar `CrearCicloTenantUseCase`, agregar `ElegirCicloTenantUseCase`, `ObtenerCicloActivoUseCase` (si algo externo los necesita; si no, no exportar de más).
- `AuthModule` debe exportar `PermissionsOrGlobalAdminGuard` (o registrarlo como provider donde corresponda — es `@Injectable()` standalone, Nest lo resuelve por DI si está en el árbol de providers de `AuthModule`; verificar que `Reflector` esté disponible — ya lo usa `PermissionsGuard`, mismo módulo).

**Ejecutar tras esta tarea:** test-suite completo (`pnpm test` en `backend/`) + `tsc --noEmit` — pegar salida real (Definition of Done del proyecto).

---

### T3.11 — Integración: test de orden de rutas + aislamiento por rol (cierre explícito riesgo #5)
**Depende de:** T3.8, T3.10.
**Archivos:** `backend/src/clientes/interface/controllers/ciclos.controller.spec.ts` (o un spec de integración nuevo si el proyecto separa unit/e2e, ej. `test/ciclos.e2e-spec.ts` si existe ese patrón — verificar convención real antes de crear archivo nuevo)

**[RED]** Si no quedó cubierto ya en T3.8:
- Instanciar el módulo Nest real (o `Test.createTestingModule` con controller real) y hacer un request simulado a `GET /ciclos/activo` con un usuario rol regular → 200 (no cae en `:id` de otra ruta, no 403).
- Mismo usuario a `GET /ciclos` → 403.
- Mismo usuario a `POST /ciclos` → 403 (guard combinado rechaza sin permiso ni global).

**[GREEN]** Si el enrutamiento ya quedó correcto en T3.8 (método declarado antes), esta tarea es solo de verificación — no debería requerir cambios de código, solo el test que lo prueba explícitamente end-to-end (unit-level de controller + guards reales, no mockeados, para que el orden de Nest se ejercite de verdad).

---

## Resumen de dependencias (orden de ejecución sugerido)

```
Fase 2 (independiente de Fase 3):
  T2.1 [P] ─┬─→ T2.4 ─┐
  T2.2 [P] ─┘         ├─→ T2.7 ─→ T2.8
  T2.3 [P] ───────────┤
  T2.5 [P] ───────────┤
  T2.6 [P] ───────────┘

Fase 3 (puede arrancar en paralelo con Fase 2 — sin dependencias cruzadas de código,
        solo de "orden de PR" si se decide encadenar):
  T3.1 [P] ─┬─→ T3.4 ─┬─→ T3.6 ─┐
  T3.3 [P] ─┘         ├─→ T3.7 ─┤
  T3.2 [P] ────────────────────┼─→ T3.8 ─→ T3.9/T3.10 (mismo commit) ─→ T3.11
  T3.5 [P] ────────────────────┘
```

---

## Review Workload Forecast

**Estimación de líneas cambiadas (código + tests, orden de magnitud):**

| Bloque | Producción | Tests | Total aprox. |
|--------|-----------:|------:|--------------:|
| Fase 2 (T2.1–T2.8) | ~260 | ~430 | **~690** |
| Fase 3 (T3.1–T3.11) | ~330 | ~560 | **~890** |
| **Total** | **~590** | **~990** | **~1580** |

(Incluye la eliminación de `CrearCicloTenantUseCase`/`CreateCicloDto`/su spec en Fase 3, que resta ~100 líneas pero cuenta como diff.)

**Presupuesto de 400 líneas por PR: EXCEDIDO ampliamente en ambos bloques** (Fase 2 sola ya casi duplica el presupuesto; Fase 3 lo triplica).

**Chained PRs recomendado: Yes.**

**División sugerida (mínimo 4 PRs encadenados, cada uno verificable de forma independiente):**
1. **PR1 (Fase 2, dominio+aplicación):** T2.1, T2.2, T2.3, T2.5, T2.6 (~350 líneas) — bajo riesgo, sin tocar el controller aún.
2. **PR2 (Fase 2, controller+wiring):** T2.4, T2.7, T2.8 (~340 líneas) — depende de PR1.
3. **PR3 (Fase 3, guard+dominio+infra):** T3.1, T3.2, T3.3, T3.4, T3.5 (~350 líneas) — independiente de PR1/PR2, puede correr en paralelo.
4. **PR4 (Fase 3, use cases+controller+cleanup+wiring):** T3.6, T3.7, T3.8, T3.9, T3.10, T3.11 (~540 líneas — el más grande; si el revisor lo pide, partir T3.6/T3.7 en un PR4a separado de T3.8/T3.9/T3.10/T3.11 en PR4b) — depende de PR3.

**Riesgo de presupuesto 400 líneas: High** (todos los PRs individuales rondan o superan el límite salvo que se subdivida PR4).

**Decisión pendiente antes de `sdd-apply`:** confirmar con el usuario si se acepta el PR4 grande (~540 líneas, `size:exception`) o se subdivide más (PR4a/PR4b), dado que ADR-3 pide que el cambio de contrato de `POST /ciclos` (T3.6+T3.8) se revise como una unidad para no dejar el contrato a medio migrar entre PRs.
