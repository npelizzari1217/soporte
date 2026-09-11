# Proposal: Autoridad del catálogo de tipos de componente (camino vinculado)

## Intent

La autoridad sobre "qué tipos de componente existen" está partida entre dos bases sin sincronización: `familias_insumo` (TENANT, la administra el cliente) decide QUÉ repuestos existen, y `master.tipos_componente` (MASTER, ABM solo ROOT, `codigo` inmutable, baja por `activo=false`) decide SI el tipo está permitido. Se unen por igualdad de string en `codigo`; al ser cross-DB no hay FK y todo guard es de aplicación.

Consecuencia verificada en el repo: una familia propia del inquilino —por ejemplo `TORNILLO`— **nunca** se puede vincular (`AgregarComponenteUseCase` la rechaza con `RepuestoSinTipoEnCatalogoError`), y aun vinculada el detalle la mostraría "Dado de baja", porque `resolver()` devuelve ausencia para todo código que no esté en MASTER. El selector ya la ofrece (`findAllActive(esRepuesto, soloVinculables)` no consulta MASTER): la pantalla ofrece lo que el servidor rechaza.

**Decisión del dueño (opción C — plantilla + extensión local)**: MASTER siembra el piso y sigue siendo la referencia compartida, pero el inquilino puede crear sus familias y usarlas. **Consecuencia aceptada a sabiendas**: ROOT pierde la baja global de un tipo para los inquilinos que ya tienen esa familia.

## Scope

### In Scope

- Autoridad del camino VINCULADO = la familia del tenant: `AgregarComponenteUseCase` deja de exigir MASTER sobre el código derivado.
- Corrección del display del camino vinculado: nombre/estado se resuelven por el `insumoId` que el componente ya trae, **sin tocar el contrato de `ITipoComponenteMasterChecker`**.
- Inversión del test fijado en `agregar-componente.use-case.spec.ts` (~L451, "límite documentado, WU-5 lo resuelve"). **Es lo esperado, no una regresión**: su propio autor nombró este ciclo como el que lo levanta. Igual trato para el e2e `equipos-instalar-desde-deposito` y el centinela de 17 clases de error del controller.
- Reescritura de los comentarios que este cambio vuelve FALSOS: el bloque "LIMITACIÓN DELIBERADA" de `AgregarComponenteUseCase` y el JSDoc de `RepuestoSinTipoEnCatalogoError`. Va dentro del work unit, no como limpieza posterior.
- **Destino de `RepuestoSinTipoEnCatalogoError`: se elimina** (clase, rama del controller y centinela). Sin el gate no queda camino que lo emita, y una clase muerta cuyo JSDoc afirma una restricción inexistente es exactamente el hallazgo que este repo no tolera. Es un cambio visible de contrato (un 422 menos), aceptable acá: el código `REPUESTO_SIN_TIPO_EN_CATALOGO` nació en el ciclo anterior y **ningún consumidor del frontend lo discrimina** (verificado por búsqueda en `frontend/`).

### Out of Scope

- **Camino de TEXTO LIBRE**: sigue validando contra MASTER (`estaActivo`) y sigue alimentando su selector con `listarActivos()`. Diferido a un ciclo posterior, explícitamente.
- Chequeo cross-DB de colisión de `codigo` al crear familias (ver Riesgos).
- Propagación en vivo ROOT → inquilinos, y toda alteración del ABM MASTER.
- Migraciones de datos y backfills: ninguna fila cambia de forma.
- Ayuda: ningún artículo de `backend/ayuda/` describe hoy esta restricción, así que nada queda falso. La escritura sigue en pausa; la deuda se anota en el commit y en el PR.

## Capabilities

### New Capabilities

- `repuestos-autoridad-catalogo`: de dónde sale la autoridad del tipo de un componente vinculado a un repuesto, y cómo se muestra un tipo que solo existe en el inquilino.

### Modified Capabilities

- Ninguna. `openspec/specs/` solo tiene las capabilities `preventivo-*`; los ciclos de repuestos anteriores viven en Engram.

## Approach

| Pieza | Enfoque |
|---|---|
| Alta vinculada | En la rama `dto.insumoId != null`, la familia (existente, `esRepuesto`, `activa`) es la única autoridad. Los guards de insumo y familia quedan intactos: lo que se retira es solo `estaActivo` sobre el código derivado. |
| Display | `ObtenerEquipoUseCase` resuelve por lote los componentes con `insumoId` contra el catálogo del inquilino (insumo → familia) y usa MASTER solo para los de texto libre. `tipoNombre`/`tipoActivo` y el DTO embebido conservan su forma; el frontend no cambia. |
| Puerto MASTER | `resolver`, `estaActivo` y `listarActivos` quedan como están: siguen sirviendo al camino de texto libre. |
| Edición | Sin cambios: `EditarComponenteUseCase` ya rechaza cambiar el tipo de un componente vinculado, así que no existe una segunda puerta. |

Un solo work unit entregable; se estima **~150–250 líneas**, dentro del presupuesto de 400 por PR. Su confirmación es trabajo de `sdd-tasks`.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/src/equipos/application/use-cases/agregar-componente.use-case.ts` | Modified | Se retira el gate MASTER del camino vinculado; se reescribe el JSDoc |
| `backend/src/equipos/application/use-cases/obtener-equipo.use-case.ts` | Modified | Resolución por `insumoId` para los vinculados |
| `backend/src/equipos/domain/errors/equipos.errors.ts` | Removed | Se elimina `RepuestoSinTipoEnCatalogoError` |
| `backend/src/equipos/interface/controllers/equipos.controller.ts` | Modified | Se quita la rama 422 del error eliminado |
| `backend/src/insumos/domain/ports/` + su impl Prisma | Modified | Lectura por lote insumo → familia para el display (evitar N+1) |
| `backend/src/equipos/equipos.module.ts` | Modified | Cableado de la nueva dependencia de lectura |
| Specs afectados (unit, integración, e2e, centinela de errores) | Modified | Inversión del límite fijado y cobertura del display |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Colisión de `codigo`: el inquilino crea un código que MASTER usa (hoy o después) con otro significado | Media | **Riesgo aceptado a propósito, sin guard.** No se agrega chequeo cross-DB al crear familias: `CrearFamiliaInsumoUseCase` ya solo exige unicidad local y esto no lo cambia. Bajo la opción C **gana lo local**, porque el inquilino no puede ser rehén de un catálogo que no administra. El daño se acota al display: dos etiquetas para un mismo código en bases distintas, sin mezcla de datos |
| Se lee como regresión la inversión del test fijado | Media | El commit y el PR citan el título del test y este documento |
| ROOT ya no puede retirar globalmente un tipo en uso | Alta (es la consecuencia elegida) | Decisión explícita del dueño; queda escrita en la spec como comportamiento, no como defecto |
| El display cambia de fuente y regresiona el caso de texto libre | Media | El batch de MASTER se conserva para los no vinculados, con test de los dos caminos en la misma lista |

## Rollback Plan

`git revert` del commit del work unit. No hay migración ni cambio de forma de datos, así que revertir no pierde información: los componentes vinculados a familias propias del inquilino creados mientras tanto **quedan persistidos y siguen listándose**, pero vuelven a mostrarse como "Dado de baja" y no se podrán crear otros nuevos hasta reaplicar. Los consumidores que hubieran empezado a depender de la ausencia del 422 `REPUESTO_SIN_TIPO_EN_CATALOGO` vuelven a recibirlo.

## Dependencies

- Ninguna externa. Se apoya en `sdd/repuestos-familias` (WU-1) y `sdd/repuestos-vinculo-componente` (WU-3), ya entregados.

## Success Criteria

- [ ] Un repuesto de una familia propia del inquilino (`TORNILLO`) se vincula a un componente y se guarda.
- [ ] Ese componente se muestra con el nombre de su familia y **sin** el badge "Dado de baja".
- [ ] El camino de texto libre sigue rechazando un código ausente o inactivo en MASTER con `TIPO_COMPONENTE_INACTIVO`.
- [ ] Los guards de insumo y familia (inexistente, no repuesto, familia deshabilitada) siguen rechazando con su error propio.
- [ ] No queda en el repo ningún comentario ni test que afirme la restricción levantada.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde en backend y frontend.
