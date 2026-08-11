import { z } from "zod";
import { MODULOS } from "@/shared/auth/modulo-access";

/**
 * Validación cliente-side de los forms de catálogos (Admin > Catálogos,
 * T4.2/T4.3). Espejo mínimo de `CreateTipoTicketDto`/`CreatePrioridadDto` —
 * el backend sigue siendo la fuente de verdad real (422 en codigo duplicado
 * o colisión de prefijo derivado, `PrefijoTipoTicketColisionError`).
 */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

export const tipoTicketSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .regex(CODIGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  nombre: z.string().min(1, "El nombre es requerido"),
  // B2: el módulo es requerido — reusa `MODULOS` (única fuente de verdad,
  // `shared/auth/modulo-access`). El placeholder "" del select cae acá.
  modulo: z.enum(MODULOS, { errorMap: () => ({ message: "El módulo es requerido" }) }),
});
export type TipoTicketFormValues = z.infer<typeof tipoTicketSchema>;

export const prioridadSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .regex(CODIGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  nombre: z.string().min(1, "El nombre es requerido"),
  color: z.string().optional().or(z.literal("")),
  orden: z.coerce.number().int("El orden debe ser un número entero"),
});
export type PrioridadFormValues = z.infer<typeof prioridadSchema>;
