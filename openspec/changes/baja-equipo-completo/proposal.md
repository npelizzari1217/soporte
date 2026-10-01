# Proposal: baja de equipo completo

## Intent

Hoy un equipo solo se retira pieza por pieza, y el único "Dar de baja" de la ficha es el borrado lógico (`DELETE /equipos/:id`), que **deja las unidades `INSTALADA` huérfanas** y los componentes activos sobre un equipo invisible: un defecto latente. El ciclo agrega la baja de un equipo entero, atómica, con dos destinos (devolver todo al stock o descartar todo) y una misma leyenda en todas las piezas, y corrige el defecto del borrado.

Entrada: `exploration.md` de esta carpeta. Research no seleccionada. **Decisión de producto**: `docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", viñeta "Baja de equipo completo" (recomendaciones P1–P11 de la exploración, confirmadas por el dueño el 2026-10-01). Cada sub-viñeta es un ítem del alcance y será un requerimiento de la spec.

**P12 resuelta por medición** (consulta de solo lectura del 2026-10-01 sobre los 8 tenants de producción): 0 equipos borrados, 0 equipos inactivos, 0 componentes activos en equipos borrados y 0 unidades `INSTALADA` en equipos borrados. No hace falta corregir datos antes del ciclo.

## Scope

### In Scope (viñeta "Baja de equipo completo", 2026-10-01)

1. **Dos opciones, todo o nada**: devolver todas las piezas al stock (como `USADO`) o descartarlas todas. La misma leyenda en todas las piezas.
2. **Motivo**: categoría (`VEJEZ`, `DONACION`, `ROTURA`, `OTRA`) más texto libre, en las dos opciones; `OTRA` exige texto.
3. **Baja definitiva**: no se deshace.
4. **Tickets abiertos**: la baja se permite con un aviso de cuántos hay.
5. **Visibilidad**: el equipo dado de baja sigue en la lista con la etiqueta "Baja", oculto por un filtro por defecto; ficha e historial visibles. No admite agregar piezas ni editarse.
6. **Permiso** `EQUIPOS:BORRADO`.
7. **Descartar todo no deja asiento negativo** en el stock.
8. **Borrado actual** solo para equipos cargados por error: se bloquea con piezas activas y el botón cambia de nombre (**corrección de defecto**).
9. **Devolver al stock** pide el serial de cada pieza legada de un insumo con serie; una pieza con insumo borrado frena la baja y se informa.
10. **Confirmación**: resumen y confirmar para devolver; además escribir el nombre del equipo para descartar.

### Out of Scope

- Destinos mezclados por componente (sigue disponible el retiro pieza por pieza previo).
- Deshacer o reactivar un equipo dado de baja.
- Acción de permiso nueva.
- Asiento negativo de stock.
- Flujo de aprobación.

## Preguntas de `rules.proposal`

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | Sí: categoría y destino (CHECK de Postgres, DTO, Zod). Fuente única: el enum del dominio del equipo. |
| ¿Alternativas con comportamiento distinto? | Sí, P1–P11; el dueño eligió la recomendada en todas. |
| ¿Cambia lo que ve o hace el usuario? | Sí. Plan de Ayuda abajo. |

**Ayuda** (escritura suspendida): se anota la deuda en commit y PR (flujo de baja nuevo, botón de borrado renombrado, filtro de la lista). Dentro del work unit correspondiente se corrige lo que el cambio vuelve **falso**: `backend/ayuda/equipos-listado.md` (afirma "no tiene filtros" y que muestra activos y dados de baja por igual) y, si queda incompleta, la lista de "trabajos que mueven el stock" de `backend/ayuda/permisos-y-roles.md`.

## Capabilities

### New Capabilities

- `equipos-baja-completa`: baja atómica del equipo, destinos, motivo y leyenda, guards de equipo no vigente, visibilidad y filtro, bloqueo del borrado, confirmación, error con piezas problemáticas.

### Modified Capabilities

- `unidades-insumo-serie`: el requerimiento "Las operaciones de unidad son reutilizables en lote" deja de prohibir la baja completa y pasa a ser consumido por ella. La spec evalúa si `stock-insumo-condicion` necesita delta por la devolución en lote.

## Approach

- **`DarDeBajaEquipoUseCase` nuevo**, todo o nada, en una sola transacción; nunca un bucle sobre `RetirarComponenteUseCase` (viola el invariante L de ADR-12, riesgo de deadlock).
- **Locks por lote**: unidades `SERIE` vía `OperacionesUnidadInsumo.devolverAlDeposito` / `descartarInstaladas` (ya por lote, L1→L2→L3 ordenados); insumos `NINGUNO` vía un camino de devolución en lote nuevo en `RegistrarEntradaInsumoUseCase`; componentes (L4) marcados al final por id ordenado.
- **Equipo** `activo=false` más columnas de baja (destino, categoría, motivo, fecha, usuario) por migración tenant.
- **Una leyenda compuesta** (equipo, categoría, texto) dentro del tope de 500 caracteres, igual en componente, movimiento y evento.
- **Fallo**: un error que lista las piezas problemáticas; ninguna baja parcial.
- **Guards** de editar y agregar componente sobre equipo `activo=false`.
- **Bugfix del borrado con TDD estricto**: test de regresión RED antes del fix (evidencia RED→GREEN).
- **Test de concurrencia** baja contra instalación sobre los mismos insumos.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/prisma_tenant/schema.prisma` + migración | Modified/New |
| `backend/src/equipos/domain/entities/equipo-informatico.entity.ts` | Modified |
| `backend/src/equipos/application/use-cases/` (baja nueva; `eliminar-equipo`, `editar-equipo`, `agregar-componente`) | New/Modified |
| `backend/src/insumos/application/use-cases/registrar-entrada-insumo.use-case.ts` | Modified |
| `backend/src/equipos/interface/controllers/equipos.controller.ts`, DTOs, `equipos.module.ts` | Modified |
| `frontend/src/features/equipos/**` (diálogo, lista, hooks, schemas) | New/Modified |
| `backend/ayuda/equipos-listado.md`, `permisos-y-roles.md` | Modified |
| `docs/roadmap-comercial.md` (Cumplida/Desviación al cerrar) | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Deadlock contra instalación concurrente | Media | Locks por lote ordenados; spec de concurrencia |
| Leyenda compuesta supera 500 | Media | Validar el texto libre contra el espacio restante |
| Insumo `SERIE`→`NINGUNO` con unidad instalada | Baja | Test del caso borde |
| Migración tenant en 8 bases | Media | `predeploy-dump.ps1` + `deploy.ps1` |
| Cadena sobre el presupuesto de 400 | Alta | Feature-branch-chain |

## Rollback Plan

- `git revert` de los PR de la cadena en orden inverso.
- La migración es **aditiva** (columnas nulas): el binario anterior la ignora y puede quedar aplicada. Si ya hubo bajas, revertir el código deja equipos `activo=false` ocultos con su historial intacto; sus piezas ya están en stock o descartadas de forma coherente.
- Ante una migración fallida: restaurar el dump verificado de `predeploy-dump.ps1`.

## Dependencies

- Ninguna dependencia nueva de paquetes. Despliegue con `predeploy-dump` y deploy.

## Chain forecast

Auto-chain, feature-branch-chain sobre `feat/baja-equipo-completo`, 400 líneas por PR. Estimación 4–5 PR: borrado bloqueado y guards (bugfix TDD); migración, entidad y entrada en lote; caso de uso, endpoint y concurrencia; frontend, filtro y correcciones de Ayuda. Riesgo de presupuesto: Alto. La partición la cierra `sdd-tasks`.

## Success Criteria

- [ ] Cada sub-viñeta de "Baja de equipo completo" es un requerimiento verificado.
- [ ] Una baja que falla en una pieza no cambia nada y lista las piezas problemáticas.
- [ ] Ninguna unidad queda `INSTALADA` en un equipo borrado o dado de baja.
- [ ] El bugfix del borrado tiene evidencia RED→GREEN.
- [ ] La spec de concurrencia pasa sin deadlock.
- [ ] Ayuda: deuda anotada y artículos falsos corregidos; la viñeta declara Cumplida o Desviación y `scripts/check-roadmap-fresco.mjs` pasa.
- [ ] `pnpm lint`, typecheck y `pnpm test` en verde en backend y frontend; cada PR bajo 400 líneas.
