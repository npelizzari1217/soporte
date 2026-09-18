# Design: ABM del catálogo `ModeloEquipo` y su selector en equipos

## Technical Approach

Ciclo **100% frontend**. El backend ya expone los 5 endpoints con sus guards por método
(`modelos-equipo.controller.ts:86,108,124,126,145,167`) y ya acepta y devuelve
`modeloEquipoId` en equipos (`equipos.dto.ts:109,186,362`). No se le pide nada nuevo.

Tres movimientos:

1. **Feature nueva `features/modelos-equipo/`**, calcada del molde de unidades de medida
   (ADR-1), más un Server Component fino en `app/(dashboard)/admin/modelos-equipo/page.tsx`
   y un ítem en `ADMIN_NAV_ITEMS` (`admin-nav.tsx:38-53`).
2. **Selector de catálogo con enclavamiento** en los dos diálogos de equipo (ADR-4), sobre
   el molde de `<select>` de catálogo de `insumo-form-dialog.tsx:98-148,226-240` (ADR-6).
3. **Resolución de nombre del lado cliente** en la única pantalla que hoy muestra `marca`:
   la columna del listado de equipos (ADR-2, ADR-3).

---

## Capa donde cae cada pieza (`rules.design`)

El backend no cambia, así que no hay `domain/` ni `application/` en este ciclo: el dominio
(`ModeloEquipoEntity`, `MODELO_EQUIPO_*_MAX_LENGTH` en `modelo-equipo.entity.ts:25-26`) es la
autoridad y se queda donde está. Todo lo que se escribe cae del lado **interface** del
hexágono, y adentro se ordena por la capa propia del frontend:

| Pieza | Capa frontend | Rol hexagonal |
|---|---|---|
| `types.ts` | espejo de contrato | interface — shape del borde HTTP, cero lógica |
| `schemas.ts` (Zod) | validación de borde | interface — regla DERIVADA; la autoridad es la entidad del backend, se copia a mano y se dice en el JSDoc (mismo criterio que `equipos/schemas.ts:11-29`) |
| `hooks/use-*.ts` | acceso a datos | infrastructure — adaptador HTTP vía `apiFetch` + caché de TanStack Query |
| `components/*` | presentación | interface — container (hooks + estado) vs. presentational (tabla/campos) |
| `app/.../page.tsx` | ruta | interface — composition root de la ruta, sin lógica |
| Enclavamiento | regla de formulario | **NO es dominio.** El backend no excluye `modeloEquipoId` de `marca`/`modelo` y este ciclo no le pide que lo haga |

**Autorización, sus dos lugares** (`rules.design`): el borde son los decoradores
`@UseGuards(AdminClienteGuard)` por método en `modelos-equipo.controller.ts:124,145,167` —
**no se tocan**, son la autoridad real. El chequeo inline del frontend es
`<SoloAdminCliente>` dentro de `ModelosEquipoAdminView` y el `esAdminCliente` de
`AdminNav` (`admin-nav.tsx:58`): defensa en profundidad, sin permiso nuevo en la matriz
`MODULO:ACCION`. La lectura (`GET /modelos-equipo`) queda abierta a cualquier autenticado,
porque el selector de equipos la necesita para un usuario que no es administrador.

---

## Architecture Decisions

### ADR-1: la feature nueva copia el molde de unidades de medida, con dos desvíos declarados

**Choice**: cuatro piezas espejadas 1:1 —`UnidadesMedidaAdminView` (39 líneas,
`AdminNav` + `SoloAdminCliente` + `PageHeader` + lista), `UnidadMedidaList` con su
`EstadoActivoAction` detrás de `ConfirmDialog` (`unidad-medida-list.tsx:22-39`),
`UnidadMedidaFormDialog` con `valoresVigentes` recalculado en cada render y
`if (next) reset(valoresVigentes)` al abrir (`unidad-medida-form-dialog.tsx:33-35,58-61`), y
los dos hooks (`use-unidades-medida.ts`, `use-unidad-medida-mutations.ts`)—.

**Desvíos, con su razón**:

| Desvío | Por qué |
|---|---|
| Sin campo `codigo`; la identidad es el PAR `(marca, modelo)` (`schema.prisma:642`) | `ModeloEquipo` no tiene `codigo`. El duplicado no es un choque de código sino de par, y vuelve como 422 del backend — se muestra con `notifyError`, igual que el resto |
| `marca` normaliza `trim().toUpperCase()`; `modelo` solo `trim()` | Es el contrato del backend. La designación comercial se muestra como la escribe el fabricante ("LaserJet Pro M404") |
| El largo se mide sobre el valor NORMALIZADO, no sobre el crudo | Molde exacto de `normalizarUbicacion` (`equipos/schemas.ts:75-77,149-155`): `toUpperCase()` no preserva longitud ('ß' → 'SS'), y medir el crudo deja pasar en el form lo que el backend rebota con 400. La misma función normaliza en el `.refine()` y en el `submit()` |
| Sin `@Matches` de código en ninguno de los dos campos | `marca` es texto libre con espacios internos ("HEWLETT PACKARD") |

**Rejected**: escribir la feature desde cero "más prolija". El repo ya pagó el costo de
converger estos cuatro archivos; divergir acá cuesta revisión sin comprar nada.

### ADR-2: `equipo-detail-view.tsx` NO cambia. El que cambia es la columna `Marca` del listado

**Verificado**: `equipo-detail-view.tsx:57-94` no renderiza `marca`, ni `modelo`, ni
`modeloEquipoId` — solo `nombre`, `numeroSerie` y la sección de componentes. Nunca los
mostró.

**Choice**: la ficha de detalle queda **fuera** de este ciclo. Se modifica una sola línea de
display: `equipos-list-view.tsx:43`, hoy `render: (row) => row.marca ?? "—"`.

**Rationale** — la asimetría es de causalidad, no de gusto:

- No mostrar el modelo en la ficha es un **hueco preexistente**. La ficha tampoco mostraba
  `marca`/`modelo` antes de este ciclo: no hay nada que este cambio rompa ahí.
- Dejar la columna como está sí es una **regresión que introduce este ciclo**. El
  enclavamiento VACÍA `marca` (ADR-4), y `equipos-list-view.tsx:43` es el único lugar donde
  un usuario ve `marca` hoy. Sin tocarla, elegir un modelo de catálogo hace desaparecer de
  pantalla el dato que el usuario acaba de cargar, y la columna dice "—" sobre un equipo que
  sí tiene marca.
- El `Success Criteria` del proposal —*"La pantalla que muestra el modelo de un equipo
  distingue 'cargando' de 'fuera de catálogo'"*— exige que exista una pantalla de display.
  Si ni la ficha ni el listado cambian, ese criterio queda **insatisfacible** y el ciclo no
  puede verificarse.
- Costo: la columna es una celda con `resolverDeCatalogo` (≈15 líneas + test). La ficha
  pediría una sección nueva que ese archivo no tiene. Con el presupuesto de 400 líneas ya
  superado, se paga lo que cierra una regresión, no lo que cierra un hueco viejo.

**Consecuencia escrita, no escondida**: tras este ciclo la ficha de detalle de un equipo
sigue sin decir nada de su marca ni de su modelo, de catálogo o de texto libre. Es el estado
de hoy y queda como **seguimiento**, no como deuda de este ciclo.

**Segunda consecuencia, fuera de alcance**: la exportación CSV toma `Marca` del campo crudo
(`exportar-equipos.use-case.ts:77`), así que un equipo con modelo de catálogo exporta la
columna vacía. Resolverlo es trabajo de backend y **rompería la propiedad "solo frontend"**
de este ciclo: se registra como seguimiento con esta evidencia, y no se toca.

### ADR-3: `resolucion-de-catalogo.ts` se importa cruzado; NO se muda a `shared/`

**Choice**: `features/equipos/` importa `resolverDeCatalogo`/`resolverLista` desde
`@/features/insumos/lib/resolucion-de-catalogo` tal como están. Cero archivos movidos.

**Rationale**: el repo ya tiene el precedente exacto y lo resolvió así —
`features/compras/components/item-create-dialog.tsx:26` importa
`@/features/insumos/lib/opciones-insumo` sin haber mudado nada a `shared/`. La mudanza
tocaría el módulo, su test y los 4 consumidores (`nombre-de-catalogo.ts:22`,
`nombre-de-usuario.ts:23`, `insumo-detail-view.tsx:61`, `insumo-form-dialog.tsx:61`) para
producir **cero cambio de comportamiento**, sobre un ciclo que ya está por encima del
presupuesto de revisión. Un refactor de ubicación merece su propio commit y su propio
diff legible, no viajar de polizón.

**Rejected**: mover a `shared/lib/`. Queda anotado como seguimiento para cuando aparezca un
tercer consumidor fuera de `insumos`/`equipos`.

**Dónde se llaman**: `resolverLista` en los dos diálogos de equipo, para decidir si el
`<select>` puede ofrecer opciones (ADR-6). `resolverDeCatalogo` en la celda `Marca` del
listado (ADR-2), con las etiquetas ya exportadas por `nombre-de-catalogo.ts:34,41,49`
(`ETIQUETA_CATALOGO_CARGANDO`, `ETIQUETA_CATALOGO_NO_DISPONIBLE`,
`ETIQUETA_FUERA_DE_CATALOGO`). **No** se reusa `nombreDeCatalogo()`: exige entradas
`{id, nombre}` y `ModeloEquipo` es `{id, marca, modelo}`. Tampoco se extrae un módulo nuevo:
el propio JSDoc de `nombre-de-catalogo.ts:12-15` fija el criterio de extracción en "dos
columnas necesitan la misma regla", y acá hay una sola.

### ADR-4: enclavamiento por `onChange` del `register`, nunca por `useEffect`

**Choice**: el vaciado se dispara en el handler del `<select>`, no en un efecto:

```ts
const modeloDeCatalogo = watch("modeloEquipoId");
const conModeloDeCatalogo = !!modeloDeCatalogo;

<Select
  id="equipo-modelo-equipo"
  disabled={estadoModelos !== "CON_ENTRADAS"}
  {...register("modeloEquipoId", {
    onChange: (e) => {
      if (!e.target.value) return;          // quitarlo NO borra nada
      setValue("marca", "", { shouldValidate: true });
      setValue("modelo", "", { shouldValidate: true });
    },
  })}
>

<Input id="equipo-marca" disabled={conModeloDeCatalogo} {...register("marca")} />
<Input id="equipo-modelo" disabled={conModeloDeCatalogo} {...register("modelo")} />
```

**Deshabilitar NO alcanza, hay que vaciar**: react-hook-form envía desde su store, no desde
el DOM. Un `<input disabled>` no viaja en un submit nativo, pero RHF sí mandaría el valor
que conserva. Por eso la regla del proposal dice **"deshabilitados y vaciados"**: son dos
cosas, y la segunda es la que importa.

**Por qué no un `useEffect` sobre `conModeloDeCatalogo`**: en edición, `reset()` al abrir
(`equipo-edit-dialog.tsx:124`) repuebla el form con el equipo guardado; un efecto se
dispararía ahí y borraría el texto libre **antes de que el usuario toque nada**, en
silencio. El `onChange` solo corre por acción del usuario.

**El caso de EDICIÓN, explícito**: un equipo con `marca`/`modelo` de texto libre guardados al
que el usuario le asigna un modelo de catálogo **pierde ese texto libre**. Es intencional y
es visible: el vaciado ocurre al seleccionar, con el diálogo abierto y antes de "Guardar";
los dos campos quedan vacíos y grises a la vista. No hay borrado silencioso al enviar.
Quitar el modelo rehabilita los campos, pero **no restituye** el texto: quedan vacíos y hay
que retipearlos. Eso también es visible.

**Qué se envía en cada estado**:

| Estado del form | Alta — vacío es AUSENCIA (`equipo-create-dialog.tsx:73-95`) | Edición — vacío es LIMPIAR (`equipo-edit-dialog.tsx:128-147`) |
|---|---|---|
| Sin modelo de catálogo | `marca`/`modelo` con su texto o ausentes; `modeloEquipoId: undefined` | `marca`/`modelo` con su texto o `null`; `modeloEquipoId: null` |
| Con modelo de catálogo | `marca`/`modelo` ausentes; `modeloEquipoId: <uuid>` | `marca: null`, `modelo: null`, `modeloEquipoId: <uuid>` — el PATCH **limpia** lo guardado |

La asimetría `undefined`/`null` no es nueva: es la semántica que los dos diálogos ya aplican
a todos sus campos (vacío en alta = ausencia; vacío en edición = orden de limpiar).

**Rejected**: (a) dejar convivir ambos valores — el proposal lo cierra en su Decisión 5;
(b) resolver la exclusión en el backend — cambio de contrato, saca el ciclo del alcance
frontend; (c) `register("marca", { disabled: true })` — RHF setea el valor a `undefined` en
el store y mezcla dos mecanismos; el atributo DOM más el `setValue("")` explícito es lo que
el repo ya hace con `disabled` (`equipo-create-dialog.tsx:238`).

### ADR-5: la `queryKey` del catálogo va SIN segmento de tenant

**Choice**: `queryKey: ["modelos-equipo"]`, plana, con `staleTime` largo — copia exacta de
`use-unidades-medida.ts:20,24-28`. Las mutaciones invalidan esa misma clave.

**Rationale** (riesgo del proposal confirmado, no supuesto): en este repo el aislamiento por
inquilino de la caché **no vive en la `queryKey`**, vive en dos mecanismos verificados:

1. El `QueryClient` se crea con `useState` por instancia de provider, no como módulo
   top-level (`query-provider.tsx:19-29`), así que no se filtra estado entre requests SSR.
2. Al cambiar de inquilino, `TenantSwitcher` llama `queryClient.invalidateQueries()` **sin
   filtro** (`tenant-switcher.tsx:62`): invalida la caché entera, incluidos todos los
   catálogos.

**La regla que sigue el hook nuevo, escrita para que nadie improvise**: los catálogos de
inquilino usan clave plana (`["modelos-equipo"]`) y confían en la invalidación global del
switcher. Meterle un segmento de tenant a esta clave sola la volvería la única distinta de
sus cinco hermanas sin cerrar ningún agujero — la invalidación global ya las cubre a todas.

### ADR-6: el `<select>` de modelo copia el molde de catálogo de `insumo-form-dialog`

**Choice**: `resolverLista({ entradas: modelosQuery.data, cargando: modelosQuery.isLoading })`
y `modelosListos = estado === "CON_ENTRADAS"` (no `!== "CARGANDO"`), con el
`useEffect` que **reaplica el valor** cuando la lista resuelve y el diálogo está abierto —
`insumo-form-dialog.tsx:98-99,114-115,138-148`, cuyo JSDoc (`:100-113`) documenta el defecto
exacto que evita: un `<select>` nativo no puede mostrar un valor cuya `<option>` todavía no
existe, así que el DOM cae al placeholder mientras RHF conserva el valor guardado — el
usuario ve "Elegí un modelo" y guarda otra cosa, sin error y sin log.

Cuatro estados bajo el campo, con nota propia para `VACIA` ("No hay modelos de equipo
cargados. Creá uno desde Admin > Modelos de equipo.") y `NO_DISPONIBLE` ("No se pudieron
cargar los modelos de equipo."), distintas a propósito: decirle "no hay modelos cargados" a
alguien cuya query se cayó lo manda a cargar un catálogo que ya existe.

**Sin la variante `tipoActualFueraDeCatalogo`** de `componente-edit-dialog.tsx:64-71`, y esta
vez la razón está verificada: `ListarModelosEquipoUseCase` devuelve los modelos del
inquilino **habilitados y deshabilitados** (`listar-modelos-equipo.use-case.ts:13-16`), y no
hay borrado duro. La `<option>` del modelo guardado siempre existe; un modelo dado de baja se
lista con el sufijo `(deshabilitado)`, igual que las familias en
`insumo-form-dialog.tsx:236-238`. `FUERA_DE_CATALOGO` queda como estado alcanzable solo en la
celda del listado (ADR-2), y el helper lo cubre.

---

## Data Flow

```
ABM del catálogo
  ModelosEquipoAdminView (container, SoloAdminCliente)
        └─ ModeloEquipoList ──→ useModelosEquipo()  GET /modelos-equipo   ["modelos-equipo"]
                │                     ▲
                └─ ModeloEquipoFormDialog ──→ POST / PATCH /:id / PATCH /:id/estado
                                              └─ onSuccess: invalidateQueries(["modelos-equipo"])

Alta / edición de un equipo
  Equipo{Create,Edit}Dialog
     ├─ useModelosEquipo() ──→ resolverLista ──→ CARGANDO | NO_DISPONIBLE | VACIA | CON_ENTRADAS
     │                                               └─ habilita <select> + reaplica el valor
     └─ onChange(modeloEquipoId ≠ "") ──→ setValue(marca,""), setValue(modelo,"")
                                          Inputs disabled ──→ submit sin texto libre

Listado de equipos (display)
  EquiposListView
     ├─ useEquipos()        ──→ equipo.modeloEquipoId (id CRUDO — el backend no embebe el par)
     └─ useModelosEquipo()  ──→ resolverDeCatalogo(id, catálogo)
                                 ENCONTRADA        → "HP LaserJet Pro M404"
                                 CARGANDO          → "Cargando…"
                                 NO_DISPONIBLE     → "Sin datos del catálogo"
                                 FUERA_DE_CATALOGO → "Fuera del catálogo"
                                 (sin modeloEquipoId) → equipo.marca ?? "—"   ← camino de hoy
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/features/modelos-equipo/types.ts` | Create | Espejo de `ModeloEquipoResponseDto` + los 3 DTOs de request |
| `frontend/src/features/modelos-equipo/schemas.ts` | Create | Zod: topes 100/150 medidos sobre el valor normalizado + `normalizarMarca`/`normalizarModelo` (ADR-1) |
| `frontend/src/features/modelos-equipo/hooks/use-modelos-equipo.ts` | Create | `GET /modelos-equipo`, `queryKey: ["modelos-equipo"]` (ADR-5) |
| `frontend/src/features/modelos-equipo/hooks/use-modelo-equipo-mutations.ts` | Create | Crear / editar / cambiar estado + invalidación + toasts |
| `frontend/src/features/modelos-equipo/components/modelo-equipo-form-dialog.tsx` | Create | Molde de `unidad-medida-form-dialog.tsx` |
| `frontend/src/features/modelos-equipo/components/modelo-equipo-list.tsx` | Create | `DataTable` + `EstadoActivoAction` tras `ConfirmDialog` |
| `frontend/src/features/modelos-equipo/components/modelos-equipo-admin-view.tsx` | Create | Container: `AdminNav` + `SoloAdminCliente` + `PageHeader` + lista |
| `frontend/src/app/(dashboard)/admin/modelos-equipo/page.tsx` | Create | Server Component fino (molde de `admin/unidades/page.tsx:9-11`) |
| `frontend/src/components/shell/admin-nav.tsx` | Modify | Un ítem en `ADMIN_NAV_ITEMS` (`:38-53`), mismo gate `esAdminCliente` |
| `frontend/src/features/equipos/types.ts` | Modify | `modeloEquipoId` entra a `Equipo`, `CreateEquipoDto` y `EditarEquipoDto` |
| `frontend/src/features/equipos/schemas.ts` | Modify | `modeloEquipoId: z.string().uuid().optional().or(z.literal(""))` — molde de `equipoId` (`:267`) |
| `frontend/src/features/equipos/components/equipo-create-dialog.tsx` | Modify | `<select>` + enclavamiento + `modeloEquipoId` en el payload |
| `frontend/src/features/equipos/components/equipo-edit-dialog.tsx` | Modify | Ídem + `equipoAFormValues` suma `modeloEquipoId` |
| `frontend/src/features/equipos/components/equipos-list-view.tsx` | Modify | Celda `Marca` (`:43`) resuelta contra el catálogo (ADR-2) |
| `frontend/src/features/equipos/components/equipo-detail-view.tsx` | **Sin cambios** | ADR-2 |
| Backend, incluida la exportación CSV | **Sin cambios** | ADR-2, consecuencia registrada |
| Tests co-localizados | Create/Modify | MSW + `renderWithProviders`, ver Testing Strategy |
| `backend/ayuda/*.md` | **Sin cambios** | Pausa vigente desde 2026-09-07. La deuda se anota en el commit y en el PR |

---

## Interfaces / Contracts

```ts
// features/modelos-equipo/types.ts — espejo de ModeloEquipoResponseDto
export interface ModeloEquipo {
  id: string;
  marca: string;   // normalizada a MAYÚSCULA por el backend
  modelo: string;  // solo trim: se muestra como la escribe el fabricante
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModeloEquipoDto { marca: string; modelo: string }
export interface EditModeloEquipoDto { marca?: string; modelo?: string }  // PATCH parcial
export interface CambiarEstadoActivoModeloEquipoDto { activo: boolean }
```

```ts
// features/equipos/types.ts — el espejo RECORTADO suma un campo en los tres shapes
interface Equipo          { /* … */ modeloEquipoId: string | null }
interface CreateEquipoDto { /* … */ modeloEquipoId?: string | null }
interface EditarEquipoDto { /* … */ modeloEquipoId?: string | null }
```

---

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (schema) | `marca` 100 / `modelo` 150 medidos sobre el valor NORMALIZADO; un valor que crece al pasar a mayúscula se rechaza en el form, no en el 400 remoto | `modelos-equipo/schemas.test.ts`, molde del caso `ubicacion` de equipos |
| Componente (ABM) | Alta, edición, activar/desactivar; el 422 de par duplicado llega como toast de error; `reset` al reabrir muestra el dato vigente | `modelo-equipo-list.test.tsx`, `modelo-equipo-form-dialog.test.tsx` con MSW |
| Componente (gate) | Sin `esAdminCliente` la vista muestra el `ErrorState`, no el ABM | `modelos-equipo-admin-view.test.tsx` |
| Componente (enclavamiento) | **El par de aserciones gemelas**: elegir modelo ⇒ `marca`/`modelo` deshabilitados Y vacíos, y el payload enviado NO los trae; quitarlo ⇒ habilitados y el payload trae lo tipeado | `equipo-create-dialog.test.tsx` |
| Componente (edición) | Equipo con texto libre guardado + elegir modelo ⇒ los campos se vacían **a la vista, antes de Guardar**, y el PATCH manda `marca: null, modelo: null, modeloEquipoId: <uuid>` | `equipo-edit-dialog.test.tsx` — es el escenario que ADR-4 declara intencional |
| Componente (select) | Catálogo que resuelve DESPUÉS de abrir el diálogo ⇒ el valor guardado se reaplica y el `<select>` no cae al placeholder; `VACIA` y `NO_DISPONIBLE` muestran notas distintas | Mismo archivo, molde de los tests de `insumo-form-dialog` |
| Componente (display) | Los cuatro desenlaces de la celda `Marca`, y que un equipo SIN `modeloEquipoId` sigue mostrando su `marca` de texto libre | `equipos-list-view.test.tsx` |

Sin tests nuevos de backend: no cambia una línea. Sin e2e nuevo — ningún catálogo hermano lo
tiene.

---

## Threat Matrix

N/A — no hay routing de servidor, shell, subprocesos, automatización de VCS/PR, clasificación
de archivos ejecutables ni integración de procesos. El cambio es UI de cliente contra
endpoints ya existentes y ya guardados.

---

## Migration / Rollout

Sin migración, sin backfill, sin feature flag: ninguna columna se agrega y ninguna fila cambia
de forma. `modelos_equipo` y `equipos_informaticos.modelo_equipo_id` ya existen
(`schema.prisma:575,623-624`).

**Rollback**: `git revert`. Los `ModeloEquipo` creados quedan persistidos y los endpoints los
siguen sirviendo; solo desaparece la pantalla. Los equipos que quedaron con `modeloEquipoId`
lo conservan en la base, pero el listado vuelve a mostrar `marca` cruda —vacía por el
enclavamiento— así que esos equipos aparecen con "—" en la columna. Es el precio ya asumido
por el enclavamiento (ADR-4) y se revierte del todo reeditando el equipo.

Si se revierte **solo el selector** conservando el ABM, el catálogo queda administrable y sin
consumidor: el estado previo al ciclo, más las pantallas.

---

## Work Units y presupuesto de revisión

El presupuesto de 400 líneas queda superado (~700-750 estimadas). Corte natural en dos
unidades entregables, cada una con sus tests adentro y revertible sola:

| # | Unidad | Alcance |
|---|---|---|
| 1 | ABM del catálogo | `features/modelos-equipo/**`, la página, el ítem del nav y sus tests. Entrega valor sola: un administrador ya puede cargar modelos |
| 2 | Selector, enclavamiento y display | `features/equipos/**` (types, schemas, los dos diálogos, la celda `Marca`) y sus tests. Depende de la 1 solo para tener catálogo que elegir |

El **Review Workload Forecast formal**, con sus tres líneas de guarda y la decisión de
encadenamiento bajo `delivery_strategy: ask-on-risk`, es trabajo de `sdd-tasks`. Este diseño
no lo decide; deja el corte propuesto.

---

## Open Questions

Ninguna. La caja abierta del proposal —si `equipo-detail-view.tsx` entra al alcance— queda
cerrada en ADR-2, con su justificación, su alternativa elegida y sus dos consecuencias
registradas como seguimiento (ficha sin marca/modelo; columna `Marca` del CSV vacía para
equipos con modelo de catálogo).
