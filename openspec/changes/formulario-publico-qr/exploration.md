# Exploración: formulario público por cliente + QR en equipos

Cambio: `formulario-publico-qr`. Fecha: 2026-10-03. Fuente de la decisión de producto: `docs/roadmap-comercial.md`, sección "Segunda etapa — brechas frente a la competencia", fila 1 (línea 639). Contexto del problema de ruteo: mismo archivo, sección "6 · Ticket por email entrante" (líneas 489-535).

Nota para la propuesta: la fila 1 todavía no tiene viñetas en "Decisiones de producto ya cerradas". Cuando el dueño responda las decisiones abiertas (sección 6), cada respuesta debe convertirse en requerimiento con escenario, y al cerrar el punto se declara "Cumplida" o "Desviación" (regla de `CLAUDE.md`, `scripts/check-roadmap-fresco.mjs`).

## 1. Estado actual (evidencia)

### 1.1 Cómo se crea hoy un ticket
- `POST /tickets` (`backend/src/tickets/interface/controllers/tickets.controller.ts:226-251`): guards `JwtAuthGuard, TenantGuard, AccionesGuard` (línea 172) y permiso `TICKETS:ALTAS`. `solicitanteId` y `autorId` salen de `user.sub`; `clienteId` sale de `user.cliente_id`. El cliente HTTP manda `tipoId` y `prioridadId`.
- `POST /soporte` (`backend/src/equipos/interface/controllers/soporte.controller.ts:96-137`): igual, pero el tipo se resuelve por código fijo `SOPORTE` (`crear-ticket-soporte.use-case.ts:22,115`) y `equipoId` es opcional.
- `CrearTicketSoporteUseCase` (`crear-ticket-soporte.use-case.ts:94-170`): valida solicitante contra master (`existeEnTenant`), resuelve el ciclo activo (409 si no hay), toma lock `FOR SHARE` del equipo y rechaza si `!equipo.activo || isDeleted()` (líneas 141-149), numera con advisory lock, crea ticket + operación + satélite `ticket_soporte`, y publica `TicketCreadoEvent` post-commit para el SLA.
- Schema `prisma_tenant/schema.prisma:226-286`: `tipoId`, `estadoId`, `prioridadId`, `solicitanteId` NOT NULL (líneas 231-238). `solicitanteId` es soft ref a `master.usuarios.id`, sin FK.
- `existeEnTenant` (`backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts:38-51`): exige `Usuario` no borrado y (ROOT o membresía no borrada en ese cliente). No mira `activo`.
- Prioridades: catálogo fijo BAJA/MEDIA/ALTA/CRITICA, con `slaHoras`/`slaActivo` (`schema.prisma:72-102`). Tipos: catálogo editable con seeds SOPORTE/COMPRAS/EDILICIA (`schema.prisma:104-134`).
- No hay listener de notificación para la creación de ticket: `notificaciones/infrastructure/listeners` solo escucha `ticket.estado_cambiado`, `ticket.comentado`, `sla.vencido` y `preventivo.generado`. Las notificaciones y el CSAT resuelven el email del solicitante por `IUsuarioContactoResolver` sobre `master.usuarios` (`ticket-csat.listener.ts:86-98`).

### 1.2 Resolución de tenant
- El tenant sale únicamente del JWT: `TenantGuard` (`backend/src/auth/infrastructure/guards/tenant.guard.ts:51-74`) lee `cliente_id`, busca el cliente en master, exige `activo` y no borrado, y bindea `TenantContext`. El header `X-Tenant-Id` NO existe, descartado por ADR-4 (líneas 19-22).
- `master.clientes` (`prisma_master/schema.prisma:64-131`) solo tiene `id` (uuid), `nombre`, `razonSocial`, `cuit`, `dbName` (unique), `activo`, SMTP, `csatHabilitado`, logo. **No hay slug ni identificador público.** Exponer `id` o `dbName` en una URL es filtrar un identificador interno; hace falta una columna nueva `slug` (unique, normalizada) y probablemente un flag `formularioPublicoHabilitado` (default false), calcado de `csatHabilitado` (`schema.prisma:109`; toggle solo ROOT en `clientes.controller.ts:385-389`).
- Precedente de resolución pública: `ResolverEncuestaTokenService` (`csat/application/services/resolver-encuesta-token.service.ts:63-91`): hash sha256 del token, validación, el `clienteId` sale solo de la fila master, verifica cliente activo/no borrado/habilitado y recién ahí hace `tenantContext.bind`. El formulario público replicaría esto con slug en lugar de token.

### 1.3 Precedentes públicos (hay dos, no uno)
1. CSAT: `EncuestaPublicaController` en `publico/encuesta/:token` (`encuesta-publica.controller.ts:51-98`). Sin guard de auth; `CsatThrottlerGuard` con límite 10 req / 60 s (`csat-throttler.guard.ts:30-33`); todo rechazo devuelve el mismo 404 (anti-oráculo, líneas 48-71). El tracker es `${xff}:${token}` (línea 45), y el propio guard documenta que el XFF es falsificable y que no hay `trust proxy` (líneas 13-17).
2. Reseteo de contraseña (`POST /auth/forgot-password`, `/auth/reset-password`): `RecuperacionPasswordThrottlerGuard` (`auth/infrastructure/guards/recuperacion-password-throttler.guard.ts:30-44`) con tracker solo email/token, sin XFF (el comentario explica que el XFF sería un bypass), 3/15 min solicitud y 5/15 min confirmación. Tokens opacos en master: `PasswordResetToken` y `EncuestaToken` (`prisma_master/schema.prisma:291-340`), solo se guarda el sha256, con `expiresAt`, `usedAt`, `revokedAt`. Correo por cliente: puerto `ICorreoDeCliente` con `estado()` LISTO/SIN_CORREO/CLIENTE_NO_DISPONIBLE y `enviar()` (`auth/domain/ports/i-correo-de-cliente.port.ts:19-25`).
- `ThrottlerModule.forRoot` ya está en `CsatModule` (`csat.module.ts:85`); `ThrottlerModule` es global y un segundo `forRoot` es riesgoso: `RecuperacionPasswordModule` registra su storage local por ese motivo (comentario en el guard, líneas 15-21). Storage en memoria de un proceso. No hay captcha ni otra infraestructura anti-abuso en el repo.
- Frontend: el BFF `frontend/src/app/api/[...path]/route.ts` reenvía `x-forwarded-for` solo para el prefijo `publico/` (líneas 61-64); el body multipart se reenvía como `FormData` (líneas 70-71). Las rutas públicas se declaran en una allowlist en `frontend/src/middleware.ts:36` (`RUTAS_PUBLICAS = ["/encuesta/", "/restablecer-password", "/olvide-password"]`). Hay que agregar `/c/` (prefijo). El route group `(publico)` (`frontend/src/app/(publico)/layout.tsx`) no aplica protección por sí solo, es solo visual (centrado, `max-w-sm`; el formulario probablemente quiera un ancho mayor). La página modelo es `frontend/src/app/(publico)/encuesta/[token]/page.tsx`.

### 1.4 Equipos
- `EquipoInformatico` (`prisma_tenant/schema.prisma:557-611`): `id` uuid generado por Postgres (122 bits, no adivinable), `nombre`, `numeroSerie`, `ubicacion` como TEXTO LIBRE (ya no es FK, líneas 565-567), `activo`, `deletedAt`, y campos de baja (`bajaDestino`, `bajaFecha`, ...). El `id` ya aparece en la URL autenticada `/equipos/[id]` (`frontend/src/app/(dashboard)/equipos/[id]/page.tsx`).
- Un equipo dado de baja no acepta tickets: `activo` y `deletedAt` se validan bajo lock en `crear-ticket-soporte.use-case.ts:141-149` (S5: la baja no puede comitear entre la validación y el alta). El formulario público debe pasar por el mismo use case para heredar esa garantía.

### 1.5 Adjuntos
- `AdjuntosController` (`tickets/interface/controllers/adjuntos.controller.ts:52-90`): requiere sesión y `TICKETS:ALTAS`, `FileInterceptor('archivo')` sin `storage` ni `limits`; la validación (10 MB, whitelist `image/*` + PDF/Office/ZIP) se hace DESPUÉS de que multer cargó el buffer completo (`validar-archivo-adjunto.ts:20-37`). `image/*` incluye `image/svg+xml`, y el mime lo declara el cliente.

### 1.6 Tests y aislamiento
- El e2e de CSAT (`csat/interface/controllers/csat.e2e.spec.ts`) es el modelo: usa guards reales, `usarLockMasterTest()` (línea 99; `soporte_master_test` es UNA sola base compartida), tokens usado/vencido/revocado y cliente inactivo. El spec del formulario público trunca master, por lo que debe llamar `usarLockMasterTest()`.

## 2. Superficies de abuso
- Spam / inundación de tickets: el límite por IP es falsificable (sin `trust proxy`, XFF del BFF); el tope del throttler está en memoria de un proceso.
- Un spammer anónimo contra un cliente concreto agota la numeración, llena el listado de triage, y puede forzar costo (mails de verificación saliendo por el SMTP del cliente).
- Enumeración de slugs/clientes y de tokens de equipo: cualquier rechazo debe ser el mismo 404 (patrón CSAT).
- Reenvío de mail como cañón: el endpoint de verificación por email puede usarse para bombardear una casilla ajena (mitigación: tope por email, igual que `RecuperacionPasswordThrottlerGuard`).
- Adjuntos: DoS de memoria (sin `limits`), SVG con script, tipos engañosos.
- Contenido: título/descripción sin límite de longitud ni sanitización; el campo se renderiza luego en la pantalla de técnicos (XSS almacenado si se renderiza como HTML; React escapa, pero verificarlo).
- Cliente sin SMTP configurado: no se puede verificar email por correo (ver decisión 3).

## 3. Opciones de identidad del solicitante

| | (a) Solo emails ya miembros | (b) Cualquiera, "solicitante externo" sin verificar | (c) Cualquiera, con verificación por link antes de crear el ticket |
|---|---|---|---|
| `solicitanteId` | El `Usuario` existente, sin cambio de modelo | No hay `Usuario`: hace falta nullable o un id sintético | Igual que (b), tras verificar |
| Spam | Bajo (solo miembros), pero enumera quién es miembro si se responde distinto; hay que responder uniforme | Muy alto: sin barrera | Medio-bajo: cada ticket exige acceso a una casilla; el costo es mail |
| Notificaciones / CSAT | Funcionan como hoy | No hay a quién mandar nada | Se puede mandar al email verificado, requiere ampliar `IUsuarioContactoResolver` |
| Cliente sin SMTP | Funciona | Funciona | **No funciona**: no se puede enviar el link |
| Cambio de dominio | Mínimo | Alto (identidad nueva) | Alto (identidad + token + mail) |
| Aislamiento | Sin riesgo nuevo | Riesgo: PII de externos en el tenant | Igual, con email verificado |
| Cobertura del caso de uso (QR en un aula, quien pide no tiene cuenta) | Pobre: justo el caso que motiva el QR | Buena | Buena |

Un punto crítico de modelado: no conviene crear `Usuario` global ni `Membresia` para el externo. `Usuario.email` es `@unique` global (`prisma_master/schema.prisma:176`) y un alta automática mezclaría identidades entre clientes, justo el problema que postergó el punto 6. Una persona externa debe vivir en el tenant (tabla propia, p. ej. `solicitantes_externos`: nombre, email verificado, teléfono opcional) y el ticket la referencia con una columna nueva (`solicitante_externo_id`) mientras `solicitanteId` pasa a nullable con un CHECK de "exactamente uno de los dos". Alternativa más barata: un usuario "sistema" por cliente (membresía con rol sin permisos) como `solicitanteId` y los datos del externo en el satélite. Funciona sin tocar el NOT NULL, pero opaca la autoría y el CSAT.

## 4. Enfoques comparados

| Enfoque | Descripción | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| A. Mínimo viable | Formulario solo para miembros: pide email, valida pertenencia, crea ticket como ese usuario; QR con `equipoId` | Casi sin cambio de modelo | Choca con el propósito del QR (quien escanea suele no tener cuenta); enumera miembros | Bajo, 3-4 días |
| B. Externo con verificación (recomendado) | Slug por cliente + QR con token opaco por equipo + solicitante externo en el tenant + link de verificación de un solo uso que crea el ticket | Cumple el caso real; spam acotado a casillas verificadas; reutiliza patrón de tokens (EncuestaToken/PasswordResetToken) | Modelo nuevo, exige SMTP del cliente, más piezas | Medio-alto, 7-10 días |
| C. Externo sin verificación + moderación | Cualquiera pide; el ticket nace en un estado "Pendiente de aprobación" y no entra al SLA hasta que un técnico lo acepta | Sin dependencia de SMTP; menor fricción | El spam llega al panel de triage; SLA y numeración se contaminan; hay que definir el estado nuevo | Medio, 6-9 días |

## 5. Recomendación
Enfoque B, con una variante: **política por cliente** (`formularioPublicoModo`: `APAGADO` | `SOLO_MIEMBROS` | `EXTERNOS_VERIFICADOS`), igual que `csatHabilitado` (toggle ROOT). Así un cliente sin SMTP queda en `SOLO_MIEMBROS` o apagado, y la funcionalidad es inerte por defecto (rollout cliente por cliente, como CSAT).

Piezas técnicas:
1. Master: `clientes.slug` (unique, `[a-z0-9-]`, backfill desde `nombre` con desambiguación) y modo del formulario. Tabla master `pedido_publico_tokens` (hash sha256, `clienteId`, `expiresAt`, `usedAt`, `revokedAt`, payload mínimo) calcada de `EncuestaToken`.
2. Tenant: `equipos_informaticos.qr_token_hash` (o tabla `equipo_qr` con `revocadoAt`) para poder revocar y regenerar el QR sin cambiar el `id`; token opaco de 128 bits. Evita codificar el `id` interno y permite invalidar un QR extraviado o copiado.
3. Endpoint `POST /publico/c/:slug/pedido` y `GET /publico/c/:slug/pedido/contexto?qr=...` (devuelve solo nombre del equipo y del cliente, nunca serie, ubicación completa ni valoración). Mismo 404 uniforme para slug/qr/estado inválidos.
4. Reutilizar `CrearTicketSoporteUseCase` (hereda baja de equipo, ciclo activo, numeración, SLA). Defaults: tipo `SOPORTE`, prioridad media o la menor del catálogo (decisión 6).
5. Throttler: guard propio que combine tope por `slug` + email (no por XFF, como el de recuperación) y un tope global por cliente por hora. Reconocer que el storage en memoria no escala horizontalmente.
6. Adjuntos: `FileInterceptor` con `limits.fileSize` y whitelist sin SVG, o dejar adjuntos fuera de la primera entrega.
7. Frontend: `(publico)/c/[slug]/pedido/page.tsx`, `/c/` en `RUTAS_PUBLICAS`, y un generador de QR en la ficha del equipo (`/equipos/[id]`) con descarga/impresión; el QR codifica `https://soporte.sesitec.net/c/<slug>/pedido?e=<token>`.

## 6. Decisiones de producto abiertas (para el dueño)

1. **¿Quién puede pedir?** (a) solo miembros; (b) cualquiera sin verificar; (c) cualquiera con link de verificación por email. Consecuencia: (b) deja pasar spam; (c) exige que el cliente tenga SMTP; (a) no cubre a quien escanea el QR sin cuenta. Recomendación: (c) con modo por cliente.
2. **¿Qué es el externo en el sistema?** Tabla propia en el tenant (recomendado), usuario "sistema" por cliente, o `Usuario` global. Consecuencia: la primera exige columna nueva y nullable en `solicitanteId`; la tercera mezcla identidades entre clientes y se descarta.
3. **Cliente sin correo configurado.** ¿Se apaga el formulario, se limita a miembros, o se permite sin verificación con moderación? Consecuencia: define si `ICorreoDeCliente.estado()` bloquea el alta.
4. **Moderación.** ¿El ticket externo nace directo en `NUEVO` o en un estado "pendiente de aprobación" que no cuenta SLA? Consecuencia: el segundo agrega un estado al catálogo fijo y toca SLA y dashboard.
5. **Qué ve el externo después.** ¿Solo un número de seguimiento por mail, una página de seguimiento por link, o nada? Consecuencia: la página de seguimiento es otra superficie pública con token propio. ¿Recibe notificaciones de cambio de estado y la encuesta CSAT?
6. **Defaults.** Tipo (solo `SOPORTE`, o el externo elige entre tipos habilitados) y prioridad (¿fija la menor, o elige?). Consecuencia: la prioridad define `sla_vence_at`, así que un externo que elija CRITICA fuerza SLA corto.
7. **Slug.** ¿Lo define el ROOT al alta/edición del cliente o se deriva del nombre? ¿Se puede cambiar (rompe QR impresos si el slug va en la URL) o es inmutable? Recomendación: inmutable una vez emitido el primer QR, o QR que no dependa del slug.
8. **QR.** ¿Un token por equipo regenerable (recomendado), o un QR por cliente con selector de equipo? ¿Se permite imprimir en lote desde el listado? ¿Qué pasa al escanear un equipo dado de baja: mensaje genérico o formulario sin equipo?
9. **Adjuntos en el formulario público.** ¿Sí o no en la primera entrega? Consecuencia: sí exige límite de tamaño en multer, whitelist sin SVG y topes por solicitud.
10. **Límites de abuso.** Cuota por cliente y por hora, y qué hacer al excederla (mensaje, cola). Hay que fijar números.
11. **Datos personales.** Un externo deja nombre, email y quizá teléfono en el tenant: ¿retención y borrado? (decisión de privacidad, no técnica).

## 7. Estimación y unidades de trabajo
Rough size (líneas cambiadas, incluyendo tests): **1.600-2.400** (backend ~1.000-1.500, frontend ~400-600, migraciones y seeds ~100-150, documentación y roadmap ~100). La estimación del roadmap (5-8 días) es razonable para el enfoque B; este repo suele quedarse corto, por lo que conviene tomar el extremo alto.

Unidades sugeridas, cada una entregable y reversible con `git revert` (PR bajo 400 líneas cuando sea posible, partiendo por costura limpia):
- **WU-1 Slug y modo por cliente**: migración master (`slug`, modo), backfill, edición solo ROOT, alta en `ClienteEntity`/DTO. Incluye e2e de aislamiento de unicidad.
- **WU-2 Token de equipo y QR**: columna/tabla tenant, caso de uso emitir/regenerar/revocar, endpoint autenticado, y generador de QR en la ficha del equipo.
- **WU-3 Solicitante externo**: tabla tenant, columna nullable + CHECK en `tickets`, ajuste de resolución de nombres y contacto (`IUsuarioContactoResolver`/`resolverNombres`), tests de que ningún listado falle con `solicitanteId` nulo.
- **WU-4 Endpoint público y anti-abuso**: controlador `publico/c/:slug/pedido`, token de verificación en master, guard de throttling propio, mails por `ICorreoDeCliente`, 404 uniforme. E2e con guards reales, `usarLockMasterTest()`, cliente inactivo, slug inexistente, token usado/vencido, equipo dado de baja, y escritura nunca fuera del tenant del slug.
- **WU-5 Frontend público**: ruta `(publico)/c/[slug]/pedido`, `/c/` en `RUTAS_PUBLICAS` y prueba del middleware, formulario con Zod espejando al backend.
- **WU-6 (opcional) Adjuntos públicos**: solo si la decisión 9 es sí.

Ayuda: la escritura está suspendida (`CLAUDE.md`); solo anotar la deuda en commit y PR (formulario público, QR en la ficha del equipo, y pantalla de configuración del modo por cliente). Verificar si algún artículo existente de `backend/ayuda/*.md` queda falso.

## 8. Cómo probar el aislamiento multi-tenant
- E2e con los guards reales (no mocks) y dos tenants: un pedido a `/c/<slug-A>/...` jamás escribe en la base de B, ni siquiera con un token de equipo de B.
- Un token de equipo de otro cliente en la URL de este cliente devuelve el mismo 404 que un token inexistente.
- Cliente inactivo, borrado, con modo apagado o sin SMTP (según modo) rechaza con el mismo cuerpo.
- Mutación: sacar la validación de cliente activo o el `tenantContext.bind` desde la fila master debe hacer fallar al menos un test.
- Specs que truncan `soporte_master_test` llaman `usarLockMasterTest()`.
- Gates por proyecto: backend `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest); frontend `pnpm lint`, `pnpm type-check`, `pnpm test`; además `scripts/check-casts-en-specs.mjs` (ratchet a mano) y `scripts/check-roadmap-fresco.mjs`.

## 9. Notas de proceso
- Es una feature, no un bugfix: se corre en modo estándar, sin inyección de strict TDD.
- Las respuestas del dueño a la sección 6 se convierten en requerimientos con escenarios en la spec, citando por ruta `docs/roadmap-comercial.md` (sección "Decisiones de producto ya cerradas") una vez agregada la viñeta del punto.
- Primero `gentle-ai sdd-status formulario-publico-qr` antes de cada fase (preflight obligatorio).
