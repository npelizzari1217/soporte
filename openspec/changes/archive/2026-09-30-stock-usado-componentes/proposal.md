# Proposal: stock usado y retiro de componentes con dos desenlaces

## Intent

Hoy el retiro de un componente es un borrado lógico sin datos (`eliminar-componente.use-case.ts`): una pieza sana retirada de un equipo no vuelve al depósito y una rota no deja registro. El stock tampoco distingue una pieza nueva de una usada. El ciclo agrega la condición NUEVO/USADO al stock del mismo ítem del catálogo y convierte el retiro en una operación con dos desenlaces que elige el usuario.

Es el **segundo de dos cambios encadenados**; se apoya en `componentes-catalogo-unico` (archivado el 2026-09-29), que dejó el retiro como borrado lógico "hasta que entre este cambio".

Entrada: `exploration.md` de esta carpeta. Research no seleccionada. **No es un punto de `docs/roadmap-comercial.md`** (la sección "Decisiones de producto ya cerradas" cubre los puntos 2, 4 y 5): la regla de citar la decisión de producto no aplica.

## Scope

### In Scope (decisiones del dueño, 2026-09-29 y 2026-09-30)

1. **Condición en el stock**: cada movimiento lleva `condicion` NUEVO/USADO sobre el mismo insumo; el saldo se lleva por insumo y condición.
2. **Instalación con descuento**: el usuario elige el saldo. NUEVO preseleccionado y modificable; si solo un saldo es mayor que cero, el selector PUEDE quedar fijo en ese saldo.
3. **Reposición**: `stockMinimo` y el estado de reposición se calculan solo sobre NUEVO. La ficha del insumo muestra ambos saldos.
4. **Alcance de la condición**: columna universal en los datos; la UI muestra el selector solo para repuestos (familias `esRepuesto`); el backend rechaza USADO en un insumo no repuesto con 422.
5. **Retiro con dos desenlaces**, con permiso `EQUIPOS:BORRADO` (sin permiso nuevo):
   - devolver al stock como USADO: ENTRADA USADO de 1 unidad y borrado lógico en una sola transacción;
   - descartar por rotura: motivo obligatorio en texto libre (máx. 500, normalización de `MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH`), sin movimiento de stock.
6. **Componente sin salida registrada** (vino con el equipo, o se instaló antes de este cambio): PUEDE devolverse como USADO con motivo obligatorio; el registro de retiro lo marca ("sin salida registrada del depósito"). Una pieza sana de un repuesto deshabilitado también PUEDE volver al stock como USADO (dueño, 2026-09-30).
7. **Reactivar**: bloqueado tras un retiro `STOCK_USADO`; permitido tras `DESCARTE` y en retiros legados (sin destino).
8. **ENTRADA manual y AJUSTE** pueden apuntar a USADO; la recepción de compra queda fija en NUEVO (el campo no se expone).
9. **Registro del retiro**: columnas en `componentes_equipo` (destino, motivo, vínculo al movimiento de devolución y, según diseño, usuario). Sin tabla nueva ni tipo de movimiento de dirección cero.

### Out of Scope

- Baja de un equipo completo con devolución de sus piezas (`eliminar-equipo.use-case.ts`).
- Seguimiento por unidad o número de serie.
- Reporte o exportación de stock.
- Mínimo de reposición por condición.
- **Ayuda**: escritura suspendida. Se anota la deuda en commit y PR de cada work unit que cambie una pantalla (ficha con dos saldos, selector de condición, diálogo de retiro, reactivar). Se corrige solo un artículo que el cambio vuelva falso; candidato a revisar: `backend/ayuda/permisos-y-roles.md:147-154` ("sin `INSUMOS:ALTAS` no puede registrar ningún movimiento"), porque el retiro con `EQUIPOS:BORRADO` suma stock.

## Preguntas de `rules.proposal`

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | Sí: CHECK de Postgres, DTO y Zod (`frontend/src/features/insumos/schemas.ts`, `frontend/src/features/equipos/schemas.ts`). Fuente única: `CONDICIONES_STOCK` y los destinos de retiro en el dominio del backend. |
| ¿Alternativas con comportamiento distinto? | Sí, preguntas (a)–(h) de exploración §4. El dueño eligió a1, b1, c3, d1, e3, f2, g1, h2. |
| ¿Cambia lo que ve o hace el usuario? | Sí: diálogo de retiro, selector de condición en el alta y en los diálogos de movimiento, ficha con dos saldos, reactivar condicionado. Plan de Ayuda: ver Out of Scope. |

## Capabilities

### New Capabilities

- `stock-insumo-condicion`: condición en el movimiento, saldo por insumo y condición, ENTRADA/SALIDA/AJUSTE por condición, recepción fija en NUEVO, reposición sobre NUEVO, rechazo de USADO en no repuestos, histórico migrado como NUEVO.

### Modified Capabilities

- `componentes-catalogo-unico`: MODIFIED el alta con descuento (saldo elegido, NUEVO por defecto); REMOVED "El retiro sigue siendo el borrado lógico sin movimiento de stock"; ADDED retiro con dos desenlaces, devolución de una pieza que vino con el equipo y política de reactivar.

## Approach

Recomendación de la exploración; el diseño la cierra.

- **Datos**: `movimientos_insumo.condicion` NOT NULL DEFAULT 'NUEVO' con CHECK con nombre; columnas de retiro nullable en `componentes_equipo` con CHECK del destino. Migración aditiva; histórico queda NUEVO y retiros previos quedan legados.
- **Saldo**: `calcularStock` sigue siendo la única fórmula y devuelve el saldo por condición; la condición es ortogonal al tipo de movimiento. El advisory lock por insumo no cambia.
- **Retiro**: `POST /equipos/:id/componentes/:cid/baja` con `{destino, motivo?}`; ENTRADA USADO y borrado lógico en una transacción. El destino del `DELETE` actual es decisión de diseño.
- **Entrega**: auto-chain, feature-branch-chain con tracker `feat/stock-usado-componentes`, cada PR bajo 400 líneas cambiadas. Estimación de exploración: 1.800–2.200 líneas, unos 8 work units (§6); la partición la cierra `sdd-tasks`.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/prisma_tenant/**` (schema, migración nueva) | Modified |
| `backend/src/insumos/**` (entidad, `calcularStock`, puerto y repo, casos de uso, DTOs, controller) | Modified |
| `backend/src/compras/**/registrar-recepcion-de-item.use-case.ts` | Modified |
| `backend/src/equipos/**` (instalar, retiro, reactivar, mapper, DTOs, controller) | Modified |
| `frontend/src/features/insumos/**`, `frontend/src/features/equipos/**` | Modified |
| `DEPLOY-VPS-runbook.md` (orden de despliegue y rollback) | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Cambio de firma de `calcularStock` y `SumasPorTipoMovimiento` rompe llamadores y specs | Alta | Una sola función con saldo por condición; se actualiza en el mismo work unit |
| Backend viejo tras un rollback mezcla NUEVO y USADO en un solo saldo | Media | Ver Rollback Plan |
| Doble conteo al reactivar tras devolver | Baja | Reactivar bloqueado tras `STOCK_USADO` |
| Stock USADO fabricado (pieza que vino con el equipo, ajuste positivo) | Media | Motivo obligatorio, marca en el registro, permisos existentes |
| `EQUIPOS:BORRADO` suma stock sin permiso de INSUMOS | Media | Consecuencia asumida; se declara en la spec |
| Cache del frontend (`staleTime: Infinity`) no refleja el retiro | Media | Invalidar `["componentes", equipoId]`, stock y movimientos |
| Spec de integración nuevo que trunca `soporte_master_test` sin lock | Baja | `usarLockMasterTest()` obligatorio |

## Rollback Plan

- Código: `git revert` de los PR de la cadena, en orden inverso.
- Migración: aditiva y con default; puede quedar aplicada con el binario viejo.
- **Riesgo real**: si ya existen movimientos USADO, el backend viejo los suma al saldo único y puede consumir usados como nuevos. Mitigación a diseñar (por ejemplo, desplegar el backend antes de habilitar la devolución, o un feature flag), documentada en el runbook. Revertir antes de que exista un USADO no tiene costo.

## Open Questions for Design

| Pregunta | Recomendación de exploración |
|---|---|
| Destino del `DELETE` actual del componente | Retirarlo o dejarlo como alias del descarte |
| Mecanismo de mitigación del rollback | Orden de despliegue o feature flag |
| Forma de `SumasPorTipoMovimiento` y del saldo devuelto | `{NUEVO, USADO}` más total derivado |
| `bajaUsuarioId` y cómo se marca "sin salida registrada del depósito" | Columnas en `componentes_equipo` |
| `condicion` con `descontarStock=false`: ¿ignorar o 400? | Sin recomendación cerrada |
| Índice `(insumoId, condicion)` | Opcional |

## Success Criteria

- [ ] Todo movimiento tiene condición; el histórico queda NUEVO y el saldo se consulta por condición.
- [ ] Una SALIDA o un AJUSTE negativo nunca deja negativo el saldo de su condición.
- [ ] El estado de reposición usa solo el saldo NUEVO.
- [ ] USADO en un insumo no repuesto devuelve 422; la recepción de compra siempre registra NUEVO.
- [ ] Retiro a stock: ENTRADA USADO y borrado lógico juntos o ninguno; descarte: motivo obligatorio y ningún movimiento.
- [ ] Reactivar se rechaza tras `STOCK_USADO` y se permite tras `DESCARTE` y en retiros legados.
- [ ] Deuda de Ayuda anotada en commit y PR; ningún artículo queda falso.
- [ ] `pnpm lint`, typecheck y `pnpm test` en verde en backend y frontend; cada PR bajo 400 líneas.
