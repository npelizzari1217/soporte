# Spec Delta: frontend-shell — Req 4 Tenant Display completado

> Delta sobre: `openspec/specs/frontend-shell/spec.md`
> Capability: `frontend-shell` — Requirement 4 "Display del tenant activo en el header del sidebar"
> Change: `auth-cliente-nombre`
> Cierra: W3 (Req 4 PARCIAL) del change `frontend-shell`
> Archivo afectado: `frontend/src/components/shell/sidebar.tsx`

## Contexto del delta

El spec canónico `frontend-shell` Requirement 4 "Display del tenant activo en el
header del sidebar" estaba en estado **PARCIAL (W3)**: el sidebar renderizaba el
texto estático "Soporte" en lugar del nombre real del cliente, porque el claim
`cliente_nombre` no estaba disponible en el JWT (el comentario en `sidebar.tsx`
lo documenta explícitamente: "clienteNombre is not yet in JwtPayload").

Este delta **cierra W3 y promueve Req 4 a estado COMPLETO**:

- Cuando `cliente_nombre` está presente en el JWT: el header del sidebar muestra
  el nombre real del cliente (sustituye "Soporte").
- Cuando `cliente_nombre` está ausente (tokens emitidos antes de este change):
  el sidebar degrada elegantemente al comportamiento actual — brand "Soporte" +
  avatar con la inicial del email del usuario.

Los dos scenarios canónicos de Req 4 en `openspec/specs/frontend-shell/spec.md`
("Nombre del tenant activo es visible" y "No existe control de tenant switcher")
permanecen vigentes. Este delta los complementa con scenarios de nombre real vs.
fallback; no los reemplaza.

---

## Requirement: Sidebar muestra `cliente_nombre` cuando el claim está presente

Cuando el JWT del usuario autenticado contiene el claim `cliente_nombre`, el
header del sidebar MUST renderizar ese valor como el nombre del tenant. El texto
estático "Soporte" MUST NOT aparecer cuando el claim está disponible y es un
string no vacío.

El elemento de display MUST seguir siendo de solo lectura (sin control de tenant
switcher), en cumplimiento del Req 4 canónico.

### Scenario: Header del sidebar muestra el nombre real del cliente

**Given** el usuario está autenticado con un JWT que contiene `cliente_nombre: "Acme Corp"`
**When** el sidebar renderiza
**Then** el header del sidebar MUST mostrar el texto "Acme Corp"
**And** MUST NOT mostrar el texto estático "Soporte"
**And** el elemento de display MUST ser de solo lectura (no `<button>`, `<select>`,
  `<input>` ni ningún control interactivo)
**And** el texto MUST ser legible con contraste WCAG AA en modo oscuro y modo claro

### Scenario: El nombre mostrado es el del cliente del usuario autenticado

**Given** `usuarioA` está autenticado con un JWT que contiene `cliente_nombre: "Acme Corp"`
  y `cliente_id` correspondiente al cliente "Acme Corp"
**When** el sidebar renderiza
**Then** el header MUST mostrar "Acme Corp"
**And** MUST NOT mostrar el nombre de ningún otro cliente

### Scenario: El avatar con la inicial del email sigue presente cuando hay `cliente_nombre`

**Given** el usuario está autenticado con un JWT que contiene `cliente_nombre: "Acme Corp"`
**And** el email del usuario es "juan@ejemplo.com"
**When** el sidebar renderiza
**Then** el header MUST mostrar "Acme Corp" como nombre del cliente
**And** MUST seguir mostrando el avatar con la inicial "J" del email del usuario
**And** el avatar MUST conservar su posicionamiento actual (extremo derecho del header)

---

## Requirement: Fallback obligatorio cuando `cliente_nombre` está ausente

Cuando el JWT del usuario NO contiene el claim `cliente_nombre` — sea porque fue
emitido antes de este change o por cualquier otro edge case — el sidebar MUST
degradar elegantemente al comportamiento actual: mostrar el brand "Soporte" y el
avatar con la inicial del email del usuario. MUST NOT ocurrir ningún error de
rendering ni mostrar texto vacío o el valor `undefined`.

Este fallback es OBLIGATORIO y garantiza compatibilidad hacia atrás con sesiones
activas al momento del deploy.

### Scenario: Header muestra fallback cuando el claim `cliente_nombre` está ausente

**Given** el usuario está autenticado con un JWT que NO contiene el claim `cliente_nombre`
  (token emitido antes de este change)
**When** el sidebar renderiza
**Then** el header MUST mostrar el texto "Soporte" (brand fallback)
**And** MUST mostrar el avatar con la inicial del email del usuario
**And** MUST NOT renderizar el string `"undefined"`, un string vacío, ni lanzar ningún error

### Scenario: String vacío en `cliente_nombre` activa el fallback

**Given** el usuario está autenticado con un JWT que contiene `cliente_nombre: ""`
  (string vacío — caso defensivo)
**When** el sidebar renderiza
**Then** el header MUST tratar el string vacío como claim ausente y aplicar el fallback
**And** MUST mostrar "Soporte" + avatar con la inicial del email del usuario
**And** MUST NOT mostrar un string vacío como nombre del cliente

### Scenario: Transición al obtener un JWT con `cliente_nombre` actualiza el display

**Given** el sidebar muestra el fallback "Soporte" porque el JWT activo no tenía `cliente_nombre`
**When** el usuario realiza un nuevo login (o el token se renueva exitosamente) y el nuevo
  JWT contiene `cliente_nombre: "Acme Corp"`
**Then** el sidebar MUST mostrar "Acme Corp" a partir del próximo render post-actualización
  del JWT
**And** MUST NOT requerir una recarga de página o acción adicional del usuario para
  que el nombre aparezca (la actualización es reactiva al cambio de sesión)

---

## Cierre de W3 — Req 4 promovido a COMPLETO

El Requirement 4 "Display del tenant activo en el header del sidebar" del spec
canónico `frontend-shell` pasa de **PARCIAL (W3)** a **COMPLETO** con este delta.

Estado antes de este change:
- El header mostraba "Soporte" (brand estático) — no el nombre real del cliente.
- W3 documentado en el comment de `sidebar.tsx`: "clienteNombre is not yet in JwtPayload".

Estado después de este change:
- El header muestra el nombre real del cliente cuando `cliente_nombre` está en el JWT.
- El fallback "Soporte" + inicial cubre tokens emitidos antes del deploy.
- Req 4 completo: se muestra el nombre del tenant activo, sin control de switcher.

Los scenarios canónicos de Req 4 en `openspec/specs/frontend-shell/spec.md`
quedan sin modificación; los scenarios de este delta los complementan con las
condiciones de nombre real vs. fallback.

---
