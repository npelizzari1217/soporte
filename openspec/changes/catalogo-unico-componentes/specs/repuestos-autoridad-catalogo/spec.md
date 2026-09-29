# Delta for Repuestos Autoridad Catálogo

Un solo camino: todo componente está vinculado a un repuesto (`insumoId`
obligatorio) y su tipo lo define la familia del tenant. Contexto de la capacidad
nueva: `specs/componentes-catalogo-unico/spec.md`.

## MODIFIED Requirements

### Requirement: La familia del tenant es la autoridad del tipo en el alta

El sistema DEBE derivar el tipo del componente de la familia del insumo del
tenant en todo alta y NO DEBE consultar MASTER. Un tipo enviado en el request NO
DEBE definir el tipo del componente. Reemplaza el límite fijado en
`agregar-componente.use-case.spec.ts` y en
`equipos-instalar-desde-deposito.e2e.spec.ts`.
(Previously: aplicaba solo al alta vinculada y derivaba y guardaba
`tipoComponenteCodigo`; el texto libre seguía otro camino.)

#### Scenario: Familia propia del inquilino se vincula sin catálogo global

- GIVEN una familia `TORNILLO`, `esRepuesto: true`, `activo: true`
- WHEN se agrega un componente con `insumoId` de un insumo activo de esa
  familia
- THEN el componente queda vinculado y su tipo es `TORNILLO`, sin consultar
  MASTER

### Requirement: Los guards de insumo y familia rigen todo alta

El sistema DEBE rechazar todo alta, cada uno con su error de dominio existente,
cuando: el insumo no existe, no está `activo`, o está soft-deleted; o la familia
no existe, está soft-deleted, no es `esRepuesto`, o no está `activo`.
(Previously: regían solo en el alta vinculada.)

#### Scenario: Cada guard sigue rechazando con su error propio

- GIVEN por separado: un insumo inexistente, inactivo o soft-deleted; y un
  insumo válido con familia inexistente, soft-deleted, no-repuesto o inactiva
- WHEN se agrega un componente en cada caso
- THEN el sistema rechaza con el error de dominio correspondiente y no
  persiste el componente

### Requirement: El display resuelve por el catálogo del tenant

El sistema DEBE resolver `tipoNombre`/`tipoActivo` de todo componente desde la
familia del tenant vía `insumoId`, sin consultar MASTER. `tipoActivo` DEBE ser
`familia.activo && familia.deletedAt === null`.
(Previously: aplicaba solo a componentes vinculados.)

#### Scenario: Componente de familia solo-tenant se muestra activo

- GIVEN un componente de un insumo de familia `TORNILLO`, `activo: true`, sin
  fila en MASTER
- WHEN se consulta el detalle del equipo
- THEN se muestra `tipoNombre: 'TORNILLO'`, `tipoActivo: true`, y NO como
  "Dado de baja"

### Requirement: RepuestoSinTipoEnCatalogoError y los errores del camino de texto libre dejan de existir

El sistema NO DEBE emitir `RepuestoSinTipoEnCatalogoError` (HTTP 422
`REPUESTO_SIN_TIPO_EN_CATALOGO`), `TipoComponenteCodigoRequeridoError` ni
`TipoComponenteInactivoError`: las clases y sus ramas en el controller se
eliminan. `ComponenteVinculadoTipoInmutableError` se elimina salvo que el diseño
decida rechazar (en lugar de ignorar) un tipo enviado en la edición. El
catálogo de errores del módulo de equipos pasa de 16 clases a 13, o a 14 si se
conserva ese último error.
(Previously: solo desaparecía `RepuestoSinTipoEnCatalogoError`, de 17 a 16.)

#### Scenario: El catálogo de errores ya no incluye los errores retirados

- GIVEN el mapeo de errores de dominio a HTTP del módulo de equipos
- WHEN se enumeran sus clases
- THEN ninguna de las tres clases retiradas aparece y el total es 13 (o 14 si
  se conserva `ComponenteVinculadoTipoInmutableError`)

## REMOVED Requirements

### Requirement: El display de texto libre sigue resolviendo por MASTER

(Reason: no existen componentes de texto libre; `insumoId` es obligatorio.)
(Migration: el display de todo componente sigue el requerimiento "El display
resuelve por el catálogo del tenant".)

### Requirement: Sin fallback cruzado bajo colisión de código

(Reason: sin un segundo camino ni catálogo MASTER no hay colisión posible entre
fuentes; el tipo sale siempre de la familia del tenant.)
(Migration: None.)

### Requirement: La baja global en MASTER no bloquea el alta vinculada de un tenant con la familia

(Reason: el catálogo MASTER se retira; ya no existe una baja global que pueda
bloquear o no un alta.)
(Migration: la desactivación de un tipo se hace en la familia del tenant, cuyo
efecto sobre el display cubre "El display resuelve por el catálogo del
tenant".)

### Requirement: El texto libre sigue exigiendo un código activo en MASTER

(Reason: desaparece el alta en texto libre y el gate MASTER.)
(Migration: el alta exige un insumo repuesto válido, ver
`componentes-catalogo-unico`.)
