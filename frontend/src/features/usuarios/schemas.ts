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
