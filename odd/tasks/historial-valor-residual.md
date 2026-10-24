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

- [x] T1 — S1-S5 — worker — tabla de historial y backfill, registro al guardar, endpoint, ficha con tabla y
  gráfico — (este commit)

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
- **L4** (T1, decisiones de implementación) — Tabla `equipo_valoraciones` (migración
  `20261025140000_historial_valor_residual`, con `rollback.sql`): `importe` DECIMAL(14,2) como
  `valor_residual`, `origen` con CHECK derivado de `ORIGENES_VALORACION_EQUIPO` (`MANUAL`,
  `MIGRACION`), `usuario_id` referencia blanda a master, FK RESTRICT al equipo. El UNIQUE
  (`equipo_id`, `fecha`) es también el índice del listado: no hay un segundo índice. Sin CHECK de rango
  sobre `importe`, igual que la columna de origen: un CHECK que `equipos_informaticos` no tiene haría
  abortar el backfill ante una fila histórica fuera de rango; el rango lo valida el dominio. La migración
  es re-ejecutable (IF NOT EXISTS, backfill con ON CONFLICT DO NOTHING).
- **L5** (T1, S4) — El backfill corre solo sobre equipos sin borrado lógico: uno borrado fue cargado por
  error y su ficha no se puede abrir. Inserta primero el valor residual y después el importe, así que en
  un mismo día queda el valor residual, igual que S3 deja el último valor del día. Montos sin fecha no
  generan fila. En las bases locales (dos tenants y `soporte_tenant_test`) el backfill dejó 0 filas:
  ningún equipo tenía montos con fecha.
- **L6** (T1, S2, S3) — La regla vive en el dominio (`valoracionDelGuardado`): registra si el valor
  residual guardado tiene monto y fecha y alguno de los dos difiere del anterior (comparación por día de
  calendario, en componentes UTC); en el alta, si los dos están cargados. Vaciarlo no registra nada ni
  borra filas. Editar solo el importe no registra (S2 nombra el valor residual). El registro corre en la
  misma transacción que el guardado del equipo (alta: `txRunner.run`; edición: después del lock LE), así
  que si falla, el equipo no queda guardado. Un guardado del mismo día reemplaza importe, usuario y
  `updated_at`, y deja la fila como `MANUAL` aunque fuera de migración: manda el último guardado.
- **L7** (T1, S5) — `GET /equipos/:id/valoraciones` con `EQUIPOS:LECTURA`, ordenado por fecha
  ascendente, también para un equipo dado de baja (404 si no existe o tiene borrado lógico). El nombre del
  usuario se resuelve con `IUsuarioMasterChecker.resolverNombres` (ya exportado por `TicketsModule`), en
  una sola consulta; se devuelven `usuarioNombre` y `usuarioApellido` por separado, como en las tareas.
  El actor del POST y del PATCH sale de `JWT.sub`. El dueño autorizó sumar `usuarioId` a las dos altas del
  seed de demo (`prisma_master/seeds/demo-seed.ts`), que no traen valor residual.
- **L8** (T1, S5, front) — La ficha suma la sección "Valor del equipo": importe y valor residual vigentes
  con su fecha, y "Historial del valor" con tabla (fecha, importe, origen, usuario) y `LineChart` con su
  tabla accesible (fecha e importe con formato es-AR; `ChartA11yTable` ganó encabezado y formato
  opcionales, sin cambiar el comportamiento por defecto). El historial usa la clave
  `["equipo-valoraciones", id]`, aparte de `["equipo", id]` para que las mutaciones de componentes no lo
  vuelvan a pedir; la invalida `useEditarEquipo`. Origen en pantalla: `MANUAL` = "Guardado en el
  equipo", `MIGRACION` = "Valor previo al historial". El eje X del gráfico es por orden de las filas, no
  proporcional al tiempo (así funciona el `LineChart` existente).
- **L9** (T1, pendiente fuera del alcance) — `frontend/src/shared/lib/formato-fecha.ts` lista en su tabla
  las columnas `@db.Date`; falta sumar `ValoracionEquipo.fecha` (el código ya usa
  `formatearFechaCalendario`). No estaba entre las superficies autorizadas.
