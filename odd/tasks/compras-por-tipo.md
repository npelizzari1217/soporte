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

- [ ] T1 — S1, S4: migración tenant `compras.tipo_ticket_id` (nullable, FK a `tipos_ticket`, índice,
  `rollback.sql`), entidad y mapper.
- [ ] T2 — S2, S3: alta y edición validan el tipo contra ALTAS por tipo.
- [ ] T3 — S2, S4, S5: listar, exportar y obtener filtran por tipos con LECTURA (más las sin tipo);
  las rutas con `:id` responden 404 sobre una compra no visible; filtro y columna Tipo.
- [ ] T4 — S3, S5: frontend — selector de tipo en alta y edición, columna y filtro en el listado, tipo
  en el detalle.
- [ ] T5 — runbook (migración tenant), registro de Ayuda pendiente (suspendida), verificación
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
