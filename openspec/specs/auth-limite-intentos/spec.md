# Auth Límite de Intentos — Specification

## Purpose

Definir el límite de intentos fallidos del paso de contraseña y del paso de código, hoy inexistente, sin permitir que un tercero bloquee a un usuario ni filtrar existencia de cuentas.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": viñeta de "Límite de intentos" y precisión sobre contraseña por usuario e IP y código por usuario. Trazabilidad completa en `auth-2fa-totp`. El "orden de 5 cada 15 minutos" de la viñeta queda fijado como exactamente 5 fallos en 15 minutos.

## Definiciones

- **Ventana**: 15 minutos.
- **Fallo**: intento rechazado por credencial o código incorrecto. Los intentos exitosos y los bloqueados NO cuentan.
- **Clave de contraseña**: email normalizado + IP del navegador. **Clave de código**: usuario.

## Requirements

### Requirement: I1 Cinco fallos en 15 minutos bloquean el resto de la ventana

El sistema DEBE bloquear la clave al llegar a 5 fallos dentro de 15 minutos, por el resto de esa ventana. Solo los fallos cuentan.

#### Scenario: Quinto fallo

- GIVEN 4 fallos recientes de una clave
- WHEN ocurre un quinto fallo dentro de los 15 minutos
- THEN la clave queda bloqueada hasta que termine la ventana

#### Scenario: Logins exitosos no cuentan

- GIVEN un usuario que inicia sesión 6 veces con éxito en 15 minutos
- WHEN hace un séptimo login correcto
- THEN no está bloqueado

#### Scenario: Fuera de la ventana

- GIVEN 4 fallos de hace más de 15 minutos
- WHEN ocurre un fallo nuevo
- THEN cuenta como el primero de una ventana nueva

### Requirement: I2 Un éxito reinicia el contador

Un intento exitoso DEBE reiniciar el contador de fallos de la clave.

#### Scenario: Reinicio

- GIVEN 4 fallos de una clave
- WHEN ocurre un intento correcto y luego un fallo
- THEN el contador vale 1

### Requirement: I3 El paso de contraseña se limita por email normalizado e IP

El contador del paso de contraseña DEBE usar como clave el email normalizado (sin distinguir mayúsculas ni espacios laterales) junto con la IP del navegador. Intentos con la misma cuenta desde otra IP NO DEBEN compartir el contador. El email inexistente DEBE contar igual que uno existente.

#### Scenario: Normalización

- GIVEN 3 fallos con `Ana@X.com` y 2 con ` ana@x.com `, desde la misma IP
- WHEN se evalúa el contador
- THEN la clave llegó a 5 fallos y está bloqueada

#### Scenario: Otra IP no se ve afectada

- GIVEN una clave bloqueada para la IP A
- WHEN el mismo usuario inicia sesión desde la IP B con credenciales correctas
- THEN el login procede

#### Scenario: Email inexistente

- GIVEN 5 fallos con un email que no existe
- WHEN se intenta otra vez
- THEN se bloquea igual que para un email existente

### Requirement: I4 La IP la fija el BFF

El backend DEBE tomar la IP del navegador solo de lo que reenvía el BFF; el cliente NO DEBE poder fijarla por sí mismo hacia el backend. Si el BFF no la envía, el sistema DEBE aplicar un valor determinístico y no omitir el límite.

#### Scenario: Cabecera de IP falsificada por el navegador

- GIVEN una petición que no pasó por el BFF con una IP elegida por el atacante
- WHEN llega al backend
- THEN esa IP no se toma como IP del navegador

#### Scenario: El BFF reenvía la IP

- GIVEN un login hecho a través del BFF
- WHEN el BFF llama al backend
- THEN la clave de contraseña usa la IP real del navegador

### Requirement: I5 El bloqueo responde como credenciales inválidas

Un intento de contraseña bloqueado DEBE responder exactamente igual que unas credenciales inválidas (mismo código, cuerpo y cabeceras), también con contraseña correcta.

#### Scenario: Bloqueado con contraseña correcta

- GIVEN una clave bloqueada
- WHEN se envía la contraseña correcta
- THEN la respuesta es idéntica a la de credenciales inválidas y no hay sesión

### Requirement: I6 El paso de código se limita por usuario

El contador del paso de código DEBE usar el usuario como clave. Las acciones de autogestión que piden un código válido (desactivar, regenerar, cambiar de celular, confirmar enrolamiento) DEBEN compartir ese mismo contador.

#### Scenario: Cinco códigos incorrectos

- GIVEN un desafío vigente
- WHEN se envían 5 códigos incorrectos
- THEN el usuario queda bloqueado en el paso de código por el resto de la ventana

#### Scenario: Autogestión comparte el contador

- GIVEN 3 códigos incorrectos en el login y 2 al intentar desactivar el 2FA
- WHEN se evalúa el contador del usuario
- THEN está bloqueado

### Requirement: I7 Bloqueado no acepta ni el código correcto

Con el paso de código bloqueado, el sistema DEBE rechazar todo código, incluido uno correcto, y NO DEBE contarlo como un fallo más.

#### Scenario: Código correcto durante el bloqueo

- GIVEN un usuario bloqueado en el paso de código
- WHEN envía el código vigente correcto
- THEN se rechaza y no se emite sesión

#### Scenario: Fin de la ventana

- GIVEN un bloqueo cuya ventana terminó
- WHEN envía el código correcto
- THEN se acepta

### Requirement: I8 El estado del límite sobrevive a un reinicio

Los contadores DEBEN persistirse fuera de la memoria del proceso: un reinicio o un deploy NO DEBE reiniciarlos.

#### Scenario: Reinicio del proceso

- GIVEN una clave con 5 fallos
- WHEN el servicio se reinicia
- THEN la clave sigue bloqueada hasta que termine la ventana

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
