# Equipos: historial del valor residual

Cada valor residual que se guarda en un equipo queda en un historial (fecha + importe) que se ve en la
ficha con tabla y gráfico, para seguir la devaluación del equipo en el tiempo.

## Specs

- **S1** — "Cuando en equipos hacemos el calculo de valor residual, necesito que esos valores se vayan
  guardando como historial, teniendo la fecha y el importe, de esas forma podemos ver la devaluacion
  historica de los equipos".
- **S2** — Se registra "Cada vez que se guarda un valor nuevo (rec.)": al guardar el equipo (alta o
  edición) con un valor residual o una fecha distintos a los guardados, venga del botón Aplicar o tipeado
  a mano; si se cierra sin guardar no se registra nada (L2).
- **S3** — Mismo día: "El último del día (rec.)": una fila por equipo y fecha; el último guardado del día
  reemplaza al anterior (L2).
- **S4** — Equipos existentes: el historial arranca con "Importe y valor residual actuales (rec.)": hasta
  dos filas por equipo (importe con su fecha de valoración, valor residual con su fecha), marcadas como de
  migración (L2).
- **S5** — Dónde se ve: "Ficha: tabla + gráfico (rec.)": la ficha del equipo muestra el importe y el valor
  residual actuales y el historial (tabla y gráfico), con el permiso de ver equipos (L2).

## Tasks

- [ ] T1 — S1-S5 — worker — tabla de historial y backfill, registro al guardar, endpoint, ficha con tabla y
  gráfico — (pendiente)

## Log

- **L1** (dueño, 2026-10-23) — pedido S1, textual.
- **L2** (decisiones del dueño, 2026-10-24) — "Cada vez que se guarda un valor nuevo (rec.)"; "El último del
  día (rec.)"; "Importe y valor residual actuales (rec.)"; "Ficha: tabla + gráfico (rec.)".
- **L3** (evidencia, mapeo) — El cálculo vive solo en el front (`frontend/src/features/equipos/depreciacion.ts:15`,
  base compuesta, el porcentaje no se guarda). "Aplicar" solo completa el formulario
  (`equipo-edit-dialog.tsx:140-156`, `equipo-create-dialog.tsx:90-106`); se persiste por `PATCH /equipos/:id`
  → `EditarEquipoUseCase` (tx + lock). Una sola fila por equipo (`valor_residual`, `fecha_valor_residual`),
  sin historial ni auditoría. La ficha no muestra importes. Charts SVG propios en `frontend/src/shared/charts/`.
  La Ayuda `equipos-importes.md` dice que "lo único que queda registrado es el valor residual": queda falsa
  con esto.
