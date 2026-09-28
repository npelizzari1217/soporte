# Email Crypto Key Rotación Specification

## Purpose

Definir el comportamiento de la herramienta de rotación de `EMAIL_CRYPTO_KEY`
(deuda técnica de `docs/roadmap-comercial.md:486`): un script que re-cifra
`clientes.smtp_password_cifrada` de una clave anterior (`OLD_KEY`) a una
nueva (`NEW_KEY`), preservando el formato `v1` de `AesGcmSecretCipher` sin
introducir keyring ni `kid`. Sin este cambio, rotar la clave a mano vuelve
indescifrable toda contraseña SMTP guardada.

## Requirements

### Requirement: Validación de las claves de entrada

El sistema DEBE validar `OLD_KEY` y `NEW_KEY` antes de abrir ninguna
transacción: cada una DEBE tener exactamente 64 caracteres hexadecimales (32
bytes), y `OLD_KEY` NO DEBE ser igual a `NEW_KEY`. Ante cualquier
incumplimiento, el sistema DEBE abortar sin tocar la base.

#### Scenario: Clave con longitud inválida es rechazada

- GIVEN una `NEW_KEY` que no tiene 64 caracteres hexadecimales
- WHEN se invoca el script de rotación
- THEN el sistema rechaza la operación antes de conectarse a la base
- AND ninguna fila se modifica

#### Scenario: OLD_KEY igual a NEW_KEY es rechazada

- GIVEN `OLD_KEY` y `NEW_KEY` con el mismo valor
- WHEN se invoca el script de rotación
- THEN el sistema rechaza la operación antes de conectarse a la base

### Requirement: Transacción única para toda la rotación

El sistema DEBE ejecutar la rotación de todas las filas afectadas dentro de
una única transacción de base de datos. Ante cualquier error durante el
procesamiento, el sistema DEBE hacer ROLLBACK completo, dejando todas las
filas cifradas con `OLD_KEY` como si la corrida no hubiera ocurrido.

#### Scenario: Una interrupción a mitad de camino revierte todo

- GIVEN varias filas con `smtp_password_cifrada` cifrado con `OLD_KEY`
- WHEN la rotación falla después de procesar solo algunas de esas filas
- THEN ninguna fila queda modificada
- AND todas siguen descifrando correctamente con `OLD_KEY`

### Requirement: Modo `--dry-run` no escribe nada

El sistema DEBE soportar un modo `--dry-run` que, para cada fila con
`smtp_password_cifrada` no nulo, descifra con `OLD_KEY`, re-cifra en memoria
con `NEW_KEY`, descifra el resultado y compara contra el texto plano
original. El modo `--dry-run` NO DEBE escribir ninguna fila ni dejar una
transacción abierta con cambios pendientes de confirmar.

#### Scenario: Dry-run sobre datos válidos no persiste cambios

- GIVEN filas cuyo `smtp_password_cifrada` descifra correctamente con
  `OLD_KEY`
- WHEN se ejecuta el script con `--dry-run`
- THEN el resultado reporta éxito del round-trip para cada fila
- AND ninguna fila de la base queda modificada

### Requirement: Verificación round-trip antes del COMMIT

Antes de confirmar la transacción, el sistema DEBE releer cada fila recién
re-cifrada, descifrarla con `NEW_KEY` dentro de la misma transacción, y
comparar el resultado contra el texto plano original. El sistema NO DEBE
hacer COMMIT si alguna fila falla esta verificación.

#### Scenario: Una fila que falla la verificación aborta el COMMIT completo

- GIVEN una rotación en curso donde todas las filas fueron re-cifradas con
  `NEW_KEY` dentro de la transacción
- WHEN la relectura y descifrado de al menos una fila no reproduce su texto
  plano original
- THEN la transacción hace ROLLBACK completo
- AND ninguna fila queda cifrada con `NEW_KEY`

### Requirement: Fallo duro ante clave desconocida o payload corrupto

Cuando una fila no descifra ni con `OLD_KEY` ni con `NEW_KEY`, el sistema
DEBE abortar toda la operación con ROLLBACK completo y terminar con código
de salida distinto de cero. El sistema NO DEBE incluir `OLD_KEY`, `NEW_KEY`
ni ningún texto descifrado en la salida (stdout, stderr o log).

#### Scenario: Fila indescifrable con ambas claves aborta sin modificar nada

- GIVEN una fila cuyo `smtp_password_cifrada` no descifra ni con `OLD_KEY`
  ni con `NEW_KEY`
- WHEN se ejecuta la rotación
- THEN la operación termina con código de salida distinto de cero
- AND ninguna fila de la base queda modificada
- AND la salida del script no contiene ninguna clave ni texto descifrado

### Requirement: Re-corrida explícita sobre filas ya migradas

Una fila cuyo `smtp_password_cifrada` ya descifra correctamente con
`NEW_KEY` (y no con `OLD_KEY`) DEBE tratarse como ya migrada: el sistema
DEBE dejarla intacta y NO DEBE contarla como error ni abortar la corrida por
su presencia.

#### Scenario: Re-correr el script tras una rotación exitosa no modifica nada

- GIVEN una fila cuyo `smtp_password_cifrada` ya fue rotado a `NEW_KEY` en
  una corrida previa
- WHEN se vuelve a ejecutar el script con las mismas `OLD_KEY`/`NEW_KEY`
- THEN esa fila se reporta como ya migrada
- AND su valor de `smtp_password_cifrada` no cambia

### Requirement: Una corrida puede procesar una mezcla de filas OLD/NEW

Cuando una misma corrida encuentra filas todavía en `OLD_KEY` junto con
filas ya en `NEW_KEY`, el sistema DEBE migrar las pendientes y dejar
intactas las ya migradas dentro de la misma operación, sin abortar por la
sola presencia de la mezcla, y DEBE reportar cuántas filas migró y cuántas
ya estaban migradas. El mecanismo de detección queda a criterio del diseño.

#### Scenario: Corrida con filas mixtas migra solo las pendientes

- GIVEN un conjunto de filas donde algunas descifran con `OLD_KEY` y otras
  ya descifran con `NEW_KEY`
- WHEN se ejecuta la rotación
- THEN las filas que estaban en `OLD_KEY` quedan cifradas con `NEW_KEY`
- AND las filas que ya estaban en `NEW_KEY` no cambian
- AND la operación no aborta por la presencia de ambos grupos

### Requirement: El AAD por cliente se preserva en el re-cifrado

El sistema DEBE usar el `clienteId` de cada fila como AAD al re-cifrar con
`NEW_KEY`, igual que `AesGcmSecretCipher`, preservando el vínculo
criptográfico entre el ciphertext y la fila que lo posee.

#### Scenario: El ciphertext re-cifrado sigue ligado a su clienteId

- GIVEN una fila re-cifrada con `NEW_KEY` durante la rotación
- WHEN se intenta descifrar ese ciphertext usando el `clienteId` de OTRA
  fila como AAD
- THEN el descifrado falla

### Requirement: Filas sin configuración SMTP quedan intactas

El sistema NO DEBE tocar ni contar como fallidas las filas de `clientes`
cuyo `smtp_password_cifrada` es NULL.

#### Scenario: Cliente sin configuración SMTP no se procesa

- GIVEN un cliente cuyo `smtp_password_cifrada` es NULL
- WHEN se ejecuta la rotación
- THEN esa fila no se modifica
- AND no se reporta como error ni bloquea el resto de la corrida

### Requirement: Compatibilidad de cifrado cruzado con `AesGcmSecretCipher`

La implementación de cifrado/descifrado del script DEBE ser interoperable
byte a byte con `AesGcmSecretCipher`: un payload cifrado por una DEBE
descifrar correctamente con la otra, usando la misma clave y el mismo AAD.

#### Scenario: Un payload cifrado por `AesGcmSecretCipher` descifra con el script

- GIVEN un payload `v1:...` generado por `AesGcmSecretCipher` con una clave
  y un `clienteId` conocidos
- WHEN el script lo descifra con esa misma clave y ese `clienteId` como AAD
- THEN el texto plano obtenido coincide con el original

#### Scenario: Un payload cifrado por el script descifra con `AesGcmSecretCipher`

- GIVEN un payload `v1:...` generado por el script con una clave y un
  `clienteId` conocidos
- WHEN `AesGcmSecretCipher` lo descifra con esa misma clave y ese
  `clienteId` como AAD
- THEN el texto plano obtenido coincide con el original

### Requirement: Modo `--verificar` de solo lectura confirma qué clave está vigente

El sistema DEBE soportar un modo `--verificar` que recibe una sola clave y
comprueba, dentro de una transacción de solo lectura (`BEGIN READ ONLY`
… `ROLLBACK`), que toda fila con `smtp_password_cifrada` no nulo descifra
con esa clave usando el `clienteId` de cada fila como AAD. El modo
`--verificar` NO DEBE escribir ninguna fila bajo ninguna circunstancia y NO
DEBE imprimir la clave ni ningún texto plano descifrado. El sistema DEBE
terminar con código de salida 0 cuando todas las filas no nulas descifran
con la clave dada, y con código de salida distinto de cero (dato
indescifrable, el mismo código que usa una fila indescifrable en la
rotación) cuando al menos una fila no descifra con ella.

#### Scenario: Todas las filas descifran con la clave verificada

- GIVEN todas las filas con `smtp_password_cifrada` no nulo cifradas con una
  misma clave
- WHEN se ejecuta `--verificar` con esa clave
- THEN la operación termina con código de salida 0
- AND ninguna fila de la base queda modificada

#### Scenario: Una fila no descifra con la clave verificada

- GIVEN al menos una fila con `smtp_password_cifrada` no nulo que no
  descifra con la clave dada a `--verificar`
- WHEN se ejecuta `--verificar` con esa clave
- THEN la operación termina con código de salida distinto de cero
- AND ninguna fila de la base queda modificada

#### Scenario: La salida de `--verificar` no contiene material sensible

- GIVEN cualquier resultado de `--verificar` (todas descifran o alguna
  falla)
- WHEN se inspecciona toda la salida del proceso
- THEN no aparece la clave verificada ni ningún texto plano descifrado

### Requirement: Ningún secreto se expone en ninguna salida

En ningún punto de la corrida —éxito, no-op o fallo— el sistema DEBE
imprimir `OLD_KEY`, `NEW_KEY` ni ningún texto plano descifrado, ni en
stdout, ni en stderr, ni en ninguna línea de log.

#### Scenario: La salida completa de una corrida no contiene material sensible

- GIVEN cualquier resultado de una corrida de rotación (éxito, no-op o
  fallo)
- WHEN se inspecciona toda la salida del proceso
- THEN no aparece `OLD_KEY`, `NEW_KEY` ni ningún texto plano descifrado

### Requirement: La reescritura de `.env` ocurre después del COMMIT confirmado

El sistema NO DEBE reescribir `backend/.env` con `NEW_KEY` hasta que la
transacción de base de datos esté confirmada (COMMIT exitoso). `OLD_KEY`
DEBE seguir disponible (respaldada) hasta confirmar el éxito completo, de
modo que si la reescritura de `.env` falla después de un COMMIT exitoso, la
operación deja evidencia clara de que la base ya está en `NEW_KEY` y de que
`OLD_KEY` sigue disponible para completar el paso manual. El mecanismo de
ordenamiento queda a criterio del diseño.

#### Scenario: Fallo en la reescritura de `.env` tras un COMMIT exitoso es recuperable

- GIVEN una rotación cuya transacción de base de datos ya hizo COMMIT
  exitoso
- WHEN la reescritura de `backend/.env` con `NEW_KEY` falla
- THEN la salida indica que la base ya quedó en `NEW_KEY`
- AND `OLD_KEY` sigue disponible para completar la reescritura manualmente

### Requirement: El script operativo es ASCII puro sin BOM

`rotate-email-crypto-key.ps1` DEBE ser 100 % ASCII y NO DEBE llevar BOM,
igual que `rotate-admin-pw.ps1`, porque PowerShell 5.1 interpreta un `.ps1`
sin BOM como ANSI y un solo carácter acentuado corrompe el parseo.

#### Scenario: El archivo del script operativo es ASCII puro sin BOM

- GIVEN el archivo `rotate-email-crypto-key.ps1`
- WHEN se inspecciona su codificación
- THEN todos sus bytes están en el rango ASCII
- AND el archivo no lleva marca BOM
