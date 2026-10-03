# Apply progress: formulario-publico-qr

## WU-1 — Master: slug, habilitacion y congelamiento (completa, sin commitear por exceder el presupuesto)

Modo: estandar (sin TDD estricto). Tareas 1.1 a 1.7 marcadas en `tasks.md`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/clientes`: 46 archivos, 346 tests, todos verdes |
| Runtime harness | Integracion contra `soporte_master_test` (`prisma-cliente.repository.integration.spec.ts`): unicidad, CHECK, CAS |
| Rollback | Migracion `20261003120000_add_cliente_formulario_publico` con `rollback.sql`; sin consumidores todavia |

### Decisiones tomadas en apply

- `toPersistence()` omite `slug` y `slugCongeladoAt`: solo los CAS del repositorio los escriben, asi un `save()` con una entidad vieja no descongela. `formularioPublicoHabilitado` si es espejo.
- `cambiarSlugSiNoCongelado` devuelve `'CAMBIADO' | 'CONGELADO' | 'DUPLICADO'` (P2002 se traduce en infraestructura).
- `habilitarFormulario` devuelve `Result` con `SlugRequeridoError`; `configurarSlug` devuelve `Result` y rechaza slug congelado.
- `SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`, largo maximo 63 (CHECK espeja el regex).
- 18 specs existentes con dobles de `IClienteRepository` recibieron 3 stubs (`findBySlug`, `congelarSlug`, `cambiarSlugSiNoCongelado`).

## WU-2 — Configurar formulario publico (BE) (completa)

Modo: estandar (sin TDD estricto). Tareas 2.1 a 2.4 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu02`, apilada sobre `feat/formulario-publico-qr-wu01`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Unit | `configurar-formulario-publico.use-case.spec.ts` (11 casos): no ROOT, cliente inexistente antes del CAS, CONGELADO, DUPLICADO, sin slug, mismo slug sin CAS |
| Controller | `clientes.controller.spec.ts`: mapeo 403/404/400/409 y delegacion con el actor |
| Runtime harness | e2e `formulario-publico.e2e.spec.ts` contra `soporte_master_test` con guards reales: 401, ADMIN 403, ROOT 200, 404, 409 (sin slug, duplicado, congelado), 400 (formato, UUID, dbName) |
| Rollback | Sin migracion; `git revert` limpio. El endpoint solo lo usa ROOT y el formulario sigue apagado |

### Decisiones tomadas en apply

- Orden del caso de uso: ROOT, `findById` (404) ANTES del CAS, validacion en memoria (slug y habilitacion), CAS del slug, `save` solo si cambio la habilitacion. Cierra el arrastre del verificador de WU-1 (cliente inexistente daba `CONGELADO`).
- Un slug igual al actual no es un cambio: no toca el CAS ni falla por congelado.
- Mapeo HTTP: `SlugInvalidoError` 400; `SlugCongeladoError`, `SlugDuplicadoError`, `SlugRequeridoError` 409; `ClienteNoEncontradoError` 404; nuevo `OnlyRootCanConfigurarFormularioError` 403.
- `ClienteResponseDto` suma `slug` y `formularioPublicoHabilitado` (la spec pide poder consultar la configuracion); se actualizaron 2 `toEqual` del spec del controller.
- DTO: `@Matches(SLUG_REGEX)` y `@MaxLength` cortan la basura en el borde; el dominio sigue siendo la fuente (UUID, id, dbName).

## WU-3 — FE: dialogo de configuracion (completa)

Modo: estandar. Tareas 3.1 a 3.3 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu03`, apilada sobre `feat/formulario-publico-qr-wu02b`. `size:exception` (434 lineas de frontend): el hook quedaria sin test propio si se partiera. Dos commits: frontend, y un fix de backend con `code` en los errores del slug.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/features/clientes`: 7 archivos, 73 tests verdes (7 del dialogo + casos del schema) |
| Runtime harness | N/A: componente aislado, MSW para el PATCH. Backend: e2e `formulario-publico.e2e.spec.ts` asevera `code` en 400/409 |
| Rollback | Revertir los dos commits; el dialogo solo se monta en `ClienteAcciones` (ROOT) |

### Decisiones tomadas en apply

- El dialogo manda solo lo que cambio; slug invalido y habilitar sin slug se rechazan en el front sin llamar al backend.
- El aviso se decide por `ApiError.code` (mapa en el hook); sin codigo cae al mensaje del backend.
- Hallazgo: el backend no enviaba `code` en estos errores. Se corrigio en `toHttpException` para los cuatro errores del slug. El 400 de borde del DTO (`@Matches`) sigue sin `code` y cae al mensaje.
- El front no sabe si el slug esta congelado (la respuesta no lo trae): se entera por el 409.
- Deuda de Ayuda: boton "Formulario" (solo ROOT) por fila de cliente, con slug y habilitacion. No hay articulo previo que se vuelva falso.
- `pnpm lint` del frontend requiere `JWT_SECRET` en el entorno (se uso un valor ficticio).

## WU-4 — QR del equipo (BE) (completa)

Modo: estandar. Tareas 4.1 a 4.5 marcadas en `tasks.md`. Cuatro ramas apiladas sobre `feat/formulario-publico-qr-wu03`: `wu04` (4a), `wu04b` (4b), `wu04c` (4c), `wu04d` (4d). Se partio porque el total (1.051 lineas) excede el presupuesto de 400 y cada parte lleva sus tests.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Integracion | `prisma-equipo-informatico.qr.integration.spec.ts` (tenants efimeros A y B): `findByQrHash`, regeneracion, aislamiento entre tenants, CAS sobre equipo de baja/borrado/inexistente, UNIQUE nullable, `save()` no pisa el QR, `rollback.sql` |
| Unit | `emitir-qr-equipo.use-case.spec.ts` (11): sin slug, CAS en 0 filas, congela antes de escribir, token 128 bits distinto del id, regenerar, baja, cliente inexistente; `equipos.controller.spec.ts` (accion, 404/403/409 con `code`/422) |
| Runtime harness | e2e `emitir-qr-equipo.e2e.spec.ts` con guards reales: 401, 403 (sin congelar), 201 con solo el hash en la base, regeneracion, 409 `QR_REQUIERE_SLUG`, 404/422, carrera emitir vs cambiar slug (12 iteraciones, 3 corridas) |
| Rollback | Migracion `20261003130000_equipos_qr` con `rollback.sql` (borra los hashes); resto con `git revert` |

### Decisiones tomadas en apply

- Orden del caso de uso: equipo (404/baja) y cliente/slug se validan ANTES del CAS de master, asi un equipo inexistente no congela el slug del cliente. Luego `congelarSlug(id, slugLeido)` y despues `guardarQrHash`.
- `guardarQrHash` es un CAS (`activo = true AND deleted_at IS NULL`): una baja entre la lectura y la escritura da `false` y el caso de uso responde `EquipoDadoDeBaja`. `findByQrHash` devuelve tambien bajas y borrados: decidir "abre sin equipo" es del resolver de la WU-12.
- `save()` y `toPersistence()` no escriben `qr_*`: solo `guardarQrHash`, como el slug con sus CAS.
- Errores nuevos con `code` y 409: `QR_REQUIERE_SLUG`, `QR_SLUG_CAMBIADO`. `ClienteNoEncontradoError` mapea a 404. Los 404/422 existentes de equipos siguen sin `code` (mapeo compartido preexistente).
- Invariante de la carrera, corregida al escribir el e2e: emitir puede ganar con el slug NUEVO si el cambio llega antes de leerlo (201/CAMBIADO, URL con el slug nuevo ya congelado). Lo prohibido es un QR con un slug distinto del que quedo vigente.
- La URL se arma con `entorno.APP_BASE_URL` (sin barra final), nunca con `Host`. El token solo existe en la respuesta del POST.
- Entorno: hubo que aplicar la migracion a `soporte_tenant_test` (`DATABASE_URL_TENANT=... pnpm migrate:tenant`) para que los specs de integracion existentes vieran las columnas nuevas.
- Deuda de Ayuda: ninguna todavia (sin pantalla); el panel del QR es WU-5.


## WU-5 — FE: panel QR (completa)

Modo: estandar. Tareas 5.1 a 5.4 marcadas en `tasks.md`. Dos ramas apiladas sobre `feat/formulario-publico-qr-wu04d`: `wu05` (5a, dependencia y utilidades) y `wu05b` (5b, hook y panel). Se partio porque el total (495 lineas sin lockfile) excede el presupuesto de 400 y cada parte lleva sus tests.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/features/equipos`: 17 archivos, 212 tests verdes (5 de `qr-equipo.test.ts`, 11 de `equipo-qr-panel.test.tsx`) |
| Runtime harness | N/A: componente con MSW para el POST; canvas, `window.open` y descarga mockeados (jsdom no los implementa) |
| Rollback | Revertir 5b quita el panel y el hook; revertir 5a quita la dependencia y las utilidades |

### Decisiones tomadas en apply

- Libreria: `uqr` 0.1.3, MIT, 0 dependencias, 28 KB de ESM sin minificar, `sideEffects: false`. No hizo falta el fallback.
- El backend no informa si el equipo ya tiene QR (la ficha no trae `qrEmitidoAt`), asi que el boton siempre pide confirmacion y dice "Emitir QR" hasta que se emite uno en la sesion, luego "Regenerar QR". El token solo viaja en la respuesta del POST: se muestra mientras el panel esta montado y no se cachea (`gcTime: 0`).
- PNG: se dibujan los modulos directo en un canvas (sin pasar por `Image`/SVG), con la zona de silencio de 2 modulos. SVG: texto armado a mano con numeros fijos, sin HTML de usuario.
- Impresion: ventana propia con solo ese SVG y el nombre del equipo como `textContent`. Sin impresion en lote (fuera de alcance).
- Avisos por `ApiError.code`: `QR_REQUIERE_SLUG` y `QR_SLUG_CAMBIADO`; 404/403 sin codigo caen al mensaje del backend.
- Panel oculto sin `EQUIPOS:MODIFICACION` y para equipos dados de baja.
- Deuda de Ayuda: seccion nueva "QR del equipo" en `/equipos/[id]` (emitir, regenerar, descargar, imprimir; regenerar invalida el impreso). No hay articulo previo que se vuelva falso.
- Nota operativa: el lockfile cambia (9 lineas) y `deploy.ps1` aborta; el proximo deploy necesita `pnpm install` a mano con los servicios detenidos.

## WU-6 — Solicitantes externos (tenant) (completa)

Modo: estandar. Tareas 6.1 a 6.4 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu06`, apilada sobre `feat/formulario-publico-qr-wu05b`. `size:exception`: un solo commit porque la migracion, el repo y su integracion (que ejecuta las migraciones y el `rollback.sql`) se prueban juntos.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run` de `solicitante-externo.entity.spec.ts` (unit) y `prisma-solicitante-externo.repository.integration.spec.ts`: 2 archivos, 23 tests verdes |
| Runtime harness | Integracion contra dos tenants efimeros migrados: guardar/leer con y sin telefono, `findNombres` en lote, una fila por pedido (mismo email dos veces = dos filas), aislamiento A/B, `tickets.solicitante_id` sigue NOT NULL y sin `solicitante_externo_id`, `rollback.sql` |
| Rollback | Migracion `20261003140000_solicitantes_externos` con `rollback.sql` (DROP INDEX + DROP TABLE, destructivo); resto con `git revert`. Con la WU-7 aplicada, revertir esa primero (la FK RESTRICT frena el DROP) |

### Decisiones tomadas en apply

- Ubicacion: modulo `tickets` (entidad, puerto `ISolicitanteExternoRepository` con `save/findById/findNombres`, mapper, repo Prisma), registrado y exportado como `SOLICITANTE_EXTERNO_REPOSITORY` en `TicketsModule`. No hay doubles de test que actualizar: el puerto es nuevo (0 implementaciones previas rotas).
- `SolicitanteExternoEntity.create` devuelve `Result` con `SolicitanteExternoInvalidoError` (`code` `SOLICITANTE_EXTERNO_INVALIDO`): nombre 1-120, email valido hasta 254 (minusculas, trim), telefono hasta 30 (vacio pasa a null). Sin baja logica: la tabla no tiene `deleted_at` (D11: se conserva mientras exista el ticket).
- `save` solo inserta (sin upsert por email, una fila por pedido confirmado).
- Retencion D11 anotada como punto a revisar en la migracion, en `schema.prisma`, en `tasks.md` y para el cuerpo del PR.
- Entorno: se aplico la migracion a `soporte_tenant_test` con `pnpm migrate:tenant` y `DATABASE_URL_TENANT` explicita.
- Deuda de Ayuda: ninguna (sin pantalla ni flujo visible).

## WU-7 — Solicitante nullable, CHECK y tipos (completa)

Modo: estandar. Tareas 7.1 a 7.5 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu07`, apilada sobre `feat/formulario-publico-qr-wu06b`. `size:exception`: un solo commit (ver nota en `tasks.md`).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/tickets/...`: 52 archivos, 474 tests verdes (incluye `tickets-solicitante-externo.integration.spec.ts`, 9 tests contra tenant efimero) |
| Runtime harness | Integracion: `solicitante_id` nullable, solo uno de los dos pasa, ambos y ninguno fallan con el CHECK (tambien en UPDATE), FK inexistente y RESTRICT, `rollback.sql` falla por diseño con un ticket externo y es atomico, ida y vuelta conserva las filas viejas |
| Rollback | `20261003150000_tickets_solicitante_externo/rollback.sql` (SET NOT NULL falla por diseño si hay tickets externos); resto con `git revert` |

### Decisiones tomadas en apply

- `TicketProps.solicitanteExternoId` es opcional en el tipo (ausente = null) para no tocar ~60 callers de `reconstitute`/`create`; el getter siempre devuelve `string | null`. `TicketEntity.create` lanza si no hay exactamente uno de los dos (espeja el CHECK).
- Lectores tocados: `tickets.controller.ts` (`resolverNombresPorTicket` saltea el nulo), `ticket.dto.ts` y `frontend/src/features/tickets/types.ts` (`solicitanteId: string | null`), `ticket-header.tsx` (fallback "—"), listeners `ticket-notificacion` (2) y `ticket-csat` (guard provisorio, no envian), SLA (`i-sla-ticket-query.repository.ts`, `sla-vencido.event.ts`). Los chequeos de dueño (`obtener-ticket`, `listar-timeline`, `adjuntar-archivo`) no cambian: `null !== actorId` deniega; con tests nuevos.
- No hay doubles de test de puertos que actualizar (el puerto `ITicketRepository` no cambio). Un fixture de `ticket.mapper.spec.ts` suma `solicitanteExternoId: null`.
- El spec de integracion de la WU-6 se ajusto: se quito la prueba "no toca tickets" (ahora falsa) y su prueba de rollback revierte primero el de la WU-7 (la FK RESTRICT frena el DROP).
- `rollback.sql` se ejecuta como una sola sentencia multiple (psql `-1` o el cliente `pg`) para que la falla sea atomica.
- Entorno: se aplico la migracion a `soporte_tenant_test` con `pnpm migrate:tenant` y `DATABASE_URL_TENANT` explicita.
- Deuda de Ayuda: ninguna (sin pantalla; los tickets existentes se ven igual).


## WU-8 — Lectores con datos del externo (completa, 4/4)

Un solo commit (~232 lineas con tests, bajo el limite de 400); sin `size:exception`.

- Backend: `TicketsController` recibe `SOLICITANTE_EXTERNO_REPOSITORY` (decimo cuarto argumento). `resolverNombresPorTicket` junta los ids de externos de todo el lote y hace UN `findNombres` (sin N+1); `NombresResueltos.solicitanteExterno` alimenta `solicitanteNombre` (apellido queda null). `GET /tickets/:id` hace `findById` solo si el ticket es externo y agrega `solicitanteTelefono` (null si no cargo); el listado no trae la clave.
- `ticket.dto.ts`: `solicitanteExternoId`, `solicitanteEsExterno`, `solicitanteTelefono?`.
- Frontend: `types.ts` espeja los campos; `ticket-header.tsx` muestra la fila "Teléfono" solo si el valor no es nulo; todo es texto de React (sin `dangerouslySetInnerHTML`).
- Tests: controller (listado mixto sin telefono y con un solo batch; detalle con telefono, sin telefono, registrado sin consulta al externo); header (con y sin telefono, y `<script>` en titulo, nombre y telefono como texto, sin nodo `script`).
- Verificacion: backend lint/typecheck limpios, `pnpm test` 562 archivos / 7073 tests; frontend lint, type-check, 230 archivos / 1817 tests; casts 627/116; roadmap fresco.
- Deuda de Ayuda: el detalle de ticket ahora muestra nombre y telefono del solicitante externo (y el listado su nombre); el articulo de tickets debe mencionarlo en la tanda final.


## WU-9 — Resolver de contacto y listeners (completa, 3/3)

Modo: estandar. Partida en dos commits: 9a en `feat/formulario-publico-qr-wu09` (resolver + spec, 138 lineas) y 9b en `feat/formulario-publico-qr-wu09b` (listeners, plantillas, modulos y specs). `size:exception` para 12b (625 lineas, 340 de e2e): partirlo separaria el codigo de su unico test.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/notificaciones src/csat`: 24 archivos, 184 tests verdes (resolver 5, plantillas, listeners) |
| Runtime harness | N/A: listeners y plantillas son unitarios con dobles de puertos; el resolver solo compone dos puertos ya cubiertos por integracion (WU-6) |
| Rollback | `git revert` de 9b (los listeners vuelven al guard de WU-7) y luego de 9a |

### Decisiones tomadas en apply

- `IContactoSolicitanteResolver.resolver(ticket)` recibe `{ solicitanteId, solicitanteExternoId }` (el `TicketEntity` cumple estructuralmente). Adaptador sin Prisma: compone `IUsuarioContactoResolver` y `ISolicitanteExternoRepository.findById`. Se exporta `CONTACTO_SOLICITANTE_RESOLVER` desde `NotificacionesModule`; `CsatModule` lo usa.
- Plantillas de estado y comentario publico: flag opcional `sinLink` (el listener lo pasa desde `contacto.esExterno`); sin link, ni texto ni HTML contienen `/tickets/`. El titulo sigue escapado (test con `<script>`).
- Los listeners SLA vencido y preventivo siguen con `IUsuarioContactoResolver` (destinatarios internos).
- Comentario interno: no publica `TicketComentadoEvent`, por lo que el listener nunca corre; el test lo deja documentado.
- Deuda de Ayuda: los externos reciben mails de estado, comentario publico y CSAT.


## WU-10 — `CrearTicketSoporteUseCase` para externos (completa, 3/3)

Modo: estandar. Rama `feat/formulario-publico-qr-wu10`, apilada sobre `feat/formulario-publico-qr-wu09b`. Un solo commit (bajo el limite de 400); sin `size:exception`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `crear-ticket-soporte.use-case.spec.ts`: 24 tests verdes (OMITIR con equipo inexistente, de baja y eliminado; RECHAZAR explicito y default; lock antes de numerar con OMITIR; externo sin consulta a master; autor `AUTOR_FORMULARIO_PUBLICO`; ambos o ninguno solicitante lanza) |
| Runtime harness | Integracion `baja-equipo.concurrencia.integration.spec.ts` caso (e2) contra tenant efimero: baja vs ticket externo con `OMITIR`, 10 iteraciones con orden alternado; el ticket siempre se crea, con equipo solo si la baja llego despues, y ambos caminos se observan |
| Rollback | `git revert` del commit; sin migracion. El alta autenticada sigue con `RECHAZAR` por defecto |

### Decisiones tomadas en apply

- `CrearTicketSoporteDto`: `solicitanteId` y `solicitanteExternoId` opcionales (exactamente uno), `equipoInvalido?: 'RECHAZAR' | 'OMITIR'` (default `RECHAZAR`). Ambos o ninguno es un error de programacion del caller: lanza, como el catalogo faltante, en vez de `Result.fail`.
- El externo no pasa por `IUsuarioMasterChecker`: lo respalda la FK de `tickets.solicitante_externo_id`.
- `OMITIR` conserva el `FOR SHARE` previo a numerar; solo cambia el desenlace (equipoId null en vez de `EquipoInvalidoError`).
- `AUTOR_FORMULARIO_PUBLICO` en `tickets/domain/constants/formulario-publico.constants.ts`. El caller (WU-14) lo pasa como `autorId`.
- El spec de integracion existente (carrera baja vs ticket) se extendio con (e2) en lugar de crear un spec nuevo, para reutilizar sus fixtures y su escalonado por locks.
- Deuda de Ayuda: ninguna (sin pantalla).


## WU-11 — Tokens y pendientes (completa, 4/4)

Modo: estandar. Rama `feat/formulario-publico-qr-wu11`, apilada sobre `feat/formulario-publico-qr-wu10`. Cuatro commits (11a a 11d), cada uno bajo 400 lineas, con sus tests; sin `size:exception`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/publico`: 4 archivos, 39 tests verdes (8 de `PedidoPublicoTokenEntity`, 12 de `PedidoPendienteEntity`, 7 de integracion master, 12 de integracion tenant) |
| Runtime harness | Integracion master (`soporte_master_test`): hash UNIQUE, FK a clientes, `marcarUsado` con 8 llamadas concurrentes (gana una), `rollback.sql` y reaplicacion. Integracion tenant (dos tenants efimeros): `DELETE ... RETURNING` con 6 confirmaciones concurrentes cada una en su transaccion (gana una), ROLLBACK restaura la fila, purga solo de vencidos y solo del tenant activo, FK `SET NULL`, aislamiento A/B, `rollback.sql` |
| Rollback | Migraciones `20261003160000_pedido_publico_tokens` (master) y `20261003170000_pedidos_publicos_pendientes` (tenant), ambas con `rollback.sql` (destructivo: los links enviados responden 404); el modulo `src/publico` no tiene consumidores todavia, `git revert` limpio |

### Decisiones tomadas en apply

- Modulo `backend/src/publico/` (domain y infrastructure; `FormularioPublicoModule` llega en la WU-12 sin registrar).
- `PEDIDO_PUBLICO_TTL_MS` (24 h) vive en `domain/constants`; ambas entidades lo aplican al crear (`PedidoPublicoTokenEntity.emitir`, `PedidoPendienteEntity.create`). El instante exacto de `expiresAt` ya cuenta como vencido (`<=`).
- `PedidoPendienteEntity.create` devuelve `Result` con `PedidoPendienteInvalidoError` (limites del DTO de ADR: nombre 1-120, email 254, telefono 30, titulo 3-150, descripcion 1-4000); normaliza igual que el solicitante externo.
- `IPedidoPendienteRepository`: `save`, `consumir(id)` (`DELETE ... RETURNING` por SQL crudo, devuelve la fila o null, no filtra vigencia: el caller valida `isExpired()`), `purgarVencidos(ahora?)`. Usa `TenantContext.getClient()`, asi que dentro de `txRunner.run` participa de la transaccion y un ROLLBACK restaura la fila.
- `IPedidoPublicoTokenRepository`: `save`, `findByHash` (sin filtrar vigencia), `marcarUsado(id)` (CAS `used_at IS NULL`, post-commit best-effort). Sin barrido de tokens en master (ADR-7).
- Master: FK a `clientes` `ON DELETE RESTRICT`, indice por `cliente_id`. Tenant: FK a `equipos_informaticos` `ON DELETE SET NULL`, indice por `expires_at` (purga) e indice parcial por `equipo_id`.
- Entorno: se aplicaron ambas migraciones a `soporte_master_test` (`pnpm migrate:master`) y `soporte_tenant_test` (`pnpm migrate:tenant`) con `DATABASE_URL_*` explicita; en la integracion master, el test de `rollback.sql` reaplica `migration.sql` al terminar.
- Deuda de Ayuda: ninguna (sin pantalla ni flujo visible).


## WU-12 — Contexto público (completa, 3/3)

Modo: estandar. Rama `feat/formulario-publico-qr-wu12`, apilada sobre `feat/formulario-publico-qr-wu11d`. Dos commits: 12a (error + resolver + spec) y 12b (caso de uso, guard, controller, modulo, e2e). `size:exception` para 12b (625 lineas, 340 de e2e): partirlo separaria el codigo de su unico test.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/publico`: unit del resolver (13: cuatro rechazos, 7 formatos invalidos sin consultar la base, mensajes identicos, bind con datos de la fila) |
| Runtime harness | e2e `pedido-publico-contexto.e2e.spec.ts` (9 tests, dos tenants efimeros, guards reales): 404 uniforme (inexistente, deshabilitado, inactivo, borrado, mal formado: mismo status, cuerpo y headers sin `Date`), token de B en el slug de A byte a byte igual a inexistente y a sin token, baja y borrado = `equipo: null`, token desmedido, modos `EXTERNO`/`SESION`, 429 al 31.º pedido |
| Rollback | `git revert` de 12b y luego 12a; sin migracion y sin consumidores (el modulo no esta en `AppModule`) |

### Decisiones tomadas en apply

- `ResolverClientePublicoService` bindea el tenant (como `ResolverEncuestaTokenService`) solo si el cliente pasa todos los filtros, con `dbName` e `id` de la fila de master. Un slug fuera de `SLUG_REGEX`/largo se rechaza sin consultar la base. Un solo `FormularioPublicoNoDisponibleError` para todos los motivos; el controller lo mapea a un `NotFoundException` de mensaje fijo.
- `ConsultarContextoPedidoUseCase` reusa `hashTokenQr` de `equipos` y `findByQrHash`; token no-string, vacio o de mas de 128 caracteres cuenta como ausente. Equipo inactivo o borrado devuelve `equipo: null`. Solo nombres en la respuesta.
- `CORREO_DE_CLIENTE` no se exporta de `RecuperacionPasswordModule`: `FormularioPublicoModule` lo arma local (mismo adaptador y repo de config SMTP), como ya hace ese modulo con el repo de config; evita importar un modulo con controller propio.
- Throttler: opciones con nombre `contexto` (30 / 60 s) y `ThrottlerStorage` locales; tracker `${xff}:${slug}` (clase). Los throttlers `email`, `cliente` y `confirmacion` llegan en las WU-13/15 con `@SkipThrottle` por ruta.
- El e2e usa un `x-forwarded-for` distinto por request para no compartir cupo entre tests.
- Deuda de Ayuda: ninguna (sin pantalla; ruta no expuesta).


## WU-13 — Solicitud de pedido (completa, 3/3)

Modo: estandar. Rama `feat/formulario-publico-qr-wu13`, apilada sobre `feat/formulario-publico-qr-wu12b`. Tres commits (13a plantilla, 13b caso de uso, 13c ruta y e2e). `size:exception` para 13c: el e2e es la mitad del commit y separarlo dejaria el wiring sin prueba.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/publico`: 9 archivos, 81 tests verdes (3 de plantilla, 10 del caso de uso, 8 e2e) |
| Runtime harness | e2e `pedido-publico-solicitud.e2e.spec.ts` (dos tenants efimeros, guards reales, `EMAIL_SENDER` falso): 202 constante con la PII solo en el tenant y solo el hash en master; correo sin `LISTO` da 404 sin escribir; mismo email con XFF distintos comparte cupo (4.º da 429, sin mail); pedido 31 al cliente da 429 y otro cliente no se afecta; slug inexistente con contador propio (404 x30, luego 429) |
| Rollback | `git revert` de 13c, 13b y 13a; sin migracion y sin consumidores (el modulo no esta en `AppModule`) |

### Decisiones tomadas en apply

- El caso de uso corre sincrono (hay que decidir 404 vs 202) y solo el mail se difiere con `ITareasSegundoPlano`, desde el propio caso de uso. `TAREAS_SEGUNDO_PLANO` es local a `FormularioPublicoModule`, como en `RecuperacionPasswordModule`.
- Orden de escrituras: resolver, `estado() === LISTO`, validar el pendiente (entidad), purgar vencidos, guardar pendiente (tenant), guardar token (master). Un estado distinto de `LISTO` o datos invalidos no escriben nada. Un token de master nunca apunta a una fila inexistente; un pendiente huerfano lo barre la purga.
- Token de verificacion: `randomBytes(32)` en base64url (43 caracteres), solo el sha256 se persiste; el crudo vive unicamente en el link `APP_BASE_URL/c/<slug>/pedido/confirmar#token=...`.
- Trackers por throttler: cierra el hueco conocido de WU-12. `email` y `cliente` llevan su propio `getTracker` en las opciones con nombre del modulo (`trackerEmail`, `trackerCliente`, exportados del guard); el `getTracker` de la clase queda para `contexto`. `@SkipThrottle` por ruta: `contexto` salta `email` y `cliente`; `solicitud` salta `contexto`.
- Comportamiento del guard: los throttlers corren en orden; un 429 por email corta antes de `cliente`, asi que ese pedido rechazado no consume cupo del cliente. El 429 usa el mensaje por defecto de la libreria, el mismo para ambos limites.
- Cuerpo del 202 constante: `{ mensaje }` fijo. El 404 reusa el mensaje uniforme del contexto. Datos invalidos para el dominio (que el DTO deberia filtrar antes) dan 400.
- `PedidoPublicoDto`: `@Transform` recorta; `whitelist: true` descarta `prioridadId`, `clienteId` y similares (el e2e manda `prioridadId`).
- El caso de uso recibe `Pick<IEquipoInformaticoRepository, 'findByQrHash'>` para evitar un doble completo en el spec.
- Deuda de Ayuda: ninguna (sin pantalla; ruta no expuesta).


## WU-14 — Confirmación (UC) (completa, 3/3)

Modo: estandar. Rama `feat/formulario-publico-qr-wu14`, apilada sobre `feat/formulario-publico-qr-wu13c`. Tres commits (14a caso de uso y spec unit, 14b spec unit de rechazos, 14c integracion). 14a supera 400 lineas (495): el caso de uso y el doble de sus colaboradores no se separan de su spec.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/publico`: unit del caso de uso (16: camino feliz, orden tx/commit/marcarUsado, ROLLBACK ante fallo del ticket, 404 uniformes, MEDIA por codigo) e integracion (3) |
| Runtime harness | Integracion `confirmar-pedido-publico.use-case.integration.spec.ts` (tenant efimero, repos y `txRunner` reales, `CrearTicketSoporteUseCase` real): `Promise.all` de dos confirmaciones da un ticket, un solicitante y un 404; sin ciclo activo da `SinCicloActivoError`, sin ticket ni solicitante, pendiente intacto y el mismo link confirma cuando aparece el ciclo; `prioridadId` CRITICA ignorado, ticket MEDIA. Mutacion verificada: devolver `null` en vez de lanzar el centinela pone en rojo el caso de ciclo |
| Rollback | `git revert` de 14c, 14b y 14a; sin migracion y sin consumidores (el modulo no esta en `AppModule`) |

### Decisiones tomadas en apply

- Comando `{ slug, token }` (token crudo). Orden: `findByHash` + `isVigente()`, resolver del slug (bind), `token.clienteId === cliente.id` (un token de B en el slug de A es 404), correo `LISTO`, prioridad `MEDIA` por `findIdByCodigo` (si falta lanza, antes de abrir la transaccion), luego `txRunner.run`.
- Dentro de la transaccion: `consumir`; null o `isExpired()` devuelve el 404 (el vencido queda borrado, era PII sin verificar). Con el pendiente, guarda el solicitante externo y llama a `CrearTicketSoporteUseCase` (`solicitanteId: null`, `equipoInvalido: 'OMITIR'`, `autorId: AUTOR_FORMULARIO_PUBLICO`, `anio` del servidor).
- Un `Result.fail` del ticket (o del solicitante) lanza `ConfirmacionAbortadaError` (privado del archivo, lleva la causa): ROLLBACK restaura el pendiente y el caso de uso devuelve la causa (409 `SinCicloActivoError`). El resto de las excepciones se propaga.
- `marcarUsado` post-commit y best-effort: si falla se loguea con `ILogger.error` y la confirmacion sigue ok.
- Devuelve `PedidoPublicoConfirmado` (`ticketId`, `numero`, `nombre`, `email`, `clienteId`, `clienteNombre`) para que la ruta de la WU-15 mande el mail con el numero fuera de la transaccion.
- La integracion usa un doble en memoria del token de master (solo se prueba la atomicidad del tenant), asi que no toca `soporte_master_test` ni llama a `usarLockMasterTest()`.
- Deuda de Ayuda: ninguna (sin pantalla; ruta no expuesta).


## WU-15 — Ruta de confirmación (completa, 2/2)

Modo: estandar. Rama `feat/formulario-publico-qr-wu15`, apilada sobre `feat/formulario-publico-qr-wu14c`. Tres commits (15a plantilla, 15b servicio del mail, 15c ruta y e2e). `size:exception` para 15c: el e2e es la unica prueba del wiring.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/publico src/equipos`: 70 archivos, 930 tests verdes (2 de plantilla, 2 del servicio, 8 e2e) |
| Runtime harness | e2e `pedido-publico-confirmar.e2e.spec.ts` (dos tenants efimeros con catalogo y ciclo, guards reales, `EMAIL_SENDER` falso): `clienteId` y `dbName` de B inyectados en el body no escriben en B (ticket solo en A); mail con el numero a `email` del solicitante, nombre escapado; token de B en slug de A = mismo 404 que inexistente; cliente inactivo, token usado y vencido dan 404 sin ticket ni mail; 400 sin token; 409 sin ciclo con el pendiente intacto; 6.º intento con el mismo token y XFF distintos da 429 |
| Rollback | `git revert` de 15c, 15b y 15a; sin migracion y sin consumidores (el modulo no esta en `AppModule`) |

### Decisiones tomadas en apply

- `cliente.slug === :slug` ya lo garantiza el caso de uso de WU-14: el tenant sale del slug resuelto y `token.clienteId === cliente.id`. La ruta no repite la comprobacion.
- Mail: `NotificarPedidoCreadoService` (application/services) arma `templatePedidoCreado` y lo difiere con `ITareasSegundoPlano`; el controller lo llama despues de que el caso de uso devuelve (post-commit). No se toco el constructor del caso de uso de WU-14.
- Respuesta: 200 `{ numero }`; `SinCicloActivoError` 409; todo otro fallo 404 con el mensaje uniforme.
- Throttler `confirmacion` (5 / 15 min): tracker = sha256 del `token` del body (el crudo no vive en el storage en memoria), sin `x-forwarded-for`. `@SkipThrottle` de `contexto` y `solicitud` ahora tambien salta `confirmacion`; `confirmar` salta los otros tres.
- Wiring: `FormularioPublicoModule` importa `TicketsModule` (catalogos, solicitante externo) y `EquiposModule` ahora exporta `CrearTicketSoporteUseCase`; `ConfirmarPedidoPublicoUseCase` se arma por factory (como el resto del modulo). `CORREO_DE_CLIENTE` y `TAREAS_SEGUNDO_PLANO` siguen locales y sin registrar en `AppModule`.
- La plantilla no lleva link al ticket (el externo no tiene sesion) y escapa `nombre`, `clienteNombre` y `numero` en el html.
- Deuda de Ayuda: ninguna (sin pantalla).


## WU-16 — FE: página pública (completa, 3/3)

Modo: estandar. Rama `feat/formulario-publico-qr-wu16`, apilada sobre `feat/formulario-publico-qr-wu15b`. Tres commits (16a middleware, 16b schema y hooks, 16c container, formulario y página); sin `size:exception`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/middleware.test.ts src/features/pedido-publico 'src/app/(publico)'`: middleware 21 (6 nuevos: `/c/` pasa sin cookie, `/clientes`, `/compras` y `/admin/c/x` redirigen a `/login`), schema 13, hooks 7, vista 9, página 2 |
| Runtime harness | N/A: componentes y hooks aislados con MSW sobre `/api/publico/...`; el backend no esta registrado en `AppModule` todavia |
| Rollback | `git revert` de 16c, 16b y 16a; la ruta `/c/` deja de ser publica con 16a |

### Decisiones tomadas en apply

- Feature nueva `features/pedido-publico` (types, schemas, hooks, components). Hooks con `apiFetch` (como `use-solicitar-reset`): estas rutas no responden 401, asi que el refresh nunca corre.
- El contexto real es `{ cliente: {nombre}, equipo: {nombre} | null, modo }`. `EXTERNO` muestra el formulario; `SESION` hace `router.replace` a `/login?siguiente=<encodeURIComponent('/pedido-qr?c=<slug>&e=<token>')>`. El retorno post-login (`destinoPosLogin`) es WU-18: hoy el login ignora `siguiente`.
- Errores: 404 del contexto = mensaje uniforme sin reintento; 429, red y 5xx del contexto con reintento. Al enviar, 429/404/red/5xx se muestran sobre el formulario, que sigue disponible.
- Limites del schema espejan el DTO: nombre 1-120, email 254, telefono 30, titulo 3-150, descripcion 1-4000; se recorta como el backend. Telefono vacio no se manda.
- `equipoToken` viaja en el POST solo si hay `?e=`. Pagina server fina; `?e=` repetido toma el primero, vacio = null.
- Pantalla de confirmacion (`/c/<slug>/pedido/confirmar`) es WU-19.
- Deuda de Ayuda: pantalla publica nueva de pedido por QR (ver `tasks.md`).


## WU-17 — BE: `GET /soporte/qr` (completa, 2/2)

Modo: estandar. Rama `feat/formulario-publico-qr-wu17`, apilada sobre `feat/formulario-publico-qr-wu16b`. Tres commits (17a caso de uso y spec, 17b ruta y e2e, 17c artefactos); sin `size:exception`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/equipos`: unit `resolver-qr-autenticado.use-case.spec.ts` (11: slug distinto da 404 sin buscar el token; cliente inexistente, inactivo o sin slug dan el mismo 404; token inexistente, de baja, ausente, vacio o largo dan `equipo: null`), e2e (6) y `soporte.controller.spec.ts` |
| Runtime harness | e2e `resolver-qr-autenticado.e2e.spec.ts` (tenant efimero, guards reales): 401; 403 con solo `TICKETS:LECTURA`; con solo `TICKETS:ALTAS` `/soporte/qr` devuelve 200 con el equipo (si cayera en `:ticketId` seria 403); `GET /soporte/:ticketId` sigue llegando a su handler; slug ajeno o ausente 404 sin revelar el equipo; token de baja, inexistente o ausente da `equipo: null`. Mutacion verificada: renombrar la ruta a `qr-zz` pone en rojo 4 de los 6 |
| Rollback | `git revert` de 17b y 17a; sin migracion, solo lectura; el consumidor (`/pedido-qr`) llega en la WU-18 |

### Decisiones tomadas en apply

- El caso de uso compara `cliente.slug` (por `findById(JWT.cliente_id)`) con `?c=`; el tenant ya viene bindeado por `TenantGuard`, no se resuelve por slug. Cliente inexistente, inactivo, borrado o sin slug, y `c` ausente, dan el mismo 404 (`QrDeOtraOrganizacionError`, mapeado a 404 en `toHttpException`).
- Con slug correcto, la resolucion del token replica `ConsultarContextoPedidoUseCase` (largo 1-128, `findByQrHash(hashTokenQr)`, baja o borrado = `equipo: null`) pero devuelve `{ id, nombre }`. No se extrajo helper compartido: son 6 lineas y viven en modulos distintos.
- `@Get('qr')` declarado antes de `@Get(':ticketId')`, con `TICKETS:ALTAS` (el alta de ticket que abre el dialogo). `c` y `e` se leen como `unknown` y el caso de uso los valida.
- `soporte.controller.spec.ts` arma el caso de uso real con repos vacios para no sumar un cast (ratchet 627/116).
- Deuda de Ayuda: ninguna (sin pantalla).
