# Clientes Logo Specification

## Purpose

Definir quién carga, reemplaza y quita el logo de un cliente; el aislamiento
de su lectura entre inquilinos; los formatos y tamaños válidos; y qué
muestra el sidebar con y sin logo, incluida la propagación diferida por el
token de sesión.

> **Desvío declarado de presupuesto.** El skill `sdd-spec` fija un tope de 650
> palabras; este artefacto tiene **989** (medido con `wc -w`, no estimado). La
> tensión la creó el encargo: cubrir las 13 reglas de `design.md` más 5
> escenarios obligatorios no entra en 650. Se consolidaron reglas afines en un
> mismo requisito para comprimir sin perder ninguna. Se deja declarado en vez de
> recortar cobertura de una capability cuyo riesgo central es una fuga entre
> inquilinos.

## Requirements

### Requirement: Aislamiento de lectura entre inquilinos

El sistema DEBE responder 403 si el solicitante no es ROOT ni pertenece al
cliente dueño del logo. ROOT DEBE leer el logo de cualquier cliente. Sin
token, DEBE responder 401.

#### Scenario: Usuario de otro cliente pide el logo

- GIVEN un usuario con `cliente_id` = A y un logo del cliente B
- WHEN pide el logo del cliente B
- THEN el sistema responde 403

#### Scenario: ROOT lee cualquier logo

- GIVEN un actor con `is_global_admin: true`
- WHEN pide el logo de un cliente con logo cargado
- THEN el sistema responde 200

#### Scenario: Sin token

- GIVEN una solicitud sin token
- WHEN pide el logo de un cliente
- THEN el sistema responde 401

### Requirement: Solo ROOT carga o quita el logo

El sistema DEBE responder 403 a la carga o el borrado del logo cuando el
actor no tiene `is_global_admin: true`, incluido un ADMINISTRADOR del propio
cliente.

#### Scenario: ADMINISTRADOR intenta cargar el logo de su cliente

- GIVEN un actor ADMINISTRADOR sin `is_global_admin`
- WHEN intenta cargar un logo para su propio cliente
- THEN el sistema responde 403

### Requirement: Validación de formato y tamaño antes de guardar

El sistema DEBE aceptar solo `image/png`, `image/jpeg` e `image/webp`, y
rechazar con 422 —antes de escribir en disco— cualquier otro mime o
cualquier archivo de más de 512 KB o de 0 bytes. Whitelist fuente única; el
frontend deriva de ella.

#### Scenario: Se rechaza un SVG

- GIVEN un archivo `image/svg+xml`
- WHEN ROOT intenta cargarlo
- THEN el sistema responde 422 y no lo escribe en disco

#### Scenario: Se rechaza un archivo fuera de rango

- GIVEN un archivo de más de 512 KB, o de 0 bytes
- WHEN ROOT intenta cargarlo
- THEN el sistema responde 422 y no lo escribe en disco

#### Scenario: Se acepta un archivo válido

- GIVEN un PNG, JPEG o WebP de hasta 512 KB
- WHEN ROOT lo carga
- THEN la operación reporta éxito

### Requirement: Servido seguro del binario

La lectura del logo DEBE responder con el `Content-Type` almacenado,
`X-Content-Type-Options: nosniff` y `Content-Disposition: inline`, sin
exponer la storage key ni una ruta de filesystem.

#### Scenario: Cabeceras de una lectura exitosa

- GIVEN un cliente con logo cargado
- WHEN un solicitante autorizado lo lee
- THEN la respuesta incluye `nosniff` e `inline`, sin storage key ni ruta

### Requirement: Persistencia del logo frente a reemplazo y edición

Tras una carga exitosa, una lectura posterior DEBE devolver el archivo
nuevo, aunque falle el borrado del anterior. Editar nombre, razón social,
CUIT, CSAT o correo del cliente NO DEBE modificar ni borrar su logo.

#### Scenario: Reemplazo exitoso aunque falle el borrado del anterior

- GIVEN un cliente con logo, cuyo borrado posterior fallará
- WHEN ROOT carga un logo nuevo
- THEN la operación reporta éxito y una lectura posterior devuelve el
  archivo nuevo

#### Scenario: Editar datos comerciales conserva el logo

- GIVEN un cliente con logo cargado
- WHEN se actualiza su nombre o razón social
- THEN el logo sigue existiendo sin cambios

### Requirement: Un logo por cliente y borrado idempotente

Una lectura DEBE devolver como máximo un archivo por cliente, sin historial.
Borrar el logo de un cliente sin logo DEBE responder 204, igual que borrar
uno existente.

#### Scenario: Cargar un logo nuevo no deja una segunda versión

- GIVEN un cliente con logo
- WHEN ROOT carga otro logo
- THEN una lectura posterior devuelve un único archivo

#### Scenario: Borrar el logo de un cliente que no tiene

- GIVEN un cliente sin logo
- WHEN ROOT pide borrarlo
- THEN el sistema responde 204

### Requirement: Fallback al ícono genérico en el sidebar

El sidebar DEBE mostrar un bloque de marca —nuevo, inexistente antes de este
cambio— con el logo del cliente cuando el token trae uno, y `Building2` en
cualquier otro caso: sin logo, falla la carga (401/404 incluidos), o sesión
MASTER (`cliente_id: null`). Nunca una imagen rota ni un hueco en el layout.

#### Scenario: Sin logo o falla la carga

- GIVEN un cliente sin logo, o una carga del binario que responde 401 o 404
- WHEN se renderiza el sidebar
- THEN se muestra `Building2` sin imagen rota

#### Scenario: Sesión MASTER

- GIVEN un token ROOT con `cliente_id: null`
- WHEN se renderiza el sidebar
- THEN se muestra `Building2`

### Requirement: Comportamiento del token de sesión

Un token sin el campo de logo (emitido antes de este cambio) DEBE tratarse
como cliente sin logo, sin error ni cierre de sesión. El logo reflejado
corresponde a la emisión del token: se actualiza en login, switch o
refresh; el switch lo actualiza sin recargar. Quien acaba de subirlo no lo
ve hasta su próximo refresh.

#### Scenario: Token sin el campo de logo

- GIVEN un token válido emitido antes de este cambio
- WHEN se renderiza el sidebar
- THEN se muestra `Building2` y la sesión permanece activa

#### Scenario: Cambiar de cliente actualiza el logo sin recargar

- GIVEN un usuario con acceso a más de un cliente, cada uno con logo propio
- WHEN cambia de cliente activo en el selector de inquilino
- THEN el sidebar muestra el logo del nuevo cliente sin recargar la página

#### Scenario: Quien sube el logo no lo ve de inmediato

- GIVEN ROOT que acaba de cargar el logo de un cliente
- WHEN revisa su propio sidebar sin refrescar su token
- THEN el sidebar sigue mostrando el estado anterior a la carga
