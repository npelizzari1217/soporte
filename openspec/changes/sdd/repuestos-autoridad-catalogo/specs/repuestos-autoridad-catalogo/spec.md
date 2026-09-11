# Repuestos Autoridad Catálogo Specification

## Purpose

Definir la autoridad del tipo de un componente vinculado a un repuesto
(`insumoId != null`) y cómo se muestra cuando su familia solo existe en el
catálogo del tenant, no en MASTER.

## Requirements

### Requirement: La familia del tenant es la autoridad del tipo en el alta vinculada

El sistema DEBE derivar `tipoComponenteCodigo` de `familia.codigo` en el alta
vinculada y NO DEBE exigir que ese código exista ni esté activo en MASTER. El
`tipoComponenteCodigo` del request DEBE descartarse, igual que hoy. Reemplaza
el límite fijado en `agregar-componente.use-case.spec.ts` y en
`equipos-instalar-desde-deposito.e2e.spec.ts`.

#### Scenario: Familia propia del inquilino se vincula sin fila en MASTER

- GIVEN una familia `TORNILLO`, `esRepuesto: true`, `activo: true`, sin código
  homónimo en `master.tipos_componente`
- WHEN se agrega un componente con `insumoId` de un insumo activo de esa
  familia
- THEN el componente se guarda con `tipoComponenteCodigo: 'TORNILLO'` y
  `estaActivo` de MASTER no es invocado

### Requirement: Los guards de insumo y familia siguen vigentes en el alta vinculada

El sistema DEBE seguir rechazando el alta vinculada, cada uno con su error de
dominio existente, cuando: el insumo no existe, no está `activo`, o está
soft-deleted; o la familia no existe, está soft-deleted, no es `esRepuesto`,
o no está `activo`.

#### Scenario: Cada guard sigue rechazando con su error propio

- GIVEN por separado: un insumo inexistente, inactivo o soft-deleted; y un
  insumo válido con familia inexistente, soft-deleted, no-repuesto o inactiva
- WHEN se agrega un componente vinculado en cada caso
- THEN el sistema rechaza con el error de dominio correspondiente y no
  persiste el componente

### Requirement: El display vinculado resuelve por el catálogo del tenant

El sistema DEBE resolver `tipoNombre`/`tipoActivo` de un componente vinculado
desde la familia del tenant vía `insumoId`, sin consultar MASTER.
`tipoActivo` DEBE ser `familia.activo && familia.deletedAt === null`.

#### Scenario: Componente vinculado a familia solo-tenant se muestra activo

- GIVEN un componente vinculado a un insumo de familia `TORNILLO`,
  `activo: true`, sin fila en MASTER
- WHEN se consulta el detalle del equipo
- THEN se muestra `tipoNombre: 'TORNILLO'`, `tipoActivo: true`, y NO como
  "Dado de baja"

### Requirement: El display de texto libre sigue resolviendo por MASTER

El sistema DEBE seguir resolviendo `tipoNombre`/`tipoActivo` de un componente
de texto libre (`insumoId === null`) contra
`tipoComponenteMasterChecker.resolver()`, sin cambios.

#### Scenario: Componente de texto libre se resuelve igual que hoy

- GIVEN un componente de texto libre con código activo en MASTER
- WHEN se consulta el detalle del equipo
- THEN `tipoNombre`/`tipoActivo` provienen de `resolver()` sobre MASTER

### Requirement: Sin fallback cruzado bajo colisión de código

Ante un `codigo` con distinto significado en tenant y MASTER, el sistema NO
DEBE consultar la base contraria a la del camino del componente: un
vinculado nunca resuelve desde MASTER, uno de texto libre nunca desde el
tenant.

#### Scenario: Colisión de código no cruza de fuente

- GIVEN una familia de tenant y una fila de MASTER con el mismo `codigo: 'X'`
- WHEN se consulta un componente vinculado a la familia del tenant
- THEN `tipoNombre` proviene de la familia del tenant, nunca de MASTER

### Requirement: La baja global en MASTER no bloquea el alta vinculada de un tenant con la familia

Cuando ROOT desactiva un tipo en MASTER, el sistema DEBE seguir permitiendo
el alta vinculada a una familia `activa` del tenant con ese código. Es
comportamiento aceptado: ROOT pierde la baja global sobre tenants que ya
tienen la familia.

#### Scenario: Tipo desactivado en MASTER no impide un nuevo vínculo

- GIVEN una familia de tenant `activa` cuyo código fue desactivado en MASTER
- WHEN se agrega un componente vinculado a un insumo de esa familia
- THEN el alta se acepta igual que si el tipo nunca hubiera existido en
  MASTER

### Requirement: El texto libre sigue exigiendo un código activo en MASTER

El sistema DEBE seguir rechazando el alta de texto libre cuyo
`tipoComponenteCodigo` no exista o no esté activo en MASTER, con
`TipoComponenteInactivoError`.

#### Scenario: Código ausente o inactivo rechaza el alta de texto libre

- GIVEN un `tipoComponenteCodigo` ausente o inactivo en MASTER
- WHEN se agrega un componente de texto libre con ese código
- THEN el sistema rechaza con `TipoComponenteInactivoError`

### Requirement: RepuestoSinTipoEnCatalogoError deja de existir

El sistema NO DEBE emitir `RepuestoSinTipoEnCatalogoError` ni el HTTP 422
`REPUESTO_SIN_TIPO_EN_CATALOGO`: la clase, su rama en el controller y el
centinela que la contaba se eliminan. El catálogo de errores pasa de 17 a 16
clases.

#### Scenario: El catálogo de errores ya no incluye REPUESTO_SIN_TIPO_EN_CATALOGO

- GIVEN el mapeo de errores de dominio a HTTP del módulo de equipos
- WHEN se enumeran sus clases
- THEN `RepuestoSinTipoEnCatalogoError` no aparece y el total es 16
