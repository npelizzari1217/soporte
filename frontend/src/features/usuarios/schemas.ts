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

/** Edición de identidad del usuario: nombre y apellido (el email no se edita). */
export const editarUsuarioSchema = z.object({
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
});
export type EditarUsuarioFormValues = z.infer<typeof editarUsuarioSchema>;
