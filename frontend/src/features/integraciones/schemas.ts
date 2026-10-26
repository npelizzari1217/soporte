/**
 * Schemas Zod de la pantalla "Integraciones" (api-publica, T9), espejo de
 * `PERMISOS_API` (`backend/src/integraciones/domain/api-clave.ts`), de
 * `ApiClaveVista` / `CrearApiClaveOutput` y de `CrearApiClaveDto`
 * (`backend/src/integraciones/interface/api-claves.controller.ts`). El backend
 * es la autoridad: esto valida la forma de la respuesta y arma el body del `POST`.
 */
import { z } from "zod";

/**
 * Espejo exacto de `PERMISOS_API`: los permisos que puede llevar una clave (CA3). Es un vocabulario
 * propio de la clave: no depende del catálogo de la matriz, que ya no tiene el módulo TICKETS (T9b).
 */
export const PERMISOS_API = ["TICKETS:LECTURA", "TICKETS:ALTAS", "TICKETS:COMENTAR"] as const;

export const permisoApiSchema = z.enum(PERMISOS_API);

/** Etiqueta visible de cada permiso; el valor que viaja es siempre el de `PERMISOS_API`. */
export const ETIQUETAS_PERMISO_API: Record<(typeof PERMISOS_API)[number], string> = {
  "TICKETS:LECTURA": "Ver tickets",
  "TICKETS:ALTAS": "Crear tickets",
  "TICKETS:COMENTAR": "Comentar tickets",
};

/** Espejo de `LARGO_MAXIMO_NOMBRE_CLAVE`. */
export const LARGO_MAXIMO_NOMBRE_CLAVE = 100;

/** Fila de `GET /integraciones/claves`: nunca trae el hash ni la clave en claro. */
export const apiClaveSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  prefijo: z.string(),
  permisos: z.array(permisoApiSchema),
  creadaAt: z.string(),
  ultimoUsoAt: z.string().nullable(),
  revocadaAt: z.string().nullable(),
});

export const apiClavesSchema = z.array(apiClaveSchema);

/** Respuesta 201 de `POST /integraciones/claves`: la ÚNICA que lleva `clave` en claro (CA9). */
export const apiClaveCreadaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  prefijo: z.string(),
  permisos: z.array(permisoApiSchema),
  creadaAt: z.string(),
  clave: z.string().min(1),
});

/** Body de `POST /integraciones/claves`, con la misma validación de nombre que el caso de uso. */
export const crearApiClaveBodySchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingrese un nombre para la clave.")
    .max(LARGO_MAXIMO_NOMBRE_CLAVE, `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_CLAVE} caracteres.`),
  permisos: z.array(permisoApiSchema).min(1, "Elija al menos un permiso."),
});

/*
 * Webhooks (webhooks, T7): espejo de las vistas de `WebhookController`
 * (`backend/src/integraciones/interface/webhook.controller.ts`). `eventos`
 * viaja con los códigos internos; el registro de entregas, con el nombre externo.
 */

/** Espejo de los eventos suscribibles: los cuatro que acepta `PUT /integraciones/webhook` (CA1). */
export const EVENTOS_WEBHOOK = ["TICKET_CREADO", "TICKET_ESTADO_CAMBIADO", "TICKET_ASIGNADO", "TICKET_COMENTADO"] as const;

export const eventoWebhookSchema = z.enum(EVENTOS_WEBHOOK);

export const ETIQUETAS_EVENTO_WEBHOOK: Record<(typeof EVENTOS_WEBHOOK)[number], string> = {
  TICKET_CREADO: "Ticket creado",
  TICKET_ESTADO_CAMBIADO: "Cambio de estado",
  TICKET_ASIGNADO: "Ticket asignado",
  TICKET_COMENTADO: "Comentario público",
};

/** Etiqueta del nombre externo que guarda cada entrega (`NOMBRE_EXTERNO_EVENTO_WEBHOOK`). */
export const ETIQUETAS_EVENTO_EXTERNO_WEBHOOK: Record<string, string> = {
  "ticket.creado": ETIQUETAS_EVENTO_WEBHOOK.TICKET_CREADO,
  "ticket.estado_cambiado": ETIQUETAS_EVENTO_WEBHOOK.TICKET_ESTADO_CAMBIADO,
  "ticket.asignado": ETIQUETAS_EVENTO_WEBHOOK.TICKET_ASIGNADO,
  "ticket.comentado": ETIQUETAS_EVENTO_WEBHOOK.TICKET_COMENTADO,
};

/** Espejo del largo máximo de `validarUrlDestino`. */
export const LARGO_MAXIMO_URL_WEBHOOK = 2048;

/**
 * Respuesta de `GET /integraciones/webhook`. Sin destino, `configurado` es
 * `false` y el resto llega en `null`. Zod descarta las claves que no declara,
 * así que un `secreto` que llegara por error nunca pasa de acá.
 */
export const webhookConfigSchema = z.object({
  configurado: z.boolean(),
  url: z.string().nullable(),
  eventos: z.array(eventoWebhookSchema).nullable(),
  activo: z.boolean().nullable(),
  creadoEn: z.string().nullable(),
  actualizadoEn: z.string().nullable(),
});

/** Respuesta de `PUT /integraciones/webhook`: la misma vista, con `secreto` SOLO cuando crea el destino. */
export const webhookGuardadoSchema = webhookConfigSchema.extend({ secreto: z.string().min(1).optional() });

/** Respuesta de `POST /integraciones/webhook/secreto`: el secreto nuevo en claro, una sola vez. */
export const secretoWebhookSchema = z.object({ secreto: z.string().min(1) });

export const entregaWebhookSchema = z.object({
  id: z.string(),
  evento: z.string(),
  ticketId: z.string(),
  numero: z.string().nullable(),
  estado: z.enum(["PENDIENTE", "ENTREGADA", "FALLIDA"]),
  intentos: z.number().int(),
  ultimoCodigo: z.number().int().nullable(),
  ultimoError: z.string().nullable(),
  createdAt: z.string(),
  proximoIntentoAt: z.string().nullable(),
  entregadaAt: z.string().nullable(),
});

/** Respuesta de `GET /integraciones/webhook/entregas`, la más nueva primero. */
export const entregasWebhookSchema = z.object({
  items: z.array(entregaWebhookSchema),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

/** Body de `PUT /integraciones/webhook`. El backend re-valida la URL y además resuelve el host. */
export const guardarWebhookBodySchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Ingrese la URL del webhook.")
    .max(LARGO_MAXIMO_URL_WEBHOOK, `La URL admite hasta ${LARGO_MAXIMO_URL_WEBHOOK} caracteres.`)
    .refine(esUrlHttps, "La URL tiene que empezar con https://."),
  eventos: z.array(eventoWebhookSchema).min(1, "Elija al menos un evento."),
  activo: z.boolean(),
});

function esUrlHttps(valor: string): boolean {
  if (valor.length === 0) return true; // ya lo informa `min(1)`
  try {
    return new URL(valor).protocol === "https:";
  } catch {
    return false;
  }
}
