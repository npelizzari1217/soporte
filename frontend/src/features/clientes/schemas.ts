import { z } from "zod";
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
  CLIENTE_SMTP_TEXTO_MAX_LENGTH,
  CLIENTE_ZONA_HORARIA_MAX_LENGTH,
} from "./limites";
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from "@/shared/lib/limites-usuario";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import { esZonaValida } from "@/shared/lib/formato-fecha";

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
  adminEmail: z
    .string()
    .email("Email inválido")
    .max(
      USUARIO_EMAIL_MAX_LENGTH,
      mensajeDemasiadoLargo("El email del administrador", USUARIO_EMAIL_MAX_LENGTH),
    ),
  adminNombre: z
    .string()
    .min(1, "Requerido")
    .max(
      USUARIO_NOMBRE_MAX_LENGTH,
      mensajeDemasiadoLargo("El nombre del administrador", USUARIO_NOMBRE_MAX_LENGTH),
    ),
  adminApellido: z
    .string()
    .min(1, "Requerido")
    .max(
      USUARIO_APELLIDO_MAX_LENGTH,
      mensajeDemasiadoLargo("El apellido del administrador", USUARIO_APELLIDO_MAX_LENGTH),
    ),
  adminPassword: z.string().min(8, "Mínimo 8 caracteres"),
  /**
   * Obligatoria y sin default: un candidato vacío o inválido no pasa
   * `esZonaValida` (ver arriba), así que no hace falta un `.min(1)` aparte.
   */
  zonaHoraria: z.string().refine(esZonaValida, "Zona horaria inválida"),
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
      /**
       * SIN tope de largo, y no es un olvido: los otros tres campos de texto de
       * este schema lo llevan porque sus columnas son `VarChar(255)`, pero la
       * contraseña se persiste en `smtp_password_cifrada`, que es `@db.Text`
       * —sin límite— y guarda el payload CIFRADO, no lo que el usuario tipeó.
       * No hay nada que espejar: ni la columna puede desbordarse ni el DTO
       * declara un tope que el front pudiera contradecir.
       */
      password: z.string().optional(),
    })
    .refine((data) => yaConfigurado || !!data.password, {
      message: "La contraseña es requerida para la primera configuración",
      path: ["password"],
    });
}
export type ConfigurarCorreoFormValues = z.infer<ReturnType<typeof configurarCorreoSchema>>;

/**
 * Espejo de `ConfigurarZonaHorariaClienteDto` (backend, D1/D2) para el
 * diálogo de EDICIÓN de la zona operativa del tenant
 * (`configurar-zona-horaria-dialog.tsx`, tarea 2.13).
 *
 * Mismo mecanismo que `crearClienteSchema.zonaHoraria` desde C2a-front:
 * `z.string().refine(esZonaValida)`, NUNCA `z.enum` — D2 prohíbe validar
 * contra un catálogo (`Intl.supportedValuesOf('timeZone')` ni siquiera trae
 * `America/Argentina/Buenos_Aires`, la zona por defecto del proyecto). El
 * `.max()` es defensa en profundidad que espeja la columna
 * `clientes.zona_horaria VARCHAR(64)` — ver el JSDoc de
 * `CLIENTE_ZONA_HORARIA_MAX_LENGTH` en `./limites` sobre por qué ese tope no
 * tiene un caso de prueba propio que lo distinga de `esZonaValida`.
 *
 * NO se apunta `schemas.test.ts` a `crearClienteSchema` para probar esto:
 * ese schema es del diálogo de ALTA y ya estaba completo desde C2a-front:
 * un test ahí no dejaría ver la falta que este schema (el de EDICIÓN) tenía
 * hasta la tarea 2.13.
 */
export const configurarZonaHorariaSchema = z.object({
  zonaHoraria: z
    .string()
    .max(
      CLIENTE_ZONA_HORARIA_MAX_LENGTH,
      mensajeDemasiadoLargo("La zona horaria", CLIENTE_ZONA_HORARIA_MAX_LENGTH),
    )
    .refine(esZonaValida, "Zona horaria inválida"),
});
export type ConfigurarZonaHorariaFormValues = z.infer<typeof configurarZonaHorariaSchema>;
