# Spec: Frontend Design System

> Capability: `frontend-design-system`
> Stack: Tailwind CSS v4 (CSS-first @theme), Shadcn, Next.js
> Autoridad: CLAUDE.md §3 "Patrones de Diseño del Frontend"
> Archivado desde: `frontend-fundacion` (2026-06-26)

## Context

La constitución establece una estética ultra limpia, minimalista y oscura por defecto, inspirada
en Stripe/Linear. Los tokens de diseño se implementan en Tailwind v4 mediante un bloque `@theme`
en `globals.css` sin archivo de configuración JS. Shadcn consume esas variables CSS para sus
componentes. No hay modo light en este change — dark es el único tema obligatorio.

Radios de esquinas — obligatorios y no negociables:
- `rounded-lg` (8px) → contenedores: cards, paneles, modales, drawers, alert boxes
- `rounded-md` (6px) → elementos interactivos: botones, inputs, dropdowns, badges, comboboxes

Los átomos `<Skeleton>`, `<EmptyState>` y la variante loading de `<Button>` son el contrato
con las demás capabilities (frontend-ui-states); este spec define los requisitos de disponibilidad
y API de esos átomos.

---

## Requirements

### Requirement: Dark mode como tema por defecto, sin intervención del usuario

#### Scenario: Cualquier página renderiza con fondo oscuro al acceder por primera vez
**Given** un usuario nuevo accede a la aplicación (primera visita, sin preferencias guardadas)
**When** cualquier página carga
**Then** el background del root layout MUST ser oscuro (token `bg-background` mapeado a un color oscuro, ej. `oklch(0.16 0 0)` de paleta Stripe/Linear)
**And** el texto MUST tener contraste mínimo WCAG AA (ratio ≥ 4.5:1 para texto normal de 16px)
**And** MUST NOT aplicar el tema claro del OS por defecto (no `prefers-color-scheme: light` override automático)

#### Scenario: El bloque @theme en globals.css define todos los tokens de color dark
**Given** el archivo `src/styles/globals.css` contiene un bloque `@theme {}`
**When** se verifica su contenido
**Then** MUST contener variables para al menos: `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-destructive`, `--color-destructive-foreground`
**And** los valores de background y card MUST ser oscuros (L < 15% en HSL o equivalente oklch)
**And** los valores de foreground MUST ser claros (L > 85% en HSL o equivalente oklch)

---

### Requirement: Radio de esquinas consistente por categoría de elemento

#### Scenario: Cards y paneles contenedores usan exclusivamente rounded-lg (8px)
**Given** cualquier componente que actúa como contenedor de información: cards de ticket, panel de detalle, modal, drawer, alert informativo, sección delimitada
**When** renderiza en cualquier estado o vista
**Then** MUST tener la clase `rounded-lg` de Tailwind (equivalente a `border-radius: var(--radius-lg)` = 8px)
**And** MUST NOT usar `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-sm`, ni `rounded-none` para contenedores

#### Scenario: Botones usan exclusivamente rounded-md (6px) en todos sus estados
**Given** cualquier `<Button>` de Shadcn o botón custom, en variante primary, secondary, outline, ghost, destructive, o loading
**When** renderiza (default, hover, focus, active, disabled, loading)
**Then** MUST tener la clase `rounded-md` (equivalente a `border-radius: var(--radius-md)` = 6px)
**And** el radio MUST NOT cambiar entre estados (hover, focus y disabled mantienen `rounded-md`)

#### Scenario: Inputs usan rounded-md (6px)
**Given** cualquier elemento de entrada: `<Input>`, `<Textarea>`, `<Select>`, combobox
**When** renderiza (vacío, con valor, con foco, con error, deshabilitado)
**Then** MUST tener la clase `rounded-md`
**And** MUST NOT usar `rounded-lg` ni `rounded-full`

#### Scenario: Panels de dropdown y menú usan rounded-md (6px)
**Given** cualquier `<DropdownMenu>`, `<Select>` panel desplegable, `<Combobox>`, `<Popover>`
**When** el panel está abierto
**Then** el contenedor del panel MUST tener `rounded-md`
**And** MUST NOT usar `rounded-lg` para el panel (solo el trigger puede ser `rounded-md` por ser botón)

#### Scenario: Badges de estado usan rounded-md (6px), no pill shape
**Given** un badge de estado (ej. "Pendiente", "Aprobado", "ADMIN", tipo de ticket)
**When** renderiza
**Then** MUST usar `rounded-md`
**And** MUST NOT usar `rounded-full` como estilo por defecto (pill shape reservado para avatares, no badges de estado)

---

### Requirement: Variables de radio declaradas en @theme

#### Scenario: --radius-lg y --radius-md están en globals.css como tokens @theme
**Given** `src/styles/globals.css` contiene el bloque `@theme {}`
**When** se verifica el contenido
**Then** MUST contener `--radius-lg: 0.5rem` (= 8px con `font-size: 16px` base) o equivalente en px
**And** MUST contener `--radius-md: 0.375rem` (= 6px con `font-size: 16px` base) o equivalente en px
**And** Shadcn MUST consumir estas variables para sus componentes (configurado via `components.json`)
**And** las clases `rounded-lg` y `rounded-md` de Tailwind MUST mapear a estos valores en el design system

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
