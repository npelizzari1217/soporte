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

- [ ] T1 — Tickets (S1-S4)
- [ ] T2 — Edilicia y Equipos (S1-S4)
- [ ] T3 — Compras, Insumos y Repuestos (S1-S4)
- [ ] T4 — Usuarios, permisos, ingreso y cuenta (S1-S4)
- [ ] T5 — Dashboard, horario, SLA, catálogos, correos, integraciones y artículos sin cambios a neutro (S1-S4)
- [ ] T6 — Re-suspensión en AGENTS.md, compuertas, merge y push (S5)

## Log

- **L1 — Pedido del dueño (2026-10-26):** "si levantamos por el momento la suspencion y creamos todo lo
  que necesitamos, mergeamos y pusheamos, luego volvemos a suspender"
- **L2 — Registro:** "Neutro en todo (Recomendado)". Se usa "usted".
