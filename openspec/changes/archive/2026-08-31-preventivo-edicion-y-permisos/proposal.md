# Proposal: Edición de planes preventivos y corrección de permisos

## Intent

Tres huecos del módulo Preventivo, todos verificados en el repo:

1. **No se puede editar un plan desde la UI.** `PATCH /preventivo/planes/:id` y `EditarPlanUseCase` existen y funcionan; nunca se construyó el diálogo. Hoy cambiar título, objetivo o cadencia obliga a dar de baja y recrear.
2. **Los permisos quedaron en el rol equivocado.** El backfill `20260825120100` otorgó los cuatro permisos `PREVENTIVO:*` solo a TECNICO. Debían ser de COLABORADOR: el técnico no puede desactivar una tarea que le asignó un superior.
3. **El ticket generado no dice sobre qué objeto se trabaja.** El payload de `generar-preventivos.use-case.ts` manda `descripcion: plan.instrucciones` y omite equipo/ubicación. `Ticket` no tiene esas columnas, así que el técnico recibe la instrucción sin el objetivo.

## Scope

### In Scope

- **WU-1 — Swap de permisos.** Migración que mueve las celdas ya otorgadas de TECNICO a COLABORADOR (TECNICO queda sin ninguna), `PRESETS_ROL` actualizado, ADR-PV6 reescrito, `permisos-y-roles.md` corregido (hoy afirma "ni siquiera Colaborador").
- **WU-2 — Objetivo en la descripción del ticket.** El generador antepone una línea `Equipo: <nombre>` o `Ubicación: <TEXTO>` seguida de línea en blanco y las instrucciones. Estrena la dependencia `preventivo → equipos` acotada a `IEquipoInformaticoRepository.findById`, inyectada con `Pick<>`.
- **WU-3 — UI de edición.** `useEditarPlanPreventivo`, diálogo de edición con `titulo`, `instrucciones`, objetivo (equipo XOR ubicación), cadencia y `activo`; entrada desde el detalle y/o la lista.

### Out of Scope

- Editar `fechaInicio` (ancla del ciclo; la API no la acepta).
- Endpoint separado para activar/desactivar (mismos roles que editar).
- Expandir un plan a un ticket por equipo: sigue siendo **un ticket por ciclo**.
- Catálogo o jerarquía de ubicaciones: sigue siendo texto libre normalizado a mayúscula.
- Columnas `equipoId`/`ubicacion` en `Ticket`: el objetivo sigue siendo descriptivo.

## Capabilities

### New Capabilities

- `preventivo-permisos-rol`: qué rol administra el mantenimiento preventivo y qué pasa con los usuarios ya existentes.
- `preventivo-edicion-plan`: qué campos de un plan se pueden modificar, quién puede hacerlo y cómo impacta la próxima emisión.
- `preventivo-objetivo-en-ticket`: cómo se refleja el objetivo del plan en la descripción del ticket generado.

### Modified Capabilities

- Ninguna. `openspec/specs/` está vacío (solo `README.md`); los ciclos previos viven en Engram.

## Approach

| WU | Enfoque |
|---|---|
| 1 | **Corregido por `sdd-design`**: el `INSERT ... SELECT` de filas TECNICO "como COLABORADOR" NO es ejecutable — `usuario_cliente_permisos` concede por USUARIO, no por rol, y las dos poblaciones son conjuntos de usuarios disjuntos. Se resuelve como `DELETE` de las celdas `PREVENTIVO:*` de los usuarios con rol TECNICO + `INSERT` de los cuatro pares para los usuarios con rol COLABORADOR. Mismo resultado observable, sin tocar celdas de otros módulos. Idempotente por PK compuesta. |
| 2 | Resolver el objetivo en el generador: `plan.ubicacion` se imprime tal cual (ya viene en mayúscula); `plan.equipoId` se resuelve con `findById`, que **no filtra `deletedAt`** y por lo tanto permite distinguir *dado de baja* de *inexistente* — la ambigüedad que ya mordió tres veces en el front (`objetivoLabel`). Un objetivo irresoluble degrada el texto, **nunca falla la generación**. |
| 3 | Diálogo espejo del de alta, con `reset(valoresVigentes)` al abrir (clase "sincronización del formulario", `AGENTS.md`), XOR de objetivo espejando `validarObjetivo`, y topes copiados de `TITULO_MAX_LENGTH`/`UBICACION_MAX_LENGTH` con centinela en el test. |

Las tres unidades son independientes y ninguna supera los 5 archivos de código por commit.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/prisma_master/migrations/` | New | Migración del swap de permisos |
| `backend/src/auth/domain/presets-rol.ts` | Modified | `PREVENTIVO:*` de TECNICO a COLABORADOR |
| `backend/src/preventivo/application/use-cases/generar-preventivos.use-case.ts` | Modified | Descripción con el objetivo |
| `backend/src/preventivo/preventivo.module.ts` | Modified | Nueva dependencia acotada a equipos |
| `frontend/src/features/preventivo/` | New/Modified | Hook, diálogo y punto de entrada |
| `backend/ayuda/permisos-y-roles.md` | Modified | Hoy dice que solo Técnico lleva el módulo |
| `backend/ayuda/mantenimiento-preventivo.md` | Modified | Editar un plan; quién administra; objetivo en el ticket |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Un TECNICO real pierde acceso al módulo | Alta (es el objetivo) | Es la corrección pedida; la Ayuda debe explicar el cambio de rol |
| Confundir "dado de baja" con "no encontrado" en el texto del objetivo | Media | **Corregido tras verificar**: `BaseEntity` SÍ expone `get deletedAt()` e `isDeleted()`, y `EquipoInformaticoEntity` además `get activo()`. No hay que exponer nada. `sdd-design` decide cuántos estados distinguir con lo que ya está disponible, sabiendo que `activo=false` (baja de catálogo) y `deletedAt` (soft delete) son DOS cosas distintas. |
| Editar la cadencia mueve `proximaEjecucionEn` hacia adelante desde hoy y el usuario no lo espera | Media | La UI debe anunciar la próxima fecha resultante; la Ayuda lo describe |
| El schema Zod del front queda más laxo o más estricto que el DTO | Media | Espejar `validarObjetivo` y las constantes del dominio, con test centinela |

## Rollback Plan

- **WU-1**: migración inversa simétrica (mueve las celdas de COLABORADOR a TECNICO) + revertir `PRESETS_ROL`. No hay pérdida de datos: solo se mueven filas de `usuario_cliente_permisos`.
- **WU-2**: revertir el commit. La descripción vuelve a `plan.instrucciones`; los tickets ya emitidos no se tocan.
- **WU-3**: revertir el commit. El backend queda intacto; se vuelve al estado actual sin UI de edición.

## Dependencies

- Ninguna externa. WU-2 introduce la primera dependencia interna `preventivo → equipos`.
- WU-1, WU-2 y WU-3 no dependen entre sí y pueden entregarse en cualquier orden.

## Success Criteria

- [ ] Un COLABORADOR ve, crea, edita y da de baja planes preventivos; un TECNICO no ve el módulo.
- [ ] Un ADMINISTRADOR conserva el acceso completo por bypass de `resolverScope`.
- [ ] Editar título, instrucciones, objetivo, cadencia o `activo` desde la UI persiste y se refleja en el próximo ticket, en contenido y en fecha.
- [ ] La descripción del ticket generado arranca con `Equipo: …` o `Ubicación: …` y una línea en blanco antes de las instrucciones.
- [ ] Un plan cuyo equipo fue dado de baja o no existe genera igual, con el objetivo degradado a texto explícito y sin confundir ambos casos.
- [ ] `fechaInicio` no aparece en el formulario de edición, ni siquiera deshabilitada.
- [ ] `mantenimiento-preventivo.md` y `permisos-y-roles.md` describen el comportamiento nuevo en el mismo commit que lo introduce.
