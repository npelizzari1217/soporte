# Spec: Frontend Design System

> Capability: `frontend-design-system`
> Stack: Tailwind CSS v4 (CSS-first @theme), Shadcn, Next.js
> Autoridad: CLAUDE.md §3 "Patrones de Diseño del Frontend"
> Archivado desde: `frontend-fundacion` (2026-06-26)
> Actualizado en change: `frontend-shell` (2026-06-27) — modo dual, glassmorphism, Inter, form atoms premium, badges translúcidos, filas-tarjeta, @media print

## Context

La constitución establece una estética ultra limpia, super premium y cinematográfica inspirada en
Stripe/Linear. Los tokens de diseño se implementan en Tailwind v4 mediante bloques `@theme` e
`@theme inline` en `globals.css` sin archivo de configuración JS. Shadcn consume esas variables CSS
para sus componentes.

La aplicación soporta modo dual (claro y oscuro) vía estrategia de clase `.dark` en `<html>`.
El modo oscuro es el predeterminado: fondos `slate-950` para acabado cinematográfico. El modo claro
usa fondos limpios de alto contraste WCAG AA. La preferencia se persiste en `localStorage`; un script
inline bloqueante en el `<head>` del root layout aplica la clase antes del primer paint (prevención de FOUC).

Glassmorphism: tarjetas y paneles principales usan `backdrop-blur` con bordes ultra-finos
(`border-white/5` oscuro, `border-slate-200/50` claro). Tipografía: `Inter` aplicada globalmente.

Radios de esquinas — obligatorios y no negociables:
- `rounded-lg` (8px) → contenedores: cards, paneles, modales, drawers, alert boxes
- `rounded-md` (6px) → botones, dropdowns, badges
- `rounded-xl` (12px) → inputs, textareas, selects, comboboxes — formularios premium

Los átomos `<Skeleton>`, `<EmptyState>` y la variante loading de `<Button>` son el contrato
con las demás capabilities (frontend-ui-states); este spec define los requisitos de disponibilidad
y API de esos átomos.

---

## Requirements

### Requirement: Modo dual (claro + oscuro) via estrategia de clase `.dark`

La aplicación MUST soportar ambos modos: claro y oscuro. El modo oscuro se activa via la clase
`.dark` en `<html>`. El modo oscuro usa fondos `slate-950` (acabado cinematográfico, no negro puro).
El modo claro usa fondos limpios de alto contraste WCAG AA. La preferencia MUST persistirse en
`localStorage`. Un script inline bloqueante MUST estar en el `<head>` del root layout para aplicar
la clase correcta antes del primer paint (prevención de FOUC).

(Supera el requirement anterior "Dark mode como tema por defecto, sin intervención del usuario" —
donde dark era el único modo y no existía modo claro ni persistencia de preferencia.)

#### Scenario: Modo oscuro renderiza con fondos slate-950

- GIVEN un usuario tiene preferencia "oscuro" en `localStorage` o es primera visita
- WHEN cualquier página del dashboard carga
- THEN la clase `.dark` MUST estar aplicada al `<html>` antes del primer paint
- AND el background root MUST mapear a `slate-950` o equivalente (L < 5% oklch)
- AND el texto MUST tener contraste mínimo WCAG AA (ratio ≥ 4.5:1)
- AND MUST NOT aplicar tema claro del OS por defecto (`prefers-color-scheme` no es la autoridad)

#### Scenario: Modo claro renderiza con fondos limpios

- GIVEN un usuario tiene preferencia "claro" en `localStorage`
- WHEN cualquier página del dashboard carga
- THEN la clase `.dark` MUST NOT estar aplicada al `<html>`
- AND el background MUST ser claro (L > 90% oklch o equivalente blanco/slate-50)
- AND el texto MUST tener contraste WCAG AA (ratio ≥ 4.5:1)

#### Scenario: Script inline previene FOUC en SSR

- GIVEN el root `layout.tsx` incluye un script inline bloqueante en `<head>`
- WHEN la página renderiza en SSR y el cliente hidrata
- THEN MUST NOT haber flash de tema incorrecto entre render SSR y hidratación
- AND el script MUST leer `localStorage` y aplicar `.dark` antes de que React hidrate

#### Scenario: @theme en globals.css define tokens duales

- GIVEN `src/styles/globals.css` contiene bloques de tokens para modo oscuro y claro
- WHEN se verifica el contenido del archivo
- THEN MUST contener `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`, `--color-primary`, `--color-muted`, `--color-border` con valores para el modo oscuro
- AND MUST contener los mismos tokens con valores para modo claro (vía `.dark { @theme {} }` o mecanismo CSS-first equivalente de Tailwind v4)
- AND los tokens de background oscuro MUST tener L < 5% oklch; los claros MUST tener L > 90% oklch

---

### Requirement: Radio de esquinas consistente por categoría de elemento

Los radios MUST ser consistentes por categoría: contenedores `rounded-lg` (8px), botones `rounded-md`
(6px), inputs/textareas/selects/comboboxes `rounded-xl` (12px), panels de dropdown `rounded-md` (6px),
badges `rounded-md` (6px).

#### Scenario: Cards y paneles contenedores usan exclusivamente rounded-lg (8px)

**Given** cualquier componente que actúa como contenedor de información: cards de ticket, panel de
detalle, modal, drawer, alert informativo, sección delimitada
**When** renderiza en cualquier estado o vista
**Then** MUST tener la clase `rounded-lg` de Tailwind (equivalente a `border-radius: var(--radius-lg)` = 8px)
**And** MUST NOT usar `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-sm`, ni `rounded-none` para contenedores

#### Scenario: Botones usan exclusivamente rounded-md (6px) en todos sus estados

**Given** cualquier `<Button>` de Shadcn o botón custom, en variante primary, secondary, outline,
ghost, destructive, o loading
**When** renderiza (default, hover, focus, active, disabled, loading)
**Then** MUST tener la clase `rounded-md` (equivalente a `border-radius: var(--radius-md)` = 6px)
**And** el radio MUST NOT cambiar entre estados (hover, focus y disabled mantienen `rounded-md`)

#### Scenario: Inputs usan rounded-xl (12px) — formularios premium

**Given** cualquier elemento de entrada: `<Input>`, `<Textarea>`, `<Select>`, combobox
**When** renderiza (vacío, con valor, con foco, con error, deshabilitado)
**Then** MUST tener la clase `rounded-xl` (= 12px)
**And** MUST NOT usar `rounded-md`, `rounded-lg` ni `rounded-full`

(Supera el escenario anterior donde inputs usaban `rounded-md` (6px). Migrado a `rounded-xl` para
look premium de formularios, per CLAUDE.md §3.)

#### Scenario: Panels de dropdown y menú usan rounded-md (6px)

**Given** cualquier `<DropdownMenu>`, `<Select>` panel desplegable, `<Combobox>`, `<Popover>`
**When** el panel está abierto
**Then** el contenedor del panel MUST tener `rounded-md`
**And** MUST NOT usar `rounded-lg` para el panel (solo el trigger puede ser `rounded-xl` si es un input)

#### Scenario: Badges de estado usan rounded-md (6px), no pill shape

**Given** un badge de estado (ej. "Pendiente", "Aprobado", "ADMIN", tipo de ticket)
**When** renderiza
**Then** MUST usar `rounded-md`
**And** MUST NOT usar `rounded-full` como estilo por defecto (pill shape reservado para avatares, no badges de estado)

---

### Requirement: Variables de radio declaradas en @theme

El bloque `@theme` de `globals.css` MUST declarar tokens de radio para las tres categorías activas:
`--radius-lg` (contenedores), `--radius-md` (botones/badges/dropdowns) y `--radius-xl`
(inputs/forms). Shadcn consume estas variables.

#### Scenario: --radius-lg, --radius-md y --radius-xl están en globals.css

**Given** `src/styles/globals.css` contiene el bloque `@theme {}`
**When** se verifica el contenido
**Then** MUST contener `--radius-lg: 0.5rem` (= 8px)
**And** MUST contener `--radius-md: 0.375rem` (= 6px)
**And** MUST contener `--radius-xl: 0.75rem` (= 12px — NUEVO, para inputs premium)
**And** Shadcn MUST consumir estas variables para sus componentes (configurado via `components.json`)
**And** las clases `rounded-lg`, `rounded-md` y `rounded-xl` de Tailwind MUST mapear a estos valores

---

### Requirement: Átomos del design system disponibles como módulos importables

#### Scenario: <Skeleton> importable y adaptable a diferentes formas de ítems

**Given** la fundación está implementada
**When** cualquier feature importa `<Skeleton>` desde `@/components/ui/skeleton`
**Then** el componente MUST existir en ese path
**And** MUST aceptar `className` como prop para controlar width, height y forma via Tailwind
**And** MUST renderizar con una animación de pulso tenue (`animate-pulse` de Tailwind)
**And** MUST NOT requerir props obligatorias adicionales a `className`

#### Scenario: <EmptyState> importable con API de props estructurada

**Given** la fundación está implementada
**When** cualquier feature importa `<EmptyState>` desde `@/components/ui/empty-state`
**Then** el componente MUST existir en ese path
**And** MUST aceptar las props: `title: string` (obligatorio), `description?: string`, `icon?: ReactNode`, `action?: ReactNode`
**And** MUST renderizar `icon` (o placeholder), `title` y `description` en layout vertical centrado
**And** MUST renderizar `action` debajo de la descripción si fue provisto
**And** MUST NOT requerir ninguna prop de layout o contenedor adicional para verse correctamente

#### Scenario: <Button> acepta prop isLoading para Interactive State sin código extra en cada formulario

**Given** la fundación está implementada
**When** un formulario pasa `isLoading={true}` al componente `<Button>`
**Then** el botón MUST mostrar un spinner interno más el texto alternativo (ej. "Cargando...")
**And** MUST tener `disabled={true}` automáticamente cuando `isLoading={true}`
**And** MUST NOT requerir que cada formulario implemente su propio spinner, aria-busy, ni lógica de disabled manualmente
**And** cuando `isLoading={false}`, MUST renderizar el contenido original (children) sin spinner

---

### Requirement: Tokens de glassmorphism disponibles en el design system

Las tarjetas y paneles principales MUST aplicar glassmorphism: fondo con `backdrop-blur` y bordes
ultra-finos que varían según el modo activo.

#### Scenario: Glassmorphism en modo oscuro

- GIVEN un componente de tarjeta principal renderiza en modo oscuro
- WHEN se inspecciona el estilo computado
- THEN MUST tener `backdrop-blur` aplicado (mínimo `backdrop-blur-sm`)
- AND el borde MUST ser `border-white/5` (blanco al 5% de opacidad)
- AND MUST NOT usar un borde opaco sólido para el efecto glass

#### Scenario: Glassmorphism en modo claro

- GIVEN un componente de tarjeta principal renderiza en modo claro
- WHEN se inspecciona el estilo computado
- THEN MUST tener `backdrop-blur` aplicado
- AND el borde MUST ser `border-slate-200/50`

---

### Requirement: Tipografía Inter aplicada globalmente

La fuente de toda la aplicación MUST ser `Inter` (o variable CSS correspondiente). MUST aplicarse
en el elemento root para herencia global.

#### Scenario: Inter es la fuente computada del body

- GIVEN el root layout carga con la fuente Inter configurada
- WHEN se inspecciona el `font-family` computado del `<body>` o `<html>`
- THEN MUST ser `Inter` o su variable CSS (`var(--font-inter)` o equivalente)
- AND MUST NOT usar Arial, Helvetica ni fuentes de sistema como fuente principal

---

### Requirement: Átomos de formulario premium disponibles en @/components/ui

Los átomos `<Input>`, `<Label>` y `<Select>` MUST estar disponibles en `@/components/ui` con estilo
premium: `rounded-xl` en inputs, labels en uppercase compacto con tracking amplio.

#### Scenario: <Input> importable con rounded-xl y estilos duales

- GIVEN la implementación está completa
- WHEN cualquier feature importa `<Input>` desde `@/components/ui/input`
- THEN el componente MUST existir en ese path
- AND MUST renderizar con `rounded-xl`
- AND MUST tener estilos para modo claro y oscuro
- AND MUST aceptar las props estándar HTML input más `className`

#### Scenario: <Label> importable con uppercase tracking-wider

- GIVEN la implementación está completa
- WHEN cualquier feature importa `<Label>` desde `@/components/ui/label`
- THEN el componente MUST existir en ese path
- AND MUST aplicar `text-xs tracking-wider uppercase` como estilo base
- AND MUST aceptar `htmlFor` y `children` como props

#### Scenario: <Select> importable con trigger rounded-xl y panel rounded-md

- GIVEN la implementación está completa
- WHEN cualquier feature importa `<Select>` desde `@/components/ui/select`
- THEN el componente MUST existir en ese path
- AND el trigger del Select MUST tener `rounded-xl`
- AND el panel desplegable MUST tener `rounded-md` (dropdown, no form atom)

---

### Requirement: Badges translúcidos con colores semánticos

Los badges de estado MUST usar fondos translúcidos con color semántico y forma `rounded-md`. El
color del fondo comunica el significado sin saturar visualmente. La paleta cubre 5 tonos:

| Tono | Fondo | Texto | Estados |
|------|-------|-------|---------|
| `neutral` | `bg-muted` | `text-muted-foreground` | Abierto, Cerrado |
| `warning` | `bg-amber-500/10` | `text-amber-600` / `dark:text-amber-400` | Pendiente de aprobación |
| `success` | `bg-emerald-500/10` | `text-emerald-600` / `dark:text-emerald-400` | Aprobado, Resuelto |
| `danger` | `bg-red-500/10` | `text-red-600` / `dark:text-red-400` | Rechazado, Cancelado |
| `info` | `bg-blue-500/10` | `text-blue-600` / `dark:text-blue-400` | En progreso |

#### Scenario: Badge de estado "espera/pendiente" usa amber translúcido

- GIVEN un badge indica estado "Pendiente", "En espera" o similar
- WHEN renderiza en cualquier modo
- THEN MUST usar `bg-amber-500/10` como fondo
- AND MUST tener texto con contraste adecuado (`text-amber-600` claro / `text-amber-400` oscuro)
- AND MUST tener `rounded-md` (no `rounded-full`)

#### Scenario: Badge de estado "completado/listo" usa emerald translúcido

- GIVEN un badge indica estado "Listo", "Completado", "Aprobado" o similar
- WHEN renderiza en cualquier modo
- THEN MUST usar `bg-emerald-500/10` como fondo
- AND MUST tener texto con contraste adecuado (`text-emerald-600` claro / `text-emerald-400` oscuro)
- AND MUST tener `rounded-md`

---

### Requirement: Patrón filas-tarjeta para los listados del dominio

Los listados de Tickets, Compras, Reparaciones y Equipos MUST presentar cada ítem como una
"fila-tarjeta" individual espaciada. MUST NOT usar tablas HTML densas (`<table>`/`<tr>`/`<td>`).
Cada fila-tarjeta MUST funcionar en ambos modos. El componente `<CardRow>` vive en
`@/components/ui/card-row` (Scope Rule §2: compartido por 4 features).

#### Scenario: Cada ítem de listado renderiza como fila-tarjeta

- GIVEN un listado de ítems del dominio renderiza con datos
- WHEN se inspeccionan las filas
- THEN cada fila MUST ser una tarjeta individual (no `<tr>/<td>`)
- AND MUST tener un elemento visual (ícono o avatar) a la izquierda
- AND MUST tener información jerarquizada al centro (título principal + subtítulo o metadata)
- AND MUST tener badge(s) de estado a la derecha
- AND MUST haber espaciado generoso entre filas (mínimo `gap-2` o `space-y-2`)

#### Scenario: Fila-tarjeta mantiene contraste en ambos modos

- GIVEN un ítem de listado renderiza
- WHEN se alterna entre modo claro y oscuro
- THEN la fila-tarjeta MUST mantener contraste WCAG AA en ambos modos
- AND los badges translúcidos MUST ser legibles sobre el fondo del modo activo

---

### Requirement: Bloque @media print en las vistas del dashboard

Las vistas principales del dashboard MUST incluir un bloque `@media print` que oculta la navegación
y controles de UI, fuerza fondo blanco y texto negro de alta legibilidad.

#### Scenario: @media print oculta sidebar y controles de UI

- GIVEN el usuario dispara impresión (`Ctrl+P` o `window.print()`)
- WHEN el browser aplica estilos de impresión
- THEN el sidebar MUST tener `display: none`
- AND los botones de acción, controles de filtro y elementos de UI interactivos MUST estar ocultos
- AND el `<main>` o área de contenido MUST ocupar el 100% del ancho imprimible

#### Scenario: @media print fuerza colores de alta legibilidad

- GIVEN el usuario dispara impresión
- WHEN el browser aplica estilos de impresión
- THEN el fondo MUST ser blanco (`background: white`)
- AND el texto MUST ser negro o gris muy oscuro para máxima legibilidad
- AND los divisores MUST ser finos y minimalistas (1px solid con tono neutro claro)

---

### Requirement: <Textarea> disponible en @/components/ui como átomo de entrada de texto largo

`<Textarea>` es el átomo equivalente a `<Input>` para campos de texto largo (ej. `descripcion`).
MUST usar `forwardRef` para compatibilidad con `register()` de react-hook-form. MUST heredar las
mismas reglas de radio que `<Input>` (`rounded-xl`). MUST aceptar prop `error?: boolean` para
aplicar estilos de borde destructivo.

Actualizado en change: `tickets-crud` (2026-06-28)

#### Scenario: <Textarea> importable con rounded-xl, forwardRef y prop error

- GIVEN la implementación está completa
- WHEN cualquier feature importa `<Textarea>` desde `@/components/ui/textarea`
- THEN el componente MUST existir en ese path
- AND MUST renderizar con `rounded-xl` como clase base (consistente con `<Input>`)
- AND `forwardRef` MUST funcionar: el ref apunta al elemento `HTMLTextAreaElement` real
- AND `error={true}` MUST agregar clase `border-destructive` al textarea
- AND `error={false}` o ausente MUST NOT agregar clase `border-destructive`
- AND props estándar HTML (`placeholder`, `disabled`, `rows`, `className`) MUST propagarse

---

### Requirement: <FormField> disponible en @/components/ui con API de campo de formulario

`<FormField>` es el wrapper de campo de formulario premium que combina: `<Label>` uppercase
con tracking, el control hijo (Input, Select, Textarea, etc.), y el mensaje de error accesible.
MUST ser importable desde `@/components/ui/form-field`. MUST ser genérico (no acoplado a
react-hook-form internamente, aunque lo usen sus consumidores).

Agregado en change: `tickets-crud` (2026-06-28)

#### Scenario: <FormField> renderiza Label uppercase + control + sin error

- GIVEN cualquier feature importa `<FormField>` desde `@/components/ui/form-field`
- WHEN se renderiza `<FormField label="Título" htmlFor="titulo"><Input id="titulo" /></FormField>`
- THEN MUST renderizar un `<label>` asociado al input (`htmlFor` correcto)
- AND el label MUST tener estilos `text-xs tracking-wider uppercase` y color atenuado (muted)
- AND el input MUST ser el hijo directo dentro del FormField
- AND MUST NOT renderizar ningún mensaje de error si `error` no fue provisto

#### Scenario: <FormField> con error renderiza mensaje accesible con role="alert"

- GIVEN `<FormField label="Título" htmlFor="titulo" error="El título es requerido"><Input /></FormField>`
- WHEN renderiza
- THEN MUST aparecer el texto "El título es requerido" debajo del control
- AND el mensaje MUST tener color destructivo (`text-destructive`)
- AND el mensaje MUST ser accesible vía `role="alert"` (live region para screen readers)
- NOTE: la vinculación `aria-describedby` entre el input y el mensaje de error es
  responsabilidad del consumer (deuda técnica registrada, ver S1/a11y en tickets-crud)

#### Scenario: <FormField> con prop required muestra indicador visual

- GIVEN `<FormField label="Título" htmlFor="titulo" required={true}>`
- WHEN renderiza
- THEN el label MUST incluir un indicador visual de requerido (ej. asterisco `*`)

#### Scenario: <FormField> acepta cualquier control hijo (Input, Select, Textarea)

- GIVEN `<FormField label="Descripción" htmlFor="desc"><Textarea id="desc" /></FormField>`
- WHEN renderiza
- THEN MUST renderizar el Textarea como control sin errores de React
- AND el Label MUST seguir asociado correctamente vía htmlFor

#### Scenario: <FormField> exportable desde @/components/ui/form-field

- GIVEN la implementación está completa
- WHEN se ejecuta `import { FormField } from '@/components/ui/form-field'`
- THEN MUST resolverse sin error
- AND MUST exportar al menos el componente `FormField` como named export

---

### Requirement: <FormModal> disponible en @/components/ui — modal glassmorphism con Radix Dialog

`<FormModal>` encapsula Radix Dialog con la estética glassmorphism del design system (heredada
del spec canónico). MUST manejar apertura/cierre de forma controlada (open/onOpenChange). MUST
preservar focus trap y ESC por defecto (comportamiento nativo de Radix Dialog). MUST ser
agnóstico al formulario que contiene. El footer de botones MUST vivir dentro del `<form>` del
consumer (no en el shell) para que `type="submit"` funcione con react-hook-form.

Agregado en change: `tickets-crud` (2026-06-28)

#### Scenario: <FormModal> exportable desde @/components/ui/form-modal

- GIVEN la implementación está completa
- WHEN se ejecuta `import { FormModal } from '@/components/ui/form-modal'`
- THEN MUST resolverse sin error

#### Scenario: <FormModal> renderiza portal con role="dialog" y aria-modal cuando open=true

- GIVEN `<FormModal open={true} onOpenChange={fn} title="Crear ticket">...</FormModal>`
- WHEN renderiza
- THEN MUST existir en el DOM un elemento con `role="dialog"`
- AND el `role="dialog"` MUST tener `aria-modal="true"`

#### Scenario: <FormModal> muestra title como Dialog.Title accesible

- GIVEN `<FormModal open={true} title="Crear ticket">`
- WHEN renderiza
- THEN el título "Crear ticket" MUST ser el texto del elemento Dialog.Title (accesible a screen readers)

#### Scenario: <FormModal> aplica glassmorphism correcto en modo oscuro

- GIVEN el tema activo es oscuro (`.dark` en `<html>`)
- WHEN `<FormModal open={true}>` renderiza
- THEN el overlay MUST tener `backdrop-blur` aplicado
- AND el borde del panel MUST ser `border-white/10` o `border-white/5` (blanco translúcido)
- AND el panel MUST tener `rounded-xl` (input-level, modal premium) o `rounded-lg` (contenedor)
- AND MUST NOT usar borde opaco sólido

#### Scenario: ESC cierra el <FormModal>

- GIVEN `<FormModal open={true} onOpenChange={mockFn}>` está renderizado
- WHEN el usuario presiona la tecla ESC
- THEN `mockFn` MUST ser llamado con `false`

#### Scenario: Click en overlay cierra el <FormModal>

- GIVEN `<FormModal open={true} onOpenChange={mockFn}>` está renderizado
- WHEN el usuario hace click en el overlay oscuro fuera del panel
- THEN `mockFn` MUST ser llamado con `false`

#### Scenario: <FormModal> con open=false no renderiza contenido en el DOM

- GIVEN `<FormModal open={false} onOpenChange={fn} title="Crear">`
- WHEN renderiza
- THEN MUST NOT existir ningún elemento con `role="dialog"` en el DOM
- AND los hijos MUST NOT estar montados

#### Scenario: <FormModal> tiene focus trap activo cuando está abierto

- GIVEN `<FormModal open={true}>` con un formulario que tiene 3 campos
- WHEN el usuario presiona Tab repetidamente
- THEN el foco MUST ciclar solo dentro del modal (provisto por Radix Dialog sin lógica manual)

---

### Requirement: <ConfirmDialog> disponible en @/components/ui — AlertDialog para acciones destructivas

`<ConfirmDialog>` usa Radix AlertDialog (semántica de acción destructiva confirmada: no se
cierra con click-outside ni ESC por defecto). MUST mostrar estado de carga en el botón de
confirmar cuando `isPending` es true. El caller controla el estado `open` — el dialog NO
se cierra solo tras confirmar.

Agregado en change: `tickets-crud` (2026-06-28)

#### Scenario: <ConfirmDialog> renderiza como AlertDialog (role="alertdialog")

- GIVEN `<ConfirmDialog open={true} title="¿Eliminar ticket?" description="..." onConfirm={fn}>`
- WHEN renderiza
- THEN MUST existir un elemento con `role="alertdialog"` en el DOM
- AND el título y la descripción MUST ser accesibles a screen readers

#### Scenario: <ConfirmDialog> no se cierra al presionar ESC ni al hacer click en overlay

- GIVEN `<ConfirmDialog open={true} onOpenChange={mockFn}>`
- WHEN el usuario presiona ESC o hace click en el overlay
- THEN `mockFn` MUST NOT ser llamado (Radix AlertDialog no cierra con ESC ni click-outside)

#### Scenario: Botón de confirmar tiene variante destructiva y usa rounded-md

- GIVEN `<ConfirmDialog open={true} confirmLabel="Eliminar" onConfirm={fn}>`
- WHEN renderiza
- THEN el botón de confirmar MUST usar variante destructiva (fondo rojo o equivalente)
- AND MUST tener `rounded-md` (botón, per spec canónico)

#### Scenario: Botón de confirmar muestra isLoading cuando isPending=true

- GIVEN `<ConfirmDialog open={true} isPending={true} onConfirm={fn}>`
- WHEN renderiza
- THEN el botón de confirmar MUST mostrar estado isLoading (spinner + disabled)

#### Scenario: Click en "Cancelar" llama a onOpenChange(false); click en confirmar llama a onConfirm

- GIVEN `<ConfirmDialog open={true} onOpenChange={mockClose} onConfirm={mockConfirm}>`
- WHEN el usuario hace click en "Cancelar"
- THEN `mockClose` MUST ser llamado con `false`; `mockConfirm` MUST NOT ser llamado
- WHEN el usuario hace click en el botón de confirmar
- THEN `mockConfirm` MUST ser llamado exactamente una vez
- AND el dialog MUST permanecer abierto hasta que el caller cambie `open` a false

#### Scenario: confirmLabel y cancelLabel tienen valores por defecto

- GIVEN `<ConfirmDialog open={true} title="¿Eliminar?" description="..." onConfirm={fn}>`
  sin pasar confirmLabel ni cancelLabel
- WHEN renderiza
- THEN MUST aparecer un botón con texto por defecto (ej. "Confirmar" o "Eliminar")
- AND MUST aparecer un botón con texto por defecto (ej. "Cancelar")

---

### Requirement: <Toaster> de sonner presente en el root layout (una sola instancia)

`<Toaster>` de sonner MUST estar montado exactamente una vez en la aplicación, en el root
layout. El helper `notify` (`@/shared/lib/notify`) envuelve `toast.success` y `toast.error`
de sonner para que la librería sea swappable y espíable en tests. MUST funcionar en ambos
modos (claro/oscuro).

Agregado en change: `tickets-crud` (2026-06-28)

#### Scenario: <Toaster> está en el root layout y no se repite por página

- GIVEN la implementación está completa
- WHEN se inspecciona `src/app/layout.tsx` (root layout)
- THEN MUST haber exactamente un `<Toaster />` montado (instancia global única)
- AND MUST NOT haber `<Toaster />` en layouts de sección ni en páginas individuales

#### Scenario: notify.success y notify.error son wrappers de sonner testeables

- GIVEN `@/shared/lib/notify` exporta `{ notify }`
- WHEN un test espía `vi.spyOn(notify, 'success')` y llama a `notify.success('msg')`
- THEN el spy registra la llamada (sin necesidad de asertar el portal DOM de sonner)
- AND `notify.error('msg')` funciona de igual forma con `vi.spyOn(notify, 'error')`

#### Scenario: Toaster adapta su tema al modo activo (claro/oscuro)

- GIVEN `<Toaster theme="system">` configurado en el root layout
- WHEN el modo activo es oscuro o claro
- THEN las notificaciones MUST tener fondo coherente con el design system activo

---

### Requirement: <Select> acepta prop error para estado visual de borde destructivo

El átomo `<Select>` MUST aceptar prop `error?: boolean`. Cuando `error={true}`, el Trigger
MUST agregar clase `border-destructive`. Esto complementa el mensaje de error que provee
`<FormField>` — el campo también pinta su borde para feedback visual inmediato.

Actualizado en change: `tickets-crud` (2026-06-28)

#### Scenario: <Select error={true}> aplica borde destructivo al Trigger

- GIVEN `<Select error={true} options={[]} />`
- WHEN renderiza
- THEN el Trigger MUST tener clase `border-destructive`

#### Scenario: <Select error={false}> no aplica borde destructivo

- GIVEN `<Select error={false} options={[]} />`
- WHEN renderiza
- THEN el Trigger MUST NOT tener clase `border-destructive`
