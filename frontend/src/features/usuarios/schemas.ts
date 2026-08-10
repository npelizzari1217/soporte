import { z } from "zod";

/** `rolCodigo`: mayúsculas/guion bajo, sin espacios (espejo de `ROL_CODIGO_PATTERN` backend). */
const ROL_CODIGO_PATTERN = /^[A-Z_]+$/;

export const crearUsuarioTenantSchema = z.object({
  email: z.string().email("Email inválido"),
  nombre: z.string().min(1, "Requerido"),
  apellido: z.string().min(1, "Requerido"),
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
  nombre: z.string().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
  apellido: z.string().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
});
export type EditarUsuarioFormValues = z.infer<typeof editarUsuarioSchema>;
