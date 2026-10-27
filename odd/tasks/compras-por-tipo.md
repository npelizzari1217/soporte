# compras-por-tipo — cada compra lleva un tipo de ticket, y se ve y se crea según los permisos por tipo

Rama `feat/compras-por-tipo`. Opción A del dueño: el permiso sale de la matriz por tipo de ticket que
ya existe (más adelante podría convenir una matriz propia de compras, opción B).

## Specs

- **S1 — Pedido.** "Las compras pueden ser de un sector pero ademas de un tipo. Por ejemplo: puede ser
  sector primario y soporte o edilicia o mantenimiento, sin que el de edilicia vea las compras que hace
  soporte." Cada compra suma un tipo de ticket, además del sector.
- **S2 — Permisos (punto 1).** Se mantienen las casillas de la fila Compras (LECTURA, ALTAS,
  MODIFICACION, BORRADO, APROBACION): deciden la acción. El tipo decide sobre qué compras: ver una
  compra exige LECTURA sobre su tipo; crearla, ALTAS sobre su tipo. Aprobar, modificar o cancelar
  exigen la casilla de Compras y solo sobre compras que la persona ve; una que no ve responde 404.
  ROOT y ADMINISTRADOR no tienen restricción por tipo.
- **S3 — Alta y edición (punto 2).** El tipo es obligatorio al crear; el selector muestra solo los
  tipos con ALTAS. Al editar se puede cambiar el tipo, solo a otro con ALTAS.
- **S4 — Compras existentes (punto 3).** "que quede sin tipo y que todos la lean hasta que se le asigne
  un tipo". Las compras sin tipo las ve cualquiera con LECTURA de Compras. Al editarla se le puede
  asignar un tipo (con ALTAS sobre él); una compra con tipo no vuelve a quedar sin tipo.
- **S5 — Listado y exportación (punto 4).** Muestran solo las compras visibles (S2, S4), con filtro y
  columna Tipo.
- **S6 — Vínculo con un ticket (punto 5).** No exige que la compra y el ticket sean del mismo tipo; no
  cambia.

## Tasks

- [x] T1 — S1, S4: migración tenant `compras.tipo_ticket_id` (nullable, FK a `tipos_ticket`, índice,
  `rollback.sql`), entidad y mapper.
- [x] T2 — S2, S3: alta y edición validan el tipo contra ALTAS por tipo.
- [x] T3 — S2, S4, S5: listar, exportar y obtener filtran por tipos con LECTURA (más las sin tipo);
  las rutas con `:id` responden 404 sobre una compra no visible; filtro y columna Tipo.
- [x] T4 — S3, S5: frontend — selector de tipo en alta y edición, columna y filtro en el listado, tipo
  en el detalle.
- [x] T5 — runbook (migración tenant), registro de Ayuda pendiente (suspendida), verificación
  independiente y suites.

## Log

- **L1 — Pedido del dueño (2026-10-27):** "Lo que quiero que verifiques es si al hacer una compra la
  persona que lo hace solo ve los tipos de compra que el puede ver y que genere solo sobre los que tiene
  derecho. al igual que cuando va a ver las compras que solo vea las que tiene habilitadas segun el
  tipo de Ticket". Verificado: hoy las compras no tienen tipo y sus permisos son del módulo entero.
  Luego: "Las compras pueden ser de un sector pero ademas de un tipo. [...] se entiende?"
- **L2 — Decisiones:** "Por ahora vamos con A, el dia de mañana por ahi nos conviene B". "1 y 2 como
  dices, 3 que quede sin tipo y que todos la lean hasta que se le asigne un tipo, 4 como dices tu, y el
  5 como dices tu".
- **L3 — Contrato entre backend (T1-T3) y frontend (T4).**
  - Respuestas de compra (detalle, ítem de listado): `tipoTicket: { id: string; nombre: string } | null`
    (`null` = compra sin tipo, S4). El nombre sale del tipo en la misma base del tenant.
  - `POST /compras`: `tipoTicketId` obligatorio (UUID). Tipo inexistente o inactivo → 400; sin ALTAS
    sobre ese tipo → 403, sin escribir nada.
  - `PATCH /compras/:id`: `tipoTicketId` opcional; `undefined` no lo toca; `null` → 400 (S4: no vuelve a
    quedar sin tipo); cambiarlo exige ALTAS sobre el tipo NUEVO (403 si no).
  - `GET /compras` y `GET /compras/export`: query `tipoTicketId` opcional (UUID); el resultado nunca
    incluye compras de tipos sin LECTURA, aunque se filtre por ellos. La exportación suma la columna
    "Tipo" (vacía si no tiene).
  - Toda ruta `/compras/:id...` sobre una compra con tipo sin LECTURA → 404, sin cambios.
  - Alcance: `CargadorAlcanceTicket.cargar(user)` (`permisosPorTipo` null = sin restricción, ROOT y
    ADMINISTRADOR). El front usa `usePermisosPorTipo()` (`shared/hooks/use-permisos-por-tipo.ts`) y
    `useTiposTicket()` (`features/tickets/hooks/use-catalogos.ts`) para el selector.
- **L4 — Backend T1-T3 implementado, sin commitear (2026-10-27).** Migración tenant
  `20261027100000_compras_tipo_ticket` (`compras.tipo_ticket_id` nullable, FK RESTRICT a `tipos_ticket`,
  índice parcial, `rollback.sql` re-ejecutable); aplicada solo en `soporte_tenant_test`, los tenants de
  desarrollo quedan pendientes (también les faltan tres migraciones previas, entre ellas
  `20261025150000_retiro_satelite_edilicia`, destructiva). La regla vive en
  `compras/application/services/visibilidad-compra.ts`; las rutas `/compras/:id...` la aplican en un
  solo punto, `VisibilidadCompraGuard` (404 con el mismo mensaje que una compra inexistente, antes del
  caso de uso). Errores nuevos: `TipoTicketDeCompraInvalidoError` (400) y
  `TipoTicketDeCompraNoPermitidoError` (403). Fuera del módulo: el vínculo con un ticket da 404 sobre una
  compra que el actor no ve, y `GET /tickets/:ticketId/compras` solo lista las visibles (el bloqueo del
  ticket sigue contando todas). Quedan sin filtrar, para decidir: los números de compra que bloquean en
  `GET /reparaciones` (`comprasQueBloquean`; la exportación no los trae), y los números en el mensaje del borrado de un ticket con compras.
- **L5 — Frontend T4 implementado, sin commitear (2026-10-27).** S3 y S5 cubiertos en
  `frontend/src/features/compras`. Hook nuevo `hooks/use-tipos-de-compra.ts`: catálogo activo
  (`useTiposTicket()`) filtrado por acción con `usePermisosPorTipo()`, con estado
  `cargando | listo | error` para no confundir "todavía cargando" con "sin permiso". Alta: selector
  "Tipo" obligatorio con los tipos con ALTAS; sin ninguno, nota y "Crear" deshabilitado; si el
  catálogo falla, otra nota. Edición: el tipo actual siempre tiene su opción (nombre de la compra,
  primero, misma `key`), marcada "(actual)" solo con el catálogo ya resuelto y fuera de ALTAS;
  "Sin tipo" existe solo para la compra sin tipo y significa sin cambio; `tipoTicketId` viaja solo si
  cambió, nunca `null`. Listado: columna "Tipo" ("Sin tipo" si es `null`), filtro con los tipos con
  LECTURA que viaja en la URL, cuenta como filtro activo y llega a la exportación; un `tipoTicketId`
  de la URL fuera del catálogo se muestra como "Tipo no disponible". Detalle: campo "Tipo". Un 403
  muestra el mensaje del backend por `notifyError`. Compuertas: `pnpm lint` sin errores ni
  advertencias, `pnpm type-check` limpio, `pnpm vitest run src/features/compras` 237/237 (antes 210).
  Los tests se escribieron después del código (feature, sin TDD exigido); se verificaron con
  mutaciones manuales de las cuatro reglas centrales, y las cuatro se pusieron en rojo. Límite: el
  filtro no ofrece tipos inactivos, porque `GET /catalogos/tipos-ticket` solo trae activos.
- **L6 — Verificación independiente (`gentle-ai-verify`).** S1, S3, S4, S5, S6 cumplen; S2 no: B1,
  desvincular (`DELETE /tickets/:id/compras/:compraId`) operaba sobre una compra de un tipo sin
  LECTURA (reproducido), y `GET /reparaciones` publicaba el id de esa compra en `comprasQueBloquean`
  (fuga a), lo que hacía alcanzable B1. Avisos: (b) el 422 al borrar un ticket nombra el número de
  todas las compras vinculadas (solo número, preexistente; queda así); alta con ALTAS sin LECTURA
  navega a un detalle que da 404 (depende de la matriz); `schema.prisma` no declara `onDelete` en la
  relación (manda la FK RESTRICT de la migración, igual que `sector`); runbook sin la nota de
  `_prisma_migrations` (agregada).
- **L7 — Corrección de B1 y fuga a, con TDD.** Suites completas antes del cambio: backend 820/820
  archivos y 10473/10473, frontend 292/292 y 2744/2744. RED: el caso "compra de un tipo sin LECTURA →
  404 y el vínculo queda" de desvincular (los hermanos con LECTURA y sin tipo pasaban) y 2 de listar
  reparaciones (`expected [ { compraId: 'compra-oculta' … } ] to deeply equal []`). GREEN:
  desvincular responde `CompraNoEncontradaError` sobre una compra no visible, sin borrar; el listado
  publica solo las compras visibles y `bloqueada` sigue contando todas. `src/reparaciones` +
  `src/compras` 1392/1392, lint y tipos limpios.
- **L8 — Tenants de desarrollo al día (2026-10-27).** Las cuatro migraciones pendientes
  (`retiro_satelite_edilicia`, `horario_laboral_usuario`, `tramos_tecnico_ticket`,
  `compras_tipo_ticket`) figuran aplicadas en Demo Soporte y Rotair a las 14:54 UTC, por un
  proceso ajeno a esta sesión y sin dump previo de esta sesión. `migrate status`: "Database schema
  is up to date!" en ambos. `ticket_edilicia`, `reparacion_compra` y `comentarios_reparacion` ya no
  existen; sus datos solo se recuperan desde un backup anterior a esa hora.
