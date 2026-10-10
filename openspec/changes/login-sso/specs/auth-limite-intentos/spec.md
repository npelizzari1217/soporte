# Delta for Auth Límite de Intentos

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)", incluida la precisión del mensaje genérico único (P2). Trazabilidad completa en `auth-sso-login`.

## ADDED Requirements

### Requirement: I9 El ingreso por SSO se limita por proveedor, sujeto e IP

El ingreso por SSO DEBE limitarse con una clave propia compuesta por el proveedor, un derivado no reversible del sujeto del proveedor y la IP del navegador (`sso:<proveedor>:<derivado del sujeto>:<ip>`), con el mismo criterio de I1 (5 fallos en 15 minutos), I2 (un éxito reinicia) y I8 (persistido). La clave DEBE reservarse recién después de validar la firma del token, y los pasos baratos previos (`state`, enlace del navegador) DEBEN rechazarse antes de cualquier llamada saliente y sin consumir esta clave. Todo rechazo posterior (usuario inexistente, vínculo de otra cuenta, ROOT, inactivo, sin membresías) DEBE contar como fallo de esta clave. Un intento bloqueado DEBE responder igual que cualquier otro rechazo del SSO (la falla genérica), también con un token válido. El sistema NO DEBE limitar el inicio del flujo solo por IP. El contador del paso de código (I6) NO DEBE verse afectado.

#### Scenario: Cinco rechazos bloquean la clave

- GIVEN 4 rechazos de una misma clave `sso:` dentro de 15 minutos
- WHEN ocurre un quinto rechazo
- THEN la clave queda bloqueada por el resto de la ventana

#### Scenario: Bloqueado con token válido

- GIVEN una clave `sso:` bloqueada
- WHEN llega un token válido de un usuario aceptable
- THEN la respuesta es la falla genérica, idéntica a la de otros rechazos, y no hay desafío ni ticket

#### Scenario: Un éxito reinicia el contador

- GIVEN 4 rechazos de una clave
- WHEN ocurre un ingreso aceptado y luego un rechazo
- THEN el contador vale 1

#### Scenario: Otra IP o sujeto no se ven afectados

- GIVEN una clave bloqueada para la IP A
- WHEN el mismo sujeto ingresa desde la IP B
- THEN no está bloqueado

#### Scenario: State inválido no consume la clave

- GIVEN callbacks con `state` inválido o sin cookie de enlace
- WHEN se evalúa cualquier clave `sso:`
- THEN ningún contador cambia

#### Scenario: El inicio del flujo no se limita por IP

- GIVEN muchos inicios de flujo desde una misma IP
- WHEN se inicia otro
- THEN no se rechaza por límite de intentos

#### Scenario: La clave cabe en el almacén

- GIVEN un sujeto de Microsoft `<tid>:<oid>`
- WHEN se arma la clave
- THEN su longitud no excede el máximo del campo de claves del límite
