# Design: Formulario público por cliente + QR en equipos

## Technical Approach

Enfoque B de la propuesta. Se compone a partir de tres moldes que ya existen en el repo y no se
modifican:

1. **Resolución de tenant sin sesión desde una fila de master.** Se toma el molde de
   `ResolverEncuestaTokenService` (`csat/application/services/resolver-encuesta-token.service.ts:63-91`):
   la fila de master decide el cliente, se validan `activo`, `!isDeleted()` y la habilitación, y
   recién después se hace `tenantContext.bind`. En este cambio la clave es el **slug**, no un token.
2. **Token opaco de un solo uso en master.** Se calca de `EncuestaToken` y `PasswordResetToken`
   (`prisma_master/schema.prisma:291-340`): solo se guarda el sha256, con `expiresAt`, `usedAt` y
   `revokedAt`. El correo sale por `ICorreoDeCliente` (`auth/domain/ports/i-correo-de-cliente.port.ts:19-25`).
3. **El alta pasa por `CrearTicketSoporteUseCase`** (`equipos/application/use-cases/crear-ticket-soporte.use-case.ts:94-221`).
   Así hereda el ciclo activo, la numeración, el lock `FOR SHARE` del equipo (S5) y el
   `TicketCreadoEvent` post-commit para el SLA.

Las piezas nuevas son las siguientes:

- el slug y la habilitación del cliente en master;
- el token QR del equipo en el tenant;
- el solicitante externo en el tenant;
- el pedido pendiente en el tenant;
- un throttler propio;
- el camino autenticado para D3.

Specs que cubre: `formulario-publico-cliente`, `equipos-qr`, `solicitante-externo` y `pedido-publico`.
Las decisiones D1-D12 del roadmap están cerradas, y este diseño no reabre ninguna.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `ClienteEntity.configurarSlug/habilitarFormulario`, `SolicitanteExternoEntity`, `PedidoPublicoTokenEntity`, `PedidoPendienteEntity`, invariante "exactamente un solicitante" en `TicketEntity` | domain | Reglas puras: formato del slug, congelamiento, vigencia y exclusividad |
| `IClienteRepository.findBySlug/congelarSlug/cambiarSlugSiNoCongelado`, `ISolicitanteExternoRepository`, `IPedidoPublicoTokenRepository`, `IPedidoPendienteRepository`, `IEquipoInformaticoRepository.findByQrHash/guardarQrHash`, `IContactoSolicitanteResolver` | domain (puertos) | Contratos sin Prisma ni Nest |
| Plantillas `templateVerificarPedido` y `templatePedidoCreado` | domain (`publico/domain/templates/`) | Funciones puras con `escaparHtml` (`shared/domain/escapar-html.ts`) |
| `ConfigurarFormularioPublicoUseCase`, `EmitirQrEquipoUseCase`, `ResolverClientePublicoService`, `ConsultarContextoPedidoUseCase`, `SolicitarPedidoPublicoUseCase`, `ConfirmarPedidoPublicoUseCase`, `ResolverQrAutenticadoUseCase` | application | Orquestación con `Result<T, DomainError>` |
| Repositorios Prisma, `ContactoSolicitanteResolverAdapter`, trackers del throttler | infrastructure | Único lugar que toca Prisma y `TenantContext.run` |
| `PedidoPublicoController` (`publico/c/:slug/pedido`), `PATCH /clientes/:id/formulario-publico`, `POST /equipos/:id/qr`, `GET /soporte/qr` y sus DTOs | interface | Traducen HTTP a casos de uso. No tienen lógica de negocio |

**Fuente única** (`rules.specs`):

- **Regla de exclusividad del solicitante.** La fuente es el CHECK `tickets_solicitante_exactamente_uno`.
  `TicketEntity.create` la replica y falla antes del INSERT.
- **Formato del slug.** La fuente es `SLUG_REGEX` en `clientes/domain/value-objects/slug-cliente.ts`.
  La copian el Zod del frontend y el CHECK `clientes_slug_formato_check`.
- **Límites de longitud del pedido.** La fuente son los DTO del backend. Zod los espeja.

### Autorización: los dos lugares donde vive

| Ruta | Borde | Inline |
|---|---|---|
| `PATCH /clientes/:id/formulario-publico` | `JwtAuthGuard, GlobalAdminGuard` del controller (`clientes.controller.ts:158`) | El caso de uso revalida `actor.isGlobalAdmin`, igual que `CrearClienteUseCase` (`clientes.controller.ts:215`) |
| `POST /equipos/:id/qr` | `@RequiereAcciones('EQUIPOS:MODIFICACION')` (patrón de `equipos.controller.ts:396`) | El equipo se busca en el tenant de la sesión, y el `clienteId` sale del JWT |
| `GET /soporte/qr` | `JwtAuthGuard, TenantGuard, AccionesGuard` + `TICKETS:ALTAS` | Exige `cliente.slug === c` de la sesión; si no coincide, responde 404 |
| `publico/c/:slug/pedido/*` | Sin auth; solo `PedidoPublicoThrottlerGuard` | La posesión del slug válido, del token QR o del token de verificación **es** la autorización. El tenant sale solo de la fila de master |

---

## Architecture Decisions

### ADR-1: detección de D3 a partir de `ICorreoDeCliente.estado()`

`CorreoDeClienteAdapter.estado()` devuelve `CLIENTE_NO_DISPONIBLE` en dos casos
(`correo-de-cliente.adapter.ts:39-47`):

- cuando el cliente no existe, está inactivo o está borrado;
- cuando hay **cualquier error de infraestructura**.

| Opción | Tradeoff | Decisión |
|---|---|---|
| `CLIENTE_NO_DISPONIBLE` responde 404 | Ante un error transitorio, el formulario de un cliente sano desaparece | Rechazada |
| `CLIENTE_NO_DISPONIBLE` exige sesión, igual que `SIN_CORREO` | Falla cerrado para el anónimo. Coincide con la spec (`formulario-publico-cliente/spec.md:87`) | **Elegida** |

El orden de evaluación cierra el caso de cliente inactivo o deshabilitado:

1. `ResolverClientePublicoService` valida `activo`, `!isDeleted()`, `formularioPublicoHabilitado` y
   la existencia del slug. Si algo falla, responde con el **404 uniforme**.
2. Recién después se consulta `estado()`.

Por eso, a esa altura, `CLIENTE_NO_DISPONIBLE` solo puede venir de un error o de una carrera:

- `LISTO` corresponde al modo `EXTERNO`.
- Cualquier otro valor corresponde al modo `SESION`.

En `POST .../solicitud` y en `POST .../confirmar`, todo estado distinto de `LISTO` responde con el
404 uniforme. No se crea nada.

### ADR-2: el slug es requisito para habilitar el formulario y para emitir un QR

Se confirma lo que asumió la spec (`formulario-publico-cliente/spec.md:79-83` y `equipos-qr/spec.md:27-31`):
sin slug no hay URL pública.

**Emitir un QR no exige que el formulario esté habilitado.** Así se pueden preparar los QR antes
de encender el formulario.

**Congelamiento.** Se agrega la columna `clientes.slug_congelado_at`. El QR vive en el tenant y el
slug vive en master, así que el congelamiento necesita una marca en master. Las dos escrituras son
CAS:

- `congelarSlug(id, slugEsperado)`:
  `UPDATE clientes SET slug_congelado_at = coalesce(slug_congelado_at, now()) WHERE id = $1 AND slug = $2`.
  Si afecta 0 filas, el slug cambió y se aborta la emisión.
- `cambiarSlugSiNoCongelado(id, nuevo)`: `... WHERE id = $1 AND slug_congelado_at IS NULL`.
  Si afecta 0 filas, el cambio se rechaza.

`EmitirQrEquipoUseCase` congela **antes** de escribir el hash en el tenant. Un slug congelado sin
ningún QR es inofensivo; un QR sin el slug congelado es el defecto que hay que evitar.

### ADR-3: equipo dado de baja entre la apertura y la confirmación

El caso de uso rechaza hoy un equipo inactivo con el lock tomado (`crear-ticket-soporte.use-case.ts:141-149`).

| Opción | Tradeoff | Decisión |
|---|---|---|
| Rechazar | Contradice `equipos-qr/spec.md:73` ("el ticket se crea sin equipo, sin error") | Rechazada |
| Reintentar sin equipo después de `EquipoInvalidoError` | Dos transacciones, y el caso de uso queda sin tocar | Rechazada |
| **Política en el DTO**: `equipoInvalido: 'RECHAZAR' \| 'OMITIR'`, con `'RECHAZAR'` por defecto | Una sola transacción. El `FOR SHARE` se sigue tomando primero: si la baja comitea antes, se ve inactivo y se omite; si comitea después, espera al lock. Se conserva S5 | **Elegida** |

Con `OMITIR`, el caso de uso se comporta así:

- el satélite queda con `equipoId: null`;
- no se devuelve ningún error.

El alta autenticada (`soporte.controller.ts:96-137`) sigue usando `RECHAZAR`.

### ADR-4: `tipoId`, `prioridadId`, `estadoId` y `solicitanteId` enviados por el cliente se ignoran

El `ValidationPipe` global corre con `whitelist: true` y sin `forbidNonWhitelisted`
(`app.module.ts:71`). El repo lo usa a propósito para descartar campos en silencio
(`equipos.dto.ts:273-274`, `movimientos-insumo.dto.ts:31`).

- `PedidoPublicoDto` no declara esos campos.
- `CrearTicketSoporteUseCase` resuelve el tipo SOPORTE (`:115`).
- `ConfirmarPedidoPublicoUseCase` resuelve la prioridad con `IPrioridadRepository.findIdByCodigo('MEDIA')`
  (`i-prioridad.repository.ts:29`). Si no la encuentra, lanza un error defensivo: es un catálogo fijo.

Hay un test que manda `prioridadId` de CRITICA y espera MEDIA. Rechazar con 400 contradiría la
convención del repo.

### ADR-5: token QR inválido o de otro cliente sobre un slug válido

**Lectura confirmada**: el formulario abre **sin equipo** y no revela nada.

- `contexto` responde 200 con `equipo: null`, y el cuerpo es idéntico al de una URL sin `e`.
- Lo mismo pasa con un token inexistente, regenerado, de otro tenant o de un equipo dado de baja.
- El token se busca **solo** en la base ya bindeada por el slug, así que un token de B nunca
  resuelve en A.

**Redacción de la spec que hay que corregir** (no la edita este diseño):

| Línea | Problema | Redacción sugerida |
|---|---|---|
| `specs/equipos-qr/spec.md:41` | "el token viejo responde 404 uniforme" contradice las líneas 35, 45 y 61 | "el token viejo se comporta como uno inexistente: el formulario abre sin equipo" |
| `specs/pedido-publico/spec.md:123` (primera oración) | Incluye "token de equipo inválido de otro cliente" en la lista del 404, y la segunda oración de la misma línea lo niega | Sacarlo de la lista y dejar el 404 para slug, habilitación, cliente y token de verificación |
| `specs/pedido-publico/spec.md:79` y `:91` | "ignorar o rechazar" | "ignorar" (ADR-4), para que verify tenga una sola salida válida |
| `specs/formulario-publico-cliente/spec.md:87` (opcional) | Agregar que `CLIENTE_NO_DISPONIBLE` solo se alcanza después de resolver el slug | Ver ADR-1 |

### ADR-6: `solicitanteId` nullable + `solicitante_externo_id` + CHECK

**Migración tenant**: `prisma_tenant/migrations/2026100XHHMMSS_solicitante_externo/`, con
`migration.sql` y `rollback.sql`. Es la convención del repo (`20260823120000_encuestas_satisfaccion/rollback.sql`).

1. `CREATE TABLE solicitantes_externos`:
   - `id uuid`
   - `nombre varchar(120)`
   - `email varchar(254)`
   - `telefono varchar(30) NULL`
   - `email_verificado_at timestamptz NOT NULL`
   - `created_at`, `updated_at`
   - índice sobre `email`
2. `ALTER TABLE tickets ALTER COLUMN solicitante_id DROP NOT NULL`. Es solo metadata.
3. `ADD COLUMN solicitante_externo_id uuid NULL REFERENCES solicitantes_externos(id) ON DELETE RESTRICT`,
   con un índice parcial `WHERE NOT NULL`.
4. `ADD CONSTRAINT tickets_solicitante_exactamente_uno CHECK ((solicitante_id IS NULL) <> (solicitante_externo_id IS NULL))`.
   Valida las filas existentes, que tienen todas `solicitante_id` NOT NULL.

**Despliegue**: corre en el fan-out `migrate:tenants` del deploy (`deploy.ps1:309-311`), con los
servicios detenidos. Un tenant creado después recibe la migración por la vía normal.

**Rollback**:

- `rollback.sql` hace `DROP CONSTRAINT`, `DROP COLUMN`, `SET NOT NULL` y `DROP TABLE`.
- `SET NOT NULL` **falla por diseño** si ya existe un ticket externo. Revertir obliga entonces a una
  decisión manual: borrar o reasignar esos tickets. Es la restricción declarada en la propuesta.

**Una fila por pedido confirmado, sin deduplicar por email.**

- No se mezclan atributos no verificados de dos pedidos.
- La retención de D11 queda ligada a cada ticket.
- No hay carrera de upsert.
- La alternativa rechazada es el upsert por email: reescribiría el nombre de tickets viejos.

**Autor de la operación de apertura**: `operaciones_ticket.autor_id` es NOT NULL
(`prisma_tenant/schema.prisma:343`).

- Se usa la constante `AUTOR_FORMULARIO_PUBLICO = '00000000-0000-0000-0000-000000000000'`, en
  `tickets/domain/constants`. `gen_random_uuid()` nunca la genera.
- El timeline no resuelve nombres de autor (`ticket.dto.ts:298-313` y `frontend/src/features/tickets/types.ts:87`).
- La alternativa rechazada es hacer `autor_id` nullable: es otra migración y suma lectores.

**Lectores que tienen que tolerar el nulo.** El typecheck los marca todos al tipar `string | null`.

| Lector | Archivo | Cambio |
|---|---|---|
| Nombres en listado y detalle | `tickets/interface/controllers/tickets.controller.ts:196-216` | Saltea el nulo en `idsUsuarios`. Agrega un batch de `ISolicitanteExternoRepository.findNombres(ids)` |
| `resolverNombres` | `tickets/infrastructure/persistence/prisma/usuario-master.checker.ts:80-91` | Sin cambios. Los callers nunca pasan nulos (test) |
| DTO de respuesta | `tickets/interface/dtos/ticket.dto.ts:198,275` | `solicitanteId: string \| null`, más `solicitanteExternoId` y `solicitanteEsExterno`. El nombre del externo va en `solicitanteNombre`, con apellido `null` |
| Entidad y mapper | `tickets/domain/entities/ticket.entity.ts:66,228`, `ticket.mapper.ts:40,78` | Las dos props pasan a nullable y la invariante va en `create` |
| Autorización por dueño | `obtener-ticket.use-case.ts:40`, `listar-timeline.use-case.ts:56`, `adjuntar-archivo.use-case.ts:113` | No cambia el código: `null !== actorId` deniega a quien no tiene VER_TODOS. Lleva tests |
| Filtro "mis tickets" | `prisma-ticket.repository.ts:134` | Sin cambios |
| SLA | `sla/domain/events/sla-vencido.event.ts:20-30`, `i-sla-ticket-query.repository.ts:5`, `prisma-sla-ticket-query.repository.ts:39`, `marcar-vencidos.use-case.ts:51` | Solo cambian los tipos. El listener usa el asignado y los administradores (`sla-vencido-notificacion.listener.ts:77-86`) |
| Contacto | `notificaciones/domain/ports/i-usuario-contacto-resolver.ts:21` | Se mantiene. Se agrega `IContactoSolicitanteResolver.resolver(ticket)`, que ramifica entre master y `solicitantes_externos` |
| Cambio de estado | `ticket-notificacion.listener.ts:64` | Usa el resolver nuevo. Para un externo, la plantilla va **sin** el link a `/tickets/:id` (`email-templates.ts:17`), porque el externo no tiene sesión |
| Comentario | `ticket-notificacion.listener.ts:107` | Saltea al externo. D5 no incluye comentarios (ver Open Questions) |
| CSAT | `csat/infrastructure/listeners/ticket-csat.listener.ts:86` | Usa el resolver nuevo. `csatHabilitado` y el token no cambian |
| Exportes y dashboard | `exportar-tickets.use-case.ts:107,136-158`, `dashboard/` | No leen al solicitante. Sin cambios |
| Frontend | `features/tickets/types.ts:25`, `components/ticket-header.tsx:82` | `string \| null`. El fallback ya no muestra el id |

### ADR-7: token de verificación en master, pedido pendiente en el tenant

`solicitante-externo/spec.md:13` prohíbe escribir datos del externo en master.
`pedido-publico/spec.md:13` exige que el token esté en master. Las dos cosas se cumplen así:

- **Master `pedido_publico_tokens`** guarda:
  - `id`
  - `cliente_id` (FK)
  - `token_hash` (UNIQUE)
  - `expires_at`, `used_at`, `revoked_at`
  - `created_at`, `updated_at`, `deleted_at`

  **No guarda PII.**
- **Tenant `pedidos_publicos_pendientes`** guarda:
  - `id` (el mismo id que el token)
  - `nombre`, `email`, `telefono`
  - `titulo`, `descripcion`
  - `equipo_id` (FK `ON DELETE SET NULL`, ya resuelto desde el QR)
  - `expires_at`, `created_at`
- **TTL: 24 h.**
  - El token no cambia una credencial: crea un ticket.
  - Quien escanea frente al equipo suele leer el mail más tarde.
  - Reset usa 60 min (`2026-09-28-reseteo-contrasena-olvidada/design.md`, ADR-3) porque cambia una
    contraseña.
- **Purga de PII sin verificar**:
  - la fila se borra al confirmar;
  - cada solicitud nueva hace `DELETE ... WHERE expires_at < now()` en su tenant;
  - no hay scheduler.

  Los tokens de master no se barren, igual que en el precedente.

**Confirmación atómica sin CAS en master.**

1. Dentro de `txRunner.run`, que es reentrante (`tenant-transaction-runner.ts:92-94`), se hace
   `DELETE FROM pedidos_publicos_pendientes WHERE id = $1 RETURNING *`.
2. Con lo que devuelve, se crea el externo y se llama a `CrearTicketSoporteUseCase`, que participa
   de la misma transacción.
3. Si el caso de uso devuelve `fail` (por ejemplo, 409 sin ciclo), se lanza un error centinela. El
   ROLLBACK restaura la fila, y el link sigue siendo válido.
4. Dos confirmaciones concurrentes se serializan sobre la fila: la segunda recibe 0 filas y responde
   con el 404 uniforme.
5. `used_at` se marca en master **post-commit**, como best-effort. Si falla, el pendiente ya no
   existe y el token igual da 404.

El orden de locks es pendiente, después equipo y después advisory. La baja no toca pendientes, así
que no hay ciclo de deadlock.

### ADR-8: throttling de D10 sin XFF y sin un segundo `forRoot`

Se copia el wiring de `RecuperacionPasswordModule` (`recuperacion-password.module.ts:114-116`):

- `getOptionsToken()` y `ThrottlerStorage` se proveen **locales** a `FormularioPublicoModule`;
- no hay `ThrottlerModule.forRoot` (el único está en `csat.module.ts:85`).

`@nestjs/throttler@6.5.0` admite `getTracker` por throttler con nombre
(`throttler-module-options.interface.d.ts:12`) y `errorMessage` en las opciones
(`:21`).

| Throttler | Ruta | Límite | Tracker |
|---|---|---|---|
| `email` | `POST solicitud` | 3 / 15 min | `email.trim().toLowerCase()` del body. Es **global** por email, no por slug: es más estricto que el escenario de la spec y frena el bombardeo de una casilla a través de varios clientes |
| `cliente` | `POST solicitud` | 30 / 60 min | `params.slug`. Un slug inexistente tiene su propio contador, así que el 429 no revela existencia |
| `contexto` | `GET contexto` | 30 / 60 s | `${xff}:${slug}`, molde de `csat-throttler.guard.ts:45`. Solo frena enumeración; no protege una escritura |
| `confirmacion` | `POST confirmar` | 5 / 15 min | El token del body |

- Cada ruta aplica `@SkipThrottle` sobre los throttlers que no le corresponden.
- El 429 lleva un solo mensaje genérico. No dice cuál límite se superó.
- Cuentan todos los pedidos que llegan al guard, también los que nunca se verifican (spec, `:95`).

**Limitación conocida**: el storage vive en la memoria de un solo proceso, igual que en CSAT y en
reset. No escala horizontalmente, y un reinicio pone los cupos en cero.

### ADR-9: rutas y camino autenticado de D3

**Rutas del backend**, en el módulo `backend/src/publico/` (`FormularioPublicoModule`):

| Método y ruta | Respuesta |
|---|---|
| `GET publico/c/:slug/pedido/contexto?e=` | `{ cliente: {nombre}, equipo: {nombre} \| null, modo: 'EXTERNO' \| 'SESION' }` o 404 |
| `POST publico/c/:slug/pedido/solicitud` | 202 con un cuerpo constante. El mail sale por `ITareasSegundoPlano`. Responde 404 si no es `LISTO` y 429 si se excede el límite |
| `POST publico/c/:slug/pedido/confirmar` (`{ token }`) | `{ numero }` o 404. Exige que `cliente.slug === :slug`, además del tenant del token |

El BFF ya reenvía el prefijo `publico/` (`frontend/src/app/api/[...path]/route.ts:61-64`).

**Rutas del frontend**:

- `(publico)/c/[slug]/pedido/page.tsx`.
- `(publico)/c/[slug]/pedido/confirmar/page.tsx`. Lee `#token=` y lo consume solo en el POST, como en
  reset: un escáner de links no lo quema.
- Se agrega `"/c/"` (prefijo) a `RUTAS_PUBLICAS` (`middleware.ts:36`). Un test comprueba que
  `/clientes` y `/compras` siguen protegidas.

**D3 (modo `SESION`).** La página redirige a
`/login?siguiente=/pedido-qr?c=<slug>&e=<token>`.

- Hoy el login siempre navega a `/` (`use-login.ts:107`), y el middleware redirige `/login` con
  sesión viva a `/` (`middleware.ts:65-76`).
- Ambos pasan a usar `destinoPosLogin(siguiente)`, en `frontend/src/shared/auth/destino-pos-login.ts`.
  Es una allowlist que **solo** acepta el path `/pedido-qr` con su query, para que no haya open
  redirect. Cualquier otro valor cae a `/`.
- El selector multi-cliente (`selectCliente`, `use-login.ts:121-124`) comparte el mismo `onSuccess`.

**Landing autenticada**: `(dashboard)/pedido-qr/page.tsx`.

1. Llama a `GET /soporte/qr?c=&e=`.
2. Si el slug de la sesión no coincide con `c`, responde 404, y la UI dice que el QR es de otra
   organización. Así queda cubierto el escenario "sesión de otro cliente": no escribe en A.
3. Si coincide, resuelve el token **en el tenant de la sesión** y devuelve `{ equipo: {id, nombre} | null }`.
4. Abre `TicketSoporteCreateDialog` (`features/equipos/components/ticket-soporte-create-dialog.tsx`)
   con dos props nuevas, `equipoInicial` y `abiertoInicial`. El alta usa `POST /soporte`, que ya
   existe.

D6 no se aplica a esta vía: es el alta autenticada vigente.

### ADR-10: librería de QR y formato de la URL

- No hay ninguna dependencia de QR (`frontend/package.json:16-44`).
- **Elección**: `uqr` (unjs). No tiene dependencias, es ESM y corre en el cliente. Con `encode()` se
  dibuja un `<svg>` propio, sin `dangerouslySetInnerHTML`.
- La descarga es en SVG y en PNG, vía canvas.
- **Fallback**: `qrcode-generator`, que tampoco tiene dependencias.
- En apply hay que verificar la licencia y el tamaño.
- **El lockfile cambia, y el deploy aborta** (`deploy.ps1:187-193`): hay que instalar a mano con los
  servicios detenidos. Se anota en el PR.

**Formato**: `${APP_BASE_URL}/c/<slug>/pedido?e=<token>`.

- El token se arma con `randomBytes(16)` en base64url: son 22 caracteres y 128 bits.
- Se guarda `sha256` hex en `equipos_informaticos.qr_token_hash`, que es UNIQUE nullable, junto con
  `qr_emitido_at`.
- La URL la arma el **backend**, en la respuesta de `POST /equipos/:id/qr`. El frontend no compone
  nada y no se lee el header `Host`.
- El token solo se muestra al emitirlo. Para reimprimir hay que regenerar, y eso invalida el QR
  anterior (`equipos-qr/spec.md:13`). La UI lo advierte.

### ADR-11: copy

- El copy de la UI usa voseo, como el resto del frontend (`use-login.ts:76-80`,
  `login/page.tsx:36-37`).
- Los mensajes del backend son neutros, como `encuesta-publica.controller.ts:49`. El frontend mapea
  el 429 y el 404 a su propio copy.
- Los artefactos son neutros.

### ADR-12: exposición gradual

`FormularioPublicoModule` se registra en `app.module.ts` **recién en la WU-16**, en el mismo PR que
la página de confirmación. Hasta entonces las rutas públicas no existen y se prueban con un
`TestHarnessModule` (molde `csat.e2e.spec.ts:91`).

Además, la habilitación nace en `false` (D12).

---

## Data Flow

```
GET contexto ─ Throttler(contexto) ─ ResolverClientePublicoService(slug) ─404─┐
   └ bind tenant ─ estado() ─ findByQrHash(sha256(e)) en ESE tenant ─ 200 {modo, equipo|null}
POST solicitud ─ Throttler(email, cliente) ─ ValidationPipe ─ resolver(slug) ─ estado≠LISTO→404
   └ purga vencidos ─ equipoId←QR ─ save pendiente(tenant) + token(master, sha256) ─ 202
   └ (setImmediate) correo.enviar(link APP_BASE_URL/c/<slug>/pedido/confirmar#token=…)
POST confirmar ─ Throttler(confirmacion) ─ findByHash ─ cliente ok + slug igual + LISTO ─ bind
   └ txRunner.run{ DELETE pendiente RETURNING ─ save externo ─ CrearTicketSoporteUseCase
                   (equipoInvalido:OMITIR, prioridad MEDIA, autor AUTOR_FORMULARIO_PUBLICO) }
   └ post-commit: marcar used_at (master) ─ mail con número ─ TicketCreadoEvent (SLA)
```

---

## Interfaces / Contracts

```ts
// equipos/application/use-cases/crear-ticket-soporte.use-case.ts (modificado)
export interface CrearTicketSoporteDto {
  /* ...campos actuales... */
  solicitanteId?: string | null;        // exactamente uno de los dos
  solicitanteExternoId?: string | null;
  equipoInvalido?: 'RECHAZAR' | 'OMITIR'; // default 'RECHAZAR'
}
// notificaciones/domain/ports/i-contacto-solicitante-resolver.ts
export interface IContactoSolicitanteResolver {
  resolver(t: { solicitanteId: string | null; solicitanteExternoId: string | null }):
    Promise<(ContactoUsuario & { esExterno: boolean }) | null>;
}
```

```
PedidoPublicoDto { nombre 1-120, email IsEmail ≤254, telefono? ≤30, titulo 3-150,
                   descripcion 1-4000, equipoToken? ≤64 }   // sin multipart (D9)
```

---

## Superficie de abuso

| Si esto falla | Abuso | Test que DEBE existir |
|---|---|---|
| El tenant sale del body, la query o un header | Escritura en un tenant ajeno | e2e con dos tenants y guards reales: un `clienteId` de B en el body escribe en A. Mutar el `bind` pone el test en rojo |
| Un token QR resuelve fuera del tenant del slug | Fuga de datos de equipos de B | e2e: un token de B en el slug de A da `equipo: null`, y el cuerpo es byte a byte igual al de un token inexistente |
| Los rechazos se distinguen entre sí | Enumeración de clientes | e2e: slug inexistente, deshabilitado, inactivo y borrado dan el mismo status, el mismo cuerpo y los mismos headers (sin `Date`) |
| El tracker usa XFF | Bypass de D10 | Guard: el mismo email con XFF distintos comparte cupo, y el 4.º intento da 429 |
| Dos confirmaciones crean dos tickets | Duplicados | Integración: `Promise.all` de dos confirmaciones da un ticket y un 404 |
| Hay un 409 después de consumir | El link se pierde | Integración: sin ciclo activo, responde 409, no queda ticket, el pendiente sigue y el link sigue válido |
| El cliente elige la prioridad | SLA corto forzado | e2e: con `prioridadId` CRITICA, el ticket sale MEDIA |
| `siguiente` acepta una URL arbitraria | Open redirect | Unit de `destinoPosLogin`: `//evil`, `https:` y `/tickets` caen a `/` |
| El externo recibe el link a `/tickets/:id` | Página de login inútil | Plantilla: la variante externa no lleva enlace |
| El slug cambia después del QR | QR impresos rotos | Integración: CAS concurrente entre emitir y cambiar el slug; nunca quedan las dos escrituras |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Slug VO, entidades (vigencia, exclusividad), plantillas, trackers, `destinoPosLogin`, política `OMITIR` y `RECHAZAR` | Vitest con dobles |
| Integración | CHECK y migración (las filas viejas se conservan), CAS del slug, DELETE RETURNING concurrente, `findByQrHash` | Postgres real. `usarLockMasterTest()` en todo spec que trunca master |
| E2E | Config ROOT/ADMIN (403), emisión de QR, contexto, solicitud, confirmación, D3 `GET /soporte/qr` | Guards reales, `overrideProvider(EMAIL_SENDER)`, `esperarPendientes()`, emails distintos por test |
| Frontend | Middleware `/c/`, schemas Zod, página pública (dos modos), confirmación (fragmento, `replaceState`), landing, diálogo de QR | Testing Library + msw |

---

## Threat Matrix

N/A en todas las filas de `references/threat-matrix.md`: no hay shell, subprocesos, VCS/PR ni
clasificación de ejecutables. El borde adversarial es HTTP público y queda cubierto por "Superficie
de abuso", que `sdd-tasks` tiene que propagar sin cambios.

---

## Migration / Rollout

- **Master** (WU-1 y WU-10): aditiva.
  - `clientes.slug`: varchar(63) UNIQUE nullable, con CHECK de formato.
  - `formulario_publico_habilitado`: default `false`.
  - `slug_congelado_at`.
  - `pedido_publico_tokens`.
- **Tenant** (WU-4, WU-6 y WU-10): columnas QR, `solicitantes_externos`, el nullable con su CHECK y
  `pedidos_publicos_pendientes`, vía `migrate:tenants`.
  - Solo es irreversible el `SET NOT NULL` una vez que hay tickets externos (ADR-6).
- **Rollback operativo**: deshabilitar el formulario por cliente lo vuelve inerte.
  - Un QR emitido antes de la WU-16 apunta a una ruta que todavía no existe. No hay que anunciar
    nada hasta que la cadena esté completa.

---

## Work Units (`auto-chain`, un PR por WU; estimación ya corregida por 2)

| WU | Alcance | Líneas |
|---|---|---|
| 1 | Master: slug, habilitación y `slug_congelado_at`; VO, entidad, mapper, `findBySlug` y CAS; integración | ~280 |
| 2 | `ConfigurarFormularioPublicoUseCase` + `PATCH /clientes/:id/formulario-publico` + e2e ROOT/ADMIN | ~340 |
| 3 | FE: `configurar-formulario-publico-dialog` (molde `configurar-csat-dialog`) + hook + test | ~300 |
| 4 | Tenant: QR, `EmitirQrEquipoUseCase` (congela primero) y `POST /equipos/:id/qr` + tests | ~380 |
| 5 | FE: dependencia `uqr` y panel de QR en `equipo-detail-view` con descarga + tests | ~280 |
| 6 | Tenant: `solicitantes_externos`, nullable con CHECK, entidad, mapper y repo + integración | ~350 |
| 7 | Lectores de listado y detalle (tabla de ADR-6), DTO y tolerancia en el FE | ~300 |
| 8 | `IContactoSolicitanteResolver`, listeners de estado, comentario y CSAT, plantilla sin link | ~330 |
| 9 | `CrearTicketSoporteUseCase`: solicitante externo y `equipoInvalido` + tests de carrera | ~280 |
| 10 | Master `pedido_publico_tokens` y tenant `pedidos_publicos_pendientes`: entidades, repos e integración | ~340 |
| 11 | `ResolverClientePublicoService`, contexto, guard, módulo (sin registrar) + e2e del 404 | ~380 |
| 12 | `SolicitarPedidoPublicoUseCase`, plantilla y `POST solicitud` + e2e de throttle | ~380 |
| 13 | `ConfirmarPedidoPublicoUseCase` y `POST confirmar` + e2e (dos tenants, concurrencia, inactivo) | ~400 |
| 14 | FE: `/c/` en el middleware, página pública, schema y hooks + tests | ~380 |
| 15 | D3: `GET /soporte/qr`, `destinoPosLogin`, `use-login`, middleware de `/login` y landing `pedido-qr` con el diálogo precargado | ~400 |
| 16 | FE: página de confirmación + **registro en `app.module.ts`** + viñeta del roadmap Cumplida o Desviación | ~250 |

**Total**: ~5.400 líneas, contra 1.600-2.400 en la propuesta.

- Las WU 13 y 15 están en el techo de las 400 líneas. Si la WU-15 se pasa, se parte en backend
  (`GET /soporte/qr`) y frontend.
- Cada WU compila y pasa sus tests sola, y se revierte con `git revert`.
- **Deuda de Ayuda**: formulario público, QR en la ficha y configuración ROOT. Se anota en el commit
  y en el PR de las WU 3, 5, 14 y 16. La retención de datos de D11 se anota en el PR de la WU-6.

---

## Open Questions

- [ ] **Comentarios públicos al externo**: D5 enumera el número, los estados y el CSAT, así que el
      diseño **no** manda los comentarios. Si el dueño los quiere, es un cambio de una línea en la
      WU-8. Es un riesgo de desviación, no una decisión de este diseño.
- [ ] **Throttle por email global** (más estricto que el escenario "en el mismo cliente"). Hay que
      confirmar que no contradice D10.
- [ ] **TTL de 24 h** para el link de verificación. Es una decisión técnica; el dueño puede pedir
      otro valor.
- [ ] Hay correcciones de redacción de la spec pendientes (ADR-5). Las aplica el orquestador o
      `sdd-spec` antes de `sdd-tasks`.
