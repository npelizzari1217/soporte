# Design: Autoridad del catálogo de tipos de componente (camino vinculado)

## Technical Approach

El cambio es de **autoridad**, no de forma de datos: ninguna columna, DTO ni contrato de puerto
existente cambia de shape. Dos movimientos, backend puro:

1. **Alta**: en la rama `dto.insumoId != null` de `AgregarComponenteUseCase` se retira la
   consulta a MASTER sobre el código derivado. La familia del inquilino pasa a ser la única
   autoridad de "qué tipo es este componente".
2. **Display**: `ObtenerEquipoUseCase` deja de resolver los componentes vinculados contra MASTER
   y los resuelve contra el catálogo del inquilino, por el `insumoId` que el componente ya trae,
   en UNA lectura por lote.

El camino de texto libre queda intacto en los dos puntos: sigue validando con `estaActivo` y
sigue mostrándose con `resolver()`. `ITipoComponenteMasterChecker` no cambia de contrato.

---

## Architecture Decisions

### ADR-1: El gate de MASTER no se reemplaza por otro gate — se retira, y lo que queda ya alcanza

**Choice**: la llamada a `tipoComponenteMasterChecker.estaActivo(tipoComponenteCodigo)` pasa a
ejecutarse **solo en la rama de texto libre**. En la rama vinculada no hay chequeo sustituto.

No hace falta inventar uno porque los guards que YA corren en esa rama cubren exactamente lo
mismo, del lado correcto de la base:

| Qué se verifica | Dónde vive | Estado |
|---|---|---|
| El insumo existe, `activo`, no soft-deleted | `agregar-componente.use-case.ts:134` | **queda** |
| La familia existe y no está soft-deleted | ídem `:145` | **queda** |
| `familia.esRepuesto === true` | ídem `:148` | **queda** |
| `familia.activo === true` | ídem `:151` | **queda** |
| El código derivado existe y está `activo` en MASTER | ídem `:172` | **se retira en la rama vinculada** |

El código sigue derivándose de `familia.codigo` y el `tipoComponenteCodigo` del DTO sigue
descartándose: la invariante "un componente no puede decir MOUSE y apuntar a un repuesto
TECLADO" se sostiene igual, y `EditarComponenteUseCase` sigue cerrando la puerta del PATCH
(`ComponenteVinculadoTipoInmutableError`). Este cambio no la toca.

**Alternatives considered**: (a) sustituir por un chequeo "existe en MASTER **o** en el tenant" —
rechazada: es el mismo acoplamiento cross-DB con una `OR`, y no cambia quién manda; (b) sembrar
en MASTER la familia nueva del inquilino al crearla — rechazada: es propagación tenant → ROOT,
fuera de alcance y contraria a la opción C.

**Consecuencia escrita como comportamiento, no como defecto**: ROOT deja de poder retirar
globalmente un tipo para los inquilinos que ya tienen esa familia. Es la decisión del dueño. La
baja en MASTER sigue teniendo efecto completo sobre el camino de texto libre.

### ADR-2: El display se decide por el CAMINO del componente, no por el resultado de MASTER

**Choice**: regla única, sin fallback cruzado — `componente.insumoId != null` ⇒ nombre y estado
salen del catálogo del inquilino; `insumoId === null` ⇒ salen de MASTER, como hoy.

```
tipoActivo = familia.activo && familia.deletedAt === null
tipoNombre = familia.nombre
```

**Rationale**: un fallback "si el tenant no lo tiene, probá MASTER" reintroduciría por la puerta
de atrás la autoridad que ADR-1 retira, y haría que dos filas con el mismo código muestren
etiquetas distintas según de qué base se leyó primero. Bajo la colisión de `codigo` aceptada en
el proposal, **gana siempre lo local** (decisión cerrada), y esta regla es la que lo materializa.

Si el `insumoId` no aparece en el mapa —fila inexistente, que la FK hace improbable— se degrada
a `tipoNombre: null, tipoActivo: false`, el mismo best-effort que ya rige para un código sin
match en MASTER. No se lanza.

`ComponenteEquipoConTipo`, `ComponenteConTipoResponseDto` y `tipoNombre`/`tipoActivo` conservan
su forma exacta: el frontend no cambia ni un archivo.

### ADR-3: La lectura por lote es un método nuevo del puerto de insumos, no un caso de uso ni un puerto nuevo

**Choice**: `IInsumoRepository` suma `findFamiliasDeInsumos(insumoIds)`, con su implementación en
`PrismaInsumoRepository`. `ObtenerEquipoUseCase` lo recibe como cuarto parámetro con el idiom del
repo, `Pick<IInsumoRepository, 'findFamiliasDeInsumos'>`, inyectado desde `INSUMO_REPOSITORY`,
que `InsumosModule` **ya exporta** y que `EquiposModule` **ya importa** desde WU-3.

**Dirección de la dependencia**: `equipos → insumos`, la misma que ya existe por
`MODELO_EQUIPO_REPOSITORY`, `INSUMO_REPOSITORY` y `FAMILIA_INSUMO_REPOSITORY`. No hay arista
nueva y no hay ciclo: `insumos` no importa nada de `equipos` — esa arista cerraría un ciclo.

**Por qué puerto y no caso de uso exportado**: la regla del repo no es "todo cruce va por un caso
de uso", es "**un puerto que protege una invariante no se exporta**". Por eso
`MOVIMIENTO_INSUMO_REPOSITORY` no se exporta y `RegistrarSalida/EntradaInsumoUseCase` sí: el
advisory lock del stock es una guarda que exportar el puerto permitiría saltear. Esta lectura no
guarda nada —es una proyección de solo lectura del catálogo—, así que envolverla en un caso de
uso agregaría una capa sin invariante que proteger. El precedente exacto es WU-3, que inyecta los
dos puertos del catálogo directo en `AgregarComponenteUseCase`.

**Por qué por lote y no `findById` por componente**: el detalle de un equipo trae TODOS sus
componentes (activos y dados de baja). Una resolución por componente sería N+1 sobre una pantalla
que hoy hace exactamente 2 consultas, y además `IInsumoRepository.findById` trae el **agregado
completo** —códigos alternativos y compatibilidad— para usar dos strings. La proyección liviana
evita las dos cosas: el peor caso queda en **2 lecturas fijas** (MASTER + tenant), cada una
salteada si su lista de entrada está vacía.

**Excepción al JSDoc del puerto, explícita**: `IInsumoRepository` declara hoy que todos sus
métodos devuelven el agregado COMPLETO, para que una lectura parcial seguida de `save()` no borre
listas en silencio. El método nuevo devuelve una **proyección que no es `InsumoEntity`** y por lo
tanto no es pasable a `save()`: el peligro que esa regla previene no existe acá. El JSDoc del
puerto se actualiza para decirlo — no se deja una regla que el archivo ya no cumple.

### ADR-4: Los comentarios y `RepuestoSinTipoEnCatalogoError` caen dentro del work unit

**Choice**: la clase de error, su import y su rama en `toHttpException`
(`equipos.controller.ts:94,138`), su entrada en la `TABLA` del spec (`:697-698`) y el centinela
de 17 clases (`:613`) se eliminan en el MISMO commit que retira el gate. El bloque "LIMITACIÓN
DELIBERADA" de `AgregarComponenteUseCase` (`:68-79`), el paso 3 de su "Flujo" (`:88-93`), el
JSDoc del test fijado (`:441-450`) y el del helper del e2e (`:247-253`) se reescriben ahí mismo.

**Rationale**: sin el gate no queda ningún camino que emita ese error, y un comentario que afirma
una restricción inexistente es un hallazgo, no deuda menor. Dejarlo para "después" produce
exactamente el estado que este repo no tolera: código que documenta una conducta que ya no tiene.
El centinela baja a **16**, y su título deja de nombrar 5 errores de WU-3 para nombrar 4.

**Riesgo aceptado**: es un cambio visible de contrato (un 422 menos). Verificado en el proposal:
ningún consumidor de `frontend/` discrimina `REPUESTO_SIN_TIPO_EN_CATALOGO`.

---

## Data Flow

```
ALTA vinculada (POST /equipos/:id/componentes, insumoId ≠ null)
  insumoRepo.findById ─→ activo? no soft-deleted?
  familiaRepo.findById ─→ existe? esRepuesto? activa?
        ↓  tipoComponenteCodigo = familia.codigo
  ComponenteEquipoEntity.create ─→ componenteRepo.save
        (MASTER ya no participa de esta rama)

ALTA texto libre (insumoId = null)          ─ SIN CAMBIOS ─
  dto.tipoComponenteCodigo ─→ masterChecker.estaActivo ─→ TipoComponenteInactivoError

DETALLE (GET /equipos/:id)
  componenteRepo.findAllByEquipoId
        ├─ vinculados   → insumoRepo.findFamiliasDeInsumos([insumoId…])  1 consulta TENANT
        └─ texto libre  → masterChecker.resolver([codigo…])              1 consulta MASTER
        ↓
  ComponenteEquipoConTipo { tipoNombre, tipoActivo }   (forma idéntica)
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/insumos/domain/ports/i-insumo.repository.ts` | Modify | `FamiliaDeInsumo` + `findFamiliasDeInsumos`; nota de la excepción al agregado completo (ADR-3) |
| `backend/src/insumos/infrastructure/persistence/prisma/prisma-insumo.repository.ts` | Modify | Implementación: un `findMany` con `select` de la relación `familia` |
| `backend/src/insumos/infrastructure/persistence/prisma/prisma-insumo.repository.integration.spec.ts` | Modify | Cobertura del método nuevo contra la base real |
| `backend/src/equipos/application/use-cases/obtener-equipo.use-case.ts` | Modify | Cuarto parámetro `Pick<>`; partición vinculados/texto libre; JSDoc (ADR-2) |
| `backend/src/equipos/application/use-cases/obtener-equipo.use-case.spec.ts` | Modify | Nuevo ctor + los casos de ADR-2 |
| `backend/src/equipos/equipos.module.ts` | Modify | `INSUMO_REPOSITORY` al `inject` de `ObtenerEquipoUseCase` + comentario del wiring |
| `backend/src/equipos/application/use-cases/agregar-componente.use-case.ts` | Modify | Gate solo en texto libre; se van el import y la rama del error; JSDoc reescrito (ADR-1, ADR-4) |
| `backend/src/equipos/application/use-cases/agregar-componente.use-case.spec.ts` | Modify | Test fijado INVERTIDO + gemelos de los guards que siguen rechazando |
| `backend/src/equipos/domain/errors/equipos.errors.ts` | Modify | Se elimina `RepuestoSinTipoEnCatalogoError` (`:236-263`) |
| `backend/src/equipos/interface/controllers/equipos.controller.ts` | Modify | Se van el import (`:94`) y la rama 422 (`:138`) |
| `backend/src/equipos/interface/controllers/equipos.controller.spec.ts` | Modify | Centinela 17 → 16 y su título; se va la fila de la `TABLA` |
| `backend/src/equipos/interface/controllers/equipos-instalar-desde-deposito.e2e.spec.ts` | Modify | `crearFamiliaRepuesto` deja de sembrar la fila gemela en MASTER; JSDoc reescrito |

Frontend: **cero archivos**. Migraciones: **ninguna**. `backend/ayuda/`: ningún artículo queda
falso (verificado en el proposal); la deuda se anota en el commit y en el PR, con la pausa vigente.

---

## Interfaces / Contracts

```ts
// insumos/domain/ports/i-insumo.repository.ts

/**
 * Proyección de solo lectura: la familia de un insumo, sin el agregado.
 * NO es `InsumoEntity` ni `FamiliaInsumoEntity` a propósito — no se puede
 * pasar a ningún `save()`, así que no puede borrar listas en silencio.
 * `activo` y `deletedAt` viajan CRUDOS: colapsarlos acá metería una regla de
 * presentación en el repositorio; quien decide es el caso de uso.
 */
export interface FamiliaDeInsumo {
  insumoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  deletedAt: Date | null;
}

/**
 * Resuelve, en UNA consulta, la familia de cada insumo pedido.
 * Lista vacía ⇒ mapa vacío, sin ir a la base. Un id inexistente simplemente
 * no aparece en el mapa: la ausencia no es un error.
 */
findFamiliasDeInsumos(insumoIds: readonly string[]): Promise<Map<string, FamiliaDeInsumo>>;
```

```ts
// equipos/application/use-cases/obtener-equipo.use-case.ts
constructor(
  equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
  componenteRepo: Pick<IComponenteEquipoRepository, 'findAllByEquipoId'>,
  tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'resolver'>,
  insumoRepo: Pick<IInsumoRepository, 'findFamiliasDeInsumos'>,   // ← nuevo
)
```

---

## Testing Strategy

Aserciones **gemelas invertidas**: cada permiso nuevo viaja con el rechazo que sigue vigente, para
que el commit no pueda leerse como "se aflojó todo".

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (alta) | **El test fijado, invertido**: familia propia del inquilino (`TORNILLO`, sin fila en MASTER) ⇒ `isOk()`, `save` llamado con `tipoComponenteCodigo: 'TORNILLO'` | Mismo escenario del `:451` actual con `estaActivo` mockeado en `false`; ahora además se afirma `expect(estaActivo).not.toHaveBeenCalled()` — que MASTER ni se consulte es la prueba de la autoridad, no solo que no rechace |
| Unit (alta) | Gemelos que SIGUEN rechazando: insumo inexistente/deshabilitado/soft-deleted, familia soft-deleted, `esRepuesto: false`, `familia.activo: false` | Los casos ya existentes, sin tocar: prueban que se retiró UN guard, no cuatro |
| Unit (alta) | Texto libre con código inactivo o ausente ⇒ `TipoComponenteInactivoError` y `estaActivo` SÍ llamado | Caso existente + aserción de llamada, espejo del de arriba |
| Unit (display) | Componente vinculado a familia solo-tenant ⇒ `tipoNombre` = nombre de la familia y `tipoActivo: true`; **no** se renderiza como dado de baja | Doble de `findFamiliasDeInsumos` con el mapa poblado; se afirma que `resolver` NO recibió su código |
| Unit (display) | Los dos caminos en la MISMA lista: un vinculado y uno de texto libre ⇒ cada uno de su fuente, una sola llamada a cada lectura | Afirmar los argumentos exactos de las dos llamadas (`[insumoId]` / `[codigo]`) — es el test anti-N+1 |
| Unit (display) | Familia deshabilitada o soft-deleted ⇒ `tipoNombre` presente, `tipoActivo: false`; `insumoId` ausente del mapa ⇒ `null`/`false` | Tres casos sobre el mismo doble |
| Unit (display) | Sin componentes vinculados no se consulta el tenant; sin componentes de texto libre no se consulta MASTER | `expect(fn).not.toHaveBeenCalled()` en cada rama |
| Integración | `findFamiliasDeInsumos` contra la base real: varios ids en una llamada, id inexistente omitido, familia deshabilitada y soft-deleted con sus flags crudos | `prisma-insumo.repository.integration.spec.ts`, patrón del archivo; tenant efímero con el orden limpiar → `app.close()` → `dropDatabase` |
| Controller | El catálogo tiene EXACTAMENTE **16** clases de error | Centinela existente, número bajado |
| E2E | Instalar desde depósito un repuesto de familia SIN fila gemela en MASTER ⇒ 201, y el `GET /equipos/:id` posterior lo muestra con su nombre y `tipoActivo: true` | `equipos-instalar-desde-deposito.e2e.spec.ts` con `crearFamiliaRepuesto` ya sin la fila de MASTER: el helper deja de mentir y el e2e pasa a probar justo lo que antes evitaba |

---

## Threat Matrix

N/A — no hay routing, shell, subprocesos, automatización de VCS/PR, clasificación de archivos
ejecutables ni integración de procesos. Ninguna migración y ninguna escritura nueva: el método
que se agrega es de solo lectura.

---

## Work Units y presupuesto de revisión

Dos commits, **un solo PR**, en este orden — importa:

| # | Commit (Conventional) | Alcance | Por qué va en este orden |
|---|---|---|---|
| 1 | `fix(equipos): el detalle resuelve el tipo de un componente vinculado por su repuesto` | Puerto + Prisma + su integración, `ObtenerEquipoUseCase` + spec, `equipos.module.ts` | Deja la pantalla lista ANTES de que se puedan crear los componentes que la necesitan. Al revés, entre commit y commit existiría un estado donde un vínculo válido se muestra "Dado de baja" |
| 2 | `feat(equipos): la familia del inquilino es la autoridad del tipo de un componente vinculado` | Gate, borrado del error, controller, JSDoc, los tres specs fijados y el e2e | Es el cambio de conducta; llega con el display ya correcto |

Cada commit lleva sus tests y revierte solo (commit 1 aislado es una refactorización del display
sin cambio de conducta observable para los datos de hoy). Estimación combinada
**~250–350 líneas** (adiciones + borrados, con el borrado del error y sus cuatro referencias
descontando): dentro del presupuesto de 400, sin necesidad de PR encadenado. El forecast formal
con las líneas de guarda es trabajo de `sdd-tasks`.

---

## Migration / Rollout

Sin migración, sin feature flag, sin backfill: ninguna fila cambia de forma y ninguna columna se
agrega. El despliegue es el normal.

**Rollback** — `git revert` del PR (o del commit 2 solo, si alcanza con cerrar el alta). Los
componentes vinculados a familias solo-tenant creados mientras tanto **quedan persistidos y
siguen listándose**: nada se pierde. Pero:

- si se revierten los DOS commits, vuelven a mostrarse con `tipoNombre: null` y "Dado de baja",
  porque su código no está en MASTER;
- si se revierte **solo el commit 2**, siguen mostrándose bien —el display revertido no es— y lo
  único que se cierra es la creación de nuevos. **Ese es el rollback recomendado**;
- en los dos casos, el 422 `REPUESTO_SIN_TIPO_EN_CATALOGO` vuelve a existir para quien hubiera
  empezado a depender de su ausencia.

---

## Open Questions

Ninguna. Las cinco decisiones abiertas del proposal (autoridad, alcance, colisión de código,
display sin tocar el checker, destino del error) llegaron cerradas por el dueño y están
implementadas tal cual en ADR-1 a ADR-4.
