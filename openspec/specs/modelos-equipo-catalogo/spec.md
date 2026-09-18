# Modelos Equipo Catálogo Specification

## Purpose

Definir quién administra el catálogo `ModeloEquipo` desde el frontend, cómo
se elige un modelo de catálogo al dar de alta o editar un equipo, y qué pasa
con `marca`/`modelo` de texto libre del equipo cuando hay un modelo elegido.
El backend ya existe y no cambia en este ciclo.

## Requirements

### Requirement: El ABM del catálogo se gatea por rol, no por permiso de módulo

El sistema DEBE mostrar `Admin > Modelos de equipo` solo a un usuario con
`esAdminCliente`, y DEBE ocultarlo a cualquier otro. El sistema NO DEBE
exigir un permiso de `MODULO:ACCION`: el backend gatea `crear`, `editar` y
`cambiarEstadoActivo` solo con `AdminClienteGuard`.

#### Scenario: Un ADMINISTRADOR ve la sección del catálogo

- GIVEN un usuario con `esAdminCliente: true`
- WHEN abre la navegación de administración
- THEN ve el ítem `Admin > Modelos de equipo`

#### Scenario: Un usuario sin el rol no ve la sección

- GIVEN un usuario con `esAdminCliente: false`
- WHEN abre la navegación de administración
- THEN no ve el ítem `Admin > Modelos de equipo`

### Requirement: El catálogo permite listar, crear, editar y activar/desactivar un modelo

El sistema DEBE permitir listar, crear (`marca`, `modelo`), editar
parcialmente y activar/desactivar un modelo del catálogo. DEBE normalizar
`marca` con `trim()` y mayúsculas, y `modelo` solo con `trim()`,
preservando su capitalización.

#### Scenario: Alta normaliza marca y preserva la capitalización de modelo

- GIVEN el formulario de alta del catálogo
- WHEN se envía `marca: "  hp  "` y `modelo: "LaserJet Pro M404"`
- THEN el modelo queda con `marca: "HP"` y `modelo: "LaserJet Pro M404"`

#### Scenario: Activar y desactivar un modelo desde la lista

- GIVEN un modelo de catálogo activo
- WHEN el administrador lo desactiva desde la lista
- THEN el modelo se muestra inactivo y puede reactivarse

### Requirement: El par marca/modelo duplicado se rechaza sin importar el estado del modelo existente

El sistema DEBE rechazar el alta o edición de un modelo cuyo par `(marca,
modelo)` normalizado coincida con uno ya existente, activo o inactivo, y
DEBE mostrar el error 422 del backend en el formulario, sin cerrarlo.

#### Scenario: Alta duplicada contra un modelo inactivo se rechaza igual que contra uno activo

- GIVEN un modelo de catálogo inactivo con `marca: "HP"`, `modelo: "LaserJet Pro M404"`
- WHEN un administrador intenta crear el mismo par
- THEN el sistema rechaza el alta con el error 422 y el formulario muestra el mensaje sin cerrarse

### Requirement: El alta y la edición de un equipo permiten elegir un modelo del catálogo

El sistema DEBE ofrecer, en el alta y edición de un equipo, un selector con
los modelos de `ModeloEquipo`, y DEBE persistir la elección en
`modeloEquipoId`. El selector DEBE admitir vacío: un equipo sin modelo
sigue siendo creable solo con texto libre.

#### Scenario: Crear un equipo con modelo de catálogo elegido

- GIVEN el formulario de alta de equipo
- WHEN el usuario elige un modelo de catálogo y guarda
- THEN el equipo se crea con `modeloEquipoId` igual al del modelo elegido

#### Scenario: Un equipo sin modelo se sigue creando con texto libre

- GIVEN el formulario de alta de equipo
- WHEN el usuario completa `marca`/`modelo` de texto libre sin elegir modelo
- THEN el equipo se crea con `modeloEquipoId: null`

### Requirement: Elegir un modelo de catálogo deshabilita y vacía los campos de texto libre del equipo

Al elegir un modelo de catálogo en el alta o edición de un equipo, el
sistema DEBE deshabilitar y vaciar `marca`/`modelo` de texto libre en el
momento de la selección, no en silencio al guardar. Al quitarlo, DEBE
rehabilitar ambos campos.

#### Scenario: Elegir un modelo vacía y deshabilita los campos

- GIVEN el formulario de equipo con `marca: "Genérico"` y `modelo: "Clon"` escritos
- WHEN el usuario elige un modelo del catálogo
- THEN `marca` y `modelo` de texto libre quedan vacíos y deshabilitados

#### Scenario: Quitar el modelo rehabilita los campos

- GIVEN el formulario con un modelo elegido y los campos deshabilitados
- WHEN el usuario quita la elección del modelo de catálogo
- THEN `marca` y `modelo` de texto libre vuelven a ser editables
