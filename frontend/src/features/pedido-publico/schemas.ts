import { z } from "zod";

/**
 * pedidoPublicoSchema — validación cliente-side del formulario público de pedido. Los límites
 * espejan a `PedidoPublicoDto` y `PedidoPendienteEntity` (backend): nombre 1-120, email hasta
 * 254, teléfono hasta 30, título 3-150, descripción 1-4000. El backend recorta los textos y sigue
 * siendo la fuente de verdad; acá se recorta igual para medir lo mismo que mide él.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico. Tarea: 16.3.
 */
export const PEDIDO_LIMITES = {
  nombreMax: 120,
  emailMax: 254,
  telefonoMax: 30,
  tituloMin: 3,
  tituloMax: 150,
  descripcionMax: 4000,
} as const;

export const pedidoPublicoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá tu nombre")
    .max(PEDIDO_LIMITES.nombreMax, `Máximo ${PEDIDO_LIMITES.nombreMax} caracteres`),
  email: z
    .string()
    .trim()
    .min(1, "Ingresá tu email")
    .email("Ingresá un email válido")
    .max(PEDIDO_LIMITES.emailMax, `Máximo ${PEDIDO_LIMITES.emailMax} caracteres`),
  telefono: z
    .string()
    .trim()
    .max(PEDIDO_LIMITES.telefonoMax, `Máximo ${PEDIDO_LIMITES.telefonoMax} caracteres`)
    .optional(),
  titulo: z
    .string()
    .trim()
    .min(PEDIDO_LIMITES.tituloMin, `Escribí al menos ${PEDIDO_LIMITES.tituloMin} caracteres`)
    .max(PEDIDO_LIMITES.tituloMax, `Máximo ${PEDIDO_LIMITES.tituloMax} caracteres`),
  descripcion: z
    .string()
    .trim()
    .min(1, "Contanos qué pasa")
    .max(PEDIDO_LIMITES.descripcionMax, `Máximo ${PEDIDO_LIMITES.descripcionMax} caracteres`),
});

export type PedidoPublicoFormValues = z.infer<typeof pedidoPublicoSchema>;
