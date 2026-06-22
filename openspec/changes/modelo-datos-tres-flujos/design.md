# Diseño técnico: Modelo de datos — tres flujos

> Fase `sdd-design`. Contexto, stack y convenciones: ver `openspec/project.md` y `CLAUDE.md`.
> Este documento resuelve el CÓMO arquitectónico y las decisiones pendientes. El detalle
> columna-por-columna de cada tabla es responsabilidad de `sdd-spec`.

## Principios rectores (de la constitución)

1. **Screaming Architecture + Hexagonal por módulo:** la estructura grita el dominio; cada
   módulo expone puertos (interfaces) y oculta adaptadores (implementaciones).
2. **Repository pattern estricto:** el dominio define interfaces de repositorio; la
   infraestructura las implementa. La lógica de negocio NUNCA conoce el ORM.
3. **Backend dueño de la lógica:** nada de lógica de negocio en la DB (sin triggers de
   negocio, sin stored procedures de dominio). La DB garantiza integridad, no reglas.
4. **API agnóstica al cliente:** lo que viaja al cliente (web hoy, mobile mañana) debe ser
   seguro y estable. Esto condiciona fuertemente la estrategia de IDs.
5. **Auditoría + soft delete global + multi-tenant por aislamiento FÍSICO** (database-per-tenant
   master/tenant, estilo educandow; el cliente ES la DB, no una columna).

---

## DECISIÓN 1 — Estrategia de IDs: `bigint identity` vs `UUIDv7`

### Contexto
Los IDs de las entidades viajan al cliente en cada respuesta `{ success, data }`. La API es
pública y agnóstica (web + mobile futuro). El sistema es multi-tenant: un ID enumerable
permite a un tenant inferir volumen del negocio ajeno y habilita ataques IDOR
(`GET /tickets/124` → probar `125`). Además queremos joins eficientes e índices compactos.

### Opciones
| Criterio | `bigint identity` | `UUIDv4` | `UUIDv7` |
|---|---|---|---|
| Tamaño / índices | 8 bytes (óptimo) | 16 bytes | 16 bytes |
| No enumerable (anti-IDOR) | NO (secuencial) | SÍ | SÍ |
| Ordenable temporalmente | SÍ | NO (random → fragmenta B-tree) | SÍ (timestamp-prefixed) |
| Generación distribuida | NO (depende de DB) | SÍ | SÍ |
| Localidad de inserción | Alta | Baja (page splits) | Alta (casi secuencial) |

### Recomendación: **UUIDv7**, almacenado como tipo nativo `uuid` de Postgres.

### Justificación
El factor decisivo es la **superficie pública de la API + mobile + multi-tenant**: exponer
enteros secuenciales filtra información de negocio y facilita enumeración/IDOR. `UUIDv7`
elimina ese riesgo SIN pagar el costo clásico de `UUIDv4`: al llevar el timestamp en los bits
altos es **monótonamente creciente**, conserva la localidad de inserción del B-tree (evita la
fragmentación que sufre v4) y aporta ordenabilidad temporal "gratis". El sobrecosto frente a
`bigint` (16 vs 8 bytes) es real en índices y joins, pero a la escala esperada de un sistema
de tickets corporativo es despreciable frente al beneficio de seguridad y desacople (los IDs
se pueden generar en el backend antes del insert → mejor testabilidad y sagas/distribución
futura).

### Implicancias
- Tipo de columna **`uuid` nativo** (NUNCA `varchar(36)`: duplica tamaño y rompe ordenabilidad).
- Generación **en el backend** (lib `uuidv7`) dentro del dominio/repositorio, no en la DB,
  coherente con "la lógica vive en el backend". Default DB opcional solo como red de seguridad.
- El ID técnico (`uuid`) es para relaciones internas/URLs. El **`numero` legible de ticket**
  (ej. `SOP-2026-00042`) es un campo aparte, human-facing, generado por secuencia por tenant.
- Todas las FKs son `uuid`. Documentar en `sdd-spec` el patrón de PK/FK uniforme.

---

## DECISIÓN 2 — Modelo de permisos: RBAC moderno vs ACL legacy

### Contexto
Roles del dominio: `admin`, `soporte_it`, `mantenimiento`, `aprobador_compras`,
`solicitante`. El legacy usaba una matriz ACL `UsuariosXModulos` con flags L/A/M/I/B
(Listar/Alta/Modif/Imprimir/Baja) por usuario y módulo: granular pero ingobernable
(permisos pegados al usuario, sin reuso, imposible de auditar a escala). Además existe un eje
ortogonal: `usuario_tipos_ticket` define **qué tipos de ticket puede atender** cada usuario.

### Opciones
- **A) ACL legacy pura:** matriz usuario×módulo×operación. Granular pero sin reuso ni
  semántica de rol; explota en filas y es opaca.
- **B) RBAC puro:** rol → permite todo lo del rol. Simple pero rígido para excepciones
  ("este soporte además aprueba compras chicas").
- **C) Híbrido RBAC + permisos granulares (recomendado).**

### Recomendación: **C) RBAC con permisos granulares**, y `usuario_tipos_ticket` como **eje
de elegibilidad separado** (no es un permiso, es enrutamiento de trabajo).

### Modelo de entidades (alto nivel)
- `roles` (admin, soporte_it, ...) — catálogo.
- `permisos` — acciones atómicas con convención `recurso:accion`
  (`ticket:crear`, `ticket:cerrar`, `compra:aprobar`, `subtarea:actualizar`).
- `roles_permisos` (N:M) — qué permisos otorga cada rol.
- `usuarios_roles` (N:M) — qué roles tiene cada usuario (permite múltiples roles).
- `usuario_tipos_ticket` (N:M usuario × `tipos_ticket`) — **se mantiene**, pero su semántica
  es "este usuario es asignable/atiende tickets de tipo X", NO un grant de permiso.

El permiso efectivo del usuario = unión de permisos de todos sus roles. Los permisos
granulares cubren las excepciones sin inflar la cantidad de roles.

### Guards en NestJS
Cadena de guards declarativa por endpoint, vía `Reflector` + metadata de decoradores:
1. `JwtAuthGuard` — valida token, hidrata `request.user` (incluye `cliente_id`, roles, permisos).
2. `RolesGuard` — lee `@Roles('admin','soporte_it')`; verificación gruesa.
3. `PermissionsGuard` — lee `@RequirePermissions('compra:aprobar')`; verificación fina.
4. `TenantGuard` — ver Decisión de multi-tenancy.

La elegibilidad por tipo de ticket (`usuario_tipos_ticket`) **no** se chequea en un guard
genérico: es regla de negocio de asignación → vive en el caso de uso
`AsignarTicketUseCase` (valida que `asignado_id` esté habilitado para `ticket.tipo`).

### Justificación
RBAC es auditable, reusable y mapea 1:1 con el lenguaje del negocio (roles reales). Los
permisos granulares evitan la explosión de roles ante excepciones. Separar
`usuario_tipos_ticket` respeta la ortogonalidad: "puedo aprobar compras" (permiso) es
distinto de "atiendo tickets edilicios" (elegibilidad/cola de trabajo). Mezclarlos
recrearía la rigidez del ACL legacy.

### Implicancias
- `request.user` debe traer roles+permisos resueltos (claim en JWT o resolución por request
  cacheada) para que los guards no peguen a la DB en cada llamada.
- Seeds iniciales de `roles`, `permisos` y `roles_permisos` (migración de datos maestros).
- El permiso `compra:aprobar` habilita la transición de estado de Compras (ver máquina de estados).

---

## DECISIÓN 3 — ORM: Prisma vs TypeORM bajo Repository estricto

### Contexto
La constitución exige **Repository pattern estricto** y desacople total: el dominio define
puertos (interfaces de repositorio), la infraestructura los implementa, y el dominio **no
conoce el ORM**. La pregunta no es "cuál ORM tiene repositorio nativo" sino "cuál se deja
ocultar mejor detrás de un puerto sin filtrarse".

### Opciones
- **TypeORM:** `Repository<Entity>` nativo + `@Entity` con decoradores que encajan con la DI
  de Nest. PERO ese mismo "encaje" es la trampa: invita a inyectar `Repository<Ticket>`
  directo en los servicios y a usar la entidad decorada como modelo de dominio → **acopla el
  dominio al ORM**, justo lo que el patrón prohíbe. Migraciones menos robustas; salud del
  proyecto históricamente irregular.
- **Prisma:** `PrismaClient` generado, type-safe, con el mejor tooling de migraciones
  (`prisma migrate`). NO trae "repository" → te **obliga** a envolverlo a mano en
  infraestructura, que es exactamente lo que queremos hacer igual.

### Recomendación: **Prisma.**

### Justificación
Bajo Repository ESTRICTO, el "repositorio nativo" de TypeORM es un anti-incentivo: su
comodidad empuja a violar la regla de desacople. Prisma, al no ofrecer ese atajo, alinea la
herramienta con la arquitectura: defino entidades de dominio como clases/POTOs propias, y
cada repositorio de infraestructura **mapea** el modelo Prisma → entidad de dominio. Sumado
a su type-safety end-to-end y a migraciones declarativas superiores (clave en un proyecto
greenfield con esquema pesado y en evolución), Prisma es la mejor base para esconder detrás
de puertos. El costo —envolver el client a mano— es trabajo que el patrón estricto exige con
cualquier ORM.

### Cómo se respeta el patrón Repository con Prisma
```
backend/src/tickets/
  domain/
    entities/ticket.entity.ts            # POTO de dominio, CERO imports de Prisma
    ports/ticket.repository.ts           # interface ITicketRepository (puerto)
  application/
    use-cases/crear-ticket.use-case.ts   # depende de ITicketRepository (token DI)
  infrastructure/
    persistence/prisma/
      prisma-ticket.repository.ts        # implements ITicketRepository, usa PrismaClient
      ticket.mapper.ts                    # PrismaTicketModel <-> TicketEntity
```
- El puerto se registra en el módulo Nest con un token: `{ provide: TICKET_REPOSITORY,
  useClass: PrismaTicketRepository }`. Los casos de uso inyectan `@Inject(TICKET_REPOSITORY)`.
- `PrismaService` vive en un módulo `shared/persistence` y SOLO lo consumen los repositorios de
  infraestructura, jamás los casos de uso ni los controladores. Bajo el nuevo multitenancy es
  una **factory multi-tenant**: un `MasterPrismaClient` fijo + un `Map<dbName, TenantPrismaClient>`
  cacheado (ver Multi-tenancy), con generators Prisma separados `prisma_master` / `prisma_tenant`.

### Implicancias
- Disciplina obligatoria: prohibido inyectar `PrismaService` fuera de `infrastructure/`.
  (Recomendable un lint rule / fitness function que falle el build si se viola.)
- El multi-tenancy NO usa Prisma Client Extensions: se resuelve con **separación física
  master/tenant** (factory de clients + `TenantContext`), ver sección Multi-tenancy.
- Mappers explícitos por entidad: más boilerplate, pero es el precio del desacople real.

---

## Máquina de estados de tickets (3 tipos)

### Diseño
Un **estado base común** + **extensiones por tipo**, no tres máquinas inconexas. El estado
vive en `tickets.estado` (FK a catálogo `estados`, ver Enums). Las transiciones válidas no se
hardcodean en la DB ni en triggers: viven en un **`TicketStateMachine` por tipo** en la capa
de aplicación, seleccionado por `ticket.tipo` (Strategy pattern).

**Estados comunes:** `abierto → en_progreso → resuelto → cerrado` (+ `cancelado`).

**Compras (extensión de aprobación):** antes de ejecutarse requiere ciclo de aprobación:
`abierto → pendiente_aprobacion → (aprobado | rechazado)`. `aprobado → en_progreso → ...`;
`rechazado → cerrado`. La transición a `aprobado/rechazado` exige permiso `compra:aprobar` y
setea `ticket_compra.aprobado_por` + timestamp.

**Edilicias (avance por subtareas):** el ticket no se cierra manualmente saltando el avance;
`en_progreso → resuelto` solo es transición válida cuando `porcentaje_avance = 100`
(todas las `subtareas_edilicia` completadas). La máquina consulta el avance derivado como
guarda de transición.

### Implementación
- Interface `TicketStateMachine { puedeTransicionar(desde, hacia, ctx): boolean }`, una
  estrategia por tipo, resuelta por un factory según `tipos_ticket.codigo`.
- **Toda** transición se registra en `operaciones_ticket` (timeline/auditoría) dentro de la
  misma transacción que el cambio de `tickets.estado`.

---

## Tabla `archivos`: polimórfica vs join por entidad

### Contexto
Hay adjuntos en varias entidades: tickets, `operaciones_ticket`, `presupuestos`, equipos.
La propuesta la tenía tentativamente como polimórfica (`entidad_tipo` + `entidad_id`).

### Opciones
- **Polimórfica:** una columna `entidad_tipo` + `entidad_id` sin FK. Simple, una sola tabla
  de vínculo, pero **destruye la integridad referencial**: la DB no puede garantizar que
  `entidad_id` apunte a algo existente; borrados huérfanos; no hay `ON DELETE CASCADE`.
- **Join por entidad:** `archivos` (solo metadata) + tablas puente con FK real
  (`archivos_ticket`, `archivos_presupuesto`, ...). Más tablas, integridad garantizada por la DB.

### Recomendación: **`archivos` (metadata) + tablas join por entidad con FK.**

### Justificación
El proyecto eleva la integridad referencial a principio (Postgres relacional, auditoría).
La polimórfica la sacrifica justo donde más duele (adjuntos huérfanos, sin cascade), trasladando
a la app una garantía que la DB da gratis. Las tablas join cuestan más DDL pero permiten FK
verdaderas, `ON DELETE` explícito por relación y N:M natural (un archivo reusado, o varios por
entidad). `archivos` guarda **solo metadata** (`storage_key`, `mime`, `tamano`, `nombre`) — el
binario vive en `IFileStorage`, nunca en la DB.

### Implicancias
- Esto **deroga** el enfoque polimórfico tentativo de la propuesta; documentarlo en `sdd-spec`.
- `IFileStorage` (puerto) en `shared/domain`, implementación (S3/local/`mensajeria`) en
  `shared/infrastructure`. La tabla guarda la `storage_key`, no el blob.

---

## `porcentaje_avance`: columna calculada/vista vs cache desnormalizada

### Opciones
- **Columna generada (`GENERATED`):** Postgres NO permite que una generated column agregue
  desde otra tabla (subquery) → inviable para `completadas/total` de `subtareas_edilicia`.
- **Vista:** correcta y siempre consistente para lectura, pero no se puede indexar/filtrar
  cómodamente ni "congelar" en el timeline; recalcula en cada query.
- **Cache desnormalizada por trigger:** rápida pero mete **lógica de negocio en la DB**,
  violando "la lógica vive en el backend" y volviéndola invisible/intesteable.
- **Cache desnormalizada mantenida por la aplicación (recomendado).**

### Recomendación: **columna `porcentaje_avance` en `ticket_edilicia`, recalculada por la
capa de aplicación dentro de la misma transacción** que crea/completa/borra una subtarea.

### Justificación
Es el único enfoque que (a) permite filtrar/ordenar por avance e indexarlo, (b) deja registrar
el snapshot del avance en `operaciones_ticket`, y (c) mantiene la regla de negocio en el
backend (testeable, versionada), respetando la constitución. Se evita el trigger justamente
para no esconder lógica en la DB. Opcionalmente, una vista `vw_avance_edilicia` sirve como
verificación/reconciliación, pero la fuente operativa es la columna.

### Implicancias
- El `SubtareaEdiliciaService` recalcula y persiste el avance en cada mutación de subtarea,
  transaccionalmente, y dispara la guarda de la máquina de estados (100% → habilita `resuelto`).

---

## Multi-tenancy: separación FÍSICA master/tenant (estilo educandow)

> **CAMBIO DE DECISIÓN (override).** Se abandona el scoping row-level por `cliente_id` +
> Prisma Client Extension. La estrategia pasa a **aislamiento físico**: el cliente NO es una
> columna, **el cliente ES la base de datos**. Esto deroga lo que `project.md` / `proposal.md`
> dijeran sobre multitenancy row-level. Patrón de referencia: `educandow/api`
> (`prisma_master` + `prisma_tenant`).

### Estrategia: **database-per-tenant** (un PostgreSQL `master` + una DB operativa por cliente).
Una base **master** centraliza identidad, autorización y el catálogo de tenants. Cada cliente
tiene su **propia base de datos** con el esquema operativo completo. El aislamiento lo da el
motor (bases distintas, conexiones distintas), no un `WHERE`.

#### schema-per-tenant vs database-per-tenant
| Criterio | schema-per-tenant (1 DB, N schemas, `?schema=` dinámico) | **database-per-tenant (elegido)** |
|---|---|---|
| Aislamiento | Lógico (mismo cluster/DB, `search_path`) | **Físico** (DB separada, FS/backup propio) |
| Riesgo de fuga | `search_path` mal seteado puede cruzar schemas | Imposible cruzar sin reconectar a otra DB |
| Backup / restore / portabilidad por cliente | Acoplado al resto | **Por cliente, independiente** (dump/restore/baja) |
| Encaje con Prisma | `multiSchema` es para schemas FIJOS, no N dinámicos; hay que hackear `?schema=` | **Un generator tenant + URL por DB** (patrón nativo, ya probado en educandow) |
| Costo de conexiones | Pool compartible | Un `PrismaClient` (pool) por cliente activo |

**Recomendación: database-per-tenant.** Es lo que hace educandow y lo que mejor respeta el
principio de aislamiento: la separación es del motor, no de una variable que alguien puede
olvidar. Prisma no soporta N schemas dinámicos de forma limpia (`multiSchema` exige schemas
conocidos en build-time); en cambio "una URL por base" es su camino natural (datasource con
`url` inyectada). Suma backup/restore/baja por cliente y cero riesgo de `search_path`. El
costo —un pool por cliente activo— es el riesgo a vigilar (ver Riesgos).

#### Qué vive en MASTER vs TENANT
| Capa | Entidades | Por qué |
|---|---|---|
| **MASTER** (global, una sola DB) | `clientes` (catálogo de tenants + puntero `db_name`/`schema`), `usuarios` + `refresh_tokens`, RBAC (`roles`, `permisos`, `roles_permisos`, `usuarios_roles`), `ciclos_vigentes` (catálogo global de ciclos) | Identidad y autorización son **globales**: un único login enruta al tenant; RBAC y catálogo de tenants no pueden vivir dentro de un tenant. |
| **TENANT** (una DB por cliente, sin `cliente_id`) | `tickets`, `operaciones_ticket`, `equipos`, `componentes`, `ubicaciones`, `ticket_compra`, `items_compra`, `presupuestos`, `ticket_edilicia`, `subtareas_edilicia`, `ciclos_cliente`, `archivos` (+ joins), y los **catálogos operativos sembrados** (`estados`, `prioridades`, `tipos_ticket`, `tipos_componente`, `tipo_operacion`), más `usuario_tipos_ticket` | Datos operativos del cliente. Sin columna de tenant: la DB ES el tenant. |

**Auth global con routing (no usuarios por tenant).** `usuarios` vive en MASTER con
`cliente_id` (FK al catálogo `clientes`) = tenant "de origen". El login se valida contra
master; el JWT lleva `cliente_id` → se resuelve la DB tenant. Beneficios: una sola superficie
de login, lockout/password centralizados, y rol `ROOT`/super-admin cross-tenant (como en
educandow). Las referencias de tickets a usuarios (`asignado_id`, `solicitante_id`,
`aprobado_por`) son **cross-DB → soft refs sin FK**, validadas en el caso de uso (patrón
educandow "AD-6": `DocenteXCiclo.userId` → master `User.id` sin FK).

**Catálogos compartidos: sembrados en cada tenant, NO en master.** Decisión fina con tensión
contra la Decisión 8 (FK con integridad de DB):
- *Opción A — catálogos en master:* fuente única, pero `tickets.estado` (DB tenant) → `estados`
  (DB master) sería **FK cross-DB = imposible** en Postgres → degrada a soft ref y rompe la
  integridad que la Decisión 8 eleva a principio.
- *Opción B — catálogo replicado por tenant (elegido):* `estados/prioridades/tipos_*` se
  **siembran en cada DB tenant** en el provisioning. Mantiene **FK reales dentro del tenant**
  (Decisión 8 intacta) a cambio de hacer *fan-out* al cambiarlos. Son tablas chicas y estables.
  Es exactamente lo que hace educandow (`AttendanceType`, `GradeScale` sembrados por tenant).

Se reserva MASTER + soft-ref **solo** para lo que es identidad genuinamente cross-cutting
(`usuarios`, RBAC, `clientes`, `ciclos_vigentes`), donde el cruce de DB es inevitable.

#### Resolución y routing en runtime
1. **`PrismaService` (factory multi-tenant):** un `MasterPrismaClient` fijo (URL master) +
   `Map<dbName, TenantPrismaClient>` con *lazy init y cache* por cliente. La URL tenant se
   construye intercambiando el nombre de DB en la URL master (`buildTenantUrl`).
2. **`TenantMiddleware`/guard:** las rutas master (`/auth`, `/usuarios`, `/roles`,
   `/clientes` CRUD) usan el master client y NO requieren tenant. Las rutas tenant: extraen
   `cliente_id`/`db_name` del JWT → validan en master que el cliente esté activo →
   `getTenantClient(db_name)` → guardan `{ prismaClient, dbName, clienteId }` en
   `AsyncLocalStorage` (`TenantContext`). Sin contexto válido → `Forbidden`.
3. **Repos:** obtienen el client del tenant activo vía `TenantContext.getClient()` /
   `PrismaService`. El dominio sigue dependiendo del puerto, ajeno a qué DB es.
4. **Transacciones:** un `TenantTransactionRunner` abre `client.$transaction(tx => …)` y
   *re-bindea* el `TenantContext` con el `tx`, de modo que los repos dentro del callback usan
   el client transaccional de forma transparente.

#### Migraciones (fan-out)
Dos pipelines separados, con generators separados (`prisma_master` + `prisma_tenant`):
`migrate:master` corre una vez sobre la DB master; `migrate:tenant` aplica el esquema tenant
a **todas** las DBs de cliente en *fan-out* (loop `prisma migrate deploy --schema=prisma_tenant`
con `DATABASE_URL` apuntando a cada `db_name`). Idéntico al par
`prisma:migrate:master` / `:tenant` de educandow.

#### Provisioning de un cliente nuevo (análogo a `tenant:create`)
`PostgresAdminService.createDatabase(db_name)` (vía pool a la DB de mantenimiento `postgres`)
→ `runTenantMigrations(db_name)` (`migrate deploy` del schema tenant) → seed de catálogos
operativos (`estados`, `prioridades`, `tipos_*`) → alta del cliente en `master.clientes` +
usuario admin inicial en `master.usuarios`. Todo orquestado por un caso de uso
`CrearClienteUseCase` (no por la DB).

#### Impacto en `cliente_id`
**`cliente_id` se elimina de todas las tablas tenant.** El cliente se identifica por la DB en
la que vive la fila. Esto NO reintroduce la redundancia legacy (`IDCliente` + `IDCicloXCliente`
duplicados): al contrario, la elimina de raíz — ya no hay columna de aislamiento que mantener
consistente. `cliente_id` solo persiste en MASTER, en `usuarios.cliente_id` (tenant de
pertenencia) y como PK de `clientes`. El `numero` legible de ticket (`SOP-2026-00042`) usa una
secuencia **local a cada DB tenant** (separación física → secuencias por cliente gratis).

#### RLS de Postgres
Ya **no es necesario** como mecanismo: la separación es física, no por filtro. Dentro de una DB
tenant todas las filas pertenecen a ese cliente, así que RLS sería redundante. Queda, a lo
sumo, como hardening fino intra-tenant (p. ej. visibilidad por rol), no para aislamiento entre
clientes.

---

## Enums: nativos de Postgres vs tablas de catálogo

### Recomendación: **tablas de catálogo** para `estados`, `prioridades`, `tipos_componente`,
`tipo_operacion`; `CHECK`/enum solo para discriminadores minúsculos y estables.

### Justificación
Los enums nativos de PG son rígidos: `ALTER TYPE ... ADD VALUE` no corre cómodo dentro de
transacciones/migraciones, no se pueden eliminar valores ni reordenar, y no admiten metadata.
Las tablas de catálogo permiten: soft delete, etiquetas i18n, color/orden para UI, FK con
integridad, y agregar valores sin DDL. `tipos_ticket` ya es tabla (correcto). Para un
discriminador chico y verdaderamente fijo (p. ej. `tipos_ticket.codigo` ∈ {SOPORTE, COMPRAS,
EDILICIA}) un `CHECK` complementa sin costo.

### Implicancias
- FKs de `tickets.estado`, `tickets.prioridad`, `operaciones_ticket.tipo_operacion` a sus
  catálogos. Seeds de datos maestros en migración inicial.

---

## Estructura de carpetas backend (Screaming + Hexagonal)

```
backend/src/
  tickets/            # dominio central
    domain/           entities/  value-objects/  ports/ (ITicketRepository, state-machine)
    application/      use-cases/  services/ (TicketStateMachineFactory)
    infrastructure/   persistence/prisma/ (repos + mappers)
    interface/        controllers/  dtos/
  compras/            # satélite: ticket_compra, items_compra, presupuestos, aprobación
    domain/ application/ infrastructure/ interface/
  reparaciones/       # satélite edilicio: ubicaciones, ticket_edilicia, subtareas, avance
    domain/ application/ infrastructure/ interface/
  equipos/            # equipos_informaticos, componentes_equipo, tipos_componente
    domain/ application/ infrastructure/ interface/
  auth/               # JWT, guards (Jwt/Roles/Permissions/Tenant), RBAC
    domain/ (roles, permisos, ports)  application/  infrastructure/  interface/
  clientes/           # MASTER: clientes (catálogo de tenants), ciclos_vigentes (global),
                      # provisioning (CrearClienteUseCase). ciclos_cliente vive en TENANT.
    domain/ application/ infrastructure/ interface/
  shared/
    domain/           ports/ (IFileStorage, TenantTransactionRunner)  base-entity (auditoría/soft-delete)
    infrastructure/   persistence/ (PrismaService factory master+tenant,
                                    PostgresAdminService, TenantTransactionRunner)
                      storage/ (adaptador IFileStorage)
    tenancy/          TenantContext (AsyncLocalStorage), TenantMiddleware/guard
prisma_master/        # schema + migraciones de la DB master (clientes, usuarios, RBAC, ciclos_vigentes)
prisma_tenant/        # schema + migraciones de la DB por cliente (operativo, sin cliente_id)
```

### Reglas de ubicación de puertos vs implementaciones
- **Puertos (interfaces):** SIEMPRE en `*/domain/ports/`. Ej.: `ITicketRepository`,
  `ICompraRepository`, `IFileStorage`.
- **Implementaciones (adaptadores):** SIEMPRE en `*/infrastructure/`. Ej.:
  `PrismaTicketRepository`, `S3FileStorage`.
- **Wiring DI:** cada módulo Nest mapea `provide: TOKEN → useClass: Adaptador`. El dominio y
  la aplicación dependen del token/interface, nunca de la clase concreta.
- `IFileStorage` y `PrismaService` viven en `shared` porque los cruzan ≥2 módulos
  (Scope Rule de la constitución).

---

## ADR — resumen de decisiones

| # | Decisión | Elegido | Rechazado | Driver principal |
|---|----------|---------|-----------|------------------|
| 1 | Estrategia de IDs | UUIDv7 (`uuid` nativo) | bigint, UUIDv4 | API pública/mobile + anti-IDOR + ordenable |
| 2 | Permisos | RBAC + permisos granulares; `usuario_tipos_ticket` como eje aparte | ACL legacy, RBAC puro | Auditable, reusable, sin explosión de roles |
| 3 | ORM | Prisma tras puertos | TypeORM nativo | El "repo nativo" acopla; Prisma fuerza el desacople correcto |
| 4 | Máquina de estados | Strategy por tipo en aplicación | Triggers/estados hardcodeados en DB | Lógica en backend, testeable |
| 5 | `archivos` | metadata + join por entidad (FK) | polimórfica | Integridad referencial |
| 6 | `porcentaje_avance` | cache desnormalizada por la app, transaccional | generated column, vista, trigger | Indexable + lógica en backend |
| 7 | Multi-tenancy | Separación FÍSICA database-per-tenant (master/tenant, factory + TenantContext) estilo educandow | scoping row-level por `cliente_id` + Prisma extension, schema-per-tenant, RLS como primario | Aislamiento del motor, no por filtro; backup/baja por cliente; cero riesgo de leak |
| 8 | Enums | tablas de catálogo | enums nativos PG | Extensible, i18n, integridad |

## Riesgos / supuestos a validar
- UUIDv7 requiere lib estable de generación y, si se usa default en DB, una función PG de v7.
- **Escalado de conexiones (database-per-tenant):** un `PrismaClient` (= un pool) por cliente
  activo. Con muchos clientes chicos esto puede agotar conexiones de Postgres. Mitigaciones a
  validar: límites de pool por client, expulsión LRU de clients inactivos del cache, o pgBouncer.
  Si el conteo de tenants crece mucho, reconsiderar schema-per-tenant.
- **Fan-out de migraciones:** `migrate:tenant` debe aplicarse a TODAS las DBs tenant; una DB que
  quede atrás genera drift de esquema. Requiere un runner idempotente, registro de versión por
  tenant y reporte de fallos parciales (no abortar todo el fan-out por un tenant caído).
- **Fan-out de catálogos:** `estados/prioridades/tipos_*` están replicados por tenant; cambiarlos
  exige propagar a todas las DBs. Mantenerlos chicos/estables y versionados con las migraciones.
- **Soft refs cross-DB a usuarios** (`asignado_id`, `solicitante_id`, `aprobado_por` → master
  `usuarios.id`): sin FK; la integridad la valida el caso de uso. Falta de validación = referencias
  colgadas. Requiere tests y, idealmente, un guard de existencia al asignar.
- **Provisioning transaccional imperfecto:** crear DB + migrar + seed + alta en master NO es una
  transacción única (cruza el motor). Necesita pasos compensatorios/rollback (drop DB) ante fallo
  a mitad de camino, como en educandow (`dropDatabase` en rollback).
- El lint/fitness rule que prohíbe `PrismaService` fuera de infraestructura es deseable pero
  no trivial; sin él, el desacople depende de disciplina humana.
- La máquina de estados de Compras asume que `compra:aprobar` es el único gate de aprobación
  (validar si hay montos/umbrales que requieran multi-aprobación — fuera de alcance actual).
