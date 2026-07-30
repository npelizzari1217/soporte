# Spec: Config operativa en runtime — tabla en DB (primer corte SMTP, nivel B)

> Artefacto de `sdd-spec`. Store activo: **openspec** (`C:\trabajos\soporte\openspec\changes\runtime-config-table\`).
> Insumos: `proposal.md` (D1-D9 cerradas) + `explore.md`.
> Convención: cada `#### Scenario:` es atómico y es el contrato de UN test RED (TDD estricto). Esta spec describe QUÉ debe ser verdad después del cambio — NO diseña wiring ni rutas de archivo (eso es `sdd-design`/`sdd-tasks`).
> Dominios cubiertos en un solo archivo (precedente: `notif-email-estado-ticket.spec.md`): `configuracion` (nuevo) + `tickets` (contrato de envío, modificado).

---

## 0. Modelo de datos (fija columnas — pendiente en el proposal)

**`ConfiguracionRuntime`** (mismo shape en `prisma_master` y `prisma_tenant`, unique en `(categoria, clave)` por scope):
`id (UUID)`, `categoria (string, ej. "smtp")`, `clave (string)`, `valor (string — cifrado si esSecreto)`, `tipo ("string"|"number"|"boolean"|"json")`, `esSecreto (bool)`, `iv (string, nullable)`, `authTag (string, nullable)`, `actualizadoPor (UUID nullable, soft-ref usuario)`, `createdAt`, `updatedAt`, `deletedAt (nullable)`.

**`AuditEntry`** (mismo shape en ambos schemas): `id (UUID)`, `actorId (UUID, NOT NULL)`, `accion (string)`, `categoria`, `clave`, `valorAnterior (string, enmascarado si esSecreto)`, `valorNuevo (string, enmascarado si esSecreto)`, `esSecreto (bool)`, `createdAt`.
**Desviación deliberada de la regla `config.yaml` "toda entidad nueva incluye soft delete":** `AuditEntry` es inmutable por diseño (§7 proposal) — NO tiene `updatedAt` ni `deletedAt`. Un log de auditoría que se puede soft-eliminar deja de ser confiable como evidencia.

---

## 1. Requirement: Resolución de config — tenant gana, fallback a global, nunca crashea

El sistema DEBE resolver `SmtpConfig` leyendo primero `ConfiguracionRuntime` del tenant; si no hay fila (o falta un campo requerido), DEBE caer a la fila global de master. Si no hay config en ningún lado, DEBE devolver un `Result.fail` tipado — NUNCA lanzar.

#### Scenario: Config del tenant existe → gana sobre la global
- **Given** el tenant tiene fila `smtp.*` completa en su `ConfiguracionRuntime` y master también tiene una fila global `smtp.*` distinta
- **When** se invoca `ResolveSmtpConfig(clienteId)`
- **Then** el resultado es `Result.ok(SmtpConfig)` con los valores del TENANT, ignorando los de global

#### Scenario: Tenant sin fila → cae a global
- **Given** el tenant NO tiene ninguna fila `smtp.*` y master tiene una fila global `smtp.*` completa
- **When** se invoca `ResolveSmtpConfig(clienteId)`
- **Then** el resultado es `Result.ok(SmtpConfig)` con los valores GLOBALES de master

#### Scenario: Ni tenant ni global tienen config → outcome tipado, no crash
- **Given** ni el tenant ni master tienen fila `smtp.*`
- **When** se invoca `ResolveSmtpConfig(clienteId)`
- **Then** el resultado es `Result.fail({ code: 'NO_CONFIG' })`, sin lanzar excepción

#### Scenario: Config incompleta (falta un campo requerido) → outcome tipado
- **Given** el tenant tiene fila `smtp.host` pero falta `smtp.port` o `smtp.user`, y global tampoco cubre el faltante
- **When** se invoca `ResolveSmtpConfig(clienteId)`
- **Then** el resultado es `Result.fail({ code: 'CONFIG_INCOMPLETA' })`, sin lanzar excepción

#### Scenario: Resolución cross-DB sin `TenantContext`, scoped por `clienteId`
- **Given** dos tenants A y B con configs `smtp.*` distintas
- **When** se resuelve config para el tenant A
- **Then** el resolver consulta `getTenantClient(dbName de A)` (dbName resuelto desde `master.clientes` por `clienteId`), sin depender de `TenantContext`, y NUNCA devuelve valores del tenant B

---

## 2. Requirement: Secretos cifrados at-rest con AES-256-GCM, nunca en claro fuera de memoria

Todo valor con `esSecreto = true` (ej. `smtp.pass`) DEBE persistirse cifrado (`valor` + `iv` + `authTag`). El descifrado SOLO ocurre en memoria, entre `decrypt()` y el armado del transporter. `decrypt()` NUNCA lanza.

#### Scenario: Round-trip encrypt → decrypt devuelve el plaintext original
- **Given** un plaintext `"smtp-password-123"` y una `CONFIG_ENCRYPTION_KEY` válida
- **When** se cifra con `ISecretCipher.encrypt()` y luego se descifra el resultado con `ISecretCipher.decrypt()`
- **Then** el plaintext descifrado es idéntico al original

#### Scenario: `authTag` inválido (tampering) → `Result.fail` tipado, nunca throw
- **Given** un valor cifrado cuyo `authTag` fue alterado (o no corresponde al `valor`/`iv`)
- **When** se invoca `ISecretCipher.decrypt()`
- **Then** el resultado es `Result.fail({ code: 'CONFIG_CIFRADO_INVALIDO' })`, sin lanzar excepción

#### Scenario: `CONFIG_ENCRYPTION_KEY` ausente o inválida
- **Given** la variable de entorno `CONFIG_ENCRYPTION_KEY` no está definida o tiene longitud/formato inválido para AES-256-GCM
- **When** el resolver intenta descifrar un secreto en send-time
- **Then** el resultado fluye como `Result.fail({ code: 'CONFIG_CIFRADO_INVALIDO' })` hasta el handler que intentó enviar el email
- **And** la aplicación NO falla al arrancar por esta causa (la validación es en send-time, no en boot-time — ver Requirement 7)

#### Scenario: El secreto en claro nunca aparece fuera de memoria
- **Given** un envío de email cuyo `SmtpConfig.pass` fue descifrado exitosamente
- **When** se inspecciona cualquier log, `Result.fail`, `AuditEntry`, o respuesta de API generada durante el flujo (incluyendo un fallo forzado del adapter nodemailer)
- **Then** el valor en claro del secreto NUNCA aparece en ninguno de esos lugares (se extiende el masking existente de `nodemailer-email-sender.adapter.ts:120-126`)

---

## 3. Requirement: Lectura vía API enmascara valores secretos

Al leer config (`GET`) vía el caso de uso `LeerConfigUseCase`, toda fila con `esSecreto = true` DEBE devolver un valor enmascarado — NUNCA el valor real, ni siquiera descifrado en memoria para la respuesta.

#### Scenario: Lectura de clave secreta devuelve valor enmascarado
- **Given** una fila `smtp.pass` con `esSecreto = true` y valor cifrado válido
- **When** un usuario autorizado hace `GET` de la config
- **Then** la respuesta expone `smtp.pass` con un valor enmascarado (ej. `"********"`), y en ningún caso el valor descifrado

#### Scenario: Lectura de clave no-secreta devuelve el valor real
- **Given** una fila `smtp.host` con `esSecreto = false`
- **When** un usuario autorizado hace `GET` de la config
- **Then** la respuesta expone el valor real de `smtp.host` sin enmascarar

---

## 4. Requirement: RBAC — permiso `configuracion:gestionar`

Solo usuarios cuyo JWT incluye el permiso `configuracion:gestionar` DEBEN poder leer o escribir `ConfiguracionRuntime` vía API. El guard evalúa el array `user.permisos` del JWT — NO consulta DB (límite conocido D9).

#### Scenario: Usuario con el permiso accede a leer/escribir config
- **Given** un usuario autenticado cuyo JWT incluye `configuracion:gestionar`
- **When** hace `GET` o `PUT` sobre el endpoint de config
- **Then** la request es autorizada por el guard y procede al caso de uso correspondiente

#### Scenario: Usuario sin el permiso es rechazado
- **Given** un usuario autenticado cuyo JWT NO incluye `configuracion:gestionar`
- **When** hace `GET` o `PUT` sobre el endpoint de config
- **Then** el guard rechaza con `403` antes de invocar cualquier caso de uso

#### Scenario: Permiso otorgado no aplica hasta el próximo login (límite D9 aceptado)
- **Given** a un usuario se le otorga `configuracion:gestionar` en master (rol o asignación directa) mientras tiene una sesión activa con un JWT emitido ANTES del otorgamiento
- **When** ese usuario intenta `PUT` sobre el endpoint de config usando el JWT vigente
- **Then** el guard sigue rechazando con `403` — el permiso solo surte efecto en el próximo login/refresh, tal como documenta D9

#### Scenario: Seed del permiso es idempotente
- **Given** el permiso `configuracion:gestionar` ya existe en `master.permisos` y ya está asignado al rol `ADMIN`
- **When** se re-corre la migración/seed
- **Then** no se duplica la fila del permiso ni la asignación al rol (`ON CONFLICT DO NOTHING`)

---

## 5. Requirement: Todo cambio de config genera un `AuditEntry` inmutable, sin bloquear la operación

Cada escritura exitosa de `ConfiguracionRuntime` DEBE emitir el evento `ConfiguracionCambiada`, cuyo handler async DEBE persistir un `AuditEntry` con `actorId`, `clave`, `categoria`, valor anterior/nuevo y timestamp. Si `esSecreto`, los valores DEBEN ir enmascarados. Un fallo de audit NUNCA bloquea ni revierte el cambio de config.

#### Scenario: Update de clave no-secreta registra valores reales en el audit
- **Given** un usuario autorizado actualiza `smtp.host` de `"old.smtp.com"` a `"new.smtp.com"`
- **When** el cambio se persiste exitosamente
- **Then** se crea un `AuditEntry` con `actorId` del usuario, `clave: "smtp.host"`, `valorAnterior: "old.smtp.com"`, `valorNuevo: "new.smtp.com"`, `esSecreto: false`

#### Scenario: Update de clave secreta enmascara valor anterior y nuevo en el audit
- **Given** un usuario autorizado actualiza `smtp.pass`
- **When** el cambio se persiste exitosamente
- **Then** se crea un `AuditEntry` con `esSecreto: true` y `valorAnterior`/`valorNuevo` ENMASCARADOS — el secreto en claro (ni el viejo ni el nuevo) NUNCA aparece en la fila de audit

#### Scenario: Fallo al persistir el audit no revierte ni bloquea el cambio de config
- **Given** un update de config válido que ya persistió exitosamente en `ConfiguracionRuntime`
- **When** el handler async de `ConfiguracionCambiada` falla al escribir el `AuditEntry` (ej. error de infra)
- **Then** el cambio de config permanece persistido y consultable — el fallo de audit se loguea y NO propaga ni revierte la escritura ya comiteada

#### Scenario: Scope dual — tenant audita en tenant, global audita en master
- **Given** un cambio de config sobre una fila tenant-scoped y otro sobre una fila global
- **When** ambos cambios se persisten
- **Then** el `AuditEntry` del cambio tenant se escribe en la DB del tenant, y el del cambio global se escribe en master — nunca cruzados

---

## 6. Requirement: Fail-fast se corre de boot-time a send-time

La aplicación DEBE arrancar exitosamente sin ninguna fila de config SMTP (ni tenant ni global). Un envío de email sin config resoluble DEBE devolver un outcome tipado — nunca una excepción de arranque ni un throw no controlado.

#### Scenario: La app arranca sin ninguna config SMTP persistida
- **Given** una instancia nueva de la app sin ninguna fila `ConfiguracionRuntime` de categoría `smtp` en ningún schema
- **When** la aplicación arranca
- **Then** el proceso de bootstrap completa sin lanzar `SmtpConfigError` ni ninguna excepción relacionada a SMTP

#### Scenario: Envío de email sin config de tenant ni global no rompe el flujo de negocio
- **Given** un ticket que transiciona a un estado que notifica (`notif-email-estado-ticket`), en un tenant sin config `smtp.*` propia ni global en master
- **When** el handler de notificación intenta resolver `SmtpConfig` antes de enviar
- **Then** `ResolveSmtpConfig` devuelve `Result.fail({ code: 'NO_CONFIG' })`, el handler loguea con contexto y NO envía email
- **And** la transición de estado del ticket (ya comiteada) permanece intacta — mismo principio que el fallo de SMTP en `notif-email-estado-ticket.spec.md` Requirement 5

#### Scenario: Cambio de config aplica en el próximo envío sin redeploy (hot-reload)
- **Given** un envío previo usó una config `smtp.host` desactualizada y un usuario autorizado la actualiza vía `PUT`
- **When** ocurre el siguiente envío de email para ese mismo tenant
- **Then** el transporter se arma con la config NUEVA, sin requerir reinicio del proceso

---

## 7. Requirement: Contrato `EmailSenderPort.send(email, config)` — adapter puro, sin resolver ni descifrar

`EmailSenderPort.send()` DEBE recibir la `SmtpConfig` ya resuelta y descifrada como parámetro explícito. El adapter (`NodemailerEmailSender`) NO DEBE resolver config cross-DB ni invocar `ISecretCipher` — arma el transporter por-envío a partir de la config recibida.

#### Scenario: `send()` recibe `SmtpConfig` ya resuelta y arma transporter por-envío
- **Given** una `SmtpConfig` válida y descifrada resuelta previamente por `ResolveSmtpConfig`
- **When** se invoca `EmailSenderPort.send(email, config)`
- **Then** el adapter arma el transporter nodemailer a partir de esa `config` (no de `process.env`, no de `fromEnv()`) y envía

#### Scenario: El adapter nunca importa `ISecretCipher` ni clientes Prisma
- **Given** el código de `NodemailerEmailSender` tras el refactor
- **When** se audita sus imports
- **Then** no existe ninguna referencia a `ISecretCipher`, `PrismaService`, `getMasterClient` ni `getTenantClient` — la resolución y el descifrado quedan en `application`

---

## 8. Requirement: Scope — solo categoría `smtp` (nivel B); nivel C fuera de este change

Este change DEBE implementar únicamente la categoría `smtp` sobre la infraestructura genérica (tabla KV, cifrado, resolver, audit, RBAC). Otras categorías (`notificaciones`, feature flags, etc.) NO DEBEN tener ningún caso de uso ni endpoint cableado en este change, aunque el modelo de datos las soporte sin migración adicional.

#### Scenario: La tabla soporta otras categorías sin migración nueva, pero ninguna está cableada
- **Given** el modelo `ConfiguracionRuntime` genérico (columna `categoria`)
- **When** se audita el código de `application`/`presentation` de este change
- **Then** no existe ningún caso de uso, endpoint ni handler que lea o escriba `categoria` distinta de `smtp`

---

## 9. Requisitos no funcionales

#### Scenario: Aislamiento multi-tenant — el resolver nunca filtra config de otro tenant
- **Given** dos tenants A y B con configs `smtp.*` distintas
- **When** se resuelve config para A
- **Then** en ningún caso el resultado contiene valores persistidos bajo el `dbName`/`clienteId` de B

#### Scenario: `ConfiguracionRuntime` cumple auditoría + soft delete estándar del proyecto
- **Given** la entidad `ConfiguracionRuntime` en ambos schemas
- **When** se audita su modelo Prisma
- **Then** incluye `createdAt`, `updatedAt` y `deletedAt` (nullable) como toda entidad nueva del proyecto (regla `config.yaml`)

#### Scenario: Transporter por-envío es aceptado sin cache (deuda documentada)
- **Given** dos envíos consecutivos para el mismo tenant con la misma config
- **When** se ejecutan ambos envíos
- **Then** el adapter arma un transporter nuevo en cada `send()` (sin cache por `(clienteId, hash-config)`) — comportamiento esperado en este MVP, no un bug

---

## Trazabilidad a decisiones del proposal

| Decisión proposal | Requirement de este spec |
|---|---|
| D1 Alcance por-tenant con fallback a global | Requirement 1 |
| D2 Cifrado + enmascarado + audit + RBAC | Requirements 2, 3, 4, 5 |
| D3 Fail-fast boot-time → send-time | Requirement 6 |
| D4 Tabla KV genérica + accesor tipado | §0, Requirement 8 |
| D5 Resolver en application | Requirement 1 |
| D5b Contrato `send(email, config)` | Requirement 7 |
| D6 Clave env + AES-256-GCM, rotación manual (deuda) | Requirement 2 |
| D7 Audit log port-based, acotado a config | Requirement 5 |
| D8 Nivel C fuera de este change | Requirement 8 |
| D9 RBAC stale hasta próximo login | Requirement 4 |
