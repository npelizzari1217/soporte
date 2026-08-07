import { z } from "zod";

/**
 * loginSchema — validación cliente-side del formulario de login.
 * Espejo mínimo de las reglas del backend (email válido, password no vacía);
 * el backend sigue siendo la fuente de verdad de autenticación real.
 *
 * Spec: PR11 — LoginForm (react-hook-form + zod).
 */
export const loginSchema = z.object({
  email: z.string().min(1, "El email es requerido").email("Ingresá un email válido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
