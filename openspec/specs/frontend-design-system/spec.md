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
