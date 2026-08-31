# Design: Edición de planes preventivos y corrección de permisos

## Technical Approach

Tres unidades independientes, sin dependencia entre sí. WU-1 corrige datos y una constante de
dominio con una migración de movimiento acotada al módulo `PREVENTIVO`. WU-2 estrena la
dependencia `preventivo → equipos` inyectando el puerto existente con `Pick<>` y aísla el
formateo del objetivo en una función pura de dominio. WU-3 construye el diálogo de edición
sobre los patrones ya cerrados del repo (`reset` en la apertura, opción fuera de catálogo,
espejo del XOR).

---

## Architecture Decisions

### ADR-1: El objetivo del ticket se escribe con cinco estados, ninguno colapsado

**Choice**: no hay getter que exponer. `BaseEntity` ya declara `get deletedAt()` público e
`isDeleted()` (`backend/src/shared/domain/base-entity.ts:54,74`), y `EquipoInformaticoEntity`
los hereda. Se escriben cinco textos distintos.

**La premisa del proposal es falsa y conviene decirlo**: el riesgo "`deletedAt` no está
expuesto en `EquipoInformaticoEntity` (solo `activo`)" no se sostiene al abrir el archivo.

**Rationale (mecanismo, no preferencia)**: `PrismaEquipoInformaticoRepository.findById` hace
`findUnique({ where: { id } })` sin filtrar `deletedAt`, así que **cuando la fila existe siempre
tenemos el nombre**. Colapsar "dado de baja" con "eliminado" descartaría un dato que ya está en
la mano. Y los dos estados que NO tienen nombre —`null` y excepción del repositorio— son
exactamente el par que el front confundió tres veces: se separan, porque "el dato no está" y
"no pude consultar el dato" mandan al usuario a acciones distintas.

| Estado | Cómo se detecta | Línea escrita |
|---|---|---|
| Ubicación | `plan.ubicacion !== null` | `Ubicación: <TEXTO>` |
| Equipo vigente | entidad, `!isDeleted()`, `activo` | `Equipo: <nombre>` |
| Equipo dado de baja | entidad, `!isDeleted()`, `!activo` | `Equipo: <nombre> (dado de baja)` |
| Equipo eliminado | entidad, `isDeleted()` | `Equipo: <nombre> (eliminado del inventario)` |
| Equipo inexistente | `findById` devolvió `null` | `Equipo: no encontrado (id <equipoId>)` |
| Equipo no consultable | `findById` lanzó | `Equipo: no se pudo consultar (id <equipoId>)` + `logger.error` |

**Alternatives considered**: (a) degradar a dos estados honestos — rechazada: tira información
disponible sin ganar nada; (b) dejar propagar la excepción de `findById` — rechazada: frena un
mantenimiento por un dato descriptivo (decisión cerrada en el proposal).

**Dónde vive**: función pura `describirObjetivo` en
`preventivo/domain/services/describir-objetivo.service.ts`, mismo lugar y criterio que
`CalcularCicloService`. Recibe una unión discriminada, **no** la entidad de equipos, así que
`preventivo/domain` no importa de `equipos/`. El use case (capa de aplicación) hace el I/O, el
`try/catch` y el mapeo entidad → unión.

### ADR-2: La dependencia `preventivo → equipos` no crea un puerto nuevo

**Choice**: `GenerarPreventivosUseCase` suma un noveno parámetro
`Pick<IEquipoInformaticoRepository, 'findById'>`, mismo idiom que sus otros ocho. Cableado en
`preventivo.module.ts`: `EquiposModule` entra a `imports` y `EQUIPO_INFORMATICO_REPOSITORY` a
`inject`.

**Rationale**: `EquiposModule` ya exporta ese token (`equipos.module.ts:278`) y no importa
`PreventivoModule`, así que no hay ciclo. Un puerto propio de preventivo sería una segunda
declaración del mismo contrato: dos fuentes de verdad para una firma que ya existe.

### ADR-3: La migración de permisos borra primero y otorga después

**Choice**: migración nueva con `DELETE` de las celdas `modulo='PREVENTIVO'` de los usuarios
con membresía TECNICO, seguido de `INSERT ... SELECT` de los cuatro pares para los usuarios con
membresía COLABORADOR activa, `ON CONFLICT DO NOTHING`.

**Precisión sobre el proposal**: "mover celdas" no puede ser un `INSERT ... SELECT` fila a fila
desde las filas TECNICO, porque `usuario_cliente_permisos` es **por usuario**, no por rol: las
dos poblaciones son conjuntos de usuarios disjuntos y no hay correspondencia entre un TECNICO y
un COLABORADOR. El movimiento es a nivel del módulo: las concesiones de `PREVENTIVO` dejan
TECNICO y aterrizan en COLABORADOR, sin tocar ninguna celda de otro módulo — que es lo que la
frase "no reaplicar presets" protege.

**Alternative rechazada**: derivar las acciones a otorgar con
`SELECT DISTINCT accion FROM usuario_cliente_permisos WHERE modulo='PREVENTIVO'`. Suena más
fiel al "mover", pero en un tenant sin ningún TECNICO el conjunto origen es vacío y la
migración es un no-op silencioso que deja el módulo inalcanzable: falla abierta hacia el lado
equivocado.

**Orden y asimetría, las dos deliberadas**:
- `DELETE` antes que `INSERT`: si un usuario tuviera membresías de los dos roles en el mismo
  cliente, este orden hace ganar la concesión y no la revocación.
- El `INSERT` filtra `m.activo = true AND m.deleted_at IS NULL` (simetría con
  `20260825120100`); el `DELETE` **no filtra por `activo`**. Otorgar es conservador; revocar es
  total, porque una celda que sobrevive en una membresía inactiva devuelve el módulo el día que
  esa membresía se reactive.
- Los `JOIN` son por `(usuario_id, cliente_id)`, así que un usuario TECNICO en un tenant y
  COLABORADOR en otro queda resuelto correctamente en cada uno.
- ADMINISTRADOR no aparece en ninguna de las dos sentencias: matriz vacía por diseño, bypass
  vía `resolverScope`.

**Idempotencia**: `ON CONFLICT DO NOTHING` sobre la PK compuesta
`(usuario_id, cliente_id, modulo, accion)` en el `INSERT`; el `DELETE` borra cero filas en la
segunda corrida. **Rollback**: migración inversa simétrica (borra las de COLABORADOR, otorga
las de TECNICO) + revertir `PRESETS_ROL`. Sin pérdida de datos: solo se tocan las cuatro celdas
de un módulo.

**Efecto aceptado**: un COLABORADOR al que le hubieran revocado esas celdas a mano las
recupera. Es una corrección de módulo, no una reaplicación de preset, y se documenta en la
Ayuda.

### ADR-4: El diálogo se sincroniza en la transición de apertura

**Choice**: el patrón exacto ya cerrado en `componente-edit-dialog.tsx:80-88`.

```tsx
<Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) sincronizar(); }}>
```

donde `sincronizar()` hace `reset(valoresVigentes)` **y** repone el estado local del radio
(`setObjetivo(plan.equipoId ? "equipo" : "ubicacion")`), con `valoresVigentes` recalculado
desde el prop `plan` en cada apertura.

**Rationale**: el diálogo no se desmonta al cerrarse, y `useForm({ defaultValues })` solo lee
su argumento en el montaje. Sin el `reset`, la segunda apertura muestra el snapshot del primer
render. Resetear el formulario sin reponer el radio deja el mismo defecto en un estado que
`react-hook-form` no administra.

**Consecuencia que ata ADR-4 con ADR-7**: `formState.dirtyFields` se mide contra la línea de
base que fija el último `reset`. Con la base vieja, el aviso de cadencia de ADR-7 se dispara
cuando no corresponde, o no se dispara cuando sí.

### ADR-5: El XOR se limpia en el formulario **y** en el cuerpo del PATCH

**Choice**: al elegir un lado del objetivo, `setValue(otroLado, "", { shouldValidate: true,
shouldDirty: true })`; y el submit manda **siempre el par completo**, con el lado descartado en
`null` explícito.

**Rationale**: `EditarPlanUseCase` es PATCH semántico (`undefined` = no tocar) y
`PlanPreventivoEntity.editar()` revalida sobre el estado RESULTANTE
(`plan-preventivo.entity.ts:288-308`). Si el usuario pasa de ubicación a equipo y el cuerpo
omite `ubicacion`, el plan queda con los dos seteados y el dominio responde 422
`ObjetivoInvalidoError` — o sea que limpiar solo el campo visible no alcanza. `null` atraviesa
el DTO sin problema: `@IsOptional()` saltea la validación tanto con `null` como con
`undefined`.

`shouldDirty: true` va aunque hoy no haya guard de `isDirty`: un `setValue` sin ese flag deja
el campo fuera de `dirtyFields`, con apariencia de estar cubierto (clase documentada en
`AGENTS.md`).

**Topes**: `schemas.ts` ya copia `TITULO_MAX_LENGTH`/`UBICACION_MAX_LENGTH`/
`INTERVALO_VALOR_MAXIMO`; el schema de edición reusa `camposComunes` menos `fechaInicio` y suma
`activo`. `schemas.test.ts` conserva el centinela sobre esos números.

### ADR-6: Un equipo fuera del catálogo activo se muestra, nunca se sustituye

**Choice**: `GET /equipos` devuelve solo `activo=true, deletedAt=null`
(`listar-equipos.use-case.ts` → `findAllActive`), así que el `<select>` puede recibir un
`equipoId` que no está entre sus opciones y el DOM caería a otra. Se resuelve con la variante ya
usada en el repo, **gateada por `isSuccess`**: la ausencia en la lista solo prueba algo cuando
la lista resolvió.

| Condición | Qué hace la UI |
|---|---|
| `equiposQuery.isSuccess` y el id está en la lista | comportamiento normal |
| `isSuccess` y el id **no** está → `useEquipo(plan.equipoId)` responde 200 | opción extra `<nombre> (dado de baja)`, preseleccionada |
| ídem, y responde `ApiError` con `status === 404` | opción extra "Equipo eliminado del inventario", preseleccionada |
| ídem, y responde cualquier otro error | mensaje "No se pudo verificar el equipo" + select del objetivo deshabilitado |
| `equiposQuery.isLoading` o `isError` | select deshabilitado + mensaje; **nunca** se infiere una baja |

`useEquipo` se invoca con `""` cuando el equipo sí está en la lista activa: su `enabled: !!id`
existente evita el request de más sin tocar el hook de equipos.

**Entrada única desde el detalle, no desde la fila de la lista**. Rationale: `useEquipo` por
fila sería un `GET /equipos/:id` por plan sobre el listado (N+1); el detalle ya resuelve un
plan único y ya monta `useEquipos`. La trampa de ADR-4 aplica igual, porque lo que la produce
es que el diálogo no se desmonta al cerrarse, no que viva en una tabla.

### ADR-7: El efecto de cambiar la cadencia se anuncia antes, y la fecha real se re-lee después

**Choice**: aviso cualitativo **sin fecha** mientras se edita, y fecha autoritativa recién
después de guardar, releída del listado.

- **Antes**: con `dirtyFields.intervaloValor || dirtyFields.intervaloUnidad`, aviso inline en el
  bloque de cadencia: *"Al cambiar la cadencia, la próxima ejecución se recalcula hacia adelante
  desde hoy. Los ciclos anteriores no se generan."*
- **Después**: `onSuccess` invalida `["preventivo", "planes"]`; el detalle deriva de ese
  listado (`usePlanPreventivo`) y muestra la `proximaEjecucionEn` recién traída.

**Rationale — dos mecanismos, los dos verificados**:
1. Calcular la fecha en el front duplicaría la aritmética de `CalcularCicloService`, creando
   una segunda fuente de verdad que puede divergir del dominio. Es la misma clase de defecto
   que los topes sin espejar.
2. **La respuesta del PATCH trae la fecha vieja.** `EditarPlanUseCase` persiste el puntero por
   el repositorio (`actualizarProximaEjecucion`) y devuelve la MISMA entidad, cuyo
   `props.proximaEjecucionEn` nunca se mutó — la entidad no expone setter, a propósito
   (`editar-plan.use-case.ts:33-34,85-103`). Mostrar `respuesta.proximaEjecucionEn` como "la
   nueva fecha" sería mentir. El listado invalidado es la única lectura confiable.

---

## Data Flow

```
WU-2  scheduler ─→ GenerarPreventivosUseCase.procesarPlan
                        │  plan.ubicacion ≠ null ──────────────→ ObjetivoResuelto
                        │  plan.equipoId  ≠ null
                        │      └─ equipoRepo.findById (try/catch)
                        │            entidad │ null │ throw ────→ ObjetivoResuelto
                        ↓
                  describirObjetivo(...)  (dominio puro)
                        ↓
                  "<línea de objetivo>\n\n<instrucciones>"
                        ↓
                  CrearTicketUseCase.execute({ descripcion })

WU-3  detalle ─→ Dialog(open) ─→ reset(valoresVigentes) + setObjetivo
                        ↓
                  submit { equipoId | null, ubicacion | null, ... }
                        ↓
                  PATCH /preventivo/planes/:id ─→ invalidate(["preventivo","planes"])
                        ↓
                  usePlanPreventivo re-lee proximaEjecucionEn AUTORITATIVA
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma_master/migrations/<ts>_swap_preventivo_permisos_colaborador/migration.sql` | Create | `DELETE` TECNICO + `INSERT` COLABORADOR (ADR-3) |
| `backend/src/auth/domain/presets-rol.ts` | Modify | Los 4 `PREVENTIVO:*` de `TECNICO` a `COLABORADOR`; reescribir el comentario que cita ADR-PV6 |
| `backend/src/auth/domain/presets-rol.spec.ts` | Modify | Sacar los 4 de `CELDAS_TECNICO_ESPERADAS` y agregar la aserción espejo para COLABORADOR |
| `backend/src/auth/infrastructure/persistence/prisma/swap-preventivo-permisos.integration.spec.ts` | Create | Corre `20260825120100` y después el swap; verifica estado final, idempotencia y que ADMINISTRADOR/USUARIO no se tocan |
| `backend/src/preventivo/domain/services/describir-objetivo.service.ts` | Create | Unión `ObjetivoResuelto` + `describirObjetivo` + composición de la descripción (ADR-1) |
| `backend/src/preventivo/application/use-cases/generar-preventivos.use-case.ts` | Modify | Noveno parámetro `Pick<…,'findById'>`; resolución con `try/catch`; `descripcion` compuesta |
| `backend/src/preventivo/preventivo.module.ts` | Modify | `EquiposModule` en `imports`, token en `inject` |
| `frontend/src/features/preventivo/types.ts` | Modify | `EditarPlanPreventivoDto` espejo del `EditarPlanPreventivoHttpDto` |
| `frontend/src/features/preventivo/schemas.ts` | Modify | `editarPlanPreventivoSchema` (sin `fechaInicio`, con `activo`) reusando `camposComunes` |
| `frontend/src/features/preventivo/hooks/use-planes-preventivo-mutations.ts` | Modify | `useEditarPlanPreventivo` (PATCH + invalidación) |
| `frontend/src/features/preventivo/components/plan-preventivo-edit-dialog.tsx` | Create | Diálogo de edición (ADR-4/5/6/7) |
| `frontend/src/features/preventivo/components/plan-preventivo-detail-view.tsx` | Modify | Entrada al diálogo bajo `<Can permiso="PREVENTIVO:MODIFICACION">` |
| `backend/ayuda/permisos-y-roles.md` | Modify | Hoy afirma "ni siquiera Colaborador"; queda al revés |
| `backend/ayuda/mantenimiento-preventivo.md` | Modify | Editar un plan, quién administra, objetivo en el ticket, efecto de la cadencia |

Tests acompañando cada unidad, en el mismo commit. Conteo de archivos de código al revisor:
WU-1 = 1, WU-2 = 3, WU-3 = 5 (justo en el tope; si aprieta, `types.ts` + `schemas.ts` pueden
salir en un commit propio).

---

## Interfaces / Contracts

```ts
// preventivo/domain/services/describir-objetivo.service.ts — dominio puro,
// sin imports de equipos/ ni de infraestructura.
export type ObjetivoResuelto =
  | { tipo: 'UBICACION'; texto: string }
  | { tipo: 'EQUIPO_VIGENTE'; nombre: string }
  | { tipo: 'EQUIPO_DADO_DE_BAJA'; nombre: string }
  | { tipo: 'EQUIPO_ELIMINADO'; nombre: string }
  | { tipo: 'EQUIPO_INEXISTENTE'; equipoId: string }
  | { tipo: 'EQUIPO_NO_CONSULTABLE'; equipoId: string }
  | { tipo: 'SIN_OBJETIVO' };

export function describirObjetivo(objetivo: ObjetivoResuelto): string | null;

export function componerDescripcionTicket(
  objetivo: ObjetivoResuelto,
  instrucciones: string | null,
): string;
```

`SIN_OBJETIVO` existe porque `PlanPreventivoEntity.reconstitute()` no revalida el XOR: una fila
histórica podría llegar sin ninguno de los dos. En ese caso `describirObjetivo` devuelve `null`
y la descripción son las instrucciones solas, sin línea de objetivo ni línea en blanco.

---

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (dominio) | Las siete ramas de `describirObjetivo`; que dos estados distintos nunca produzcan el mismo texto | Función pura, sin mocks; un caso por rama más un test que asegura textos mutuamente distintos |
| Unit (aplicación) | `findById` que lanza degrada el texto, loguea y **no** aborta la generación; `null` produce un texto distinto del de baja | Doble de `findById` con `mockRejectedValue` / `null`; se afirma que `crearTicketUseCase.execute` se llamó igual |
| Unit (aplicación) | La descripción es `<objetivo>\n\n<instrucciones>` y con `instrucciones = null` no queda línea en blanco colgada | Aserción sobre el payload de `crearTicketUseCase.execute` |
| Integración (master) | Estado final del swap, idempotencia de la segunda corrida, ADMINISTRADOR/USUARIO intactos, TECNICO con cero celdas `PREVENTIVO` | Fixture propio + ejecución del SQL real, patrón de `backfill-preventivo-permisos.integration.spec.ts`; `usarLockMasterTest()` obligatorio |
| Frontend | Reabrir el diálogo tras cambiar el plan muestra los valores vigentes | Abrir, cerrar, mutar el prop, reabrir, afirmar sobre los valores del form |
| Frontend | Cambiar de ubicación a equipo manda `ubicacion: null` en el cuerpo | Espiar el `mutate` y afirmar sobre el DTO, no sobre la pantalla |
| Frontend | Los tres estados fuera de catálogo, con su hermano invertido (equipo vigente presente en la lista) | `useEquipo` mockeado con 200 / `ApiError(404)` / `ApiError(500)` |
| Frontend | El aviso de cadencia aparece al ensuciar la cadencia y **no** aparece al tocar solo el título | Par de asserts invertidos, según la regla de asserts de ausencia |

---

## Threat Matrix

N/A — no hay routing, shell, subprocesos, automatización de VCS/PR, clasificación de archivos
ejecutables ni integración de procesos. La migración SQL corre por `prisma migrate deploy`, el
mecanismo de despliegue ya vigente.

---

## Migration / Rollout

Una sola migración de master, sin feature flag y sin fases. Se despliega con el resto: al
aplicarse, todo TECNICO pierde el módulo y todo COLABORADOR activo lo gana en el mismo commit
que corrige `PRESETS_ROL`, así que preset y datos nunca quedan divergentes en producción. Los
usuarios creados después toman el preset corregido por la vía normal. Rollback: migración
inversa simétrica descrita en ADR-3.

---

## Open Questions

- [ ] **ADR-PV6 no vive en un archivo.** El proposal pide "ADR-PV6 reescrito", pero el design de
      `sdd/preventivo` es anterior al 2026-08-30 y vive solo en Engram: no hay `openspec/` que
      editar. Se resuelve actualizando las tres citas en código que lo referencian
      (`presets-rol.ts`, el header de `20260825120100/migration.sql`,
      `backfill-preventivo-permisos.integration.spec.ts`) para que apunten a este design, y
      dejando el artefacto de Engram como registro histórico. Confirmar que alcanza.
