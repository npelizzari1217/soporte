# Spec: Design System Delta — Shared Form Infrastructure

> Capability: `frontend-design-system` (delta)
> Delta on: `openspec/specs/frontend-design-system/spec.md`
> Stack: Radix UI (Dialog, AlertDialog), sonner, Tailwind v4, react-hook-form (consumer context)
> Authority: CLAUDE.md §2 (Scope Rule §2: compartido en 2+ features → @/components/ui), §3 (Patrones Premium)
> Change: `tickets-crud` (2026-06-28)

## Context

Este delta añade tres nuevos átomos de infraestructura de formularios/mutaciones a
`frontend-design-system` y el proveedor global de toasts. Son componentes genéricos sin
acoplamiento a la entidad Ticket — su API debe permanecer agnóstica al dominio para que Compras,
Reparaciones y Catálogos los reutilicen sin modificaciones (Scope Rule §2).

`<FormField>` es el átomo wrapper de campo de formulario. `<FormModal>` es el contenedor modal
glassmorphism sobre Radix Dialog para cualquier formulario de creación/edición. `<ConfirmDialog>`
es el contenedor de confirmación destructiva sobre Radix AlertDialog. `<Toaster>` integra sonner
en el root layout.

Todos los radios y tokens de glassmorphism heredan los valores ya establecidos en el spec canónico
de `frontend-design-system` (`rounded-lg` contenedores, `rounded-md` botones, `rounded-xl`
inputs, glassmorphism `border-white/5` oscuro / `border-slate-200/50` claro). Este delta NO
modifica esas reglas — las aplica en los nuevos átomos.

---

## Requirements

### Requirement: <FormField> disponible en @/components/ui con API de campo de formulario

`<FormField>` es el wrapper de campo de formulario premium que combina: `<Label>` uppercase
con tracking, el control hijo (Input, Select, Textarea, etc.), y el mensaje de error accesible.
MUST ser importable desde `@/components/ui/form-field`. MUST ser genérico (no acoplado a
react-hook-form internamente, aunque lo usen sus consumidores).

#### Scenario: <FormField> renderiza Label uppercase + control + sin error

- GIVEN cualquier feature importa `<FormField>` desde `@/components/ui/form-field`
- WHEN se renderiza `<FormField label="Título" htmlFor="titulo"><Input id="titulo" /></FormField>`
- THEN MUST renderizar un `<label>` asociado al input (`htmlFor` correcto)
- AND el label MUST tener estilos `text-xs tracking-wider uppercase` y color atenuado (muted)
- AND el input MUST ser el hijo directo dentro del FormField
- AND MUST NOT renderizar ningún mensaje de error si `error` no fue provisto

#### Scenario: <FormField> con error renderiza mensaje accesible en rojo

- GIVEN `<FormField label="Título" htmlFor="titulo" error="El título es requerido"><Input /></FormField>`
- WHEN renderiza
- THEN MUST aparecer el texto "El título es requerido" debajo del control
- AND el mensaje MUST tener color rojo (text-red-500 en oscuro / text-red-600 en claro)
- AND el mensaje MUST ser accesible: el input MUST tener `aria-describedby` apuntando al elemento de error
- AND el input MUST tener `aria-invalid="true"` cuando hay error

#### Scenario: <FormField> con prop required muestra indicador visual

- GIVEN `<FormField label="Título" htmlFor="titulo" required={true}>`
- WHEN renderiza
- THEN el label MUST incluir un indicador visual de requerido (ej. asterisco `*`)
- AND el label MUST tener `aria-required` o el campo hijo MUST tener `required` propagado

#### Scenario: <FormField> acepta cualquier control hijo (Input, Select, Textarea)

- GIVEN `<FormField label="Descripción" htmlFor="desc"><Textarea id="desc" /></FormField>`
- WHEN renderiza
- THEN MUST renderizar el Textarea como control sin errores de React
- AND el Label MUST seguir asociado correctamente vía htmlFor

#### Scenario: <FormField> exportable desde @/components/ui/form-field

- GIVEN la implementación está completa
- WHEN se ejecuta `import { FormField } from '@/components/ui/form-field'`
- THEN MUST resolverse sin error (el módulo existe en ese path)
- AND MUST exportar al menos el componente `FormField` como named export

---

### Requirement: <FormModal> disponible en @/components/ui — modal glassmorphism con Radix Dialog

`<FormModal>` encapsula Radix Dialog con la estética glassmorphism del design system (heredada
del spec canónico). MUST manejar apertura/cierre de forma controlada (open/onOpenChange). MUST
preservar focus trap y ESC por defecto (comportamiento nativo de Radix Dialog). MUST ser
agnóstico al formulario que contiene.

#### Scenario: <FormModal> exportable desde @/components/ui/form-modal

- GIVEN la implementación está completa
- WHEN se ejecuta `import { FormModal } from '@/components/ui/form-modal'`
- THEN MUST resolverse sin error

#### Scenario: <FormModal> renderiza portal fuera del árbol DOM principal cuando open=true

- GIVEN `<FormModal open={true} onOpenChange={fn} title="Crear ticket">...</FormModal>`
- WHEN renderiza
- THEN el Dialog MUST ser un portal (renderizado fuera del árbol del componente padre)
- AND MUST existir en el DOM un elemento con `role="dialog"`
- AND el `role="dialog"` MUST tener `aria-modal="true"`

#### Scenario: <FormModal> muestra title como Dialog.Title accesible

- GIVEN `<FormModal open={true} title="Crear ticket">`
- WHEN renderiza
- THEN MUST existir un elemento que Radix registra como Dialog.Title (accesible a screen readers)
- AND el título "Crear ticket" MUST ser el texto del elemento

#### Scenario: <FormModal> aplica glassmorphism correcto en modo oscuro

- GIVEN el tema activo es oscuro (`.dark` en `<html>`)
- WHEN `<FormModal open={true}>` renderiza
- THEN el overlay del dialog MUST tener `backdrop-blur` aplicado al panel del contenido
- AND el borde del panel MUST ser `border-white/5` (blanco al 5%)
- AND el panel MUST tener `rounded-lg` (8px — contenedor, per spec canónico)
- AND MUST NOT usar borde opaco sólido

#### Scenario: <FormModal> aplica glassmorphism correcto en modo claro

- GIVEN el tema activo es claro (sin `.dark`)
- WHEN `<FormModal open={true}>` renderiza
- THEN el borde del panel MUST ser `border-slate-200/50`
- AND el panel MUST mantener `backdrop-blur` y `rounded-lg`

#### Scenario: ESC cierra el <FormModal>

- GIVEN `<FormModal open={true} onOpenChange={mockFn}>` está renderizado
- WHEN el usuario presiona la tecla ESC
- THEN `mockFn` MUST ser llamado con `false` (Radix maneja esto por defecto)
- AND el panel del dialog MUST desaparecer del DOM

#### Scenario: Click en overlay cierra el <FormModal>

- GIVEN `<FormModal open={true} onOpenChange={mockFn}>` está renderizado
- WHEN el usuario hace click en el overlay oscuro fuera del panel
- THEN `mockFn` MUST ser llamado con `false`

#### Scenario: <FormModal> muestra footer cuando se provee la prop footer

- GIVEN `<FormModal open={true} footer={<Button>Guardar</Button>}>`
- WHEN renderiza
- THEN el elemento footer MUST aparecer después del children del formulario
- AND MUST existir un separador visual entre el cuerpo y el footer

#### Scenario: <FormModal> con open=false no renderiza contenido en el DOM

- GIVEN `<FormModal open={false} onOpenChange={fn} title="Crear">`
- WHEN renderiza
- THEN MUST NOT existir ningún elemento con `role="dialog"` en el DOM
- AND los hijos MUST NOT estar montados (no renderizar en background)

#### Scenario: <FormModal> tiene focus trap activo cuando está abierto

- GIVEN `<FormModal open={true}>` con un formulario que tiene 3 campos
- WHEN el usuario presiona Tab repetidamente
- THEN el foco MUST ciclar solo dentro del modal (no escapar al DOM exterior)
- AND esto MUST ser provisto por Radix Dialog sin lógica manual adicional

---

### Requirement: <ConfirmDialog> disponible en @/components/ui — AlertDialog para acciones destructivas

`<ConfirmDialog>` usa Radix AlertDialog (semántica de acción destructiva confirmada: no se
cierra con click-outside ni ESC por defecto). MUST mostrar estado de carga en el botón de
confirmar cuando `isPending` es true.

#### Scenario: <ConfirmDialog> exportable desde @/components/ui/confirm-dialog

- GIVEN la implementación está completa
- WHEN se ejecuta `import { ConfirmDialog } from '@/components/ui/confirm-dialog'`
- THEN MUST resolverse sin error

#### Scenario: <ConfirmDialog> renderiza como AlertDialog (role="alertdialog")

- GIVEN `<ConfirmDialog open={true} title="¿Eliminar ticket?" description="Esta acción no se puede deshacer." onConfirm={fn}>`
- WHEN renderiza
- THEN MUST existir un elemento con `role="alertdialog"` en el DOM
- AND el título "¿Eliminar ticket?" MUST ser el AlertDialog.Title
- AND la descripción MUST ser el AlertDialog.Description
- AND ambos MUST ser accesibles a screen readers

#### Scenario: <ConfirmDialog> no se cierra al presionar ESC (seguridad destructiva)

- GIVEN `<ConfirmDialog open={true} onOpenChange={mockFn}>`
- WHEN el usuario presiona ESC
- THEN `mockFn` MUST NOT ser llamado (Radix AlertDialog no cierra con ESC por defecto)
- AND el dialog MUST permanecer en el DOM

#### Scenario: <ConfirmDialog> no se cierra al hacer click en overlay

- GIVEN `<ConfirmDialog open={true} onOpenChange={mockFn}>`
- WHEN el usuario hace click en el overlay fuera del dialog
- THEN `mockFn` MUST NOT ser llamado con `false`
- AND el dialog MUST permanecer abierto

#### Scenario: Botón de confirmar tiene variante destructiva y usa rounded-md

- GIVEN `<ConfirmDialog open={true} confirmLabel="Eliminar" onConfirm={fn}>`
- WHEN renderiza
- THEN el botón de confirmar MUST usar variante destructiva (fondo rojo o equivalente)
- AND MUST tener `rounded-md` (6px — botón, per spec canónico)
- AND MUST NOT tener `rounded-xl` ni `rounded-lg`

#### Scenario: Botón de confirmar muestra isLoading cuando isPending=true

- GIVEN `<ConfirmDialog open={true} isPending={true} onConfirm={fn}>`
- WHEN renderiza
- THEN el botón de confirmar MUST mostrar estado isLoading (spinner + disabled)
- AND MUST NOT ser clickeable mientras isPending=true

#### Scenario: Click en "Cancelar" llama a onOpenChange(false) sin llamar a onConfirm

- GIVEN `<ConfirmDialog open={true} onOpenChange={mockClose} onConfirm={mockConfirm}>`
- WHEN el usuario hace click en "Cancelar"
- THEN `mockClose` MUST ser llamado con `false`
- AND `mockConfirm` MUST NOT ser llamado

#### Scenario: Click en botón de confirmar llama a onConfirm

- GIVEN `<ConfirmDialog open={true} onConfirm={mockConfirm}>`
- WHEN el usuario hace click en el botón de confirmar
- THEN `mockConfirm` MUST ser llamado exactamente una vez
- AND el dialog MUST permanecer abierto hasta que el caller cambie `open` a false
  (el ConfirmDialog no maneja el cierre post-confirmación internamente)

#### Scenario: confirmLabel y cancelLabel tienen valores por defecto razonables

- GIVEN `<ConfirmDialog open={true} title="¿Eliminar?" description="..." onConfirm={fn}>`
  sin pasar confirmLabel ni cancelLabel
- WHEN renderiza
- THEN MUST aparecer un botón con texto por defecto (ej. "Confirmar" o "Eliminar")
- AND MUST aparecer un botón con texto por defecto (ej. "Cancelar")

---

### Requirement: <Toaster> de sonner presente en el root layout (una sola instancia)

`<Toaster>` de sonner MUST estar montado exactamente una vez en la aplicación, en el root
layout. La función `toast` de sonner (importada directamente) MUST ser la API de notificaciones
para todas las features. MUST funcionar en ambos modos (claro/oscuro).

#### Scenario: <Toaster> está en el root layout y no se repite por página

- GIVEN la implementación está completa
- WHEN se inspecciona `src/app/layout.tsx` (root layout)
- THEN MUST haber exactamente un `<Toaster />` montado
- AND MUST NOT haber `<Toaster />` en layouts de sección ni en páginas individuales

#### Scenario: toast.success muestra notificación verde con auto-dismiss

- GIVEN `<Toaster>` está montado en el root layout
- WHEN cualquier módulo llama a `toast.success('Ticket creado')`
- THEN MUST aparecer una notificación visible con el texto "Ticket creado"
- AND la notificación MUST usar color verde (success semantic)
- AND MUST desaparecer automáticamente después de aproximadamente 3 segundos sin interacción

#### Scenario: toast.error muestra notificación roja con duración mayor

- GIVEN `<Toaster>` está montado
- WHEN cualquier módulo llama a `toast.error('No se pudo crear el ticket')`
- THEN MUST aparecer una notificación con el texto del error
- AND la notificación MUST usar color rojo (error semantic)
- AND la duración MUST ser mayor que la de success (mínimo 4 segundos)

#### Scenario: Toaster adapta su tema al modo activo (claro/oscuro)

- GIVEN `<Toaster theme="system">` o equivalente configurado
- WHEN el modo activo es oscuro
- THEN las notificaciones MUST tener fondo oscuro coherente con el design system
- WHEN el modo activo es claro
- THEN las notificaciones MUST tener fondo claro

#### Scenario: Múltiples toasts se apilan sin bloquear la UI

- GIVEN `<Toaster>` está montado
- WHEN se llaman sucesivamente `toast.success('A')` y `toast.error('B')`
- THEN MUST aparecer ambos como notificaciones separadas y visibles simultáneamente
- AND la UI de fondo MUST seguir siendo interactuable (los toasts son no-bloqueantes)
