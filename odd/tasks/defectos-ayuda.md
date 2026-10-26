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

- [ ] T1 — S1
- [ ] T2 — S2
- [ ] T3 — S3
- [ ] T4 — S4
- [ ] T5 — S5
- [ ] T6 — S6
- [ ] T7 — S7

## Log

- **L1 — Pedido del dueño (2026-10-26):** "dale el orden que creas importante y resuleve todos"
- **L2 — Orden y decisión:** 3, 2, 1, 4, 7, 5, 6. Para #5, el webhook dispara en todo cambio de
  estado (es lo que promete su nombre), sin sumar correos; si aparece riesgo para consumidores, se
  consulta.
