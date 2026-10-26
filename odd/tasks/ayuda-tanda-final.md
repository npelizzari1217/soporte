# ayuda-tanda-final — escritura de la Ayuda pendiente y corrección de lo que miente

Levanta por esta tanda la suspensión de la Ayuda (AGENTS.md, "Ayuda de usuario — SUSPENDIDA desde el
2026-09-07"), escribe todo lo que falta, corrige lo falso y la vuelve a suspender. Rama
`docs/ayuda-tanda-final`. Inventario: Engram `soporte/ayuda/deuda` (2026-10-26).

## Specs

- **S1 — Alcance.** "si levantamos por el momento la suspencion y creamos todo lo que necesitamos,
  mergeamos y pusheamos, luego volvemos a suspender" (L1). Cubre la parte A (falta escribir) y la B
  (modificar) del inventario.
- **S2 — Registro.** "Neutro en todo (Recomendado)" (L2): español neutro con "usted" en lo nuevo y en
  los artículos existentes, que se pasan enteros a neutro. Sin voseo ni modismos regionales.
- **S3 — Verdad contra el código.** Cada afirmación se verifica en el código vigente de `main`; lo que no
  se pueda confirmar no se afirma.
- **S4 — Formato.** Frontmatter `slug`, `titulo`, `visibleParaSolicitante` (validado por
  `backend/scripts/sync-ayuda.js`); `# título` igual al `titulo`; secciones `##`.
- **S5 — Re-suspensión.** Al cerrar, el bloque de suspensión del AGENTS.md vuelve a regir para lo que
  se agregue después de esta tanda, con la fecha de la tanda.

## Tasks

- [x] T1 — Tickets (S1-S4)
- [x] T2 — Edilicia y Equipos (S1-S4)
- [x] T3 — Compras, Insumos y Repuestos (S1-S4)
- [x] T4 — Usuarios, permisos, ingreso y cuenta (S1-S4)
- [x] T5 — Dashboard, horario, SLA, catálogos, correos, integraciones y artículos sin cambios a neutro (S1-S4)
- [x] T6 — Re-suspensión en AGENTS.md, compuertas, merge y push (S5)

## Log

- **L1 — Pedido del dueño (2026-10-26):** "si levantamos por el momento la suspencion y creamos todo lo
  que necesitamos, mergeamos y pusheamos, luego volvemos a suspender"
- **L2 — Registro:** "Neutro en todo (Recomendado)". Se usa "usted".
- **L3 — T1-T5.** Cinco redactores en paralelo, uno por área, con superficies disjuntas. 29
  artículos (17 nuevos, 12 reescritos enteros a neutro): commits `f8886bf8` (tickets), `1fd713c5`
  (edilicia y equipos), `68c11fa4` (compras, insumos, repuestos), `bf6ddf4c` (usuarios, permisos,
  ingreso), `c4b14092` (dashboard, horario, SLA, catálogos, correos, integraciones). Pasada transversal:
  título de `tickets-listado` con "Excel o CSV" y una referencia cruzada a un título viejo corregida.
  `cargarArticulos()` 29 OK; `sync-ayuda.spec.ts` 21/21; sin voseo fuera de etiquetas citadas de la UI.
- **L4 — Verify independiente:** las 10 afirmaciones de mayor riesgo (destinatarios de correo, tiempo
  del técnico, borrado y edición, transiciones, alcance del listado, permisos por tipo, edición de
  reparaciones, dashboard, usuarios, 2FA, movimientos de stock) dieron TRUE con `path:line`. Su única
  advertencia (la fila del técnico en el dashboard ignora el filtro de tipo) quedó en `75347174`.
- **L5 — Posibles defectos de producto detectados al escribir (no se tocaron, a decidir):**
  - Exportación de equipos: la columna Marca usa la marca tipeada, que el form vacía al elegir un
    modelo de catálogo; esos equipos exportan Marca vacía.
  - Un modelo de equipo deshabilitado aparece en el selector, pero guardar un equipo que ya lo tiene
    se rechaza aunque no se cambie.
  - Reactivar a una persona desactivada con el mismo rol choca con la unicidad de la membresía.
  - El dashboard cuenta los tickets CANCELADO como abiertos (nunca reciben fecha de cierre).
  - El webhook "Cambio de estado" solo se dispara hacia Resuelto, Cerrado y Esperando al cliente.
  - Copy de la UI y de correos todavía en voseo ("Elegí una familia", "No tenés permiso…", asuntos
    de correo), y la nota de familias vacías nombra "Admin > Insumos" cuando la pestaña se llama
    "Familia de Catálogos".
  - La pantalla de confirmación del pedido público promete aviso "en cada cambio de estado", pero solo
    se envía en Esperando al cliente, Resuelto, Cerrado y comentarios públicos.
- **L6 — T6.** AGENTS.md: la suspensión vuelve a regir tras la tanda, con el registro neutro "usted"
  para lo que se escriba después. Producción: `deploy.ps1` no corre `sync:ayuda`; los artículos llegan
  a la base master recién con `node scripts/sync-ayuda.js` en el VPS (idempotente, no toca la
  visibilidad de los existentes).
- **L7 — Dueño (2026-10-26): "ok, quiero que todos sean publicos".** Producción: `UPDATE` en una
  transacción de los 13 artículos con `visible_para_solicitante = false` (los 29 del repo; no hay
  artículos escritos desde la pantalla) → 29/29 públicos. Repositorio: el frontmatter de los 13 pasa a
  `visibleParaSolicitante: true` para que un entorno nuevo nazca igual que producción.
