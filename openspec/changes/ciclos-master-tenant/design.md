# Design: ciclos-master-tenant — Fases 2 y 3 (backend)

> Alcance de ESTE documento: **solo Fase 2 (CRUD catálogo master) y Fase 3 (elegir+activar en tenant + lectura del activo)**.
> Fase 4 (ciclo en tickets/compras/reparaciones) y Fase 5 (frontend + fix `TenantContext.tsx`) quedan **fuera** — se marcan explícitamente donde tocan.
> Fuente de verdad de comportamiento: decisiones confirmadas del usuario (engram `sdd/ciclos-master-tenant/decisiones`, obs #1718).

## Contexto arquitectónico (lo que YA existe)

Clean/Hexagonal por módulo (`backend/src/clientes`), tres capas: `domain` (entidades + puertos, sin infra), `application` (use cases plain-class), `interface` (controllers + DTOs), `infrastructure` (repos Prisma).

Dos niveles de ciclo, en **dos bases distintas**:

| Nivel | Entidad | Tabla / DB | Repo | Contexto |
|-------|---------|------------|------|----------|
| MASTER (catálogo global) | `CicloVigenteEntity` (`clientes/domain`) | `ciclos_vigentes` @ **master** | `PrismaCicloVigenteRepository` (`getMasterClient()`) | global |
| TENANT (ciclo elegido/activo) | `CicloClienteEntity` (`clientes/domain`) | `ciclos_cliente` @ **tenant** | `PrismaCicloClienteRepository` (`TenantContext`) | por-tenant |

Puertos de dominio ya más completos que lo expuesto (deuda de wiring):
- `ICicloVigenteRepository`: ya tiene `findById`, `findAllNonDeleted`, `findActiveNonDeleted`, `findAll`, `save`, `delete`. Solo `save` (POST) está cableado a HTTP.
- `ICicloClienteRepository` (admin): `findAll`, `findById`, `save`, `activarCiclo` (transacción atómica desactivar-todos-activar-uno). Todo cableado.

Guards existentes: `JwtAuthGuard` (hidrata `request.user` con `is_global_admin` y `permisos[]` del JWT), `GlobalAdminGuard` (O(1) sobre `is_global_admin`), `TenantGuard` (resuelve tenant; honra `X-Tenant-Id` **solo** si `is_global_admin`; regular con `X-Tenant-Id` → 403), `PermissionsGuard` (AND sobre `user.permisos`; sin metadata → pass-through).

RBAC (master, seed `20260629100000_seed_rbac_4_roles`): 4 roles acumulativos USUARIO⊂COLABORADOR⊂TECNICO⊂ADMINISTRADOR. `ciclo:gestionar` (b0..018) lo tiene **solo ADMINISTRADOR**. `permisos[]` se hornea en el JWT al login.

**Defecto raíz confirmado** (`prisma-ciclo-cliente.repository.ts:85`): `save()` setea `cicloVigenteId: ciclo.id` (placeholder = su propio id). El link a master nunca apunta a un ciclo master real. `CrearCicloTenantUseCase` crea nombre/fechas de cero, ignorando el catálogo.

---

## Fase 2 — CRUD del catálogo master (`ciclos_vigentes`)

Objetivo: sobre `CiclosVigentesController` (que ya tiene POST protegido con `GlobalAdminGuard`, #34), exponer **listar**, **editar** y **desactivar/baja lógica**. Todo bajo `GlobalAdminGuard` (solo operador global gestiona el catálogo compartido). Bajo riesgo: los puertos ya lo soportan.

### ADR-1 — Baja del catálogo = soft-delete + flag `activo`, NUNCA `delete` físico

**Decisión.** "Desactivar" un ciclo del catálogo se implementa como **soft-delete** (`softDelete()` de `BaseEntity` → `deletedAt`) vía `save()` (upsert), NO vía `ICicloVigenteRepository.delete()` (que es `DELETE` físico). Se mantiene además el flag `activo` como estado independiente (habilitado/deshabilitado para ser elegido) separado de la baja lógica.

**Por qué.** La constitución del proyecto prohíbe la baja física ("Soft delete: la baja física está prohibida"). Un ciclo master puede estar referenciado por N `ciclos_cliente` (soft-ref cross-DB sin FK); borrarlo físicamente rompería la provenance histórica que la decisión #3 del usuario apoya (los `ciclos_cliente` inactivos son el historial). El método `delete()` del puerto queda existente pero **no se cablea a HTTP** en esta fase.

**Semántica de los dos flags:**
- `activo=false` → sigue existiendo y visible al operador global, pero **no elegible** por el tenant (ver ADR-4/validación de elección).
- `deletedAt != null` → fuera del catálogo (no listado por defecto, no elegible).

**Rechazado.** Exponer `DELETE /ciclos-vigentes/:id` (físico) — viola soft-delete y puede dejar `ciclos_cliente` colgando sin origen.

### ADR-2 — Editar el catálogo NO propaga a los `ciclos_cliente` ya elegidos

**Decisión.** `PATCH /ciclos-vigentes/:id` edita el registro master (nombre/fechas/activo). **No** reescribe los `ciclos_cliente` que ya tomaron snapshot de ese ciclo (ver ADR-6). La edición master solo afecta elecciones **futuras**.

**Por qué.** Consistencia con el modelo snapshot (ADR-6): el tenant "congela" nombre/fechas al elegir, para que su reporting por ciclo sea estable. Propagar ediciones master a tenants ya activos alteraría datos históricos de tickets/reportes (Fase 4) de forma no auditada. Cross-DB además no permite una transacción atómica master→N-tenants.

**Riesgo asumido.** Divergencia nombre/fechas master vs snapshot tenant. Aceptable: el `cicloVigenteId` preserva la trazabilidad al origen; un editor master consciente sabe que no re-materializa elecciones pasadas.

### Cambios de dominio (Fase 2)

`CicloVigenteEntity` hoy es inmutable (solo getters + `create`/`reconstitute`). Agregar comportamiento de dominio:

- `rename(nombre: string): void` — valida no-vacío, `touch()`.
- `reschedule(fechaInicio: Date, fechaFin: Date): void` — revalida invariante `fechaFin > fechaInicio` (lanza `CicloVigenteInvalidDatesError`), `touch()`.
- `activate(): void` / `deactivate(): void` — set `props.activo`, `touch()`.
- `softDelete()` ya heredado de `BaseEntity`.

`CicloVigenteMapper.toPersistence` ya serializa `activo` + `deletedAt` → no cambia.

### Use cases nuevos (Fase 2, application)

Todos plain-class, inyectan `CICLO_VIGENTE_REPOSITORY`, retornan `Result<...>` salvo el listar.

1. **`ListarCiclosVigentesUseCase`**
   - `execute({ incluirInactivos?: boolean }): Promise<CicloVigenteEntity[]>`
   - Default (catálogo para gestión global): `findAllNonDeleted()` (incluye `activo=false`, excluye soft-deleted). El operador global ve habilitados y deshabilitados, no los dados de baja.
   - Nota: el listado que el **tenant** usa para elegir (Fase 3/5) NO es este endpoint; se resuelve con `findActiveNonDeleted()` (ver Fase 3 / "consumo del catálogo").

2. **`EditarCicloVigenteUseCase`**
   - `execute(id, { nombre?, fechaInicio?, fechaFin?, activo? }): Promise<Result<CicloVigenteEntity, CicloVigenteNotFoundError | CicloVigenteInvalidDatesError | CicloVigenteOverlapError>>`
   - `findById(id)` → null ⇒ `CicloVigenteNotFoundError` (nuevo error, 404).
   - Aplica `rename` / `reschedule` / `activate|deactivate` según campos presentes.
   - Si cambian fechas y el ciclo queda `activo=true`: **revalidar solapamiento** contra `findActiveNonDeleted()` excluyendo el propio id (mismo algoritmo `A<=D && B>=C` que `CrearCicloVigenteUseCase`). Solapa ⇒ `CicloVigenteOverlapError` (422).
   - `save()`.

3. **`DesactivarCicloVigenteUseCase`** (baja lógica del catálogo)
   - `execute(id): Promise<Result<void, CicloVigenteNotFoundError>>`
   - `findById(id)` → null ⇒ `CicloVigenteNotFoundError`.
   - `entity.softDelete()` + `save()`. (No usa `delete()` físico — ADR-1.)

**Error nuevo** (`clientes.errors.ts`): `CicloVigenteNotFoundError` (`code = 'CICLO_VIGENTE_NOT_FOUND'`, mensaje con id) → mapea a `NotFoundException` (404) en el controller.

### Contratos de endpoints (Fase 2)

Controller: `CiclosVigentesController` (`@Controller('ciclos-vigentes')`, `@UseGuards(JwtAuthGuard)` a nivel clase). Todos los endpoints de gestión llevan `@UseGuards(GlobalAdminGuard)` a nivel método (igual que el POST #34).

| Método | Ruta | Guards | Body / Params | Respuesta | Errores |
|--------|------|--------|---------------|-----------|---------|
| GET | `/ciclos-vigentes` | Jwt + GlobalAdmin | query `?incluirInactivos=false` (opcional) | 200 `CicloVigenteResponseDto[]` | — |
| POST | `/ciclos-vigentes` | Jwt + GlobalAdmin | `CreateCicloVigenteDto` (existente) | 201 `CicloVigenteResponseDto` | 422 overlap |
| PATCH | `/ciclos-vigentes/:id` | Jwt + GlobalAdmin | `UpdateCicloVigenteDto` (nuevo, todos opcionales) | 200 `CicloVigenteResponseDto` | 404 not-found, 422 invalid-dates/overlap |
| DELETE | `/ciclos-vigentes/:id` | Jwt + GlobalAdmin | param `id` | 204 (baja lógica; `@HttpCode(204)`) | 404 not-found |

> `DELETE` aquí es **verbo HTTP** de intención "quitar del catálogo", implementado como **soft-delete** (ADR-1). No borra la fila.

**DTO nuevo** `UpdateCicloVigenteDto`: `nombre?` `@IsString @IsNotEmpty @IsOptional`; `fechaInicio?` / `fechaFin?` `@IsDateString @IsOptional`; `activo?` `@IsBoolean @IsOptional`. El controller convierte fechas string→Date.

### Wiring (Fase 2, `clientes.module.ts`)

Registrar los 3 use cases nuevos como factory `inject: [CICLO_VIGENTE_REPOSITORY]` (mismo patrón que `CrearCicloVigenteUseCase`). Inyectarlos en `CiclosVigentesController`. Exportar si hicieran falta fuera (no por ahora).

---

## Fase 3 — Elegir + activar en el tenant + lectura del activo

Tres sub-problemas: (A) el tenant **elige** del catálogo en vez de crear de cero, con link real; (B) **activar** mantiene el invariante "un solo activo"; (C) **leer el activo** habilitado para todos los roles.

### ADR-3 — `POST /ciclos` cambia de "crear de cero" a "elegir del catálogo" (contrato REEMPLAZADO, misma ruta)

**Decisión.** Reemplazar el **contrato** de `POST /ciclos`: el body pasa de `{ nombre, fechaInicio, fechaFin }` a `{ cicloVigenteId: string }`. Se mantiene la **ruta** `POST /ciclos` (sigue creando el recurso `ciclos_cliente` en la colección). Se retira la semántica "crear libre"; `CrearCicloTenantUseCase` se reemplaza por `ElegirCicloTenantUseCase`.

**Por qué reemplazar y no agregar `POST /ciclos/elegir`:**
1. **No hay datos productivos ni consumidores externos** (decisión #5): el único cliente es el frontend propio, que se reescribe entero en Fase 5. No hay contrato que preservar.
2. **El endpoint viejo ES el bug.** Mantener "crear de cero" vivo deja abierto el camino que genera el placeholder roto y ciclos huérfanos del catálogo. Un buen diseño elimina el estado inválido, no lo deja como puerta lateral.
3. **REST correcto.** `POST /ciclos` = "crear un `ciclos_cliente`". Sigue siendo eso; solo cambia la *representación* de entrada (referencia al master en vez de datos crudos). Un verbo-en-path `/elegir` sería menos RESTful y redundante.

**Rechazado.** (a) `POST /ciclos/elegir` nuevo + dejar el viejo → dos caminos, uno inválido. (b) Endpoint nuevo y deprecar el viejo con warning → sobra: no hay consumidores que migrar.

**Consecuencia (breaking, aceptada):** el frontend actual de creación libre (`CiclosPage.tsx`) deja de compilar contra el contrato. Es esperado y se aborda en Fase 5.

### ADR-4 — Copiar (snapshot) nombre/fechas; referenciar `cicloVigenteId`

**Decisión.** Al elegir, `ciclos_cliente` **copia** `nombre`, `fechaInicio`, `fechaFin` desde el `CicloVigente` master (snapshot en el momento de la elección) y **referencia** el `cicloVigenteId` real (link a `ciclos_vigentes.id`).

**Por qué.**
- **Referenciar el link real** corrige el defecto raíz (placeholder) y da provenance: se sabe de qué entrada del catálogo salió.
- **Copiar los datos** (no join en runtime) porque: (1) es cross-DB — no hay JOIN posible master↔tenant en Postgres; resolver el nombre en cada lectura obligaría a un fetch master extra por request. (2) Estabilidad histórica: tickets/compras/reparaciones (Fase 4) se filtran por el ciclo del tenant; el snapshot mantiene el reporting inmutable aunque el master se edite después (coherente con ADR-2 y decisión #3: los `ciclos_cliente` inactivos = historial).

**Qué se copia vs referencia:**

| Campo `ciclos_cliente` | Origen | Tipo |
|------------------------|--------|------|
| `cicloVigenteId` | `CicloVigente.id` | **referencia** (link real) |
| `nombre` | `CicloVigente.nombre` | copia (snapshot) |
| `fechaInicio` | `CicloVigente.fechaInicio` | copia (snapshot) |
| `fechaFin` | `CicloVigente.fechaFin` | copia (snapshot) |
| `activo` | — | `false` al elegir (activación es paso aparte) |

### ADR-5 — El link `cicloVigenteId` sube al dominio de `CicloClienteEntity` (admin)

**Decisión.** Agregar `cicloVigenteId: string` a `CicloClienteAdminProps` (entidad admin `clientes/domain/entities/ciclo-cliente.entity.ts`). El repo persiste `ciclo.cicloVigenteId` **real**; se **elimina** el placeholder `cicloVigenteId: ciclo.id` (línea 85).

**Por qué.** El link dejó de ser un detalle de infra "que el schema exige" para ser un concepto de primer orden del dominio (de qué ciclo master proviene). Modelarlo en la entidad (en vez de pasarlo suelto a `save(ciclo, cicloVigenteId)`) mantiene la entidad como fuente de verdad y evita un parámetro fuera de banda. `reconstitute()` y el `toDomain` inline del repo también leen/mapean `cicloVigenteId`.

**Rechazado.** Pasar `cicloVigenteId` como segundo parámetro de `save()` — rompe la simetría entidad↔fila y esconde un dato de dominio en la firma del puerto.

**Impacto en `CicloResponseDto`:** por ahora **sigue omitiendo** `cicloVigenteId` (no filtrar infra en la respuesta admin). Nota para Fase 5: si la UI necesita mostrar provenance, se agrega ahí como decisión de presentación.

### ADR-6 — Validación de elección contra el catálogo master

**Decisión.** `ElegirCicloTenantUseCase` valida que el `cicloVigenteId` recibido exista en master y sea **elegible**: `findById(id) != null` **AND** `activo === true` **AND** `deletedAt === null`. Si no cumple ⇒ `CicloVigenteNotFoundError` (404) — no se puede elegir un ciclo inexistente, deshabilitado o dado de baja.

**Por qué.** El tenant no debe poder linkear a basura ni a entradas retiradas del catálogo (coherente con ADR-1: `activo=false`/`deletedAt` = no elegible). Se usa `ICicloVigenteRepository.findById` (lee master) — el use case tenant necesita **ambos** repos inyectados (master `CICLO_VIGENTE_REPOSITORY` + tenant `CICLO_CLIENTE_ADMIN_REPOSITORY`). Es legítimo: el flujo cruza los dos niveles por diseño.

### ADR-7 — Activación: reutilizar el mecanismo atómico existente, sin cambios

**Decisión.** `PATCH /ciclos/:id/activar` y `ActivarCicloUseCase` **no cambian**. Ya implementan el invariante "un solo ciclo activo por cliente" vía `activarCiclo(id)` (transacción Prisma: `updateMany activo=false` a todos + `updateMany activo=true` al objetivo). Elegir (crear inactivo) y activar (flip atómico) siguen siendo **dos pasos** — coherente con decisión #2.

**Por qué.** El mecanismo ya es correcto y atómico; tocarlo agrega riesgo sin valor. El único ajuste colateral es que ahora los ciclos que activás provienen de una elección con link real, no de una creación libre — transparente para este use case.

**Flujo elegir→activar (textual):**
```
POST /ciclos { cicloVigenteId }        PATCH /ciclos/:id/activar
        │                                        │
        ▼                                        ▼
ElegirCicloTenantUseCase                 ActivarCicloUseCase
  1. master.findById(cicloVigenteId)       1. tenant.findById(:id) → 404 si no
     → 404 si no elegible                   2. tenant.activarCiclo(:id)  [TX]
  2. snapshot nombre/fechas (ADR-4)            a. UPDATE activo=false  (todos)
  3. overlap vs activos del tenant             b. UPDATE activo=true   (:id)
     → 422 si solapa                        3. return ciclo activado
  4. CicloClienteEntity.create(
       {..snapshot, cicloVigenteId, activo:false})
  5. tenant.save(ciclo)  → cicloVigenteId REAL
  6. return 201 (activo=false)
INVARIANTE: exactamente 1 activo por cliente tras activar.
```

### ADR-8 — Lectura del activo: endpoint dedicado SIN `PermissionsGuard` (no permiso `ciclo:ver`)

**Decisión.** Agregar `GET /ciclos/activo` protegido **solo** por `JwtAuthGuard + TenantGuard` (sin `PermissionsGuard`). Devuelve **únicamente el ciclo activo** (`activo=true, deletedAt=null`) del tenant resuelto, o `null`/`204` si no hay. `GET /ciclos` (listar todos) **mantiene** `ciclo:gestionar`.

**Por qué elegir esto sobre un permiso nuevo `ciclo:ver`:**
1. **Sin re-login masivo.** `permisos[]` se hornea en el JWT al login (`PermissionsGuard` lee `user.permisos`). Un permiso nuevo `ciclo:ver` no aparece en los JWT ya emitidos → todos los usuarios regulares tendrían que re-loguear para ver su ciclo. Un endpoint sin `PermissionsGuard` funciona al instante.
2. **Sin migración RBAC multi-tenant.** `ciclo:ver` exigiría una migración master que inserte el permiso y lo asocie a los 4 roles (`roles_permisos`), idempotente y corrida en todas las DBs — costo y riesgo por algo que el modelo de tenant ya garantiza.
3. **Aislamiento ya garantizado por `TenantGuard`.** El endpoint sirve el activo del **tenant resuelto**. Un usuario regular no puede pasar `X-Tenant-Id` (→ 403), así que solo ve el activo de SU cliente. Cumple exacto la decisión #4 ("regulares leen solo el activo de su cliente, no la lista, no otros clientes").
4. **Separación de responsabilidades limpia.** "Ver el activo" (todos) y "gestionar ciclos" (admin) son operaciones distintas con endpoints distintos. La lista completa sigue siendo privilegio de gestión.

**Rechazado.**
- **Permiso `ciclo:ver` en los 4 roles** → costo re-login + migración RBAC en todas las tenants + hornear en JWT. Se documenta como alternativa viable a futuro si se quisiera granularidad por permiso, pero hoy no aporta sobre el aislamiento por tenant.
- **Quitar `PermissionsGuard` de `GET /ciclos`** (lista) → expondría la lista completa e histórica a regulares; viola decisión #4.

**Nota de routing NestJS:** declarar `GET /ciclos/activo` **antes** que cualquier ruta paramétrica; hoy no hay `GET /ciclos/:id`, así que no hay colisión con `PATCH /ciclos/:id/activar`. Seguro.

**Habilita Fase 5 (fuera de alcance):** el fix de `TenantContext.tsx` (403 silenciado que deja `cicloId=null`) consistirá en que el front llame `GET /ciclos/activo` (accesible a todos) en vez de `GET /ciclos`. Este diseño provee el contrato; la corrección del front es Fase 5.

### Cambios de dominio (Fase 3)

- `CicloClienteEntity` (admin): agregar `cicloVigenteId: string` a `CicloClienteAdminProps`; getter `cicloVigenteId`; incluirlo en `create()` y `reconstitute()` (ADR-5).

### Cambios de aplicación (Fase 3)

1. **`ElegirCicloTenantUseCase`** (reemplaza `CrearCicloTenantUseCase`)
   - Inyecta **ambos** repos: `ICicloVigenteRepository` (master) + `ICicloClienteRepository` admin (tenant).
   - `execute({ cicloVigenteId }): Promise<Result<CicloClienteEntity, CicloVigenteNotFoundError | CicloVigenteOverlapError | CicloVigenteInvalidDatesError>>`
   - Pasos: validar master elegible (ADR-6) → snapshot (ADR-4) → overlap vs activos tenant (reusar lógica existente `findAll().filter(activo && !deleted)` + algoritmo `A<=D && B>=C`) → `CicloClienteEntity.create({snapshot, cicloVigenteId, activo:false})` → `save()`.
   - `CrearCicloTenantUseCase` y su spec se retiran/renombran (TDD: reescribir el spec al nuevo contrato primero, RED→GREEN).

2. **`ObtenerCicloActivoUseCase`** (nuevo, lectura del activo)
   - Inyecta el repo admin tenant. Para leer el activo hace falta un método de repo que lo traiga.
   - `execute(): Promise<CicloClienteEntity | null>`.

3. `ActivarCicloUseCase`, `ListarCiclosUseCase`: **sin cambios** (ADR-7).

### Cambios de infraestructura (Fase 3)

`PrismaCicloClienteRepository` (admin):
- `toDomain`: mapear `cicloVigenteId: row.cicloVigenteId`.
- `save().create`: `cicloVigenteId: ciclo.cicloVigenteId` (**eliminar** el placeholder `ciclo.id`, línea 85). El `update` no toca `cicloVigenteId` (inmutable tras la elección).
- **Agregar** `findActive(): Promise<CicloClienteEntity | null>` al puerto admin `ICicloClienteRepository` + impl (`findFirst where activo=true, deletedAt=null`). (El puerto de tickets ya tiene `findActive`; acá el admin lo necesita para `ObtenerCicloActivoUseCase`.)

**Sin migración de datos** del placeholder (decisión #5: sin datos productivos). El schema `ciclos_cliente.cicloVigenteId` ya existe (NOT NULL, sin FK) → no hay cambio de schema.

### Contratos de endpoints (Fase 3)

Controller: `CiclosController` (`@Controller('ciclos')`, `@UseGuards(JwtAuthGuard, TenantGuard)` a nivel clase).

| Método | Ruta | Guards método | Body/Params | Respuesta | Errores |
|--------|------|---------------|-------------|-----------|---------|
| GET | `/ciclos/activo` | (ninguno extra) | — | 200 `CicloResponseDto` \| 204 sin activo | — |
| GET | `/ciclos` | Permissions `ciclo:gestionar` | — | 200 `CicloResponseDto[]` | 403 |
| POST | `/ciclos` | Permissions `ciclo:gestionar` | `ElegirCicloDto { cicloVigenteId }` | 201 `CicloResponseDto` (activo=false) | 404 master no elegible, 422 overlap |
| PATCH | `/ciclos/:id/activar` | Permissions `ciclo:gestionar` | param `id` | 200 `CicloResponseDto` (activo=true) | 404 |

- **`GET /ciclos/activo`**: declarado **antes** que las rutas con parámetro. Solo `JwtAuthGuard+TenantGuard` (heredados de la clase), **sin** `@UseGuards(PermissionsGuard)` ni `@RequirePermissions` → accesible a todos los roles. Sirve el activo del tenant resuelto (decisión #4).
- **Permisos de elegir/activar**: se mantienen bajo `ciclo:gestionar` (hoy solo ADMINISTRADOR). Cubre "ADMINISTRADOR del cliente". El **operador global** opera vía `X-Tenant-Id` (TenantGuard lo resuelve) — pero necesita `ciclo:gestionar` en su JWT. **Verificar** que el rol del operador global incluya `ciclo:gestionar`; si no, es un gap de RBAC a resolver (ver Riesgos). Alternativa de diseño: permitir el bypass cuando `is_global_admin` (agregar `GlobalAdminGuard` como OR). Se deja marcado como decisión de tasks, no se fuerza acá.

**DTO nuevo** `ElegirCicloDto`: `cicloVigenteId!: string` con `@IsUUID` `@IsNotEmpty`. Reemplaza el uso de `CreateCicloDto` en `POST /ciclos` (`CreateCicloDto` queda sin uso en tenant; evaluar remover en tasks).

### Wiring (Fase 3, `clientes.module.ts`)

- `CrearCicloTenantUseCase` → reemplazar provider por `ElegirCicloTenantUseCase` con `inject: [CICLO_VIGENTE_REPOSITORY, CICLO_CLIENTE_ADMIN_REPOSITORY]`.
- Agregar provider `ObtenerCicloActivoUseCase` `inject: [CICLO_CLIENTE_ADMIN_REPOSITORY]`.
- Inyectarlos en `CiclosController`; actualizar exports.

---

## Diagrama de componentes (Fases 2+3)

```
                         ┌───────────────── MASTER DB ─────────────────┐
GlobalAdmin ─Jwt+GAG──▶ CiclosVigentesController                       │
                         │  GET/POST/PATCH/DELETE /ciclos-vigentes      │
                         │        │                                     │
                         │        ▼                                     │
                         │  Listar/Crear/Editar/Desactivar VigenteUC ──▶ ICicloVigenteRepository
                         │                                              │   (getMasterClient → ciclos_vigentes)
                         └──────────────────────────────────────────────┘
                                        ▲ findById (validar elección)
                                        │
Tenant admin ─Jwt+TenantGuard+Perms──▶ CiclosController                ┌──── TENANT DB ────┐
  (o GlobalAdmin via X-Tenant-Id)      │  POST /ciclos (elegir) ───▶ ElegirCicloTenantUC ──▶ ICicloClienteRepo(admin)
                                        │  PATCH /ciclos/:id/activar ▶ ActivarCicloUC ───────▶  (TenantContext →
Todos los roles ─Jwt+TenantGuard────▶  │  GET /ciclos/activo ──────▶ ObtenerCicloActivoUC ──▶   ciclos_cliente)
  (sin PermissionsGuard)               │  GET /ciclos (lista, Perms) ▶ ListarCiclosUC ────────▶ └───────────────────┘
                                        └──────────────────────────────
```

---

## Riesgos y decisiones abiertas para tasks

1. **`ciclo:gestionar` del operador global.** El operador global (`is_global_admin`) opera el tenant vía `X-Tenant-Id`, pero `POST/PATCH /ciclos` exigen `ciclo:gestionar` en su JWT. Si su rol no lo incluye, no podrá elegir/activar en nombre del cliente (decisión #1). **Acción en tasks:** verificar los permisos del JWT del operador global; si falta, decidir entre (a) `@UseGuards(PermissionsGuard OR GlobalAdminGuard)` composable, o (b) asegurar `ciclo:gestionar` en su rol. Diseño sugiere (a) para no acoplar RBAC a un flag global.
2. **Snapshot vs edición master (ADR-2).** Divergencia nombre/fechas entre master y `ciclos_cliente` ya elegidos. Aceptada; documentar en la UI de Fase 5 que editar el catálogo no re-materializa elecciones pasadas.
3. **Deuda de wiring (`CreateCicloDto`, `CrearCicloTenantUseCase`).** Al reemplazar el contrato, quedan artefactos sin uso. Tasks debe removerlos/renombrarlos limpiamente (y sus specs), no dejar código muerto.
4. **Dos `ICicloClienteRepository`** (admin en `clientes/domain` y otro en `tickets/domain`). No unificar en este change; `ObtenerCicloActivoUseCase` usa el **admin**. Fase 4 (tickets) usará el suyo. Evitar confusión de tokens DI.
5. **Orden de rutas NestJS.** `GET /ciclos/activo` antes de rutas paramétricas. Cubrir con test e2e de que un rol regular (sin `ciclo:gestionar`) recibe 200 en `/ciclos/activo` y 403 en `/ciclos`.
6. **TDD estricto (constitución).** Cada use case/endpoint nuevo con su test atómico RED→GREEN antes de implementar. El cambio de contrato de `POST /ciclos` empieza por reescribir el spec al nuevo contrato (RED).

## Fuera de alcance (NO diseñar aquí)

- **Fase 4** — auto-inyección del `cicloId` activo en creación de tickets/compras/reparaciones + filtro por ciclo en listados. (Consume `ObtenerCicloActivoUseCase`/`findActive`, pero el cableado a esos flujos es Fase 4.)
- **Fase 5** — UI catálogo master (CRUD), UI de selección tenant (combo cliente+ciclo para operador global), lectura del activo para regulares, y **fix `TenantContext.tsx`** (403 silenciado → usar `GET /ciclos/activo`).
