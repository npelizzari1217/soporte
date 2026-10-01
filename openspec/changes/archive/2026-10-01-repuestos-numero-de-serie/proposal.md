# Proposal: seguimiento de repuestos por número de serie

## Intent

Hoy una pieza en depósito es solo una cantidad (`movimientos_insumo.cantidad`) y el serial existe únicamente como texto libre, sin unicidad, en `componentes_equipo.numero_serie`. No se sabe qué seriales hay en el depósito, el serial se pierde al devolver una pieza al stock y no hay historia de una pieza entre equipos. El ciclo agrega seguimiento por unidad física para los insumos que el dueño marque como serializados.

Se apoya en `stock-insumo-condicion` y `componentes-catalogo-unico` (archivados el 2026-09-30). Entrada: `exploration.md` de esta carpeta. Research no seleccionada. **No es un punto de `docs/roadmap-comercial.md`** (los seis puntos y "Decisiones de producto ya cerradas" no tratan seriales): la regla de citar la decisión de producto no aplica.

## Scope

### In Scope (decisiones del dueño, 2026-09-30)

1. **Modo de seguimiento por insumo** (`NINGUNO` | `SERIE`), elegido en el ABM del catálogo (P1). Solo para unidades de medida enteras (P11) y solo con saldo cero (P4).
2. **Serial obligatorio** en insumos `SERIE`, cargable al recibir la compra o después desde la ficha (P2); ver pregunta de diseño D1.
3. **Unicidad por insumo**, con serial normalizado (sin distinguir mayúsculas ni espacios) (P3).
4. **Condición por unidad**: NUEVO/USADO es propiedad de la unidad; el saldo de un insumo `SERIE` cuenta unidades en depósito por condición (P9).
5. **Movimientos con unidad**: entrada y recepción crean unidades; salida, instalación y ajuste negativo exigen elegir la unidad por serial (P6, P10); ajuste positivo exige un serial nuevo; ajustes con motivo.
6. **Ciclo de vida en equipos**: instalar consume una unidad; retirar a stock la devuelve como USADO conservando su serial; descartar la da de baja; reactivar mantiene la unidad consistente.
7. **Corrección de serial** con motivo obligatorio y registro auditado (P8).
8. **Historial por serial**: ingreso, equipos, retiros y destino, desde este cambio en adelante (P7).
9. **Legado**: componentes instalados antes del cambio conservan su serial de texto y no reciben unidad (P5).
10. Insumos `NINGUNO`: comportamiento idéntico al actual.

### Out of Scope

- **Reporte o exportación de stock** (ciclo próximo). Este cambio no lo impide: `unidades_insumo` es una tabla plana exportable.
- **Baja de un equipo completo** (ciclo próximo): devolver todas sus piezas al stock o descartarlas con un motivo compartido (vejez, donación, rotura, otra) y la misma leyenda en cada pieza. Este cambio no lo impide: las operaciones de unidad deben ser reutilizables en lote y el motivo de baja no se cierra aquí.
- Conversión de stock existente a unidades; backfill de seriales legados; eliminar `componentes_equipo.numero_serie`.
- Historia anterior a este cambio.
- **Ayuda**: escritura suspendida. Se anota la deuda en commit y PR de cada work unit con UI (flag en el ABM, carga de seriales, selector de unidad, historial, corrección). Revisado: `backend/ayuda/equipos-listado.md:11` habla del serial del equipo y no queda falso; se corrige cualquier otro artículo que el cambio vuelva falso.

## Preguntas de `rules.proposal`

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | Sí: CHECK de Postgres (modo, estado, `cantidad = 1` con unidad), DTO y Zod de insumos y equipos. Fuente única: enums y normalización del serial en el dominio del backend. |
| ¿Alternativas con comportamiento distinto? | Sí, P1–P11 de exploración §3. El dueño eligió la recomendada en todas. |
| ¿Cambia lo que ve o hace el usuario? | Sí: ABM del insumo, recepción, diálogos de movimiento, alta de componente, ficha con unidades e historial. Plan de Ayuda: ver Out of Scope. |

## Capabilities

### New Capabilities

- `unidades-insumo-serie`: modo de seguimiento, unidad con serial único normalizado, estados de la unidad, carga y corrección de serial, historial, invariante libro/unidades.

### Modified Capabilities

- `stock-insumo-condicion`: para insumos `SERIE`, el saldo por condición sale de las unidades en depósito; ENTRADA, recepción, SALIDA y AJUSTE referencian una unidad con cantidad 1.
- `componentes-catalogo-unico`: el alta con descuento de un insumo `SERIE` exige elegir la unidad; retiro, descarte y reactivar actualizan la unidad; componentes legados sin unidad.

## Approach

Modelo A+B de la exploración; el diseño lo cierra.

- **Datos** (migración aditiva): `Insumo.seguimiento` default `NINGUNO`; tabla `unidades_insumo` (serial, condición, estado `EN_DEPOSITO`/`INSTALADA`/`DESCARTADA`, `equipoId`); `movimientos_insumo.unidad_id` nullable con CHECK `cantidad = 1`; `componentes_equipo.unidad_id` nullable y único.
- **Fuente única del saldo** `SERIE`: unidades. Toda mutación de unidad ocurre en la misma transacción que su movimiento, bajo el advisory lock por insumo existente; un spec de integración verifica el invariante.
- **Entrega**: auto-chain, feature-branch-chain con tracker `feat/repuestos-numero-de-serie`, cada PR bajo 400 líneas cambiadas. Estimación: 5–7 PR; la partición la cierra `sdd-tasks`.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/prisma_tenant/**` (schema, migración nueva) | Modified |
| `backend/src/insumos/**` (entidad, unidad nueva, saldo, casos de uso, controller) | New/Modified |
| `backend/src/compras/**/registrar-recepcion-de-item.use-case.ts` | Modified |
| `backend/src/equipos/**` (instalar, alta, retirar, reactivar, editar) | Modified |
| `frontend/src/features/insumos/**`, `frontend/src/features/equipos/**` | Modified |
| `DEPLOY-VPS-runbook.md` (orden de despliegue y rollback) | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Dos fuentes de verdad del saldo | Media | Saldo derivado de unidades; spec del invariante |
| Recepción parcial con deltas acumulados | Alta | D1 y D2 en diseño; unidad entera obligatoria |
| Concurrencia al elegir unidad | Media | Elección bajo el lock por insumo |
| PR de recepción y frontend sobre 400 líneas | Alta | Corte en work units más finos |
| Rollback con unidades creadas | Media | Ver Rollback Plan |

## Rollback Plan

- Código: `git revert` de los PR de la cadena, en orden inverso.
- Migración aditiva y con default: puede quedar aplicada con el binario viejo.
- Mientras ningún insumo esté en `SERIE`, revertir no tiene costo. Con unidades creadas, el backend viejo suma el libro y los saldos coinciden si el invariante se cumplió, pero pierde la elección de unidad; el diseño documenta el procedimiento en el runbook.

## Open Questions for Design

| # | Pregunta |
|---|---|
| D1 | Qué significa "después" en P2: unidad con serial pendiente (estado y restricciones precisas: ¿puede instalarse o salir?) o recepción completable más tarde sin crear unidades hasta cargar el serial. No reabre la decisión de producto. |
| D2 | Recepción con delta fraccional o sin seriales suficientes: rechazo o pendiente. |
| D3 | Alta sin descuento de un insumo `SERIE`: unidad INSTALADA sin origen o sin unidad. |
| D4 | Dónde vive el registro de corrección de serial y el historial (tabla propia o derivado del libro). |
| D5 | Validación de unidad de medida entera: lista cerrada o atributo de la unidad de medida. |
| D6 | Forma de las operaciones de unidad para que la baja de equipo completo las reutilice en lote. |

## Success Criteria

- [ ] Un insumo `NINGUNO` se comporta exactamente como antes.
- [ ] `SERIE` solo se activa con saldo cero y unidad de medida entera.
- [ ] Un serial duplicado (tras normalizar) dentro del mismo insumo se rechaza.
- [ ] El saldo `SERIE` por condición coincide con las unidades en depósito y con el libro (spec del invariante).
- [ ] Instalar, salida y ajuste negativo exigen una unidad en depósito; retirar a stock la devuelve USADO con su serial.
- [ ] La corrección de serial exige motivo y queda registrada; el historial muestra la vida de la unidad.
- [ ] Deuda de Ayuda anotada; ningún artículo queda falso.
- [ ] `pnpm lint`, typecheck y `pnpm test` en verde en backend y frontend; cada PR bajo 400 líneas.
