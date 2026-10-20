import { Badge } from "./badge";
import { cn } from "@/lib/utils";

/**
 * StatusBadge — maps the fixed ticket workflow estado (spec §R-M1: NUEVO →
 * ASIGNADO → EN_PROCESO → RESUELTO → CERRADO, + CANCELADO, sin reapertura)
 * to a Spanish label and a color propio por estado.
 *
 * Cada estado tiene un color distinto para que se reconozca de un vistazo en
 * listas cargadas. Los colores llevan su par `dark:` explícito: en modo claro
 * fondo pastel con texto oscuro, en modo oscuro fondo translúcido con texto
 * claro, así el contraste se sostiene en los dos temas. NUEVO va en sólido y
 * con énfasis porque es el estado que pide atención.
 *
 * Los `<select>` nativos no pintan el color de cada `<option>` en todos los
 * navegadores; por eso las opciones llevan un emoji de color (ver
 * `etiquetaOpcionEstado`), que se ve en cualquier plataforma.
 */
export type TicketEstado = "NUEVO" | "ASIGNADO" | "EN_PROCESO" | "ESPERANDO_CLIENTE" | "RESUELTO" | "CERRADO" | "CANCELADO";

interface EstadoConfig {
  label: string;
  /** Texto del badge; difiere de `label` solo donde se refuerza la atención. */
  badgeLabel: string;
  emoji: string;
  className: string;
}

const ESTADO_CONFIG: Record<TicketEstado, EstadoConfig> = {
  NUEVO: {
    label: "Nuevo",
    badgeLabel: "✨ Nuevo!!",
    emoji: "🔵",
    className: "border-transparent bg-blue-600 text-white font-semibold dark:bg-blue-500 dark:text-white",
  },
  ASIGNADO: {
    label: "Asignado",
    badgeLabel: "Asignado",
    emoji: "🟣",
    className:
      "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  },
  EN_PROCESO: {
    label: "En proceso",
    badgeLabel: "En proceso",
    emoji: "🟠",
    className:
      "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  },
  ESPERANDO_CLIENTE: {
    label: "Esperando al cliente",
    badgeLabel: "Esperando al cliente",
    emoji: "🟡",
    className:
      "border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
  },
  RESUELTO: {
    label: "Resuelto",
    badgeLabel: "Resuelto",
    emoji: "🟢",
    className:
      "border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/40 dark:text-green-200",
  },
  CERRADO: {
    label: "Cerrado",
    badgeLabel: "Cerrado",
    emoji: "⚫",
    className: "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300",
  },
  CANCELADO: {
    label: "Cancelado",
    badgeLabel: "Cancelado",
    emoji: "🔴",
    className: "border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
};

function esTicketEstado(codigo: string): codigo is TicketEstado {
  return Object.prototype.hasOwnProperty.call(ESTADO_CONFIG, codigo);
}

/**
 * Texto de una `<option>` de estado: emoji de color + nombre.
 *
 * @param codigo Código del estado; si no es uno conocido se usa `fallback`.
 * @param fallback Texto a mostrar para un código fuera del catálogo fijo.
 * @returns La etiqueta lista para la opción del combo.
 */
export function etiquetaOpcionEstado(codigo: string, fallback?: string): string {
  if (!esTicketEstado(codigo)) return fallback ?? codigo;
  const config = ESTADO_CONFIG[codigo];
  return `${config.emoji} ${config.label}`;
}

export interface StatusBadgeProps {
  estado: TicketEstado;
}

export function StatusBadge({ estado }: StatusBadgeProps) {
  const config = ESTADO_CONFIG[estado];
  return (
    <Badge data-testid="status-badge" variant="outline" className={cn(config.className)}>
      {config.badgeLabel}
    </Badge>
  );
}
