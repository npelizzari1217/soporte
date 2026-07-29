# Spec (delta): Notificaciones por email al cambiar el estado de un ticket

> Artefacto de `sdd-spec`. Store activo: **openspec** (`C:\trabajos\soporte\openspec\changes\notif-email-estado-ticket\`).
> Insumos: `proposal.md` (aprobado) + `explore.md` (mapa de código) + inspección directa del modelo de estados real (ver §0).
> Convención: cada `#### Scenario:` es atómico y es el contrato de UN test RED (TDD estricto activo en el proyecto).
> Esta spec describe QUÉ debe ser verdad después del cambio. NO diseña wiring, NO define rutas de archivo, NO escribe tasks — eso es `sdd-design` / `sdd-tasks`.

---

## 0. Modelo de estados verificado (obligatorio antes de fijar el set que notifica)

El proposal dejó "a afinar en el spec" el set exacto de estados que notifican, con candidatos `RESUELTO / RECHAZADO / SIN_SOLUCION / CERRADO`. Se inspeccionó el código real — NO se inventó ningún código de estado.

**Fuente de verdad inspeccionada:**
- `backend/src/tickets/domain/state-machine/base-ticket-state-machine.ts` (grafo base — usado por `SOPORTE` vía fallback de `TicketStateMachineFactory`)
- `backend/src/compras/domain/state-machine/compras-state-machine.ts` (grafo `COMPRAS`)
- `backend/src/reparaciones/domain/state-machine/edilicia-state-machine.ts` (grafo `EDILICIA`)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` (camino oficial — resuelve máquina por `tipoCodigo` vía factory)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` (camino de auto-transición — **usa SIEMPRE `BaseTicketStateMachine`, sin importar el tipo del ticket**, líneas 143-151)
- `backend/prisma_tenant/seeds/tenant-seed.ts` líneas 69-78 (catálogo real de `estados`: 10 filas compartidas por los 3 tipos — `ABIERTO, PENDIENTE_APROBACION, APROBADO, RECHAZADO, EN_PROGRESO, SUSPENDIDO, RESUELTO, SIN_SOLUCION, CERRADO, CANCELADO`)

**Hallazgo clave:** `estados` es un catálogo COMPARTIDO (mismos códigos/UUIDs para los 3 tipos de ticket); lo que cambia por tipo es el GRAFO de transiciones válidas (Strategy). Un mismo código de estado (ej. `RESUELTO`) es terminal (sin arcos de salida) para `SOPORTE`, pero NO lo es para `COMPRAS` ni `EDILICIA` (ambos permiten `RESUELTO → CERRADO` y `RESUELTO → EN_PROGRESO`, reapertura). Por lo tanto el set que notifica NO puede definirse como "estados terminales del grafo" de forma uniforme — se define como un **set de códigos de catálogo, compartido, evaluado por código sin importar el tipo del ticket** (así es como el proposal §3.3 ya lo planteaba: "¿el estadoNuevo está en el set de estados que notifican?").

### Set de estados que notifican (DECISIÓN FIJADA en este spec)

```
{ RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO }
```

Confirma los 4 candidatos originales del proposal — SON códigos reales verificados en el seed (línea 69-78) y en los 3 grafos. **`CANCELADO` SE INCLUYE por decisión de producto (2026-07-29)**: el coordinador cerró explícitamente que `CANCELADO` también notifica al solicitante. Es un código real del catálogo (seed línea 78) y terminal genuino en `COMPRAS` y `EDILICIA` — ver §0.1 para su alcanzabilidad exacta por tipo, y §0.2 (pregunta #1) para el registro de esta decisión.

### 0.1 Alcance por tipo de ticket (evidencia del grafo — informativo para diseñar los tests, NO cambia la regla: el filtro es por código, no por tipo)

| Código que notifica | Alcanzable en SOPORTE (vía PATCH oficial) | Alcanzable en COMPRAS (vía PATCH oficial) | Alcanzable en EDILICIA (vía PATCH oficial) | Alcanzable vía auto-transición (`CrearObservacionUseCase`, siempre `BaseTicketStateMachine`, solo si `estadoActual = APROBADO`) |
|---|---|---|---|---|
| `RESUELTO` | Sí (terminal: `APROBADO/EN_PROGRESO → RESUELTO`) | Sí (`EN_PROGRESO → RESUELTO`, NO terminal — reabre a `EN_PROGRESO` o cierra a `CERRADO`) | Sí (`EN_PROGRESO → RESUELTO`, guardado por `porcentajeAvance = 100`; NO terminal) | Sí — `APROBADO → RESUELTO` está en el mapa base |
| `RECHAZADO` | Sí (terminal: `ABIERTO → RECHAZADO`) | Sí (`PENDIENTE_APROBACION → RECHAZADO`, NO terminal — sigue a `CERRADO`) | **No** (no existe en el grafo `EDILICIA`) | No — `APROBADO → RECHAZADO` no está en el mapa base |
| `SIN_SOLUCION` | Sí (terminal: `APROBADO/EN_PROGRESO → SIN_SOLUCION`) | **No en el grafo oficial de COMPRAS** (no está en `VALID_TRANSITIONS_COMPRAS`) | **No** (no existe en el grafo `EDILICIA`) | Sí — `APROBADO → SIN_SOLUCION` está en el mapa base, **y este camino NO distingue tipo de ticket** (ver §0.2, quirk preexistente) |
| `CERRADO` | **No** (`CERRADO` es congelado/legacy en el grafo base — sin arcos de entrada; dead data) | Sí (`RESUELTO → CERRADO`, `RECHAZADO → CERRADO`, terminal) | Sí (`RESUELTO → CERRADO`, terminal) | No — `CERRADO` no está en el mapa base |
| `CANCELADO` | **No** (`CANCELADO` es congelado/legacy en el grafo base — sin arcos de entrada ni salida; dead data para `SOPORTE`) | Sí (`ABIERTO → CANCELADO`, `PENDIENTE_APROBACION → CANCELADO`, `EN_PROGRESO → CANCELADO`; terminal) | Sí (`ABIERTO → CANCELADO`, `EN_PROGRESO → CANCELADO`; terminal) | **No** — `CANCELADO` no está entre los destinos de `APROBADO` en el mapa base (`{EN_PROGRESO, RESUELTO, SUSPENDIDO, SIN_SOLUCION}`); inalcanzable vía observación sin importar el tipo |

### 0.2 Preguntas abiertas surgidas de la inspección (NO bloquean el spec, se documentan para diseño/producto)

1. **RESUELTA (2026-07-29):** `CANCELADO` estaba originalmente fuera del set que notifica pese a ser terminal genuino en `COMPRAS` y `EDILICIA`. El coordinador cerró la decisión de producto: **`CANCELADO` SÍ notifica**, ya no queda diferido a Fase 2. Ver set actualizado arriba y fila `CANCELADO` en §0.1. Nota de alcance: `CANCELADO` es inalcanzable para `SOPORTE` (congelado/legacy, sin arcos) y para el camino de auto-transición (no está en los destinos de `APROBADO` del mapa base) — el requirement/escenario dedicado (Requirement 1) lo ejercita vía `COMPRAS`/`EDILICIA` por `PATCH`, los únicos caminos donde es real.
2. **Quirk preexistente NO introducido por este change:** la auto-transición de `CrearObservacionUseCase` usa `new BaseTicketStateMachine()` sin resolver `tipoCodigo` (línea 148 del use case), por diseño de ADR-2. Esto significa que un ticket `COMPRAS` que llegue a `APROBADO` (camino real: `PENDIENTE_APROBACION → APROBADO`) y reciba una observación con `estadoDestinoCodigo: 'SIN_SOLUCION'` SÍ auto-transiciona a `SIN_SOLUCION` aunque `ComprasStateMachine` (grafo oficial) jamás permitiría esa transición vía `PATCH /tickets/:id/estado`. Este change **no corrige** esa inconsistencia (fuera de scope — es comportamiento preexistente del dominio), pero SÍ dispara notificación en ese caso porque el filtro es por código de estado destino, no por tipo. Se documenta como riesgo heredado, no como bug de esta feature.
3. **`EDILICIA` nunca pasa por `APROBADO`** en su grafo (`ABIERTO → EN_PROGRESO` directo) → la auto-transición de `CrearObservacionUseCase` es, en la práctica, inalcanzable para tickets `EDILICIA`. No requiere escenario dedicado por tipo; el escenario 2.1 (más abajo) cubre el mecanismo con un tipo donde `APROBADO` sí es alcanzable (`SOPORTE` o `COMPRAS`).

---

## 1. Requirement: Set de estados que notifican se evalúa por código, no por tipo de ticket

El sistema DEBE determinar si una transición de estado notifica evaluando el código del estado destino contra un set fijo `{ RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO }`, sin importar el `tipoCodigo` del ticket (`SOPORTE`, `COMPRAS`, `EDILICIA`).

#### Scenario: Estado destino en el set notifica sin importar el tipo de ticket
- **Given** un ticket de tipo `COMPRAS` en estado `RESUELTO`
- **When** se transiciona a `CERRADO` vía `PATCH /tickets/:id/estado`
- **Then** el sistema evalúa `CERRADO ∈ { RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO }` como verdadero
- **And** procede a notificar (ver Requirement 2)

#### Scenario: Estado destino fuera del set no notifica sin importar el tipo de ticket
- **Given** un ticket de tipo `EDILICIA` en estado `ABIERTO`
- **When** se transiciona a `EN_PROGRESO` vía `PATCH /tickets/:id/estado`
- **Then** el sistema evalúa `EN_PROGRESO ∈ { RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO }` como falso
- **And** NO se emite ningún email

#### Scenario: Transición a CANCELADO notifica al solicitante (COMPRAS o EDILICIA)
- **Given** un ticket de tipo `COMPRAS` en estado `EN_PROGRESO` (o `EDILICIA` en `ABIERTO`/`EN_PROGRESO`), con `solicitanteId` que resuelve a un email válido
- **When** se transiciona a `CANCELADO` vía `PATCH /tickets/:id/estado` (arco válido en el grafo `ComprasStateMachine`/`EdiliciaStateMachine`, ver §0.1)
- **Then** el sistema evalúa `CANCELADO ∈ { RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO }` como verdadero
- **And** se publica `TicketEstadoCambiado` post-commit y el handler llama `EmailSenderPort.send()` dirigido al solicitante

---

## 2. Requirement: Transición vía el camino oficial (`PATCH /tickets/:id/estado`) notifica al solicitante

Cuando `TransicionarEstadoUseCase.execute()` completa una transición exitosa hacia un estado que notifica, el sistema DEBE publicar el evento `TicketEstadoCambiado` **después** de que la transacción (`txRunner.run()`) haya comiteado, y el handler correspondiente DEBE resolver el email del solicitante y enviarlo.

#### Scenario: Transición oficial a estado clave dispara email al solicitante
- **Given** un ticket `SOPORTE` en estado `EN_PROGRESO` con `solicitanteId` que resuelve a un usuario con email válido en `master.Usuario`
- **When** se ejecuta `PATCH /tickets/:id/estado` con destino `RESUELTO` (y `fechaCierre` provista) y la transición es válida
- **Then** la transacción de persistencia (`ticketRepo.save` + `operacionRepo.save`) commitea exitosamente
- **And**, después del commit, se publica el evento de dominio `TicketEstadoCambiado` con `estadoNuevoId` correspondiente a `RESUELTO`
- **And** el handler de notificación resuelve el email del solicitante y llama `EmailSenderPort.send()` con un mensaje dirigido a ese email
- **And** el `Result` de `TransicionarEstadoUseCase.execute()` es `Result.ok(ticket)`, sin relación de dependencia con el resultado del envío de email

#### Scenario: Transición oficial a estado no-clave NO dispara email
- **Given** un ticket `SOPORTE` en estado `APROBADO`
- **When** se ejecuta `PATCH /tickets/:id/estado` con destino `EN_PROGRESO` y la transición es válida
- **Then** la transacción commitea exitosamente
- **And** NO se publica ningún evento `TicketEstadoCambiado` que derive en un envío de email (o, si se publica el evento igualmente por diseño, el handler DEBE cortar en el filtro del Requirement 1 sin llamar a `EmailSenderPort.send()`)
- **And** `EmailSenderPort.send()` no es invocado

---

## 3. Requirement: Auto-transición vía `CrearObservacionUseCase` (ticket en `APROBADO`) también notifica

**Este es el escenario crítico anti-regresión** señalado en el proposal (§3.1, riesgo #1): el camino de auto-transición reproduce el cambio de estado INLINE dentro de `CrearObservacionUseCase.execute()`, sin llamar a `TransicionarEstadoUseCase` (ADR-2). Enganchar la publicación del evento SOLO en `TransicionarEstadoUseCase` es un bug silencioso que pierde estas notificaciones. El sistema DEBE publicar `TicketEstadoCambiado` desde AMBOS caminos.

#### Scenario: Crear observación sobre ticket APROBADO con auto-transición a estado clave dispara email
- **Given** un ticket (tipo `SOPORTE` o `COMPRAS` — cualquiera que pueda estar en `APROBADO`) en estado `APROBADO`, con `solicitanteId` que resuelve a un email válido
- **When** se ejecuta `POST /tickets/:id/observaciones` con `estadoDestinoCodigo: 'RESUELTO'` y `fechaCierre` provista
- **Then** `CrearObservacionUseCase` reproduce la transición inline (`APROBADO → RESUELTO`) vía `BaseTicketStateMachine`, dentro de la MISMA transacción que la observación
- **And** la transacción commitea (`ticketRepo.save` + `operacionRepo.save(observacion)` + `operacionRepo.save(cambioEstado)`)
- **And**, después del commit, se publica el evento de dominio `TicketEstadoCambiado` con `estadoNuevoId` correspondiente a `RESUELTO`, idéntico en estructura al publicado por el camino oficial (Requirement 2)
- **And** el handler de notificación resuelve el email del solicitante y llama `EmailSenderPort.send()`

#### Scenario: Crear observación sobre ticket APROBADO con auto-transición a estado NO-clave no dispara email
- **Given** un ticket en estado `APROBADO`
- **When** se ejecuta `POST /tickets/:id/observaciones` con `estadoDestinoCodigo: 'EN_PROGRESO'` (o se omite, usando el default `EN_PROGRESO`)
- **Then** la auto-transición ocurre y commitea normalmente
- **And** NO se envía ningún email (el filtro del Requirement 1 corta: `EN_PROGRESO` no está en el set)

#### Scenario: Crear observación sin auto-transición (ticket NO está en APROBADO) nunca notifica
- **Given** un ticket en estado `EN_PROGRESO` (no `APROBADO`)
- **When** se ejecuta `POST /tickets/:id/observaciones` (sin auto-transición posible)
- **Then** solo se persiste la `OperacionTicketEntity` tipo `OBSERVACION` (`estadoAnteriorId`/`estadoNuevoId` null)
- **And** no se publica ningún evento `TicketEstadoCambiado` (no hubo cambio de estado)
- **And** `EmailSenderPort.send()` no es invocado

---

## 4. Requirement: Resolución del destinatario — solicitante sin email o UUID huérfano no rompe la transición

El handler DEBE resolver el email del solicitante vía el resolver cross-DB (Requirement 8). Si la resolución falla (usuario no encontrado en `master.Usuario`, UUID huérfano, o `email` ausente/nulo), el sistema DEBE loguear un WARN estructurado y NO debe:
- lanzar una excepción que escale fuera del handler,
- afectar de ningún modo la transición de estado ya comiteada (la transición ya ocurrió antes de que el handler corra).

#### Scenario: Solicitante con UUID huérfano en master (no existe en master.Usuario)
- **Given** un ticket cuyo `solicitanteId` no corresponde a ningún registro en `master.Usuario` (referencia huérfana — dato corrupto o usuario borrado hard en algún proceso externo)
- **When** el ticket transiciona a un estado que notifica (ej. `RESUELTO`) y el handler intenta resolver el email
- **Then** el resolver cross-DB retorna un `Result.fail` (usuario no encontrado)
- **And** el handler loguea un WARN con contexto (`ticketId`, `solicitanteId`, motivo) sin exponer datos sensibles
- **And** el handler retorna sin llamar a `EmailSenderPort.send()`
- **And** la transición de estado del ticket permanece intacta (ya comiteada antes de que el handler corriera)

#### Scenario: Solicitante existe pero no tiene email (dato inconsistente)
- **Given** un ticket cuyo `solicitanteId` resuelve a un registro `master.Usuario` existente pero con `email` vacío o no resoluble
- **When** el ticket transiciona a un estado que notifica
- **Then** el resolver cross-DB retorna un `Result.fail` (email no disponible)
- **And** el handler loguea WARN con contexto y corta sin invocar `EmailSenderPort.send()`
- **And** la transición del ticket permanece intacta

---

## 5. Requirement: Fallo de envío SMTP no revierte ni bloquea la transición ya comiteada

Si `EmailSenderPort.send()` retorna `Result.fail(EmailError)`, el sistema DEBE loguear el fallo con contexto (ERROR o WARN según severidad) y NO debe reintentar en el MVP (decisión #9 del proposal: best-effort, un solo intento). La transición de estado, ya comiteada antes de que el handler corriera, es completamente ajena a este fallo.

#### Scenario: SMTP falla al enviar — la transición ya comiteada permanece intacta
- **Given** un ticket que transicionó exitosamente a `RESUELTO` (transacción ya comiteada) y un solicitante con email resoluble
- **When** el handler llama `EmailSenderPort.send()` y el adapter nodemailer falla (ej. timeout SMTP, conexión rechazada)
- **Then** `EmailSenderPort.send()` retorna `Result.fail(EmailError)` (nunca lanza una excepción no controlada)
- **And** el handler loguea el fallo con contexto (destinatario enmascarado, causa, `ticketId`) a nivel ERROR o WARN
- **And** el sistema NO reintenta el envío en este flujo (MVP: un intento, sin backoff automático — documentado como límite conocido, fase 2 = outbox)
- **And** una consulta posterior del ticket confirma que su estado sigue siendo `RESUELTO` — el fallo de email no lo revirtió ni lo dejó en un estado intermedio

---

## 6. Requirement: Publicación y envío ocurren estrictamente post-commit — nunca dentro de la transacción

El sistema DEBE garantizar que ni la publicación del evento ni el envío del email ocurran dentro de `txRunner.run()` / `$transaction()`. La transición del ticket es durable independientemente de lo que pase con el email.

#### Scenario: La transición es durable incluso si el email falla catastróficamente
- **Given** un ticket transicionando a un estado que notifica
- **When** la transacción de persistencia (`ticketRepo.save` + `operacionRepo.save`) commitea exitosamente
- **And**, posteriormente, el envío de email falla de cualquier forma (timeout, excepción del adapter, proceso caído durante el envío)
- **Then** el cambio de estado del ticket permanece persistido y consultable — el fallo de email ocurre estrictamente DESPUÉS del punto de no-retorno de la transacción
- **And** ningún código de la ruta de notificación (publicación del evento, resolución de email, envío SMTP) se ejecuta dentro de `txRunner.run()` — verificable porque la publicación ocurre en el código que sigue al `await this.txRunner.run(...)` (camino oficial) o después del bloque transaccional equivalente (camino de auto-transición)

#### Scenario: `.emit()` no bloquea la respuesta HTTP del endpoint de transición
- **Given** un adapter de email deliberadamente lento (simulado, ej. delay artificial mayor al timeout de un request HTTP típico)
- **When** se ejecuta `PATCH /tickets/:id/estado` hacia un estado que notifica
- **Then** la respuesta HTTP del endpoint se retorna sin esperar a que el envío de email complete (`EventEmitter2.emit()` es no-bloqueante — el handler corre de forma asíncrona, desacoplado del ciclo request/response)

---

## 7. Requirement: Contrato del puerto `EmailSenderPort`

`EmailSenderPort` es la única forma en que la capa de aplicación envía emails. DEBE seguir el patrón `Result<T, E extends DomainError>` del repo (`shared/domain/result.ts`) — NO el patrón `Promise<T>` + throw de `IFileStorage` (divergencia documentada y deliberada, ver proposal §3.4).

#### Scenario: `send()` retorna Result.ok en éxito
- **Given** un `EmailMessage` válido (`to`, `subject`, `body` de tipo `template` con `name` + `data`)
- **When** se invoca `EmailSenderPort.send(email)` y el adapter subyacente entrega el mensaje sin error
- **Then** el resultado es `Result.ok(undefined)`

#### Scenario: `send()` retorna Result.fail con EmailError tipado en fallo esperado (nunca throw)
- **Given** un `EmailMessage` válido pero el proveedor SMTP rechaza el envío (ej. destinatario inválido, conexión rechazada)
- **When** se invoca `EmailSenderPort.send(email)`
- **Then** el resultado es `Result.fail(error)` donde `error` es una instancia de `EmailError extends DomainError`
- **And** `error` expone al menos: `code` (heredado de `DomainError`), `message` descriptivo, el destinatario ENMASCARADO (nunca el email completo en claro en logs — ej. `u***@dominio.com`), y la causa subyacente (motivo del fallo, sin credenciales ni datos sensibles)
- **And** en ningún caso `send()` lanza (`throw`) para este tipo de fallo esperado — el `throw` queda reservado para errores de infraestructura verdaderamente irrecuperables en el límite del adapter (ej. config SMTP faltante al bootstrap, que debe fallar el arranque de la app, no un `send()` individual)

---

## 8. Requirement: Contrato del resolver cross-DB de email del solicitante

Dado un `solicitanteId` (soft-ref UUID → `master.Usuario.id`) y el `tenantId`/`clienteId` del ticket, el sistema DEBE resolver el email correspondiente consultando `master.Usuario` (mismo patrón de acceso que `UsuarioMasterChecker`: vía `PrismaService.getMasterClient()`, sin `TenantContext`, scoped por `clienteId`).

#### Scenario: Resolver retorna el email cuando el usuario existe y pertenece al tenant
- **Given** un `solicitanteId` que corresponde a un registro `master.Usuario` con `deletedAt: null` y `clienteId` igual al tenant del ticket
- **When** se invoca el resolver con `(solicitanteId, clienteId)`
- **Then** el resultado es `Result.ok(email)` con el valor de `master.Usuario.email` de ese registro

#### Scenario: Resolver retorna Result.fail cuando el usuario no existe o no pertenece al tenant
- **Given** un `solicitanteId` que NO tiene registro en `master.Usuario`, o que existe pero pertenece a un `clienteId` distinto del tenant del ticket
- **When** se invoca el resolver con `(solicitanteId, clienteId)`
- **Then** el resultado es `Result.fail(error)`, sin lanzar excepción
- **And** el resolver NUNCA filtra emails de un tenant ajeno (mismo principio de aislamiento multi-tenant que `existeEnTenant`/`estaActivoEnTenant` en `UsuarioMasterChecker`)

#### Scenario: Resolver retorna Result.fail cuando el usuario existe pero el email es nulo o vacío
- **Given** un `solicitanteId` con registro válido en `master.Usuario` pero sin valor utilizable en `email` (dato inconsistente — no debería ocurrir dado que `email` es `@unique` y `NOT NULL` en el schema, pero el resolver DEBE manejarlo defensivamente)
- **When** se invoca el resolver
- **Then** el resultado es `Result.fail(error)` con un código distinguible de "usuario no encontrado" (ej. `EMAIL_NO_DISPONIBLE` vs `USUARIO_NO_ENCONTRADO`), para que el handler pueda loguear con precisión

---

## 9. Requirement: Payload del evento de dominio `TicketEstadoCambiado`

El evento es un plain object en tiempo pasado, sin dependencias de framework (regla `domain/` no importa nada externo). DEBE llevar todo lo que el handler necesita para resolver el destinatario y armar el email, sin volver a consultar el ticket.

#### Scenario: El evento publicado contiene todos los campos requeridos
- **Given** una transición de estado exitosa y comiteada (por cualquiera de los dos caminos)
- **When** se construye el evento `TicketEstadoCambiado` para publicar
- **Then** el evento contiene, como mínimo, estos campos con datos no nulos (salvo que se indique lo contrario):
  - `ticketId: string` (UUID del ticket)
  - `tipoCodigo: string` (código del tipo de ticket — `SOPORTE` | `COMPRAS` | `EDILICIA`)
  - `estadoAnteriorId: string` (UUID del estado origen, del catálogo `estados`)
  - `estadoNuevoId: string` (UUID del estado destino, del catálogo `estados`)
  - `solicitanteId: string` (soft-ref UUID → `master.Usuario.id`)
  - `autorId: string` (soft-ref UUID → `master.Usuario.id`, quien ejecutó la transición — `dto.autorId` del caso de uso)
  - `tenantId: string` (UUID del cliente/tenant — `clienteId` del `TenantContext`, requerido para que el resolver cross-DB consulte el tenant correcto)
  - `occurredAt: Date` (momento del cambio, no el momento de publicación)

#### Scenario: El evento publicado desde el camino de auto-transición tiene la misma forma que el publicado desde el camino oficial
- **Given** dos transiciones equivalentes (mismo ticket, mismo estado destino) — una ejecutada vía `PATCH /tickets/:id/estado` y otra vía la auto-transición de `POST /tickets/:id/observaciones`
- **When** se comparan los dos eventos `TicketEstadoCambiado` publicados
- **Then** ambos tienen exactamente la misma forma (mismos campos, mismos tipos) — el handler de notificación NO necesita distinguir de qué camino vino el evento

---

## 10. Requisitos no funcionales

#### Scenario: Ningún código de envío/publicación corre dentro de una transacción Prisma
- **Given** el código de `TransicionarEstadoUseCase` y `CrearObservacionUseCase` tras el cambio
- **When** se audita el código dentro de los bloques `txRunner.run(...)` de ambos use cases
- **Then** no existe ninguna llamada a `EventEmitter2.emit()`, a un port de publicación de eventos, ni a `EmailSenderPort.send()` dentro de esos bloques

#### Scenario: Cero configuración de proveedor SMTP fuera de infraestructura
- **Given** el código de `domain/` y `application/` de este change
- **When** se audita por referencias a variables de entorno SMTP (host, puerto, usuario, contraseña) o al paquete `nodemailer`
- **Then** no existe ninguna referencia — la config SMTP se lee exclusivamente en `infrastructure/`, vía variables de entorno, validada al bootstrap de la aplicación

#### Scenario: Resolución del solicitante siempre ocurre contra el tenant correcto (aislamiento multi-tenant)
- **Given** dos tenants distintos (`clienteId` A y B) con usuarios de igual `solicitanteId` inexistente cruzado (o simplemente tenants distintos)
- **When** un ticket del tenant A transiciona a un estado que notifica
- **Then** el resolver de email consulta `master.Usuario` filtrando por el `tenantId`/`clienteId` que viaja en el evento (el del tenant A), nunca resolviendo por error un usuario de otro tenant

---

## Trazabilidad a decisiones del proposal

| Decisión proposal | Requirement de este spec |
|---|---|
| #1 Transiciones que notifican | Requirement 1, §0 |
| #2 Destinatario = solo solicitante | Requirement 8, 9 |
| #3 Proveedor nodemailer tras port | Requirement 7 |
| #5 Enganche: domain event + EventEmitter2 post-commit en 2 caminos | Requirement 2, 3, 6, 9 |
| #6 Contrato `Result<void, EmailError>` | Requirement 7 |
| #7 Trazado de fallos = log, no `operaciones_ticket.metadata` | Requirement 4, 5 |
| #9 Reintentos: best-effort, un intento | Requirement 5 |
| Riesgo "perder la auto-transición" | Requirement 3 (escenario crítico anti-regresión) |
