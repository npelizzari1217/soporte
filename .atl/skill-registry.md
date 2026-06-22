# Skill Registry — soporte

**Delegator use only.** El orquestador lee este registry para resolver compact rules y las inyecta como `## Project Standards (auto-resolved)` en el prompt de cada sub-agente (texto, NO paths). Curado para el stack y las decisiones de "soporte" (Sistema de Gestión de Tickets). Difiere de educandow donde nuestras decisiones difieren.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| API, REST, endpoint, controller, route, HTTP, web service, API contract, respuesta unificada | api-design | ~/.config/opencode/skills/api-design/SKILL.md |
| audit, auditoría, historial, soft delete, trail, who changed, operaciones_ticket | audit-log | ~/.config/opencode/skills/audit-log/SKILL.md |
| auth, autenticación, autorización, login, JWT, RBAC, roles, permisos, guards, multitenancy, tenant | auth-access | ~/.config/opencode/skills/auth-access/SKILL.md |
| clean architecture, hexagonal, capas, layers, DDD, Screaming Architecture, módulos | clean-arch | ~/.config/opencode/skills/clean-arch/SKILL.md |
| repository, repositorio, persistencia, Prisma, ORM, data access, mappers, puertos | repository-pattern | ~/.config/opencode/skills/repository-pattern/SKILL.md |
| NestJS, Nest, módulo, controller, provider, @Module, DI, Injectable, token | nestjs-modules | ~/.config/opencode/skills/nestjs-modules/SKILL.md |
| value object, VO, tipos fuertes, domain primitive, self-validating, CUIT, Email, Money | value-objects | ~/.config/opencode/skills/value-objects/SKILL.md |
| error handling, errores, Result type, manejo de errores, domain errors, try catch | error-handling | ~/.config/opencode/skills/error-handling/SKILL.md |
| file, archivo, adjunto, upload, subir, imagen, PDF, storage, S3, IFileStorage | file-storage | ~/.config/opencode/skills/file-storage/SKILL.md |
| email, notificación, push, telegram, websocket, SMS, EnviaEmail, EnviaTelegram | messaging-notifications | ~/.config/opencode/skills/messaging-notifications/SKILL.md |
| data access, Prisma, persistencia, cache, sync, mobile futuro | data-access | ~/.config/opencode/skills/data-access/SKILL.md |
| UI, button, formulario, form, input, table, modal, toast, componente, Next.js, Tailwind | ui-patterns | ~/.config/opencode/skills/ui-patterns/SKILL.md |
| report, PDF, reporte, listado, documento, certificado, ticket export | reporting-documents | ~/.config/opencode/skills/reporting-documents/SKILL.md |
| creating PRs, opening PRs, preparing PRs for review | branch-pr | ~/.config/opencode/skills/branch-pr/SKILL.md |
| PRs over 400 lines, stacked PRs, review slices, chained | chained-pr | ~/.config/opencode/skills/chained-pr/SKILL.md |
| commit splitting, work unit, reviewable commits, implementation | work-unit-commits | ~/.config/opencode/skills/work-unit-commits/SKILL.md |
| PR feedback, issue replies, reviews, comments | comment-writer | ~/.config/opencode/skills/comment-writer/SKILL.md |

## Compact Rules

### api-design
- RESTful resource naming: NO verbos en URLs (`/getTickets` ✗), NO prefijo `/api` salvo detrás de gateway, NO trailing slashes.
- **Response envelope unificado (decisión de soporte):** éxito → `{ success: true, data: ... }`; error → `{ success: false, error: { code, message, details? } }`. NUNCA devolver 200 con un error.
- HTTP status: 200/201/204 éxito; 400/401/403/404/409/422 error.
- Validación en dos niveles: transporte (DTOs/class-validator en `interface/`) para forma; dominio (VO self-validation) para reglas de negocio.
- Controllers FINOS: validar request → llamar use case → mapear respuesta. Cero lógica de negocio.
- Paginación: `?page=1&pageSize=20&sort=createdAt:desc&filter=estado:abierto`.
- NUNCA filtrar errores de infraestructura al cliente. Mapear en el borde de `interface/`.
- La API es agnóstica al cliente (web hoy, mobile mañana): nada de lógica de presentación en el backend.

### audit-log
- Auditoría = los campos `created_at`, `updated_at`, `deleted_at` (timestamptz) en TODA entidad, + el timeline `operaciones_ticket` para acciones de negocio.
- Toda transición de estado / avance de subtarea se registra en `operaciones_ticket` (usuario_id + tipo_operacion + fecha) DENTRO de la misma transacción que el cambio.
- El actor es SIEMPRE requerido. Desconocido = sistema, nunca null.
- Cambios estructurados, no texto libre cuando aplique: `{ campo, valorAnterior, valorNuevo }`.
- Entradas de auditoría son INMUTABLES. Correcciones = entradas nuevas, no updates.
- Enmascarar datos sensibles (passwords, tokens). NUNCA loguear el `password_hash`.

### auth-access
- AuthN ≠ AuthZ: AuthN verifica identidad (infraestructura: JWT/Passport), AuthZ chequea permisos (aplicación/dominio).
- Passwords: **argon2id** en infraestructura; reglas de validación en VO de dominio. NUNCA loguear tokens ni passwords.
- Tokens: access 15min + refresh 7d (refresh persistido en `master.refresh_tokens`, revocable). httpOnly + secure + sameSite.
- **RBAC híbrido (decisión de soporte):** roles + permisos granulares `recurso:accion` (`ticket:crear`, `compra:aprobar`). Permiso efectivo = unión de permisos de todos los roles del usuario.
- Guards encadenados en Nest vía Reflector: `JwtAuthGuard` → `RolesGuard` (@Roles) → `PermissionsGuard` (@RequirePermissions) → `TenantGuard`.
- `usuario_tipos_ticket` NO es permiso: es elegibilidad de asignación. Se valida en `AsignarTicketUseCase`, no en un guard.
- `request.user` trae roles+permisos resueltos para que los guards no peguen a la DB por request.

### auth-access · multitenancy (soporte)
- **database-per-tenant:** identidad/auth/RBAC viven en MASTER; los datos operativos en una DB por cliente. El JWT lleva `cliente_id` → se resuelve la DB tenant.
- `TenantContext` (AsyncLocalStorage) guarda `{ prismaClient, dbName, clienteId }` por request. Rutas master (`/auth`, `/usuarios`, `/roles`, `/clientes`) NO requieren tenant.
- Sin contexto de tenant válido en ruta tenant → `Forbidden`. El aislamiento es físico (DB separada), no por filtro.
- Refs cross-DB ticket→usuario (`asignado_id`, `solicitante_id`, `aprobado_por`) = soft refs sin FK, validadas en el caso de uso.

### clean-arch
- **Hexagonal por módulo (Screaming Architecture).** Capas: `domain/` → `application/` → `infrastructure/` / `interface/`.
- `domain/` NO importa nada externo (ni Prisma ni Nest). `application/` importa `domain/` SOLO. `infrastructure/` e `interface/` importan `domain/`+`application/`.
- Entidades con comportamiento — nada de dominio anémico. Value Objects inmutables, self-validating, comparados por valor.
- Use Cases: una clase = un caso de uso, método `execute()`. Puertos en `domain/ports`, implementados en `infrastructure/`.
- DTOs en `interface/` (request/response). NUNCA exponer entidades de dominio fuera de `application/`.
- Tests de dominio con CERO infraestructura. Tests de aplicación mockean puertos.
- El wiring de DI vive en el módulo Nest (`infrastructure`). Inyección por constructor.

### repository-pattern
- Interface de repositorio definida en `domain/ports` como puerto. Implementación en `infrastructure/persistence/prisma`.
- Métodos hablan lenguaje de dominio: `findById()`, `save()`, `findAbiertosPorTipo()` — nunca `insertIntoTable()`.
- Devuelven entidades de dominio, NO modelos Prisma. La impl mapea (Prisma model ↔ entidad) con un mapper explícito por entidad.
- Una repo por aggregate root. NO crear repo por cada tabla.
- **Fitness rule (soporte):** `PrismaService` PROHIBIDO fuera de `infrastructure/`. Si aparece en `domain/`, `application/` o `interface/`, es un error de arquitectura.
- El repo obtiene el client del tenant activo vía `TenantContext`/`PrismaService` factory; el dominio no se entera de qué DB es.
- Tests: mockear la interface para domain/application; testear la impl contra DB real.

### nestjs-modules
- Controllers en `interface/`, use cases en `application/`, repos en `infrastructure/`. Los módulos los cablean.
- Use cases son clases planas con `execute()`. SIN `@Injectable()` ni decoradores Nest en el dominio.
- Inyección de repos por **Symbol token**, no por clase: `@Inject(TICKET_REPOSITORY)` con `{ provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository }`.
- SIN `@Injectable()` en entidades de dominio ni VOs. El dominio es TypeScript puro.
- Imports circulares = olor de diseño. Extraer dependencias compartidas a `shared/`.

### value-objects
- Campos `private readonly`. Sin setters. Sin mutación. Factory `static create()` que devuelve `Result` o lanza errores tipados.
- Implementar `equals()` (comparación por valor), `get()` (primitivo crudo), `toString()`.
- Validación DENTRO del VO, no en controllers ni use cases. Foco en invariantes del valor, no reglas de negocio.
- VOs candidatos en soporte: `CUIT`, `Email`, `Money`/`Monto`, `PorcentajeAvance` (0-100), `EstadoTicket`. VOs compartidos en `shared/domain`.

### error-handling
- NUNCA lanzar (`throw`) en domain o application. Usar `Result<T, E>` para fallos esperados.
- Modelo de errores por capa: DomainError → ApplicationError → InfrastructureError → Presentation (mapeado).
- Mapear en bordes de capa: errores de infraestructura NO cruzan a application tal cual.
- Todo `catch` mapea o re-envuelve. Nada de `catch(e) { throw e }`.
- Errores con contexto: qué falló, por qué, identificadores. Nada de `Error('algo salió mal')`.

### file-storage
- Operaciones de archivo detrás de un puerto **`IFileStorage`** en `shared/domain`. Implementaciones (local FS, S3, mensajeria) en `shared/infrastructure`.
- La tabla `archivos` guarda SOLO metadata (`storage_key`, `mime_type`, `tamano_bytes`, `nombre_original`). El binario NUNCA en la DB.
- Vínculo entidad↔archivo por **tablas join con FK real** (`archivos_ticket`, `archivos_operacion`, `archivos_presupuesto`, `archivos_equipo`), no polimórfico.
- Upload devuelve una FileReference (id, mime, tamaño). NUNCA exponer paths internos.
- Validación (tipo, tamaño) en application antes de almacenar. Servir archivos por un controller, no desde el FS directo.

### messaging-notifications
- Notificaciones detrás de un puerto en `application/`. Implementaciones (email/Telegram) en `infrastructure/`.
- `clientes.envia_email` / `clientes.envia_telegram` gobiernan el canal por cliente.
- Async preferido: publicar evento de dominio → handler llama al puerto de notificación. No bloquear la operación primaria.
- Templates son objetos de dominio (estructura), el rendering es infraestructura. Proveedores swappables sin tocar application.

### data-access
- Backend: PostgreSQL + Prisma, escondido tras puertos de repositorio (ver repository-pattern).
- NUNCA importar tipos específicos de Prisma en domain o application.
- Mobile futuro: el backend es agnóstico al cliente; cuando llegue mobile, misma interface de puerto, otra impl (no rehacer dominio).

### ui-patterns
- Frontend Next.js (App Router) + Tailwind + Shadcn/Tremor. Aplicar el sistema de diseño de `skills/frontend-ui/skill.md` (paleta, estados de ticket por color, dark:, rounded-lg/md, toasts).
- Todo listado (tickets/compras/reparaciones) DEBE tener: Skeleton Loader (no spinner full-screen), Empty State, Interactive State (botón con loading + disabled al enviar).
- Inputs con validación en cliente + feedback inmediato (`text-rose-500`) y submit deshabilitado si hay errores.
- Consumir el envelope `{ success, data }` del backend. El front NUNCA accede a la DB.
- Tipos compartidos desde un paquete/contrato — no redefinir tipos de dominio en el front.

### reporting-documents
- Generación de documentos detrás de un puerto en `application/`. Engine (PDFKit/ExcelJS) es infraestructura.
- Reportes ensamblados desde datos de dominio vía use cases. Cero lógica de negocio en los generadores.
- Async para documentos grandes; almacenar el resultado vía el puerto IFileStorage.

### branch-pr
- Branch naming: `type/description` — `^(feat|fix|chore|docs|refactor|perf|test|build|ci)\/[a-z0-9._-]+$`.
- Conventional commits: `type(scope): description`. SIN atribución AI / Co-Authored-By (regla del usuario).
- Checks automáticos deben pasar antes del merge. Un `type:*` label por PR.

### chained-pr
- Estrategia de entrega del proyecto: **ask-on-risk**. Partir PRs de más de **400 líneas** cambiadas salvo `size:exception` aceptado.
- Cada PR revisable en ≤60 min. Tests/docs viajan con la unidad que verifican.
- Declarar inicio/fin, dependencias, follow-up y out-of-scope en cada PR encadenado.
- No mezclar estrategias de cadena una vez elegida.

### work-unit-commits
- Cada commit = unidad de trabajo revisable: coherente, testeable de forma independiente, propósito claro.
- Un cambio lógico por commit. Tests y docs con el código que verifican.
- Conventional commits: `type(scope): description`. El body explica el PORQUÉ, no el QUÉ.

### comment-writer
- Empezar por el punto accionable. No recapitular todo el PR antes del feedback.
- Cálido y directo, como un compañero que piensa, no un bot corporativo.
- Corto: 1-3 párrafos o bullets. Explicar el PORQUÉ técnico al pedir un cambio.
- Idioma del thread. Español → **Rioplatense voseo** (`podés`, `tenés`, `fijate`).

## Project Conventions

Decisiones cerradas de soporte (ver `openspec/changes/modelo-datos-tres-flujos/design.md` para el detalle/rationale). Inyectar SIEMPRE en sub-agentes que escriban o revisen código.

### IDs
- **UUIDv7** tipo `uuid` nativo en TODAS las PK/FK. Generado en el backend (lib `uuidv7`) antes del INSERT. Nunca `varchar(36)`. Default DB solo como red de seguridad.
- `numero` legible de ticket (`SOP-2026-00042`) = secuencia local por DB tenant, campo aparte del uuid.

### Multitenancy (database-per-tenant)
- MASTER (una DB): `clientes` (catálogo de tenants + db_name), `usuarios`, `refresh_tokens`, RBAC, `ciclos_vigentes`.
- TENANT (una DB por cliente, **SIN columna cliente_id**): tickets y todo el dato operativo + catálogos operativos sembrados por tenant.
- Aislamiento FÍSICO (DB separada), no por `WHERE`. Routing por JWT → `PrismaService` factory (`MasterPrismaClient` + `Map<dbName, TenantPrismaClient>` lazy/cacheado).
- Migraciones en fan-out (`migrate:master` 1 vez + `migrate:tenant` a todas las DBs tenant). Alta de cliente vía `CrearClienteUseCase` (crea DB + migra + siembra catálogos + registra en master).
- Catálogos (`estados`, `prioridades`, `tipos_*`, `tipo_operacion`) se SIEMBRAN en cada tenant para preservar FK reales dentro del tenant.

### Auditoría + soft delete (TODA entidad)
- `created_at`, `updated_at` (timestamptz NOT NULL, `now()`), `deleted_at` (timestamptz NULL).
- Soft delete: borrado = `UPDATE deleted_at = now()`. NUNCA `DELETE` físico. Las lecturas de negocio excluyen `deleted_at IS NOT NULL`.

### Enums
- Tablas de catálogo (no enums nativos de PG): `estados`, `prioridades`, `tipos_componente`, `tipo_operacion`. FK desde las tablas que los usan. `CHECK` solo para discriminadores chicos y fijos (`tipos_ticket.codigo`).

### Estructura (Screaming + Hexagonal)
- Módulos por dominio: `tickets`, `compras`, `reparaciones`, `equipos`, `auth`, `clientes`, `usuarios`. Cada uno con `domain/ application/ infrastructure/ interface/`.
- `shared/`: `IFileStorage` (puerto), `PrismaService` + factory de tenancy, base-entity (auditoría), `TenantContext`. Algo va a `shared/` solo si lo cruzan ≥2 módulos (Scope Rule).
- **Fitness rule:** `PrismaService` prohibido fuera de `infrastructure/`.

### Frontend
- Sistema de diseño en `skills/frontend-ui/skill.md`, aplicado automáticamente por el hook `PreToolUse` al editar `frontend/**`. Dark-first, Stripe/Linear, paleta corporativa, estados de ticket por color.

### Testing
- Jest (NestJS), Strict TDD: test primero (RED) antes de implementar (GREEN). Coverage ≥80%. Comandos provisionales hasta scaffoldear el backend (`cd backend && pnpm test` / `pnpm build`).
