/**
 * Modalidad de ejecución del ticket (odd/edilicia-obra-externa, S1). Espejo de `MODALIDADES_TICKET`
 * del backend (`ticket.entity.ts`), que la base valida con un CHECK.
 */
export const MODALIDADES_TICKET = ["INTERNA", "EXTERNA"] as const;
export type ModalidadTicket = (typeof MODALIDADES_TICKET)[number];

/** Valor del alta cuando nadie elige otro: el comportamiento de siempre. */
export const MODALIDAD_POR_DEFECTO: ModalidadTicket = "INTERNA";

/** Texto de cada opción, tal como la lee el usuario. */
export const ETIQUETA_MODALIDAD: Record<ModalidadTicket, string> = {
  INTERNA: "Técnicos internos",
  EXTERNA: "Contratista externo",
};

/** Motivo visible cuando el backend informa que la modalidad ya no se puede cambiar. */
export const MOTIVO_MODALIDAD_NO_EDITABLE =
  "La modalidad solo se puede cambiar mientras el ticket no tenga tareas ni compras vinculadas.";
