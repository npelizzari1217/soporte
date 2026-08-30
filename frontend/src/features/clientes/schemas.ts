import { z } from "zod";
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
  CLIENTE_SMTP_TEXTO_MAX_LENGTH,
  mensajeDemasiadoLargo,
} from "./limites";

/** Espejo de `CreateClienteDto` (backend). Provisiona DB física + admin inicial — solo ROOT. */
export const crearClienteSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(CLIENTE_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", CLIENTE_NOMBRE_MAX_LENGTH)),
  razonSocial: z
    .string()
    .max(
      CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
      mensajeDemasiadoLargo("La razón social", CLIENTE_RAZON_SOCIAL_MAX_LENGTH),
    )
    .optional(),
  cuit: z
    .string()
    .max(CLIENTE_CUIT_MAX_LENGTH, mensajeDemasiadoLargo("El CUIT", CLIENTE_CUIT_MAX_LENGTH))
    .optional(),
  adminEmail: z.string().email("Email inválido"),
  adminNombre: z.string().min(1, "Requerido"),
  adminApellido: z.string().min(1, "Requerido"),
  adminPassword: z.string().min(8, "Mínimo 8 caracteres"),
});
export type CrearClienteFormValues = z.infer<typeof crearClienteSchema>;

/** Espejo de `UpdateClienteDto` (backend). Edición de datos comerciales — solo ROOT. dbName inmutable. */
export const editarClienteSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(CLIENTE_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", CLIENTE_NOMBRE_MAX_LENGTH)),
  razonSocial: z
    .string()
    .max(
      CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
      mensajeDemasiadoLargo("La razón social", CLIENTE_RAZON_SOCIAL_MAX_LENGTH),
    )
    .optional(),
  cuit: z
    .string()
    .max(CLIENTE_CUIT_MAX_LENGTH, mensajeDemasiadoLargo("El CUIT", CLIENTE_CUIT_MAX_LENGTH))
    .optional(),
});
export type EditarClienteFormValues = z.infer<typeof editarClienteSchema>;

/**
 * Espejo de `ConfigurarCorreoClienteDto` (backend, D7). `password` es
 * requerido SOLO al configurar por primera vez (`yaConfigurado=false`) — si
 * el cliente ya tiene correo configurado, dejarlo vacío preserva el actual
 * (nunca se valida ni se manda como `""`, ver `configurar-correo-dialog.tsx`).
 */
export function configurarCorreoSchema(yaConfigurado: boolean) {
  return z
    .object({
      host: z
        .string()
        .min(1, "El host es requerido")
        .max(
          CLIENTE_SMTP_TEXTO_MAX_LENGTH,
          mensajeDemasiadoLargo("El host", CLIENTE_SMTP_TEXTO_MAX_LENGTH),
        ),
      port: z.coerce
        .number({ invalid_type_error: "El puerto es requerido" })
        .int("El puerto debe ser un entero")
        .min(1, "Puerto inválido")
        .max(65535, "Puerto inválido"),
      user: z
        .string()
        .min(1, "El usuario es requerido")
        .max(
          CLIENTE_SMTP_TEXTO_MAX_LENGTH,
          mensajeDemasiadoLargo("El usuario", CLIENTE_SMTP_TEXTO_MAX_LENGTH),
        ),
      secure: z.boolean(),
      from: z
        .string()
        .min(1, "El remitente es requerido")
        .max(
          CLIENTE_SMTP_TEXTO_MAX_LENGTH,
          mensajeDemasiadoLargo("El remitente", CLIENTE_SMTP_TEXTO_MAX_LENGTH),
        ),
      password: z.string().optional(),
    })
    .refine((data) => yaConfigurado || !!data.password, {
      message: "La contraseña es requerida para la primera configuración",
      path: ["password"],
    });
}
export type ConfigurarCorreoFormValues = z.infer<ReturnType<typeof configurarCorreoSchema>>;
