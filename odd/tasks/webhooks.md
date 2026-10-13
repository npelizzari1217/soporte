# Webhooks — etapa 2 de la API pública (punto 8 de la segunda etapa)

## Objetivo
Que el sistema de un cliente se entere, sin consultar la API, de lo que pasa con sus tickets: soporte le envía un aviso firmado a una URL suya cada vez que ocurre un evento.

## Problema
La etapa 1 (`odd/tasks/api-publica.md`) solo expone recursos: para saber que un ticket cambió, el integrador tiene que consultar la API de forma periódica. Hoy no hay cola de salida ni firma HMAC, y ningún proceso envía avisos a terceros.

## Por qué
Es la segunda mitad del punto 8 del roadmap. La decisión de producto la entrega en dos etapas, y la etapa 1 ya está en producción desde el 2026-10-11.

## Decisión de producto citada
`docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta del punto 8, sub-viñeta **"Etapa 2, webhooks"** (líneas 1116-1125). Cada viñeta es un criterio de aceptación más abajo (CA1 a CA5).

**Supuestos aprobados por el dueño el 2026-10-13**, para huecos que la decisión no cubre:
- **Quién lo configura:** el ADMINISTRADOR, en Integraciones, con `AdminClienteGuard`. Hace falta que ROOT haya habilitado la API (`Cliente.apiHabilitada`). Si la API se deshabilita, los envíos se pausan: los avisos quedan pendientes y no salen.
- **Cuántos destinos:** uno por cliente, con casillas para elegir cuáles de los cuatro eventos recibe.
- **Dónde va cada cosa:** la configuración y el secreto van en **master**, como la contraseña SMTP, para que el script de rotación sume una sola entrada. La cola y el registro de entregas van en la base del **inquilino**, como pide la decisión.
- **Firma:** HMAC-SHA256 sobre `<timestamp>.<cuerpo>`. Encabezados: firma, timestamp, evento e id de entrega (que el receptor usa para descartar duplicados).
- **Reintentos:** un barrido por minuto con espera exponencial durante unas 24 horas; después la entrega queda FALLIDA.
- **Destino:** solo HTTPS. Se rechazan las IPs privadas, loopback y link-local, y se resuelve el DNS en cada envío. Cuenta como éxito una respuesta 2xx en 10 s o menos.
- **Registro:** se conservan 30 días.
- **Encolado:** lo hace un listener de los eventos de dominio, después del commit.
- **El secreto:** se muestra una sola vez, al crearlo o al regenerarlo.

**Desviaciones declaradas de antemano:**
- **D1 — Reintentos acotados.** La decisión dice "hasta que el destino responde". Acá se reintenta unas 24 horas y después la entrega queda FALLIDA. Motivo: reintentar para siempre a un destino muerto llena la cola y no lo arregla.
- **D2 — Ventana de pérdida en el encolado.** Los eventos se publican después del commit (`alCommitear`), y el aviso se encola en un listener. Si el proceso se cae entre el commit y el encolado, ese aviso se pierde. Cerrar la ventana exige escribir en la cola dentro de la transacción de cada uno de los cuatro casos de uso. Se acepta la ventana: es muy chica, y la API permite reconciliar.
- **Fuera de alcance**, aunque la decisión no lo pide: un botón "enviar prueba" y el reenvío manual de una entrega fallida.

## Alcance
- **Backend:**
  - en master, la configuración del destino con el secreto cifrado, sumada al script de rotación de `EMAIL_CRYPTO_KEY`;
  - en el inquilino, la tabla de entregas;
  - la firma, la espera exponencial y la validación de la URL;
  - el listener que encola;
  - el barrido que envía y purga;
  - los endpoints del ADMINISTRADOR.
- **Frontend:** una sección "Webhooks" en Integraciones con la configuración, el secreto mostrado una sola vez y el registro de entregas.
- **Docs:**
  - el formato del aviso y cómo se verifica la firma, para el integrador;
  - las notas de deploy en el runbook;
  - la deuda de Ayuda anotada.

## Fuera de alcance
- Los eventos de vencimiento de SLA (los deja afuera la decisión).
- Los avisos de comentarios internos.
- Más de un destino por cliente.
- El botón "enviar prueba" y el reenvío manual.
- Una outbox transaccional (ver D2).

## Restricciones
- Arquitectura hexagonal: solo `infrastructure/` importa `@prisma/client`. Los errores de dominio se devuelven con `Result`.
- Aislamiento entre inquilinos: un aviso del cliente A nunca sale hacia el destino del cliente B, y nunca lleva datos de B.
- **Nada se sube a GitHub hasta nuevo aviso del dueño:** commits y ramas solo locales.
- Las features no exigen TDD (`~/proyectos/CLAUDE.md` §6.1), pero cada unidad lleva sus tests. Los bugfixes sí van con TDD.
- Comandos:
  - backend: `pnpm lint`, `pnpm typecheck`, `pnpm test`;
  - frontend: `pnpm lint`, `pnpm type-check`, `pnpm test`;
  - raíz: `node scripts/check-casts-en-specs.mjs`.
- Todo spec que trunque `soporte_master_test` llama a `usarLockMasterTest()`.
- El barrido por inquilino copia el patrón de `sla/infrastructure/schedulers/sla-sweep.scheduler.ts`.
- El HTTP saliente usa `fetch` nativo: no se agregan dependencias.

## Criterios de aceptación
Salen de la decisión de producto (CA1 a CA5) y de los supuestos aprobados (CA6 a CA9).
- **CA1:** se envían avisos solo para ticket **creado**, **cambio de estado**, **asignado** y **comentado**. Comentado cubre solo los comentarios públicos: un comentario interno no genera aviso. No hay eventos de SLA.
- **CA2:** cada aviso se encola en la base del cliente, y un proceso periódico lo reenvía hasta que el destino responde con 2xx o vence el plazo de reintentos (D1). Un aviso puede llegar más de una vez, y siempre con el mismo id de entrega.
- **CA3:** el cuerpo lleva el evento y un resumen corto del ticket: identificador, número, estado, tipo y fechas. No lleva el detalle: ni descripción ni comentarios.
- **CA4:** la pantalla de Integraciones muestra el registro de entregas: evento, ticket, estado, intentos, último código o error, y fechas.
- **CA5:** el secreto de firma se guarda cifrado con `EMAIL_CRYPTO_KEY`, y `scripts/rotar-email-crypto-key.mjs` lo re-cifra junto con las contraseñas de correo.
- **CA6:** solo el ADMINISTRADOR (o ROOT) del cliente configura el destino, y solo con la API habilitada. Con la API deshabilitada no se encola nada nuevo y no sale ningún envío.
- **CA7:** la firma es HMAC-SHA256 sobre `<timestamp>.<cuerpo>` con el secreto del cliente. El secreto en claro se muestra una sola vez.
- **CA8:** se rechaza una URL que no sea HTTPS, o que resuelva a una IP privada, loopback o link-local, tanto al guardarla como al enviar.
- **CA9:** las entregas de más de 30 días se purgan.
- **Transversal:** el evento de un ticket del cliente A nunca se encola ni se envía con la configuración del cliente B.

## Estrategia de entrega
- **Pronóstico:** unas 2.400 líneas en 8 tareas.
- **Estrategia:** `ask-on-risk`, con la cadena `feature-branch-chain` que el dueño eligió para la etapa 1 el 2026-10-10.
  - El tracker es `feat/webhooks`, y cada tarea va en `feat/webhooks-tN`, apilada sobre la anterior.
  - Todo es local mientras dure la pausa de GitHub.

## Tareas
- [x] **T1 — Configuración en master** (~350): modelo del destino por cliente (URL, eventos suscriptos, secreto cifrado, activo, fechas), migración con `rollback.sql`, puerto y repositorio, alta del secreto en `DESTINOS` de `rotar-email-crypto-key.mjs` y tests de integración. Ruta: delegada (trigger de writer). Salió en 548 líneas, commit `336bc645`.
- [x] **T2 — Entregas en el inquilino** (~300): tabla de entregas (id, evento, ticket, payload, estado PENDIENTE/ENTREGADA/FALLIDA, intentos, próximo intento, último código, último error, fechas), migración con `rollback.sql`, puerto, repositorio y tests de integración. Ruta: delegada (trigger de writer). Salió en 550 líneas, commit `e652fedb`.
- [ ] **T3 — Dominio puro** (~250): la firma HMAC, la política de espera exponencial con su plazo de unas 24 h, y la validación de la URL (HTTPS y rechazo de IPs privadas, loopback y link-local). Tests unitarios. Ruta: delegada (trigger de writer).
- [ ] **T4 — Listener que encola** (~300): escucha `ticket.creado`, `ticket.estado_cambiado`, `ticket.asignado` y `ticket.comentado`. Si la API está habilitada y el evento está suscripto, arma el resumen y encola. Incluye un test de aislamiento entre clientes. Ruta: delegada (trigger de writer).
- [ ] **T5 — Barrido de envío y purga** (~350): `@Cron` por inquilino. Toma las entregas vencidas y valida el destino al enviar. Firma, hace POST con `fetch` y timeout de 10 s, y actualiza el estado y el próximo intento. Si la API está deshabilitada, no envía. Purga las entregas de más de 30 días. Ruta: delegada (trigger de writer).
- [ ] **T6 — Endpoints del ADMINISTRADOR** (~300): ver y guardar la configuración, regenerar el secreto (en claro una sola vez) y listar las entregas paginadas, todo con `AdminClienteGuard`. Ruta: delegada (trigger de writer).
- [ ] **T7 — Sección "Webhooks" en Integraciones** (~380): formulario de URL y eventos, el secreto mostrado una sola vez y la tabla del registro de entregas, con schemas Zod que espejan al backend. Ruta: delegada (trigger de writer).
- [ ] **T8 — Docs y cierre** (~150):
  - el formato del aviso y la verificación de la firma, para el integrador;
  - el runbook;
  - la deuda de Ayuda;
  - la declaración Cumplida/Desviación en el roadmap;
  - la verificación completa y `judgment-day`, porque el cambio es grande y de seguridad (salida hacia URLs de terceros).

  Ruta: delegada para la verificación.

## Verificación
- **Por tarea:** lint, typecheck y los tests del módulo.
- **Al cierre:** las suites completas de backend y frontend, el ratchet de casts, `check-roadmap-fresco` y `judgment-day`.
- RDD está apagado.

## Progreso
- 2026-10-13: el dueño aprobó los supuestos y se creó el documento. Próximo paso: T1.
- 2026-10-13: T1 cerrada en `feat/webhooks-t1` (commit `336bc645`, 548 líneas: los tests de integración y de rotación pesan más de lo previsto). Tabla `webhook_destinos` con PK `cliente_id` y FK en cascada como `api_claves`; el secreto se cifra fuera del repositorio, en `SecretoWebhookCifrado` (AAD `webhook:{clienteId}`, mismo criterio que `SecretoTotpCifrado`), y la rotación lo re-cifra. Migración aplicada a `soporte_master` local y a `soporte_master_test`. Verificación: `pnpm lint` y `pnpm typecheck` en cero, `pnpm vitest run src/integraciones scripts/rotar-email-crypto-key` 22 archivos y 136 tests en verde, ratchet de casts en 617 (sin subir). Próximo paso: T2.
- 2026-10-13: T2 cerrada en `feat/webhooks-t2` (commit `e652fedb`, 550 líneas: el spec de integración pesa 265). Tabla `webhook_entregas` en el inquilino (migración `20261013130000_webhook_entregas` con `rollback.sql` re-ejecutable), con CHECK de estado y `ultimo_error` en VARCHAR(500), que el repositorio recorta. `ticket_id` es referencia blanda, sin FK: el registro se purga a los 30 días por su cuenta y no debe frenar ni arrastrar el borrado de un ticket (el resumen ya viaja en `payload`). Índices por (`estado`, `proximo_intento_at`) para el barrido y por `created_at` para el listado y la purga. El repositorio toma el cliente de `TenantContext`, como `PrismaReglaAsignacionRepository`. `marcarEntregada` y `registrarFallo` solo actúan sobre PENDIENTES y devuelven `false` si no, así no se reabre una entrega terminada. `tomarVencidas` no reserva filas: el barrido de T5 no debe correr en paralelo consigo mismo por inquilino. `listar` usa `{ pagina, porPagina }`, la convención de tickets. Migración aplicada con `pnpm migrate:tenants` a los 2 tenants locales, sin deriva de la tabla nueva contra el schema. Verificación: `pnpm lint` y `pnpm typecheck` en cero, `pnpm vitest run src/integraciones` 20 archivos y 108 tests en verde, ratchet de casts en 617 (sin subir). Próximo paso: T3.
