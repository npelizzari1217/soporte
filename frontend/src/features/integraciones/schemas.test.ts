import { describe, it, expect } from "vitest";
import {
  entregasWebhookSchema,
  guardarWebhookBodySchema,
  secretoWebhookSchema,
  webhookConfigSchema,
  webhookGuardadoSchema,
} from "./schemas";

/** Schemas del webhook (webhooks, T7): espejo de las cuatro vistas de `WebhookController` y del formulario. */
const CONFIGURADO = {
  configurado: true,
  url: "https://erp.example.com/hooks",
  eventos: ["TICKET_CREADO", "TICKET_COMENTADO"],
  activo: true,
  creadoEn: "2026-10-13T12:00:00.000Z",
  actualizadoEn: "2026-10-13T12:00:00.000Z",
};

const SIN_CONFIGURAR = {
  configurado: false,
  url: null,
  eventos: null,
  activo: null,
  creadoEn: null,
  actualizadoEn: null,
};

const ENTREGA = {
  id: "e-1",
  evento: "ticket.creado",
  ticketId: "t-1",
  numero: "SOP-2026-00042",
  estado: "PENDIENTE",
  intentos: 1,
  ultimoCodigo: 500,
  ultimoError: "HTTP 500",
  createdAt: "2026-10-13T12:00:00.000Z",
  proximoIntentoAt: "2026-10-13T12:01:00.000Z",
  entregadaAt: null,
};

describe("schemas del webhook", () => {
  it("la configuración acepta un destino configurado", () => {
    expect(webhookConfigSchema.parse(CONFIGURADO)).toEqual(CONFIGURADO);
  });

  it("la configuración acepta configurado: false con todo en null", () => {
    expect(webhookConfigSchema.parse(SIN_CONFIGURAR)).toEqual(SIN_CONFIGURAR);
  });

  it("la configuración descarta un secreto que llegara por error", () => {
    expect(webhookConfigSchema.parse({ ...CONFIGURADO, secreto: "whsec_x" })).not.toHaveProperty("secreto");
  });

  it("la configuración rechaza un evento que el backend no conoce", () => {
    expect(webhookConfigSchema.safeParse({ ...CONFIGURADO, eventos: ["TICKET_BORRADO"] }).success).toBe(false);
  });

  it("la respuesta del guardado lleva el secreto solo cuando el backend lo manda", () => {
    expect(webhookGuardadoSchema.parse({ ...CONFIGURADO, secreto: "whsec_abc" }).secreto).toBe("whsec_abc");
    expect(webhookGuardadoSchema.parse(CONFIGURADO).secreto).toBeUndefined();
  });

  it("regenerar exige un secreto no vacío", () => {
    expect(secretoWebhookSchema.parse({ secreto: "whsec_abc" })).toEqual({ secreto: "whsec_abc" });
    expect(secretoWebhookSchema.safeParse({ secreto: "" }).success).toBe(false);
  });

  it("el registro de entregas acepta la página con nulos y rechaza un estado desconocido", () => {
    const entregada = { ...ENTREGA, id: "e-2", numero: null, estado: "ENTREGADA", ultimoCodigo: 200, ultimoError: null, proximoIntentoAt: null, entregadaAt: "2026-10-13T12:00:01.000Z" };
    const pagina = { items: [ENTREGA, entregada], total: 2, pagina: 1, porPagina: 20 };
    expect(entregasWebhookSchema.parse(pagina)).toEqual(pagina);
    expect(entregasWebhookSchema.safeParse({ ...pagina, items: [{ ...ENTREGA, estado: "PERDIDA" }] }).success).toBe(false);
  });
});

describe("guardarWebhookBodySchema", () => {
  const valido = { url: "  https://erp.example.com/hooks  ", eventos: ["TICKET_CREADO"], activo: false };

  it("acepta una URL https, recorta espacios y conserva activo", () => {
    expect(guardarWebhookBodySchema.parse(valido)).toEqual({ ...valido, url: "https://erp.example.com/hooks" });
  });

  it.each([
    ["", "Ingresá la URL del webhook."],
    ["http://erp.example.com/hooks", "La URL tiene que empezar con https://."],
    ["no es una url", "La URL tiene que empezar con https://."],
    [`https://erp.example.com/${"a".repeat(2048)}`, "La URL admite hasta 2048 caracteres."],
  ])("rechaza la URL %j", (url, mensaje) => {
    const resultado = guardarWebhookBodySchema.safeParse({ ...valido, url });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([mensaje]);
  });

  it("exige al menos un evento", () => {
    const resultado = guardarWebhookBodySchema.safeParse({ ...valido, eventos: [] });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual(["Elegí al menos un evento."]);
  });

  it("exige activo booleano", () => {
    expect(guardarWebhookBodySchema.safeParse({ ...valido, activo: "si" }).success).toBe(false);
  });
});
