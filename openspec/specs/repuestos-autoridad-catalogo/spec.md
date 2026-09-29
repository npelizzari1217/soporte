# Repuestos Autoridad Catálogo Specification

## Purpose

Definir la autoridad del tipo de un componente de equipo. Todo componente está
vinculado a un repuesto del catálogo del tenant (`insumoId` obligatorio) y su tipo
lo define la familia de ese repuesto; el catálogo MASTER de tipos de componente no
existe. Contexto de la capacidad: `openspec/specs/componentes-catalogo-unico/spec.md`.

Historial: reescrita por el ciclo `catalogo-unico-componentes`
(`openspec/changes/archive/2026-09-29-catalogo-unico-componentes/`), que retiró el
camino de texto libre y el catálogo MASTER.

## Requirements

### Requirement: La familia del tenant es la autoridad del tipo en el alta

El sistema DEBE derivar el tipo del componente de la familia del insumo del
tenant en todo alta y NO DEBE consultar MASTER. Un tipo enviado en el request NO
DEBE definir el tipo del componente.

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

#### Scenario: Componente de familia solo-tenant se muestra activo

- GIVEN un componente de un insumo de familia `TORNILLO`, `activo: true`, sin
  fila en MASTER
- WHEN se consulta el detalle del equipo
- THEN se muestra `tipoNombre: 'TORNILLO'`, `tipoActivo: true`, y NO como
  "Dado de baja"

### Requirement: Los errores del camino de texto libre no existen

El sistema NO DEBE emitir `RepuestoSinTipoEnCatalogoError`,
`TipoComponenteCodigoRequeridoError`, `TipoComponenteInactivoError` ni
`ComponenteVinculadoTipoInmutableError`: un tipo enviado en la edición se
descarta (no se rechaza). El catálogo de errores del módulo de equipos tiene 13
clases.

#### Scenario: El catálogo de errores ya no incluye los errores retirados

- GIVEN el mapeo de errores de dominio a HTTP del módulo de equipos
- WHEN se enumeran sus clases
- THEN ninguna de las clases retiradas aparece y el total es 13
