# Design — ciclos-master-tenant · FASE 4 (backend: tickets/compras/reparaciones usan el ciclo ACTIVO)

> Alcance ACOTADO a Fase 4. SOLO backend. El frontend (formularios, selector de histórico, manejo de 409) es **Fase 5** y está fuera de este documento.
> Fase 3 ya está en `master`: existe `ObtenerCicloActivoUseCase` + `findActive()` en el repo admin de `ciclos_cliente`, y `GET /ciclos/activo`. Fase 4 consume la capacidad de "resolver el ciclo activo del tenant", pero por el lado de tickets (ver ADR-4-Repo).

## 1. Contexto y problema

Hoy los cuatro flujos de creación de tickets comparten `CrearTicketDto` y **todos** hacen `cicloId: dto.cicloId ?? null`:

| Flujo | Endpoint | Use case | Archivo |
|---|---|---|---|
| Genérico/base | `POST /tickets` | `CrearTicketUseCase` | `src/tickets/application/use-cases/crear-ticket.use-case.ts:130` |
| Compras | `POST /compras` | `CrearTicketCompraUseCase` | `src/compras/application/use-cases/crear-ticket-compra.use-case.ts:106` |
| Edilicia | `POST /tickets-edilicio` | `CrearTicketEdilicioUseCase` | `src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts:130` |
| Soporte/IT | `POST /tickets-soporte` | `CrearTicketSoporteUseCase` | `src/equipos/application/use-cases/crear-ticket-soporte.use-case.ts:132` |

El `cicloId` llega opcional desde el cliente (HTTP DTO) y hoy termina en `null` porque el frontend nunca lo manda (solo hay un gate de UI vía `GET /tickets/ciclo-activo`). Resultado: los tickets **no** quedan asociados a un ciclo, contradiciendo la decisión del usuario *"SIEMPRE los tickets/compras/reparaciones se filtran por ciclo"* (decisión #3).

**Nota de alcance:** aunque el pedido nombra "tickets/compras/reparaciones", el flujo de **soporte/IT** (`equipos`) comparte exactamente el mismo `CrearTicketDto` y el mismo bug. Dejarlo afuera crearía un cuarto camino que sigue produciendo `cicloId: null`. Por consistencia e invariante, Fase 4 incluye los **cuatro** flujos de creación. Se marca explícitamente.

Objetivo Fase 4:
1. En creación, el `cicloId` se toma del **ciclo activo del tenant**, no del DTO.
2. Si **no hay** ciclo activo, el backend **rechaza** la creación con un error de dominio claro (nunca crea con `cicloId: null`).
3. Los listados (tickets/compras/reparaciones) se filtran por ciclo: **default = activo**, con `cicloId` opcional para históricos.

## 2. Enfoque arquitectónico

Clean/Hexagonal (ya vigente en el repo): dominio → aplicación (use cases) → interface (controllers) → infraestructura (Prisma). Se respeta:

- **No throw en dominio/aplicación**: todo fallo esperado retorna `Result.fail(DomainError)`. El mapeo a HTTP vive en el controller.
- **El servidor determina el ciclo, el cliente no lo provee** (menor privilegio, sección 7 CLAUDE.md): el `cicloId` es autoridad del backend.
- **DRY sobre 4 use cases idénticos**: en vez de repetir `findActive()` + error en cuatro lugares, se introduce **un colaborador de aplicación compartido** (`ResolverCicloActivoParaCreacion`) inyectado en los cuatro `CrearX`.

Regla de negocio "listado siempre por ciclo, default=activo" = **lógica de aplicación**, no de HTTP → se resuelve dentro de los use cases de listado (no en el controller), inyectando el repo de ciclo del lado tickets.

## 3. ADRs

### ADR-1 — Auto-inyección vía colaborador de aplicación compartido (no en cada use case, no un servicio de dominio pesado)

**Decisión:** crear `ResolverCicloActivoParaCreacion` (application service, módulo `tickets/application/services/`). Contrato:

```ts
// tickets/application/services/resolver-ciclo-activo.service.ts
export class ResolverCicloActivoParaCreacion {
  constructor(private readonly cicloRepo: ICicloClienteRepository /* tickets-side */) {}

  /** Retorna el ciclo activo del tenant, o SinCicloActivoError si no hay ninguno. */
  async resolver(): Promise<Result<CicloClienteEntity, SinCicloActivoError>> {
    const activo = await this.cicloRepo.findActive();
    if (!activo) return Result.fail(new SinCicloActivoError());
    return Result.ok(activo);
  }
}
```

Cada `CrearX` lo invoca al inicio de su flujo (después de validar solicitante, antes de generar número) y usa `cicloActivo.id` como `cicloId` del ticket.

**Por qué así:**
- **DRY / SRP**: la regla "el ciclo de un ticket nuevo es el activo del tenant" es una sola, vive en un solo lugar. Los 4 use cases pasan de `cicloId: dto.cicloId ?? null` a `cicloId: cicloActivo.id`.
- **No es un servicio de dominio puro** porque necesita un puerto de repositorio (I/O) → pertenece a la capa de aplicación.
- **No inline en cada use case**: evitaría el colaborador pero duplicaría el `findActive()` + manejo de error 4 veces (viola DRY, y si cambia la política hay que tocar 4 archivos).

**Rechazado:**
- *Resolver el ciclo en el controller y pasarlo por DTO*: reintroduce la posibilidad de que el cliente manipule el `cicloId` y dispersa la regla en 4 controllers. Viola "el servidor determina".
- *Reusar `ObtenerCicloActivoUseCase` (módulo clientes)*: acopla los módulos de tickets/compras/reparaciones/equipos al repo **admin** de `ciclos_cliente`. Ver ADR-4-Repo.

### ADR-2 — Rechazo cuando NO hay ciclo activo: `SinCicloActivoError` → **HTTP 409 Conflict**

**Decisión:** nuevo error de dominio `SinCicloActivoError` en `tickets/domain/errors/tickets.errors.ts` (ubicación compartida: compras/reparaciones/equipos ya importan de ahí). Los cuatro controllers lo mapean a **409 Conflict**.

```ts
export class SinCicloActivoError extends DomainError {
  constructor() {
    super('No hay un ciclo activo en este tenant. Activá un ciclo antes de crear tickets.');
    this.name = 'SinCicloActivoError';
  }
}
```

Mensaje estable + `name` machine-readable para que Fase 5 (frontend) pueda ramear ("activá un ciclo") sin parsear el texto.

**Por qué 409 y no 422:** el payload del request es válido; lo que falta es una **precondición de estado del tenant** (no hay ciclo activo). 409 Conflict = "el request entra en conflicto con el estado actual del servidor" y es **corregible** activando un ciclo — semántica exacta. 422 se reserva en este repo para input semánticamente inválido (`SolicitanteInvalidoError`, etc.).

**Alternativa considerada (documentada, no elegida):** usar **422** por consistencia mecánica con el resto de errores de creación del repo. Se descarta porque mezcla "tu input está mal" con "el tenant no está listo", que el frontend necesita distinguir. Si el equipo prioriza uniformidad sobre precisión semántica, 422 es aceptable — pero la recomendación es **409**. (Decisión de un solo valor para no dispersar: **409**.)

### ADR-3 — Los HTTP DTO de creación **remueven** `cicloId` (no se ignora silenciosamente)

**Decisión:** eliminar el campo `cicloId` de los cuatro DTO de entrada HTTP de creación (`CreateTicketHttpDto`, `CreateTicketCompraHttpDto`, `CreateTicketEdilicioHttpDto`, `CreateTicketSoporteHttpDto`) y dejar de pasarlo desde los controllers. El servidor lo determina (ADR-1).

**Por qué remover y no ignorar:**
- **Contrato honesto**: un campo que el server ignora silenciosamente induce a error al cliente ("lo mandé, ¿por qué no se aplicó?"). Removerlo hace el contrato explícito.
- **Seguridad**: elimina cualquier vector de que el cliente fuerce un `cicloId` arbitrario (incluido uno de otro tenant o inactivo).

**Cambio en `CrearTicketDto` (application):** se **remueve** `cicloId?: string | null` del DTO de aplicación también. El campo desaparece del contrato de entrada; el `cicloId` pasa a ser una variable interna resuelta por el use case. Esto rompe compilación en los 4 use cases y sus specs → se actualizan (TDD: los specs RED primero).

**Fuera de alcance (se preserva):** `PATCH /tickets/:id` (`UpdateTicketHttpDto.cicloId` + `EditarTicketUseCase`) mantiene `cicloId` editable — mover un ticket entre ciclos es una corrección administrativa válida, no una creación. Se documenta como decisión consciente; cualquier endurecimiento de edición queda para una fase posterior.

### ADR-4-Repo — La resolución del activo usa el repo **del lado tickets** (`CICLO_CLIENTE_REPOSITORY`), NO el admin

**Decisión:** `ResolverCicloActivoParaCreacion` y los listados usan `ICicloClienteRepository` de `tickets/domain/ports` (token `CICLO_CLIENTE_REPOSITORY`), que ya expone `findActive()` y ya está provisto/inyectado en `TicketsController`. **NO** se usa el `ICicloClienteRepository` admin (`CICLO_CLIENTE_ADMIN_REPOSITORY`, módulo clientes).

**Por qué:** el pedido es explícito — *hay DOS `ICicloClienteRepository`, no unificar*. El repo admin es para operaciones de gestión (listar/crear/activar); el de tickets es para asignación/lectura de ciclo en el contexto de tickets. Usar el de tickets mantiene la frontera de módulos y evita que compras/reparaciones/equipos dependan del módulo `clientes`.

**Consecuencia de wiring (riesgo DI, ver §6):** los módulos `compras`, `reparaciones` y `equipos` deben tener disponible el provider `CICLO_CLIENTE_REPOSITORY` (importándolo desde `TicketsModule` o proveyéndolo). Hoy solo `TicketsController` lo inyecta.

### ADR-5 — Listados: filtro por ciclo con **default = activo**, resuelto en el use case

**Decisión:** los tres use cases de listado resuelven el **ciclo efectivo** internamente:

```
cicloEfectivo = query.cicloId ?? (await cicloRepo.findActive())?.id ?? <sin-ciclo>
```

- Si el cliente manda `cicloId` (histórico) → se filtra por ese.
- Si no → se usa el activo (default).
- Si no hay activo **ni** `cicloId` explícito → se retorna **lista vacía** (200 OK, `[]`). No se listan "todos": el invariante es "siempre por ciclo".

**Reparto por módulo:**
- **Tickets** (`ListarTicketsUseCase`): se agrega `cicloId?: string` a `TicketFiltros` y el repo (`ITicketRepository.findAll`) filtra `WHERE ciclo_id = :cicloId`. La resolución del default (activo) se hace **en el use case** (se le inyecta `ICicloClienteRepository` tickets-side). Se retira el comentario "default = frontend PR4": la regla pasa a backend.
- **Compras** (`ListarComprasUseCase`) y **Reparaciones** (`ListarReparacionesUseCase`): hoy iteran satélites y resuelven el ticket base con `ticketRepo.findById`. Se les inyecta el repo de ciclo, resuelven `cicloEfectivo`, y **filtran en el loop** por `ticket.cicloId === cicloEfectivo` (o se les pasa el filtro al `ticketRepo` si se prefiere; ver nota de performance §6). Firma nueva: `execute(cicloId?: string)`.

**Por qué en el use case y no en el controller:** "listado siempre por ciclo, default activo" es **regla de negocio**, no traducción HTTP. Mantenerla en aplicación la hace testeable en unit (TDD) sin levantar HTTP y evita duplicarla en 3 controllers.

**Rechazado:** *default = activo resuelto en frontend* (estado actual). Se descarta: deja el backend permitiendo listar sin ciclo y delega la invariante a la UI, que es exactamente el gap que Fase 4 cierra.

### ADR-6 — Compatibilidad: tickets con `cicloId: null` quedan **invisibles** en listados filtrados (comportamiento defensivo aceptado)

**Decisión:** con el filtro `WHERE ciclo_id = :cicloEfectivo`, cualquier ticket viejo con `ciclo_id IS NULL` **no matchea ningún ciclo** y desaparece de todos los listados filtrados. Se acepta como comportamiento defensivo.

**Por qué es aceptable:** decisión #5 del usuario — **no hay datos productivos**, no hay migración del placeholder. No se construye lógica de "bucket sin ciclo" ni backfill.

**Escape hatch (documentado, NO implementado en Fase 4):** si en el futuro hiciera falta ver huérfanos, se podría admitir `cicloId=none` explícito → `WHERE ciclo_id IS NULL`. Se deja anotado para no diseñarlo ahora (YAGNI). Fase 4 **no** expone esto.

## 4. Contratos afectados por módulo

### Tickets (`src/tickets`)
- **Dominio:**
  - `domain/errors/tickets.errors.ts`: **+** `SinCicloActivoError`.
- **Aplicación:**
  - `application/services/resolver-ciclo-activo.service.ts`: **NUEVO** `ResolverCicloActivoParaCreacion` (ADR-1).
  - `application/use-cases/crear-ticket.use-case.ts`: `CrearTicketDto` **remueve** `cicloId`; el use case inyecta el resolver, resuelve activo (o falla con `SinCicloActivoError`), usa `cicloActivo.id`.
  - `application/use-cases/listar-tickets.use-case.ts`: inyecta `ICicloClienteRepository` (tickets-side); `execute(filtros?)` resuelve `cicloEfectivo` (query.cicloId ?? activo) y lo pasa a `findAll`.
  - `domain/ports/i-ticket.repository.ts`: `TicketFiltros` **+** `cicloId?: string`; `findAll` filtra por `ciclo_id`.
  - `infrastructure/.../prisma-ticket.repository.ts`: `findAll` agrega `where.cicloId` cuando viene.
- **Interface:**
  - `interface/dtos/tickets.dto.ts`: `CreateTicketHttpDto` **remueve** `cicloId`; `ListarTicketsQueryDto` **+** `cicloId?: string` (histórico).
  - `interface/controllers/tickets.controller.ts`:
    - `POST /tickets`: no pasa `cicloId`; mapea `SinCicloActivoError → 409`.
    - `GET /tickets`: pasa `q.cicloId` al use case.
    - `GET /tickets/ciclo-activo`: **sin cambios** (Fase 3, sigue igual).

### Compras (`src/compras`)
- **Aplicación:**
  - `crear-ticket-compra.use-case.ts`: inyecta resolver; resuelve activo o falla; usa `cicloActivo.id`.
  - `listar-compras.use-case.ts`: inyecta repo ciclo; `execute(cicloId?)`; filtra `ticket.cicloId === cicloEfectivo`.
- **Interface:**
  - `dtos/compras.dto.ts`: `CreateTicketCompraHttpDto` **remueve** `cicloId`.
  - `controllers/compras.controller.ts`: `POST /compras` no pasa `cicloId`, mapea `SinCicloActivoError → 409`; `GET /compras` acepta `?cicloId` y lo pasa al use case.
- **Módulo:** `compras.module.ts` debe disponer de `CICLO_CLIENTE_REPOSITORY` y del resolver (import de `TicketsModule` o provisión). Ver ADR-4-Repo / §6.

### Reparaciones (`src/reparaciones`)
- **Aplicación:**
  - `crear-ticket-edilicio.use-case.ts`: idem (resolver + `cicloActivo.id`).
  - `listar-reparaciones.use-case.ts`: inyecta repo ciclo; `execute(cicloId?)`; filtra por `ticket.cicloId`.
- **Interface:**
  - `dtos/reparaciones.dto.ts`: `CreateTicketEdilicioHttpDto` **remueve** `cicloId`.
  - `controllers/tickets-edilicio.controller.ts`: `POST /tickets-edilicio` no pasa `cicloId`, mapea `409`.
  - `controllers/reparaciones.controller.ts` (listado): acepta `?cicloId`, lo pasa al use case.
- **Módulo:** `reparaciones.module.ts` idem wiring de `CICLO_CLIENTE_REPOSITORY` + resolver.

### Equipos / Soporte (`src/equipos`) — incluido por consistencia (ver §1)
- **Aplicación:** `crear-ticket-soporte.use-case.ts`: resolver + `cicloActivo.id`.
- **Interface:** `CreateTicketSoporteHttpDto` **remueve** `cicloId`; `POST /tickets-soporte` no pasa `cicloId`, mapea `409`.
- **Módulo:** `equipos.module.ts` idem wiring.
- (Si el equipo decide excluir soporte de Fase 4, se documenta como gap conocido: seguiría creando `cicloId: null`.)

## 5. Cambios de dominio / aplicación (resumen accionable para sdd-tasks)

1. **Dominio (tickets):** nuevo `SinCicloActivoError`.
2. **Aplicación (tickets):** nuevo `ResolverCicloActivoParaCreacion`.
3. **Aplicación (4 use cases de creación):** remover `cicloId` del contrato de entrada, inyectar resolver, resolver activo → `cicloActivo.id` o `Result.fail(SinCicloActivoError)`. Ubicación en el flujo: tras validar solicitante (y ubicación/equipo cuando aplique), antes de generar número.
4. **Aplicación (3 use cases de listado):** inyectar repo ciclo tickets-side, resolver `cicloEfectivo` (query ?? activo), filtrar. Sin activo ni query → `[]`.
5. **Dominio (puerto ticket):** `TicketFiltros.cicloId?`; `findAll` filtra por `ciclo_id`. Infra Prisma: agregar el `where`.
6. **Interface (4 DTO creación):** remover `cicloId`. `ListarTicketsQueryDto` (+ query equivalentes en compras/reparaciones) **+** `cicloId?`.
7. **Interface (4 controllers de creación):** dejar de pasar `cicloId`; mapear `SinCicloActivoError → 409 Conflict`.
8. **Interface (3 controllers de listado):** leer `?cicloId` y pasarlo.
9. **Módulos (compras/reparaciones/equipos):** wiring de `CICLO_CLIENTE_REPOSITORY` + resolver.
10. **TDD (sección 4/5 CLAUDE.md):** por cada criterio, test atómico RED→GREEN: (a) crear sin ciclo activo → `SinCicloActivoError`/409; (b) crear con ciclo activo → ticket queda con `cicloId = activo.id` (ignora cualquier valor viejo); (c) listar sin query → solo tickets del activo; (d) listar con `cicloId` → histórico; (e) listar sin activo ni query → `[]`.

## 6. Riesgos de regresión (esto toca flujos productivos de creación)

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Bloqueo total de creación** si un tenant no tiene ciclo activo: hoy crear funciona (con `cicloId: null`); tras Fase 4 devuelve 409. Un tenant sin ciclo activo **no puede crear ningún ticket** en ningún módulo. | ALTA | Es el comportamiento **deseado** (decisión #3). Pero requiere que Fase 3/5 garanticen que activar un ciclo sea fácil y visible. Coordinar release: Fase 4 no debería llegar a prod sin que exista un ciclo activo por tenant. Documentar en runbook. |
| R2 | **Wiring DI** (`CICLO_CLIENTE_REPOSITORY` / resolver no provisto en compras/reparaciones/equipos) → Nest falla al bootstrap o en runtime al inyectar. | ALTA | Test de módulo/e2e que levante cada controller de creación. Verificar `imports`/`providers` de los 3 módulos. `tsc --noEmit` no lo atrapa (es DI runtime) → cubrir con e2e fino (sección 5.3 CLAUDE.md). |
| R3 | **Contrato roto para clientes que hoy mandan `cicloId`** en el body. Con `whitelist`/`forbidNonWhitelisted` de class-validator, un `cicloId` sobrante podría **rechazar el request (400)**. | MEDIA | Verificar la config global de `ValidationPipe`. Si `forbidNonWhitelisted: true`, coordinar con Fase 5 (frontend deja de mandarlo) o transicionar removiendo el campo pero sin forbid. Al no haber datos/clientes productivos externos, el impacto real es bajo, pero **verificar la pipe**. |
| R4 | **Tickets viejos con `cicloId: null` desaparecen** de todos los listados (ADR-6). | BAJA | Aceptado (decisión #5, sin datos productivos). Documentado. Escape hatch anotado pero no implementado. |
| R5 | **Performance del filtro por ciclo en compras/reparaciones**: si se filtra en memoria tras `findById` por cada satélite, se traen tickets que luego se descartan (N+1 ya existente + filtrado tardío). | BAJA/MEDIA | Aceptable en MVP (patrón N+1 ya presente). Si molesta, mover el filtro al `ticketRepo` (query con `ciclo_id`) o a un método de repo de satélites que joinee. Marcar como mejora, no bloqueante. |
| R6 | **Specs existentes rompen** al remover `cicloId` de `CrearTicketDto` (4 use cases + 4 controllers + specs que pasan `cicloId`). | MEDIA | Esperado por TDD: actualizar specs RED→GREEN. No borrar tests sin justificar (sección 9 CLAUDE.md). Buscar todos los usos de `cicloId:` en specs de creación. |
| R7 | **Doble fuente de "ciclo activo"** (repo admin vs repo tickets) podría divergir si un día uno filtra `deleted_at` y el otro no. | BAJA | Ambos definen `findActive()` como `activo=true AND deleted_at IS NULL`. Verificar que la impl. Prisma tickets-side respete el mismo predicado. No unificar (pedido explícito), pero alinear el predicado. |

## 7. Frontera con Fase 5 (frontend — NO se diseña acá)

Queda para Fase 5 y se menciona solo como límite:
- Quitar cualquier envío de `cicloId` desde los formularios de creación (`TicketFormModal`, compras, edilicia, soporte).
- Manejar el **409 `SinCicloActivoError`** en la UI (mensaje "activá un ciclo", CTA al flujo de activación) — reemplaza/complementa el gate actual de `GET /tickets/ciclo-activo`.
- Selector de **histórico** en los listados → mandar `?cicloId=` para ver ciclos inactivos; default (sin param) = activo.
- Resolver correctamente el ciclo activo para roles no-admin (gap de `GET /ciclos` documentado en exploración; depende de Fase 3).

## 8. No-objetivos de Fase 4

- Migración de datos / backfill de `cicloId` (decisión #5).
- Endurecer `PATCH /tickets/:id` (edición de `cicloId`) — se preserva editable (ADR-3).
- Unificar los dos `ICicloClienteRepository` (pedido explícito de no unificar).
- Cualquier cambio de frontend (Fase 5).
