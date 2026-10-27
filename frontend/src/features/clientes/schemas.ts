import { z } from "zod";
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_SLUG_MAX_LENGTH,
  CLIENTE_SLUG_REGEX,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
  CLIENTE_SMTP_TEXTO_MAX_LENGTH,
  CLIENTE_IA_CLAVE_MAX_LENGTH,
  CLIENTE_IA_MODELO_MAX_LENGTH,
  CLIENTE_IA_URL_MAX_LENGTH,
} from "./limites";
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from "@/shared/lib/limites-usuario";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

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
 * Espejo de `ConfigurarFormularioPublicoDto` (backend) y de `SLUG_REGEX` de
 * `slug-cliente.ts`. El backend es la autoridad: además rechaza un slug con
 * forma de UUID o igual al `id`/`dbName` del cliente, y eso el front no lo
 * puede saber, así que lo muestra el 400.
 */
export const configurarFormularioPublicoSchema = z.object({
  slug: z
    .string()
    .min(1, "El slug es requerido")
    .max(CLIENTE_SLUG_MAX_LENGTH, mensajeDemasiadoLargo("El slug", CLIENTE_SLUG_MAX_LENGTH))
    .regex(CLIENTE_SLUG_REGEX, "Usá solo minúsculas, números y guiones, sin empezar ni terminar con guion"),
  habilitado: z.boolean(),
});
export type ConfigurarFormularioPublicoFormValues = z.infer<typeof configurarFormularioPublicoSchema>;

/**
 * Espejo de `ConfigurarIaClienteDto` y de las validaciones del dominio (`validarUrlIa`,
 * `validarModeloIa`, `validarClaveIa`). Los topes se miden sobre el valor recortado, como el
 * backend: un modelo de solo espacios es un modelo vacío. La clave es requerida solo la primera
 * vez (`yaConfigurado=false`); vacía, se conserva la guardada y no se manda.
 */
export function configurarIaSchema(yaConfigurado: boolean) {
  return z
    .object({
      url: z
        .string()
        .trim()
        .min(1, "La URL es requerida")
        .max(CLIENTE_IA_URL_MAX_LENGTH, mensajeDemasiadoLargo("La URL", CLIENTE_IA_URL_MAX_LENGTH))
        .refine(esUrlHttps, "La URL debe empezar con https:// y no llevar usuario ni contraseña"),
      modelo: z
        .string()
        .trim()
        .min(1, "El modelo es requerido")
        .max(CLIENTE_IA_MODELO_MAX_LENGTH, mensajeDemasiadoLargo("El modelo", CLIENTE_IA_MODELO_MAX_LENGTH)),
      clave: z
        .string()
        .trim()
        .max(CLIENTE_IA_CLAVE_MAX_LENGTH, mensajeDemasiadoLargo("La clave", CLIENTE_IA_CLAVE_MAX_LENGTH)),
    })
    .refine((data) => yaConfigurado || data.clave.length > 0, {
      message: "La clave es requerida para la primera configuración",
      path: ["clave"],
    });
}
export type ConfigurarIaFormValues = z.infer<ReturnType<typeof configurarIaSchema>>;

/** URL absoluta HTTPS sin credenciales embebidas, como `validarUrlIa` del backend. */
function esUrlHttps(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
