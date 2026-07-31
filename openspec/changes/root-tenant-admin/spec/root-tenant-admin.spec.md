# Delta Spec — `root-tenant-admin`

> SDD phase: **SPEC**. Describe QUÉ debe ser verdad tras el change (no HOW).
> Fuente: `openspec/changes/root-tenant-admin/proposal.md` (D1-D7 cerradas, O1/O5 resueltas por el
> usuario, O2-O4/O6 quedan abiertas para el design — los requirements de abajo describen
> comportamiento observable, no mecanismo, donde esas decisiones siguen abiertas).
> Decisiones ya cerradas y NO reabiertas acá: D1 (root=flag ortogonal, no rol), D2 (alcance
> completo), D3 (ADMINISTRADOR no crea roots), D4 (fix asignar-rol entra), D5 (propagación
> centralizada), D7 (clienteId nunca del body), O1/O5 (root=terminología sobre `is_global_admin`,
> CERO rename de columna, CERO cambio de contrato JWT).

---

## Domain: auth-rbac (backend)

### ADDED Requirement R1: Terminología "root" ortogonal al RBAC

(D1, O1 resuelta) Root es el flag `is_global_admin` renombrado SOLO a nivel de terminología de
negocio/UI. La columna DB, el claim JWT y `ITokenService` NO cambian. El dominio MUST exponer un
accesor `isRoot()` (alias legible de `isGlobalAdmin`, mismo valor, sin campo nuevo).

#### Scenario: La entidad expone isRoot() como alias de isGlobalAdmin
- GIVEN una instancia de `UsuarioEntity` con `isGlobalAdmin = true`
- WHEN se invoca `usuario.isRoot()`
- THEN MUST devolver `true`, idéntico a `usuario.isGlobalAdmin`

#### Scenario: Rol ADMINISTRADOR no implica ser root [CRITICAL]
- GIVEN un usuario con rol `ADMINISTRADOR` e `isGlobalAdmin = false`
- WHEN se evalúa `usuario.isRoot()`
- THEN MUST devolver `false`; ningún guard MUST derivar root desde el rol

#### Scenario: Ser root no implica tener rol ADMINISTRADOR
- GIVEN un usuario con `isGlobalAdmin = true` sin ningún rol RBAC asignado
- WHEN opera cross-tenant vía `TenantGuard`
- THEN el acceso cross-tenant MUST concederse igual (basado solo en el flag)

---

### ADDED Requirement R2: Un root puede crear otro usuario root

(D1, D3, R1 del proposal) Existe un camino de aplicación que permite a un actor root crear un
usuario con `isGlobalAdmin = true`. Ningún actor no-root alcanza ese resultado por ningún camino.
Autorización validada en aplicación, además del guard de presentación (defensa en profundidad).

#### Scenario: Root crea exitosamente otro root
- GIVEN un actor con `isGlobalAdmin = true`
- WHEN solicita crear un usuario marcado como root
- THEN MUST crearse con `isGlobalAdmin = true`, HTTP 201, y auditarse (actor, objetivo, timestamp)

#### Scenario: ADMINISTRADOR no-root recibe 403 al intentar crear un root [CRITICAL]
- GIVEN un actor con rol `ADMINISTRADOR` e `isGlobalAdmin = false`
- WHEN intenta el mismo camino con `isGlobalAdmin=true` en la solicitud
- THEN MUST rechazarse con HTTP 403, sin crear usuario; la aplicación MUST validar `actor.isRoot()` (no solo el guard)

#### Scenario: El alta normal sigue creando siempre root=false [CRITICAL]
- GIVEN cualquier actor autorizado usa el endpoint existente de alta normal (`POST /usuarios`)
- WHEN el usuario se crea exitosamente
- THEN `isGlobalAdmin` MUST ser `false` sin excepción, incluso si el actor es root

---

### MODIFIED Requirement R3: Bootstrap seguro y reproducible del primer root

(Previously: "Migración idempotente designa admin global inicial" — `UPDATE` atado al email
hardcodeado `nestor@sesitec.com.ar`, no-op silencioso si la fila no preexistía. Bootstrap frágil,
riesgo R3 del proposal.)

Existe un mecanismo idempotente que garantiza al menos un usuario root, configurado vía variables
de entorno (NUNCA email/credenciales hardcodeadas). MUST crear la identidad si no existe (no solo
actualizar). Mecanismo exacto (seed vs CLI) es decisión de diseño (O2); este requirement fija el
comportamiento observable.

#### Scenario: Bootstrap crea el primer root si no existe
- GIVEN no existe fila en `master.usuarios` con el email del env
- WHEN se ejecuta el bootstrap
- THEN MUST crear la fila con `isGlobalAdmin = true`; el sistema MUST NOT quedar sin ningún root

#### Scenario: Bootstrap es idempotente [CRITICAL]
- GIVEN el bootstrap ya se ejecutó y el root existe
- WHEN se ejecuta nuevamente (redeploy)
- THEN MUST completar sin error, sin duplicar filas, `isGlobalAdmin` MUST permanecer `true`

#### Scenario: Bootstrap actualiza el flag si el usuario ya existe sin root
- GIVEN existe una fila con el email del env pero `isGlobalAdmin = false`
- WHEN se ejecuta el bootstrap
- THEN MUST setear `isGlobalAdmin = true` y reactivar la cuenta (`activo = true`,
  `deletedAt = null`) — intencional para garantizar un root usable en cada
  corrida — sin alterar `nombre`/`apellido`/`passwordHash`

#### Scenario: Credenciales del bootstrap nunca hardcodeadas
- GIVEN el código del mecanismo de bootstrap
- WHEN se audita
- THEN MUST NOT contener ningún email/password literal; MUST leerlos de variables de entorno

---

## Domain: clientes-tenancy (backend)

### ADDED Requirement R4: Asignación de rol valida el tenant del usuario objetivo (fix D4)

(D4, D7, R2a del proposal) Al asignar rol, el sistema MUST validar que el usuario objetivo
pertenece al mismo tenant que el actor (salvo root operando cross-tenant vía `X-Tenant-Id`). El
`clienteId` de referencia NUNCA viene del body (D7) — se resuelve server-side desde `TenantContext`.

#### Scenario: Regresión — la fuga cross-tenant existía antes del fix [CRITICAL][RED]
- GIVEN un ADMINISTRADOR del tenant A y un usuario objetivo del tenant B
- WHEN el test de regresión ejerce el comportamiento previo al fix (sin validar tenant)
- THEN el test MUST fallar en RED demostrando que la operación completaba sin bloqueo

#### Scenario: Asignar rol a usuario de otro tenant es rechazado [CRITICAL]
- GIVEN un ADMINISTRADOR (no root) del tenant A y un usuario objetivo del tenant B
- WHEN llama al endpoint de asignación de rol sobre ese usuario
- THEN MUST rechazarse con HTTP 403 o 404; MUST NOT modificar datos del usuario de tenant B

#### Scenario: Asignar rol al mismo tenant sigue funcionando (sin regresión)
- GIVEN un ADMINISTRADOR del tenant A y un usuario objetivo también del tenant A
- WHEN llama al endpoint de asignación de rol
- THEN MUST devolver 200/201 y el rol MUST asignarse en `usuarios_roles`

#### Scenario: Root asigna rol cross-tenant vía X-Tenant-Id
- GIVEN un root con `X-Tenant-Id` apuntando al tenant del usuario objetivo
- WHEN llama al endpoint de asignación de rol
- THEN MUST completar en el contexto de ese tenant; MUST NOT afectar otros tenants

---

## Domain: frontend-api-client

### ADDED Requirement R5: Propagación centralizada de X-Tenant-Id en vistas operativas

(D5, R2b/R7 del proposal) Con un cliente seleccionado, TODA request operativa (tickets, compras,
equipos, reparaciones) MUST incluir `X-Tenant-Id` del cliente elegido, inyectado en un único punto
de la capa de transporte (no hook por hook). Punto exacto de inyección: decisión de diseño (O4).

#### Scenario: Root con cliente seleccionado ve los datos de ESE cliente en tickets [CRITICAL]
- GIVEN un root con "Acme Corp" seleccionado en TenantContext
- WHEN navega a Tickets
- THEN la request MUST incluir `X-Tenant-Id` = id de Acme Corp; la vista MUST mostrar solo tickets de Acme Corp

#### Scenario: Lo mismo aplica a compras, equipos y reparaciones
- GIVEN un root con un cliente seleccionado
- WHEN navega a compras/equipos/reparaciones
- THEN cada request MUST incluir el header y mostrar solo datos de ese cliente

#### Scenario: Usuario NO-root nunca envía X-Tenant-Id [CRITICAL]
- GIVEN un usuario con `isGlobalAdmin = false`
- WHEN navega a cualquier vista operativa
- THEN ninguna request MUST incluir `X-Tenant-Id`; MUST seguir viendo solo su propio tenant

#### Scenario: Backend rechaza cross-tenant de un no-root aunque el frontend lo enviara [CRITICAL]
- GIVEN una request con `X-Tenant-Id` distinto al `cliente_id` del actor no-root
- WHEN `TenantGuard` evalúa la request
- THEN MUST rechazar con HTTP 403 (defensa en profundidad, no se relaja)

---

## Domain: admin-ui

### ADDED Requirement R6: Creación de root visible solo para roots en la UI

(D1, D3, R1) La opción de crear un usuario root MUST ser visible únicamente para `isGlobalAdmin = true`.

#### Scenario: Root ve la opción de crear otro root
- GIVEN un root en `/admin/usuarios` abre el formulario de nuevo usuario
- WHEN el formulario renderiza
- THEN MUST existir un campo/toggle de root; al enviarlo activado el usuario creado MUST tener `isGlobalAdmin = true`

#### Scenario: ADMINISTRADOR no-root no ve la opción [CRITICAL]
- GIVEN un `ADMINISTRADOR` con `isGlobalAdmin = false` en `/admin/usuarios`
- WHEN abre el formulario de nuevo usuario
- THEN el campo/toggle de root MUST NOT renderizarse; ningún camino de UI MUST permitir setear el flag

---

## Cross-cutting NFR

### ADDED Requirement R7: Defensa en profundidad, menor privilegio y secretos

(R1, R3, R6 del proposal) Toda superficie que exponga la capacidad root MUST validar autorización
en guard de presentación Y en aplicación. Secretos del bootstrap vía `.env`. Auditoría cross-tenant
existente MUST mantenerse sin regresión.

#### Scenario: Doble validación en root-crea-root [CRITICAL]
- GIVEN el use case de creación de root
- WHEN se audita el código
- THEN MUST existir verificación explícita de `actor.isRoot()` independiente del guard; si el guard se removiera por error, la aplicación igual MUST rechazar

#### Scenario: Auditoría cross-tenant sin regresión
- GIVEN un root opera sobre tenant ajeno vía `X-Tenant-Id`
- WHEN `TenantGuard` resuelve el contexto
- THEN MUST seguir registrando actor, tenant objetivo y timestamp sin cambio de comportamiento
