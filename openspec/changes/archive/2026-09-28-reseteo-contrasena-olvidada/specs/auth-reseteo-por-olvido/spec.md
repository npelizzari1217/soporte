# Auth Reseteo Por Olvido Specification

## Purpose

Reset de contraseña self-service por email: solicitud pública
anti-enumeración, token de un solo uso con vencimiento, confirmación,
revocación de sesiones y mail de confirmación. No reemplaza el reset por
admin (`usuarios-reset-password`). TTL, límites de rate limiting y nombres
de ruta quedan fijados en `sdd-design`.

## Requirements

### Requirement: La solicitud de reset devuelve una respuesta uniforme

El sistema DEBE devolver la misma respuesta genérica en `POST
/auth/forgot-password` sin importar existencia del email, actividad de la
cuenta, cantidad de membresías (0, 1, 2+), disponibilidad de SMTP del
tenant, o ausencia de `EMAIL_CRYPTO_KEY`. Solo con exactamente 1 membresía
activa y SMTP configurado el sistema envía mail.

#### Scenario: Ningún caso sin mail se distingue

- GIVEN email inexistente, cuenta inactiva/soft-deleted, 0 o 2+ membresías,
  tenant sin SMTP, o `EMAIL_CRYPTO_KEY` ausente
- WHEN se solicita el reset
- THEN la respuesta es genérica y no se envía mail

#### Scenario: El caso con mail responde igual

- GIVEN email existente, cuenta activa, 1 membresía activa, tenant con SMTP
- WHEN se solicita el reset
- THEN la respuesta es idéntica a la anterior y se envía el mail

### Requirement: La solicitud no filtra información por tiempo de respuesta

El sistema DEBE emitir la respuesta antes de ejecutar cualquier trabajo que
dependa de la rama (existencia del email, estado de la cuenta, cantidad de
membresías, configuración SMTP del tenant). El código, el cuerpo y los
headers de la respuesta DEBEN ser idénticos en todas las ramas.

#### Scenario: La respuesta no espera el trabajo dependiente de la rama

- GIVEN un envío de mail simulado que queda bloqueado sin resolver
- WHEN se solicita el reset para un email que activaría ese envío
- THEN la respuesta llega igual, sin esperar a que el envío se resuelva

#### Scenario: El handler no espera el trabajo posterior a la respuesta

- GIVEN el manejador de la solicitud de reset
- WHEN procesa la petición
- THEN responde sin awaitear la búsqueda del usuario, el conteo de
  membresías, la emisión del token ni el envío del mail

#### Scenario: Código, cuerpo y headers son idénticos en toda rama

- GIVEN un email existente con 1 membresía activa y tenant con SMTP, y un
  email inexistente
- WHEN se solicita el reset con cada uno
- THEN el código de estado, el cuerpo y los headers de la respuesta son
  idénticos

### Requirement: El token es opaco y solo su hash se persiste

El sistema DEBE generar un token de 32 bytes y persistir únicamente su
SHA-256; el crudo viaja solo en el link del mail. DEBE aplicar un TTL de
vencimiento fijado en diseño.

#### Scenario: La base solo guarda el hash

- GIVEN una solicitud con mail enviado
- WHEN se emite el token
- THEN se persiste solo su SHA-256 y el crudo no se persiste

### Requirement: Emitir un token nuevo revoca los vigentes del usuario

El sistema DEBE revocar todo token de reset vigente del usuario antes de
emitir uno nuevo.

#### Scenario: Una segunda solicitud invalida el link anterior

- GIVEN un token vigente sin usar
- WHEN el mismo usuario solicita un nuevo reset
- THEN el anterior queda revocado y su confirmación se rechaza

### Requirement: Confirmar cambia la contraseña como máximo una vez bajo concurrencia

El sistema DEBE usar compare-and-swap sobre el token para que dos
confirmaciones concurrentes con el mismo token cambien la contraseña a lo
sumo una vez.

#### Scenario: Dos confirmaciones concurrentes con el mismo token

- GIVEN un token vigente sin usar
- WHEN dos confirmaciones concurrentes llegan con contraseñas distintas
- THEN como máximo una cambia la contraseña

### Requirement: Confirmar con un token inválido responde igual sin importar la causa

El sistema DEBE devolver el mismo rechazo genérico cuando el token está
vencido, usado, revocado o es desconocido.

#### Scenario: Las cuatro causas son indistinguibles

- GIVEN un token vencido, usado, revocado, o inexistente
- WHEN se intenta confirmar con él
- THEN la respuesta es el mismo rechazo genérico en los cuatro casos

### Requirement: La contraseña nueva respeta el mínimo de alta y usa el hasher del login

El sistema DEBE exigir el mismo mínimo de 8 caracteres que
`cambiar-password.use-case.ts` y hashear únicamente vía
`UsuarioEntity.hashPassword()`.

#### Scenario: Contraseña corta se rechaza sin tocar passwordHash

- GIVEN una confirmación con menos de 8 caracteres
- WHEN se intenta confirmar
- THEN se rechaza y `passwordHash` no cambia

#### Scenario: El login usa la contraseña nueva tras el reset

- GIVEN un reset confirmado con éxito
- WHEN el usuario intenta loguearse
- THEN funciona con la contraseña nueva y falla con la anterior

### Requirement: Las sesiones se revocan tras un reset exitoso sin condicionar la respuesta

El sistema DEBE revocar todas las sesiones activas tras persistir la
contraseña nueva. Un fallo de revocación NO DEBE propagarse como error.

#### Scenario: Reset exitoso revoca las sesiones activas

- GIVEN un usuario con sesiones activas
- WHEN confirma el reset con éxito
- THEN reporta éxito y las sesiones previas quedan revocadas

#### Scenario: Un fallo de revocación no deshace el reset

- GIVEN que `revokeAllByUsuarioId()` lanza una excepción
- WHEN se confirma el reset
- THEN igual reporta éxito y el fallo se loguea sin el plaintext

### Requirement: Una cuenta no disponible no cambia su contraseña al confirmar

El sistema DEBE rechazar la confirmación, sin modificar `passwordHash`,
cuando la cuenta quedó inactiva o soft-deleted entre solicitud y
confirmación.

#### Scenario: Confirmar con una cuenta que quedó inactiva se rechaza

- GIVEN un token vigente cuyo usuario quedó inactivo antes de confirmar
- WHEN se intenta confirmar
- THEN se rechaza con el error genérico y `passwordHash` no cambia

### Requirement: Un reset exitoso dispara un mail de confirmación

El sistema DEBE enviar un mail de confirmación tras un reset exitoso,
resuelto con la misma lógica de tenant que el mail de solicitud, indicando
que la contraseña fue restablecida.

#### Scenario: La confirmación exitosa envía el mail de aviso

- GIVEN un reset confirmado con éxito
- WHEN se completa
- THEN se envía el mail de confirmación por el mismo tenant que emitió el
  token

### Requirement: El link de reset se construye solo desde APP_BASE_URL

El sistema DEBE construir el link únicamente desde `APP_BASE_URL` y NUNCA
desde el header `Host` de la request.

#### Scenario: El link ignora el header Host

- GIVEN una solicitud con `Host` manipulado
- WHEN se emite el mail
- THEN el link usa `APP_BASE_URL` y no refleja el `Host`

### Requirement: Ningún log contiene el plaintext ni el token crudo

El sistema NO DEBE loguear la contraseña en texto plano ni el token crudo en
ningún punto del flujo.

#### Scenario: Los logs no exponen secretos

- GIVEN cualquier resultado del flujo de solicitud o confirmación
- WHEN se inspeccionan los logs generados
- THEN ninguna línea contiene la contraseña ni el token crudo

### Requirement: Ambas rutas aplican rate limiting propio

El sistema DEBE limitar `POST /auth/forgot-password` por email y `POST
/auth/reset-password` por token; los límites exactos quedan fijados en
diseño.

#### Scenario: Exceder cualquiera de los dos límites rechaza la petición

- GIVEN un email o un token que superó el límite fijado en diseño
- WHEN se repite la solicitud o la confirmación
- THEN el sistema rechaza la petición por límite de tasa

### Requirement: El frontend ofrece el flujo completo de self-service

El sistema DEBE mostrar un link "¿Olvidaste tu contraseña?" en el login; la
pantalla de solicitud DEBE mostrar siempre el mismo mensaje; la pantalla de
confirmación DEBE validar localmente igualdad de contraseñas y largo
mínimo, espejando el Zod/DTO del backend.

#### Scenario: El login enlaza a la solicitud de reset

- GIVEN la pantalla de login
- WHEN el usuario la visualiza
- THEN existe un link hacia la pantalla de solicitud

#### Scenario: La solicitud muestra el mismo mensaje siempre

- GIVEN la pantalla de solicitud de reset
- WHEN se envía el formulario, exista o no el email
- THEN se muestra el mismo mensaje

#### Scenario: La confirmación valida antes de enviar

- GIVEN la pantalla de confirmación de reset
- WHEN el usuario ingresa contraseña y confirmación
- THEN rechaza localmente si no coinciden o no cumplen el largo mínimo

### Requirement: La Ayuda deja de decir que no existe la opción de recuperar contraseña

El sistema DEBE actualizar `backend/ayuda/mi-cuenta-contrasena.md:31-35`
para reflejar el flujo nuevo, en vez de afirmar que no hay botón de
"olvidé mi contraseña".

#### Scenario: El artículo de Ayuda refleja el flujo nuevo

- GIVEN el artículo `mi-cuenta-contrasena.md`
- WHEN se revisan las líneas 31-35
- THEN ya no afirman la ausencia del botón y describen el link nuevo
