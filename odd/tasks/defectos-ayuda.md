# defectos-ayuda — defectos de producto detectados al escribir la Ayuda

Los 7 posibles defectos de `odd/tasks/ayuda-tanda-final.md` (L5). Rama `fix/defectos-ayuda`. Los
bugfixes van con TDD (RED, GREEN) y su evidencia en el Log.

## Specs

- **S1 — Reactivar usuario (#3).** "Reactivar a una persona desactivada con el mismo rol choca con la
  unicidad de la membresía." Reproducir primero; si se confirma, volver a dar de alta a la persona la
  reactiva.
- **S2 — Modelo deshabilitado (#2).** "Un modelo de equipo deshabilitado aparece en el selector, pero
  guardar un equipo que ya lo tiene se rechaza aunque no se cambie." Guardar sin cambiar el modelo no
  se rechaza; elegir un modelo deshabilitado NUEVO sigue rechazándose.
- **S3 — Marca al exportar (#1).** "Exportación de equipos: la columna Marca usa la marca tipeada, que
  el form vacía al elegir un modelo de catálogo; esos equipos exportan Marca vacía." La exportación
  muestra la misma marca que la pantalla.
- **S4 — CANCELADO no es abierto (#4).** "El dashboard cuenta los tickets CANCELADO como abiertos."
- **S5 — Promesa del pedido público (#7).** "La pantalla de confirmación del pedido público promete
  aviso 'en cada cambio de estado', pero solo se envía en Esperando al cliente, Resuelto, Cerrado y
  comentarios públicos." El texto dice lo que pasa.
- **S6 — Webhook de cambio de estado (#5).** "El webhook 'Cambio de estado' solo se dispara hacia
  Resuelto, Cerrado y Esperando al cliente." Decisión (L2): dispara en todo cambio de estado, sin sumar
  correos.
- **S7 — Copy en voseo (#6).** "Copy de la UI y de correos todavía en voseo ('Elegí una familia', 'No
  tenés permiso…', asuntos de correo), y la nota de familias vacías nombra 'Admin > Insumos' cuando la
  pestaña se llama 'Familia de Catálogos'." Todo texto que lee una persona pasa a español neutro
  (AGENTS.md).

## Tasks

- [x] T1 — S1
- [x] T2 — S2
- [x] T3 — S3
- [x] T4 — S4
- [x] T5 — S5
- [x] T6 — S6
- [ ] T7 — S7

## Log

- **L1 — Pedido del dueño (2026-10-26):** "dale el orden que creas importante y resuleve todos"
- **L2 — Orden y decisión:** 3, 2, 1, 4, 7, 5, 6. Para #5, el webhook dispara en todo cambio de
  estado (es lo que promete su nombre), sin sumar correos; si aparece riesgo para consumidores, se
  consulta.
- **L3 — T1 (#3), confirmado.** RED en `test/usuarios-permisos-tipo.e2e.spec.ts`: re-alta con el mismo
  rol → `expected 409 to be 201` (rechazada como "ya activa"); con otro rol → dos membresías (la vieja
  inactiva). GREEN: `findTodasByUsuarioYCliente` en el puerto y en Prisma; `CrearUsuarioTenantUseCase`
  reactiva una membresía desactivada (la del mismo rol, si no la primera con el rol nuevo) en vez de
  crear otra. Caso hermano: con membresía activa sigue el 409. Mocks de `IMembresiaRepository`
  completados en 10 specs. auth+clientes 1677/1677, e2e 14/14 y 5/5, typecheck y lint limpios.
  Ayuda (suspendida): el artículo de usuarios puede decir que volver a darla de alta la reactiva.
- **L4 — T2 (#2), confirmado.** RED: "guardar sin cambiar un modelo que se deshabilitó después no se
  rechaza" → `expected false to be true`. GREEN: `EditarEquipoUseCase` valida el modelo solo si cambia;
  elegir uno deshabilitado nuevo sigue rechazado. `src/equipos` 946/946, lint y typecheck limpios.
- **L5 — T3 (#1), confirmado.** RED: `Expected "Impresora;HP LaserJet Pro M404;SN-001;Activo"`,
  `Received "Impresora;;SN-001;Activo"`. GREEN: `ExportarEquiposUseCase` recibe el repositorio de
  modelos, busca cada modelo presente una sola vez y arma "Marca Modelo" como la pantalla; un modelo
  que ya no está cae a la marca tipeada. `src/equipos` 948/948, lint y typecheck limpios. Ayuda: la
  tanda de hoy documentaba #1 y #2 tal como eran; `equipos-listado.md` y
  `equipos-componentes-y-modelos.md` corregidos (una Ayuda que miente se corrige aunque esté suspendida).
- **L6 — T4 (#4), confirmado.** RED en `prisma-dashboard.integration.spec.ts`: `expected { abiertos: 2 }
  to deeply equal { abiertos: 1 }`. GREEN: "abierto" = sin fecha de cierre y estado distinto de
  CANCELADO, en el conteo y en la carga por agente (que también sumaba cancelados). `src/dashboard`
  63/63, lint y typecheck limpios. Ayuda `dashboard.md` corregida.
- **L7 — T5 (#7), confirmado.** RED: el texto de "Pedido registrado" no coincidía (prometía aviso "en
  cada cambio de estado"). GREEN: dice que avisa cuando se necesita su respuesta, cuando se resuelve o
  se cierra y cuando hay un comentario nuevo, en neutro. `pedido-publico` 36/36, lint y type-check limpios.
- **L8 — T6 (#5).** Ningún evento cubría todo cambio de estado: `ticket.estado_cambiado` sale solo hacia
  los estados que avisan por correo y la asignación y las tareas cambian el estado sin emitir nada.
  Evento nuevo `ticket.estado_modificado`, publicado post-commit por `TicketRepositoryConTramos.save`
  (punto único de escritura del estado) cuando un ticket existente cambia de estado; el webhook lo
  escucha en lugar de `estado_cambiado` (correos y CSAT no cambian; sin duplicados). RED: 3 tests
  (decorador y listener) fallaron por la razón correcta. GREEN más un test de integración (asignar un
  NUEVO avisa, reasignar no). El guard estructural de `escritores-asignado.spec.ts` acepta el salto de
  línea de Prettier. `tiempo-tecnico`+`integraciones` 420/420, lint y typecheck limpios. Ayuda
  `integraciones-y-clientes.md` corregida. Riesgo: los consumidores del webhook reciben más avisos
  (Asignado, En proceso, Cancelado, reaperturas), que es lo que promete el nombre del evento.
