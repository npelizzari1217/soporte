# Acciones del detalle de ticket agrupadas y etiquetadas (2026-10-16)

Las acciones del detalle (`TicketDetailView`) viven en una tira horizontal sin etiquetas visibles:
hasta cuatro pares "desplegable + botón", dos de ellos con la misma lista de técnicos a la vez.
Pasan a una tarjeta "Acciones" con grupos titulados, etiqueta visible por control y un solo botón
por grupo. Sin cambios de reglas: permisos, estados y validaciones siguen en el backend y en
`lib/estado-transitions.ts`.

## Specs
- S1. Un único control de responsable. En NUEVO o ASIGNADO el botón es "Asignar y poner en proceso"
  (`PATCH /tickets/:id/asignar-en-proceso`, exige TICKETS:ASIGNAR y TICKETS:TRANSICIONAR). En los
  demás estados no terminales el botón es "Cambiar responsable" (`PATCH /tickets/:id/asignar`,
  exige TICKETS:ASIGNAR). Decisión del dueño: "un solo boton". Si en NUEVO/ASIGNADO el usuario tiene
  ASIGNAR pero no TRANSICIONAR, se ofrece "Cambiar responsable" (lo que hoy ya puede hacer).
- S2. Cada desplegable lleva una etiqueta visible (`<label htmlFor>`), no solo `aria-label`, y una
  línea de ayuda cuando el efecto no es obvio. Nombres accesibles: "Responsable", "Nuevo estado",
  "Corregir estado".
- S3. Grupos dentro de una tarjeta "Acciones": "Responsable", "Estado" (con el subgrupo "Corregir
  estado" solo para ROOT/ADMINISTRADOR, visualmente distinto y con su ayuda) y "Ticket" (Editar,
  Descargar PDF, y la nota "En proceso: solo ROOT puede editar" junto al lugar del botón).
  Escritorio: etiqueta arriba, control y botón en fila. Móvil: apilado.
- S4. Comentario y adjunto siguen al final, en su propia sección "Nuevo comentario".

## Tasks
- [x] T1 (S1, S2): `TicketResponsableControl` reemplaza a `TicketAsignarEnProcesoControl` y
  `TicketReasignarControl`; tests propios y ajuste de los del detalle. Commit en
  `feat/acciones-ticket-agrupadas`.
- [x] T2 (S2, S3, S4): etiquetas en `TicketTransitionControl`, tarjeta "Acciones" con grupos en
  `TicketDetailView`, sección de comentario. Tests ajustados. Commit.

## Log
- L1 (2026-10-16, dueño): "Vamos a trabajar sobre la pantalla front de ticket, es muy confusa la
  forma de trabajar de los botones y los input, al igual que los desplegables, no se entiene que
  input o desplegable es controlado por que boton, me gustaría que queden en etiquetas separadas,
  que propones?"
- L2 (2026-10-16, dueño), ante la pregunta "¿un solo botón según el estado, o los dos botones bajo
  el mismo desplegable?": "un solo boton".
- 2026-10-16, T1 (`a06234c5`): `TicketResponsableControl` reemplaza a los dos controles; 6 tests propios,
  los del detalle ajustados al nombre accesible "Responsable". Frontend: 208 tests del módulo, lint y tsc 0.
- 2026-10-16, T2: etiquetas visibles y ayuda en `TicketTransitionControl` (el salto correctivo en un
  recuadro punteado), tarjeta "Acciones" con los grupos Responsable, Estado y Ticket (un grupo solo se
  monta si el usuario puede hacer algo en él), sección "Nuevo comentario". Tres tests nuevos en el
  detalle. Frontend completo: 273 archivos, 2304 tests; lint y tsc 0. La Ayuda no describe estos
  controles: no hay artículo que corregir.
