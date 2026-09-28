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

/**
 * cambiarPasswordSchema — validación cliente-side del diálogo de cambio de
 * contraseña. `repetirPassword` es SOLO del cliente (nunca viaja al backend,
 * ver `CambiarPasswordDialog`) — su único propósito es detectar un error de
 * tipeo antes de enviar. El backend valida `passwordNueva` con `MinLength(8)`.
 *
 * Spec: sdd/cambio-de-contrasena — WU4.
 */
export const cambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1, "La contraseña actual es requerida"),
    passwordNueva: z.string().min(8, "Mínimo 8 caracteres"),
    repetirPassword: z.string().min(1, "Repetí la nueva contraseña"),
  })
  .refine((data) => data.passwordNueva === data.repetirPassword, {
    message: "Las contraseñas no coinciden",
    path: ["repetirPassword"],
  });
export type CambiarPasswordFormValues = z.infer<typeof cambiarPasswordSchema>;

/**
 * solicitarResetSchema — validación cliente-side de la pantalla de "olvidé mi
 * contraseña" (`/olvide-password`). Espeja `SolicitarResetDto.email`
 * (`@IsEmail()`, `recuperacion-password.dto.ts`).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — WU-9. Design ADR-8, "Schemas".
 */
export const solicitarResetSchema = z.object({
  email: z.string().min(1, "El email es requerido").email("Ingresá un email válido"),
});
export type SolicitarResetFormValues = z.infer<typeof solicitarResetSchema>;

/**
 * restablecerPasswordSchema — validación cliente-side de la pantalla de
 * confirmación (`/restablecer-password`). Copia textual de
 * `cambiarPasswordSchema` (arriba) sin `passwordActual`: acá no hay
 * contraseña vigente que pedir, la posesión del token es la autorización
 * (design ADR-1, "Autorización"). `repetirPassword` tampoco viaja al
 * backend — espeja `ConfirmarResetDto.passwordNueva` (`@MinLength(8)`).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — WU-9. Design ADR-8, "Schemas".
 */
export const restablecerPasswordSchema = z
  .object({
    passwordNueva: z.string().min(8, "Mínimo 8 caracteres"),
    repetirPassword: z.string().min(1, "Repetí la nueva contraseña"),
  })
  .refine((data) => data.passwordNueva === data.repetirPassword, {
    message: "Las contraseñas no coinciden",
    path: ["repetirPassword"],
  });
export type RestablecerPasswordFormValues = z.infer<typeof restablecerPasswordSchema>;
