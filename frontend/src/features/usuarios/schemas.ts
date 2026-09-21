import { z } from "zod";
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from "@/shared/lib/limites-usuario";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

/** `rolCodigo`: mayúsculas/guion bajo, sin espacios (espejo de `ROL_CODIGO_PATTERN` backend). */
const ROL_CODIGO_PATTERN = /^[A-Z_]+$/;

export const crearUsuarioTenantSchema = z.object({
  email: z
    .string()
    .email("Email inválido")
    .max(USUARIO_EMAIL_MAX_LENGTH, mensajeDemasiadoLargo("El email", USUARIO_EMAIL_MAX_LENGTH)),
  nombre: z
    .string()
    .min(1, "Requerido")
    .max(USUARIO_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", USUARIO_NOMBRE_MAX_LENGTH)),
  apellido: z
    .string()
    .min(1, "Requerido")
    .max(
      USUARIO_APELLIDO_MAX_LENGTH,
      mensajeDemasiadoLargo("El apellido", USUARIO_APELLIDO_MAX_LENGTH),
    ),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  rolCodigo: z.string().regex(ROL_CODIGO_PATTERN, "Rol inválido"),
});
export type CrearUsuarioTenantFormValues = z.infer<typeof crearUsuarioTenantSchema>;

export const cambiarRolSchema = z.object({
  rolCodigo: z.string().regex(ROL_CODIGO_PATTERN, "Rol inválido"),
});
export type CambiarRolFormValues = z.infer<typeof cambiarRolSchema>;

/**
 * Edición de identidad del usuario (nombre y apellido, el email no se edita)
 * MÁS el reset opcional de contraseña (ADR-6, `sdd/reset-de-contrasena-por-admin`).
 *
 * `password`/`repetirPassword` son `z.string()` planos, NO `.optional()`:
 * react-hook-form entrega un input de texto vacío como `""`, nunca como
 * `undefined`, así que `.optional()` no expresaría "no cambiar" sin normalizar
 * antes. Cadena vacía ES la señal de "no cambiar la contraseña".
 * `repetirPassword` es SOLO del cliente: NUNCA viaja al backend.
 * El `min(8)` es DERIVADO de `@MinLength(8)` del backend
 * (`usuario-tenant.dto.ts:51`), la misma autoridad que espeja
 * `crearUsuarioTenantSchema` (arriba). Los dos campos van `type="password"`
 * (enmascarados): el admin no puede releer lo tipeado, así que confirmarla dos
 * veces ES la relectura.
 */
export const editarUsuarioSchema = z
  .object({
    nombre: z
      .string()
      .min(1, "Requerido")
      .max(USUARIO_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", USUARIO_NOMBRE_MAX_LENGTH)),
    apellido: z
      .string()
      .min(1, "Requerido")
      .max(
        USUARIO_APELLIDO_MAX_LENGTH,
        mensajeDemasiadoLargo("El apellido", USUARIO_APELLIDO_MAX_LENGTH),
      ),
    password: z.string(),
    repetirPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password === "") return; // vacío = no cambiar
    if (data.password.length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Mínimo 8 caracteres" });
    }
    if (data.password !== data.repetirPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repetirPassword"],
        message: "Las contraseñas no coinciden",
      });
    }
  });
export type EditarUsuarioFormValues = z.infer<typeof editarUsuarioSchema>;
