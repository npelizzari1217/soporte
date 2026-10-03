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

