# Design: Reset de contraseña por admin/root

## Technical Approach

Un caso de uso nuevo que **compone dos precedentes ya entregados**: toma de
`EditarUsuarioTenantUseCase` (`editar-usuario-tenant.use-case.ts:52-63`) el scoping por
membresía que produce el aislamiento multi-inquilino, y de `CambiarPasswordUseCase`
(`cambiar-password.use-case.ts:74-84`) las tres reglas duras del manejo de credenciales.
Se expone en una ruta propia de `UsuariosController` con `AdminClienteGuard` por método, y
se consume desde un campo opcional dentro del `EditarUsuarioDialog` existente.

Nada nuevo en `domain/`: la entidad ya sabe hashear (`usuario.entity.ts:191`), el error ya
existe (`auth.errors.ts:157-163`) y el puerto de revocación ya existe
(`i-refresh-token.repository.ts:32`). El ciclo escribe **una** pieza de `application/`, dos
de `interface/` (ruta + DTO), el wiring, y tres archivos de frontend.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa hexagonal | Por qué |
|---|---|---|
| `ResetearPasswordUsuarioTenantUseCase` | **application** | Orquesta dominio y puertos; contiene la regla de autorización sobre el objetivo. Clase plana, sin decoradores de Nest, con `Result<void, DomainError>` — molde de sus dos precedentes |
| `UsuarioEntity.hashPassword()`, `MembresiaNoEncontradaError`, `UsuarioNoDisponibleError` | **domain** | Ya existen. **No se tocan** |
| `IUsuarioRepository`, `IMembresiaRepository`, `IHashProvider`, `IRefreshTokenRepository`, `ILogger` | **domain (puertos)** / **infrastructure (impl)** | Ya existen y ya están wireados en `auth.module.ts` |
| Ruta nueva en `usuarios.controller.ts` + `ResetearPasswordUsuarioDto` | **interface** | Traduce HTTP ↔ caso de uso y mapea `DomainError` → `HttpException`. Cero lógica de negocio |
| `AdminClienteGuard` | **infrastructure** (`infrastructure/guards/`) | Preexistente. **No se reescribe** (proposal, Out of Scope) |
| Provider en `auth.module.ts` | wiring | Molde exacto de `auth.module.ts:234-243` (el que ya inyecta hash + revocación + logger) |

Frontend — capas propias de esa app, todas del lado **interface** del hexágono:

| Pieza | Capa frontend |
|---|---|
| `schemas.ts` (Zod) | validación de borde — regla **DERIVADA**; la autoridad es `@MinLength(8)` del backend (`usuario-tenant.dto.ts:51`), se copia a mano y se dice en el JSDoc (`rules.specs`) |
| `hooks/use-usuarios-tenant-mutations.ts` | infrastructure — adaptador HTTP vía `apiFetch` + caché de TanStack Query |
| `editar-usuario-dialog.tsx` | container: estado del form, secuencia de mutaciones y mensajes |

### Autorización: los dos lugares donde vive (`rules.design`)

**1. Decoradores del borde.** `@UseGuards(JwtAuthGuard, TenantGuard)` a nivel de clase
(`usuarios.controller.ts:150`) más `@UseGuards(AdminClienteGuard)` **por método** en la ruta
nueva (ADR-P5). `AdminClienteGuard` evalúa `esAdminDeCliente(user)` contra el JWT del propio
actor (`admin-cliente.guard.ts:31-44`), **nunca consulta la DB y nunca mira al usuario
objetivo**. Responde una sola pregunta: *¿el actor es ADMINISTRADOR o ROOT?*

**2. Chequeos inline dentro del cuerpo.** Son dos, y los dos son indispensables:

- En el controller, `clienteId: actor.cliente_id as string` en el call site (molde
  `usuarios.controller.ts:271-276`). Si esa línea leyera un valor de la request, el guard
  seguiría pasando y el aislamiento desaparecería. El DTO **no declara** `clienteId`, y el
  `ValidationPipe` global con `whitelist: true` lo descartaría si llegara
  (`usuario-tenant.dto.ts:5-11`).
- En el caso de uso, `findActivaByUsuarioYCliente(usuarioId, clienteId)` antes de cargar al
  usuario. Es **lo único** que ata al objetivo con el inquilino del actor.

**Consecuencia para los tests, escrita porque es contraintuitiva**: ningún test de guard ni
de controller puede probar el aislamiento multi-inquilino, porque el guard no ve al objetivo.
El aislamiento se prueba **en el caso de uso**; el controller prueba solamente que el
`clienteId` que viaja al caso de uso sale del JWT.

---

## Architecture Decisions

### ADR-1: `PATCH /usuarios/:id/password`, 204 sin cuerpo

**Choice**: `@Patch(':id/password')` + `@UseGuards(AdminClienteGuard)` +
`@HttpCode(HttpStatus.NO_CONTENT)`.

| Alternativa | Por qué no |
|---|---|
| `PUT /usuarios/:id/password` | Semánticamente exacto (reemplazo total, idempotente), pero el controller **no usa `PUT` en ninguna de sus 8 rutas**: introducir un verbo para una sola ruta diverge del vocabulario del archivo sin comprar nada |
| `POST /usuarios/:id/reset-password` | `POST` en este controller está reservado a alta (`:196`) y a acciones con payload de configuración (`:382`). El reset muta un atributo de un sub-recurso, igual que `PATCH /:id/rol` (`:230`) |
| Extender `PATCH /usuarios/:id` | ADR-3 |

**Rationale**: `PATCH /:id/rol` es el molde literal — sub-recurso de un segmento, mutación,
guard por método. No hay riesgo de solapamiento con `@Patch(':id')` (`:264`): `:id` matchea
**un** segmento, así que `/usuarios/x/password` nunca cae ahí.

**204 sin cuerpo** no es cosmética: es la garantía **estructural** de que la contraseña en
claro no puede volver en la respuesta. No existe un DTO de respuesta que alguien pueda
ampliar más adelante.

**Mapeo de errores — `toHttpException` (`:136-148`) NO se modifica**:

| Error | HTTP | Vía |
|---|---|---|
| `MembresiaNoEncontradaError` | **404** | rama existente `:139-141` |
| `UsuarioNoDisponibleError` | **422** | fallthrough existente `:145-147` |

El 422 para "la cuenta global está inactiva" es semánticamente impreciso (409 sería mejor),
y se acepta a propósito: agregar una rama a una función compartida por 8 rutas para un
status que el frontend no ramifica —`notifyError` muestra `err.messages` sea cual sea el
código (`toast.ts:17-23`)— es costo de revisión sin cambio de comportamiento.

### ADR-2: qué toma de cada precedente, y qué deliberadamente NO toma

| De `EditarUsuarioTenantUseCase` | Se toma |
|---|---|
| `findActivaByUsuarioYCliente(usuarioId, clienteId)` primero, `MembresiaNoEncontradaError` si no hay (`:52-58`) | **Sí** — es el aislamiento |
| El **mismo** error cuando `findById` devuelve nulo (`:60-63`) | **Sí** — un admin ajeno no distingue "no existe" de "existe en otro inquilino"; sin esto el endpoint enumera usuarios entre inquilinos |
| `Pick<IRepo, ...>` en el constructor (`:45-46`) | **Sí** — el caso de uso declara exactamente los métodos que usa |

| De `CambiarPasswordUseCase` | ¿Se toma? |
|---|---|
| `usuario.hashPassword(plaintext, hashProvider)` (`:74`) | **Sí, regla dura.** Misma instancia de `IHashProvider` que verifica el login. Prohibido `argon2` directo |
| `save()` como punto de no retorno (`:75`) | **Sí** |
| `revokeAllByUsuarioId` en `try/catch` que no propaga, solo `logger.error` (`:77-84`) | **Sí** — ADR-4 |
| Guarda de disponibilidad `!activo \|\| isDeleted()` (`:61-63`) | **Sí** — ADR-5 |
| `verifyPassword(passwordActual)` (`:65-68`) | **No.** El admin no conoce la contraseña actual y no debe pedirla |
| Rechazo de `passwordNueva === passwordActual` en plaintext (`:70-72`) | **No.** No hay `passwordActual` contra qué comparar, y comparar contra el hash almacenado está prohibido: Argon2 saltea, dos hashes de la misma clave difieren siempre (`cambiar-password.use-case.ts:38-40`) |

Constructor resultante: `Pick<IUsuarioRepository,'findById'|'save'>`,
`Pick<IMembresiaRepository,'findActivaByUsuarioYCliente'>`, `IHashProvider`,
`Pick<IRefreshTokenRepository,'revokeAllByUsuarioId'>`, `ILogger`. Wiring con `useFactory`
sobre `USUARIO_REPOSITORY`, `MEMBRESIA_REPOSITORY`, `HASH_PROVIDER`,
`REFRESH_TOKEN_REPOSITORY`, `LOGGER` — molde de `auth.module.ts:234-243`.

### ADR-3: el botón "Guardar" dispara dos llamadas SECUENCIALES, identidad primero, con corte

Esta es la pregunta abierta que el proposal delegó (`proposal.md:75-77`).

**Choice**: en el `submit` del diálogo, con `mutateAsync` y `try/catch`:

1. Si `nombre`/`apellido` cambiaron respecto de los valores del row, `PATCH /usuarios/:id`.
   Si **falla, se corta ahí**: la segunda llamada nunca sale.
2. Solo si el campo de contraseña **no está vacío**, `PATCH /usuarios/:id/password`.
3. El diálogo se cierra **únicamente** si todo lo solicitado salió bien.

**Campo vacío = la segunda llamada no existe.** No se envía un body con `password: ""`, no se
manda un PATCH vacío al endpoint de credencial y el backend nunca ve una petición de reset
que no se pidió. Es la lectura literal de la decisión 1 del dueño y elimina el peor modo de
fallo del campo opcional: tocar `passwordHash` sin que nadie lo haya pedido.

**Por qué identidad primero**: colapsa la matriz de cuatro desenlaces a tres, **por
construcción**.

| # | Desenlace | ¿Alcanzable? | Estado real | Qué se le dice al admin | ¿Cierra? |
|---|---|---|---|---|---|
| 1 | Ambas ok (o solo identidad, con el campo vacío) | Sí | Todo guardado | `"Usuario actualizado."` / `"Usuario actualizado. Contraseña restablecida: las sesiones del usuario se cerraron."` | **Sí** |
| 2 | Identidad falla | Sí | **Nada cambió.** La credencial no se tocó | El mensaje del error (403/404/red) y, si había contraseña tipeada, `"No se guardó nada: la contraseña tampoco se cambió."` | **No** |
| 3 | Identidad ok + reset falla | Sí | Nombre/apellido guardados, contraseña **intacta** | `"Se guardaron nombre y apellido, pero la contraseña NO se cambió: <motivo>."` | **No** |
| 4 | Identidad falla + reset ok | **No, imposible** | — | — | — |

Los dos endpoints comparten guard de clase, guard de método y el mismo scoping por
membresía: los fallos probables (403, 404, sesión expirada, red) están **correlacionados**.
Poner primero la operación barata y reversible hace que esos fallos se detecten **antes** de
tocar la credencial, dejando el estado intacto. El orden inverso produciría el desenlace 4 —
contraseña cambiada, sesiones del usuario revocadas, y un cartel de error — que es el peor de
los cuatro.

**Por qué el diálogo no se cierra en 2 ni en 3**: cerrar destruye el form y con él la
contraseña tipeada; el admin se queda con un toast y sin forma de reintentar sin retipear.
Abierto, el reintento es un click. El reintento es seguro: repetir el PATCH de identidad con
los mismos valores es idempotente, y repetir el reset con el mismo plaintext deja la misma
contraseña utilizable (hash distinto, credencial equivalente) y vuelve a revocar sesiones ya
revocadas.

**Quién emite los mensajes**: el **diálogo**, no los hooks. Hoy `useEditarUsuarioTenant`
emite `notifySuccess("Usuario actualizado.")` en su `onSuccess` y `notifyError` en su
`onError` (`use-usuarios-tenant-mutations.ts:63-68`). En el desenlace 3 eso produciría un
toast **verde** que dice "Usuario actualizado" al lado de uno rojo — exactamente la
ambigüedad que este repo ya pagó cara: *éxito reportado, usuario afuera*
(`scripts/reset-password.ts:6-19`). Por eso el hook de identidad cede los toasts al diálogo y
conserva su `invalidateQueries`; el hook nuevo del reset nace sin toasts.

**Desvío declarado, con su evidencia**: modificar un hook compartido sería riesgoso, pero
`useEditarUsuarioTenant` tiene **un solo consumidor** — `editar-usuario-dialog.tsx:19,29` es
la única referencia en todo `frontend/src`. El radio de impacto es este mismo diálogo.

**Rejected — el endpoint combinado, y por qué no, pese a ser tentador**: hacer que
`PATCH /usuarios/:id` acepte `password?` **sí eliminaría** el fallo parcial de raíz.
`nombre`, `apellido` y `password_hash` viven en la misma fila de `master.usuarios`, así que un
caso de uso combinado haría `editar()` + `hashPassword()` + **un solo** `save()`: atómico de
verdad, no aparentemente atómico. Esa concesión es real y se deja escrita. No alcanza:

1. **Ensancha permanentemente una superficie de escalación de privilegios.** Hoy
   `EditarUsuarioDto` (`usuario-tenant.dto.ts:92-102`) garantiza, vía `whitelist: true`, que
   por la ruta de identidad **no existe** un campo que escriba credenciales. Agregarlo se lo
   regala a todo consumidor presente y futuro de esa ruta, y convierte cualquier cambio futuro
   sobre la edición de identidad en un riesgo de regresión de credenciales.
2. **Mezcla dos semánticas de fallo incompatibles.** La revocación de sesiones no debe
   propagar su fallo (regla heredada); "guardé el apellido" sí debe fallar si falla. Una sola
   respuesta no puede expresar las dos, y un caso de uso combinado necesitaría igual una rama
   interna "¿vino contraseña?" que reintroduce las dos semánticas adentro de un método.
3. **El fallo parcial que queda es acotado y benigno**: nombre guardado, contraseña intacta,
   mensaje explícito, diálogo abierto, reintento idempotente. Nada corrupto, nada
   silenciosamente mal, ningún agujero de seguridad.

El costo (atomicidad perdida) es menor que el beneficio (la ruta de identidad sigue sin poder
escribir credenciales). **La decisión del dueño se mantiene y este diseño la confirma con
evidencia, no por deferencia.**

### ADR-4: la revocación falla en silencio hacia afuera y ruidosa hacia el log

**Choice**: después del `save()`,
`try { await refreshTokenRepo.revokeAllByUsuarioId(usuarioId) } catch (error) { logger.error(...) }`.
El `Result` devuelto es `ok` **igual**.

**Qué observa el llamador**: 204, idéntico al camino feliz. El admin **no puede distinguir**
"sesiones revocadas" de "revocación fallida". Es deliberado y es el mismo trade-off ya
aceptado en el autocambio (`cambiar-password.use-case.ts:46-49`): devolver un fallo acá
mentiría sobre el estado de la credencial, que **ya cambió**, y empujaría al admin a
reintentar una operación que ya surtió efecto.

**Qué queda en el log**: `logger.error` con `usuarioId` y el `message` del error —
**nunca** el plaintext, ni entero ni parcial. El mensaje de éxito del frontend dice
"las sesiones del usuario se cerraron" porque ese es el contrato que se pidió; la degradación
es visible solo en el log, y así queda registrada.

**Consecuencia asumida**: ante un fallo silencioso, un refresh token viejo del usuario
reseteado puede seguir vivo hasta su expiración. No es una regresión de este ciclo: es la
propiedad que el autocambio ya tiene.

### ADR-5: se rechaza el reset sobre una cuenta global inactiva o soft-deleted

**Choice**: tras confirmar la membresía y cargar al usuario, `!usuario.activo ||
usuario.isDeleted()` → `UsuarioNoDisponibleError` (422). Diverge de
`EditarUsuarioTenantUseCase`, que no tiene esa guarda.

**Rationale**: `LoginUseCase` rechaza exactamente esa condición antes de mirar la contraseña
(`login.use-case.ts:111`). Sin la guarda, el admin recibe 204, le comunica la contraseña
nueva al usuario, y el usuario **no puede entrar** — el patrón exacto del incidente de
`scripts/reset-password.ts`: éxito reportado, usuario afuera. Editar un nombre sobre una
cuenta inactiva es inocuo; escribir una credencial que no va a funcionar, no.

**No filtra información entre inquilinos**: la guarda corre **después** de confirmar una
membresía activa en el cliente del actor, así que el actor ya sabe que ese usuario existe en
su inquilino.

**Coordinación con `sdd-spec`**: este comportamiento no está entre los 7 de
`proposal.md:66-73`. El proposal delega el punto (*"Error nuevo solo si el diseño lo
justifica"*, `:62`) y `UsuarioNoDisponibleError` ya existe, así que está dentro del mandato —
pero **`specs/` debe absorberlo como escenario**. Queda anotado en Open Questions.

### ADR-6: el campo se suma al schema existente con confirmación, no con `.optional()`

**Choice**: `editarUsuarioSchema` (`frontend/src/features/usuarios/schemas.ts:39-52`) suma
`password` y `repetirPassword` como `z.string()` (cadena vacía = "no cambiar") y un
`.superRefine` que **solo valida si `password` no está vacío**.

```ts
// frontend/src/features/usuarios/schemas.ts
// `repetirPassword` es SOLO del cliente: NUNCA viaja al backend.
// El `min(8)` es DERIVADO de `@MinLength(8)` del backend (usuario-tenant.dto.ts:51),
// la misma autoridad que espeja `crearUsuarioTenantSchema` (:28).
.superRefine((data, ctx) => {
  if (data.password === "") return;              // vacío = no cambiar
  if (data.password.length < 8) ctx.addIssue({ path: ["password"], message: "Mínimo 8 caracteres" });
  if (data.password !== data.repetirPassword)
    ctx.addIssue({ path: ["repetirPassword"], message: "Las contraseñas no coinciden" });
});
```

**Por qué la confirmación**: los dos campos van `type="password"` (enmascarados), así que el
admin no puede releer lo que tipeó — y tiene que comunicárselo al usuario fuera del sistema
(decisión 2 del dueño). Un error de tipeo deja al usuario afuera con una contraseña que solo
conoce un teclado. Tipearla dos veces **es** la relectura. Es el molde textual de
`cambiarPasswordSchema` (`frontend/src/features/auth/schemas.ts:25-34`), incluido el mensaje
"Las contraseñas no coinciden".

**Rejected**: `password: z.string().min(8).optional()` — con react-hook-form un input de
texto vacío llega como `""`, no como `undefined`, así que `.optional()` no expresa
"no cambiar" sin normalizar antes; y mostrar el campo en claro (`type="text"`) agrega la
superficie humana de exposición que la exploración señaló (`exploration.md:71`) a cambio de
una relectura que la confirmación ya da.

---

## Data Flow

```
EditarUsuarioDialog — submit
  │
  ├─ identidad cambió? ──no──┐
  │         │sí              │
  │   PATCH /usuarios/:id ───┼── falla ──→ toast de error + "no se cambió la contraseña"
  │         │ok              │             DIÁLOGO ABIERTO · credencial INTACTA (desenlace 2)
  ├─────────┴────────────────┘
  │
  ├─ password === "" ──sí──→ toast "Usuario actualizado." · CIERRA (desenlace 1)
  │        │no
  │  PATCH /usuarios/:id/password  { password }
  │        │
  │        ├─ falla ──→ "Se guardaron nombre y apellido, pero la contraseña NO se cambió"
  │        │            DIÁLOGO ABIERTO (desenlace 3)
  │        └─ 204 ────→ toast de éxito + sesiones cerradas · CIERRA (desenlace 1)
  ▼
UsuariosController.resetearPassword           @UseGuards(AdminClienteGuard)   ← borde: ¿el ACTOR es admin?
  clienteId = actor.cliente_id  (JWT, NUNCA del body)                         ← inline #1
  ▼
ResetearPasswordUsuarioTenantUseCase
  1. membresiaRepo.findActivaByUsuarioYCliente(usuarioId, clienteId)          ← inline #2: AISLAMIENTO
        └─ null ──→ MembresiaNoEncontradaError ──→ 404
  2. usuarioRepo.findById(usuarioId)
        └─ null ──→ MembresiaNoEncontradaError ──→ 404   (MISMO error: no enumera)
  3. !activo || isDeleted() ──→ UsuarioNoDisponibleError ──→ 422              (ADR-5)
  4. usuario.hashPassword(password, hashProvider)          ← ÚNICA vía. Nunca argon2 directo
  5. usuarioRepo.save(usuario)                             ← punto de no retorno
  6. try { refreshTokenRepo.revokeAllByUsuarioId(usuarioId) }
     catch { logger.error(usuarioId + motivo) }            ← NO propaga · NUNCA el plaintext
  7. Result.ok(void)                                       ──→ 204 SIN CUERPO
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.ts` | Create | El caso de uso completo (ADR-2, ADR-4, ADR-5) |
| `backend/src/auth/application/use-cases/resetear-password-usuario-tenant.use-case.spec.ts` | Create | Aislamiento, no-enumeración, hash, revocación degradada, plaintext |
| `backend/src/auth/interface/controllers/usuarios.controller.ts` | Modify | `@Patch(':id/password')` + `@UseGuards(AdminClienteGuard)` + `@HttpCode(NO_CONTENT)`, junto a `editar()` (`:264-283`). Se actualiza el mapa de rutas del JSDoc de cabecera (`:5-13`) |
| `backend/src/auth/interface/dtos/usuario-tenant.dto.ts` | Modify | `ResetearPasswordUsuarioDto { @IsString() @MinLength(8) password }`. Sin `clienteId` |
| `backend/src/auth/auth.module.ts` | Modify | Provider `useFactory` con los 5 tokens (ADR-2) |
| `backend/src/auth/interface/controllers/usuarios.controller.spec.ts` | Modify | 403 sin admin; `clienteId` del JWT; 404; 204 sin cuerpo |
| `backend/src/auth/domain/**` | **Sin cambios** | La entidad, los errores y los puertos ya existen |
| `backend/scripts/reset-password.ts` · `backend/src/notificaciones/**` | **Sin cambios** | Proposal, Out of Scope |
| `frontend/src/features/usuarios/schemas.ts` | Modify | `password` + `repetirPassword` + `superRefine` (ADR-6) |
| `frontend/src/features/usuarios/types.ts` | Modify | `ResetearPasswordUsuarioDto { password: string }` |
| `frontend/src/features/usuarios/hooks/use-usuarios-tenant-mutations.ts` | Modify | `useResetearPasswordUsuarioTenant` (sin toasts); `useEditarUsuarioTenant` cede sus toasts al diálogo y conserva `invalidateQueries` (ADR-3) |
| `frontend/src/features/usuarios/components/editar-usuario-dialog.tsx` | Modify | Dos campos `type="password"`, secuencia con corte, mensajes por desenlace, cierre condicional |
| `frontend/src/features/usuarios/components/editar-usuario-dialog.test.tsx` | Modify | Los tres desenlaces alcanzables + campo vacío |
| `frontend/src/features/usuarios/components/usuarios-admin-view.tsx` | **Sin cambios** | El diálogo ya está montado (`:54`); no hace falta un control nuevo |
| `backend/ayuda/*.md` | **Sin cambios** | Pausa vigente desde 2026-09-07. La deuda se anota en el commit y en el PR |

---

## Interfaces / Contracts

```ts
// application — sin decoradores de Nest, Result en vez de throw
export interface ResetearPasswordUsuarioTenantInput {
  /** SIEMPRE `actor.cliente_id` del JWT. Nunca un valor de la request. */
  clienteId: string;
  usuarioId: string;
  /** Plaintext. No se loguea, no se imprime, no vuelve en la respuesta. */
  password: string;
}
export type ResetearPasswordUsuarioTenantError =
  | MembresiaNoEncontradaError
  | UsuarioNoDisponibleError;
```

```
PATCH /usuarios/:id/password
  Guards:   JwtAuthGuard + TenantGuard (clase) · AdminClienteGuard (método)
  Body:     { "password": string }          // min 8
  204 No Content — sin cuerpo
  403 — el actor no es ADMINISTRADOR ni ROOT
  404 — sin membresía activa en el cliente del token, O el usuario no existe (MISMO cuerpo)
  422 — la cuenta global está inactiva o soft-deleted
```

---

## Superficie de escalación de privilegios

Este endpoint escribe la credencial de un tercero. Cada fila es un modo de fallo concreto, no
una categoría.

| Si este chequeo falla | Abuso concreto | Test que DEBE existir |
|---|---|---|
| Falta `@UseGuards(AdminClienteGuard)` en el método nuevo | Cualquier TECNICO o SOLICITANTE autenticado fija la contraseña de **cualquier usuario de su inquilino, incluido su propio administrador** → toma de control del inquilino desde adentro | Controller: actor sin `esAdminDeCliente` → **403**, asertado **sobre esta ruta**, jamás heredado de una hermana |
| `clienteId` sale del body o del path en vez del JWT | Un admin del cliente A fija la contraseña de un admin del cliente B → se rompe la propiedad crítica del producto | Caso de uso: `findActivaByUsuarioYCliente` recibe `(usuarioId, clienteIdDelActor)`. Controller: el caso de uso recibe `actor.cliente_id` aunque el body traiga otro |
| La búsqueda de membresía ignora `activo`, o `findById` corre antes | Un ex-miembro con membresía desactivada sigue siendo reseteable | Caso de uso: membresía inactiva/ausente → `MembresiaNoEncontradaError` y **`usuarioRepo.save` nunca se llama** |
| `findById` nulo devuelve un error distinto | Enumeración entre inquilinos: el admin de A distingue "no existe" de "existe en B" | Caso de uso: usuario inexistente y usuario de otro inquilino producen el **mismo** error y el mismo cuerpo HTTP |
| Se hashea con `argon2` directo | El incidente de `scripts/reset-password.ts:6-19`: 204 devuelto, hash que `LoginUseCase` no valida, usuario afuera **después** de que el admin ya le comunicó la contraseña | Caso de uso: el hash guardado se verifica con **la misma instancia** de `IHashProvider`. Es el blanco #1 de la mutación adversarial de `sdd-verify` |
| La revocación propaga su fallo | 500 tras un `save()` exitoso: el admin cree que no cambió nada y comunica la contraseña vieja | Caso de uso: `revokeAllByUsuarioId` rechaza → resultado `ok` + `logger.error` llamado |
| El plaintext viaja a un log, a un error o a la respuesta | La contraseña queda en el agregador de logs al lado del `usuarioId` | Caso de uso: el argumento de `logger.error` **no contiene** el plaintext. Controller: la respuesta 204 no tiene cuerpo |
| El campo vacío igual dispara la segunda llamada | Se reescribe `passwordHash` y se revocan sesiones al editar un apellido | Componente: con el campo vacío, `fetch` al endpoint de password **no ocurre** |

---

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (caso de uso) | Las 8 filas de la tabla de arriba, con dobles de los 5 puertos | `resetear-password-usuario-tenant.use-case.spec.ts`, molde de `cambiar-password.use-case.spec.ts` |
| Unit (controller) | 403 sin admin; `clienteId` del JWT y no del body; 404; 204 sin cuerpo | `usuarios.controller.spec.ts` (existente), `Test.createTestingModule` con el caso de uso mockeado |
| Unit (schema) | Vacío es válido; 7 caracteres rechaza; contraseñas distintas marcan `repetirPassword`; `repetirPassword` no viaja en el payload | `usuarios/schemas` |
| Componente | Los **tres** desenlaces alcanzables de ADR-3, cada uno con su mensaje y su estado de cierre; y el caso "campo vacío ⇒ una sola llamada" | `editar-usuario-dialog.test.tsx` (existente) con MSW |
| Integración / e2e | **No se agregan.** Ni `editar-usuario-tenant` ni `cambiar-password` tienen `*.integration.spec.ts`; el aislamiento es lógica pura del caso de uso y se prueba ahí | — |

Ningún test imprime ni asserta contra la contraseña en claro salvo para verificar su
**ausencia**.

---

## Threat Matrix

**N/A** — las cinco filas de `references/threat-matrix.md` cubren rutas tipo documentación,
selección de repositorio Git, estado de commit, estado de push y comandos de PR. Este cambio
no ejecuta shell, subprocesos, ni automatización de VCS/PR, y no clasifica archivos
ejecutables. El único borde adversarial real es el de **autorización HTTP**, y tiene su
propia sección arriba con su matriz de abusos y sus tests RED asociados; esa tabla, no esta,
es la que `sdd-tasks` debe propagar.

---

## Migration / Rollout

Sin migración, sin backfill, sin feature flag. `master.usuarios.password_hash` ya existe y el
reset solo lo sobrescribe; ninguna columna se agrega y ninguna fila cambia de forma.

**Rollback**: `git revert`. Las contraseñas establecidas mientras la funcionalidad estuvo
viva **siguen siendo válidas** —están hasheadas con el mismo `IHashProvider` que verifica el
login (ADR-2)— y las sesiones revocadas siguen revocadas. Solo desaparece la capacidad de
volver a hacerlo desde la UI; `scripts/reset-password.ts` queda intacto como mecanismo de
última instancia.

---

## Work Units y presupuesto de revisión

El presupuesto de 400 líneas queda superado (estimación del proposal: ~430-610). Corte
natural en dos unidades entregables, cada una con sus tests adentro y revertible sola:

| # | Unidad | Alcance |
|---|---|---|
| 1 | Backend del reset | Caso de uso + DTO + ruta + wiring + los dos specs. Entrega valor sola: el endpoint queda disponible y probado, sin consumidor de UI |
| 2 | El campo en el diálogo | Schema, tipos, los dos hooks, el diálogo con su secuencia de ADR-3 y sus tests. Depende de la 1 |

El **Review Workload Forecast formal**, con sus tres líneas de guarda y la decisión de
encadenamiento bajo `delivery_strategy: ask-on-risk`, es trabajo de `sdd-tasks`. Este diseño
no lo decide: deja el corte propuesto.

---

## Open Questions

- [ ] **Coordinación con `sdd-spec` (ADR-5)**: la guarda de disponibilidad
  (`!activo || isDeleted()` → 422) no está entre los 7 comportamientos verificables de
  `proposal.md:66-73`. El diseño la justifica y está dentro del mandato delegado
  (`proposal.md:62`), pero `specs/` debe absorberla como escenario o `sdd-verify` verá una
  divergencia diseño↔spec. **El orquestador debe reconciliarlo antes de `sdd-tasks`.**
- [ ] **Coordinación con `sdd-spec` (ADR-3)**: el comportamiento 6 del proposal
  (*"con el campo vacío, guardar no modifica la contraseña"*) se satisface porque la segunda
  llamada **no se emite**. Si `specs/` lo redacta como una propiedad del backend en vez de
  una del cliente, el escenario quedará sin implementación que lo satisfaga.
- [ ] **No bloqueante**: el admin no puede distinguir "sesiones revocadas" de "revocación
  fallida" (ADR-4). Es el trade-off heredado del autocambio y queda como seguimiento, no como
  deuda de este ciclo.
