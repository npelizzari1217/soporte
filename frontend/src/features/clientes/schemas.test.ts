import { describe, expect, it } from "vitest";
import { configurarCorreoSchema, crearClienteSchema, editarClienteSchema } from "./schemas";

/**
 * Estos schemas son espejo de las reglas `class-validator` de `cliente.dto.ts`.
 * El backend sigue siendo la fuente de verdad; el schema del front solo adelanta
 * el rechazo al formulario.
 *
 * Un schema MÁS LAXO que el backend rompe justamente eso: el form acepta, el
 * servidor devuelve 400, y el usuario se come un error remoto por algo que se
 * podía ver en el acto — con el agravante de que el texto ya tipeado se pierde.
 *
 * De dónde sale cada tope, que NO es uniforme:
 *
 * - `cuit` → `CLIENTE_CUIT_MAX_LENGTH` en `ClienteEntity`, importado por
 *   `cliente.dto.ts`. Las tres capas atadas a `cuit VARCHAR(13)`.
 * - `host`/`user`/`from` → `@MaxLength(255)` de `ConfigurarCorreoClienteDto`,
 *   que coincide exacto con `smtp_host`/`smtp_user`/`smtp_from VarChar(255)`.
 * - `nombre`/`razonSocial` → `@MaxLength(200)` de `UpdateClienteDto`. Más
 *   estricto que la columna, que es `VarChar(255)` en las dos.
 *
 * OJO con el bloque de `crearClienteSchema`: `CreateClienteDto` NO declara
 * `@MaxLength` para `nombre` ni `razonSocial` (sí para `cuit`). Esos dos casos
 * no espejan nada del alta — adelantan al formulario el tope que el backend
 * solo aplica en la EDICIÓN, y el POST directo sigue sin guard. Pendiente del
 * lado del servidor.
 */

const CLIENTE_VALIDO = {
  nombre: "Cliente S.A.",
  razonSocial: "Cliente Sociedad Anónima",
  cuit: "30-12345678-9",
  adminEmail: "admin@cliente.com",
  adminNombre: "Ada",
  adminApellido: "Lovelace",
  adminPassword: "unaClaveLarga",
};

const EDICION_VALIDA = {
  nombre: "Cliente S.A.",
  razonSocial: "Cliente Sociedad Anónima",
  cuit: "30-12345678-9",
};

const CORREO_VALIDO = {
  host: "smtp.cliente.com",
  port: 587,
  user: "notificaciones@cliente.com",
  secure: true,
  from: "Soporte <notificaciones@cliente.com>",
  password: "unaClaveLarga",
};

/** Cadena de exactamente `n` caracteres. */
const largo = (n: number) => "a".repeat(n);

describe("crearClienteSchema — topes espejados de CreateClienteDto", () => {
  it("acepta los valores en el límite exacto", () => {
    const resultado = crearClienteSchema.safeParse({
      ...CLIENTE_VALIDO,
      nombre: largo(200),
      razonSocial: largo(200),
      cuit: largo(13),
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un nombre de 201 caracteres (backend: @MaxLength(200))", () => {
    const resultado = crearClienteSchema.safeParse({ ...CLIENTE_VALIDO, nombre: largo(201) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza una razón social de 201 caracteres (backend: @MaxLength(200))", () => {
    const resultado = crearClienteSchema.safeParse({ ...CLIENTE_VALIDO, razonSocial: largo(201) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un CUIT de 14 caracteres (columna: cuit VARCHAR(13))", () => {
    const resultado = crearClienteSchema.safeParse({ ...CLIENTE_VALIDO, cuit: largo(14) });
    expect(resultado.success).toBe(false);
  });

  it("sigue aceptando razón social y CUIT vacíos: el tope no los vuelve obligatorios", () => {
    const resultado = crearClienteSchema.safeParse({ ...CLIENTE_VALIDO, razonSocial: "", cuit: "" });
    expect(resultado.success).toBe(true);
  });
});

describe("editarClienteSchema — topes espejados de UpdateClienteDto", () => {
  it("acepta los valores en el límite exacto", () => {
    const resultado = editarClienteSchema.safeParse({
      nombre: largo(200),
      razonSocial: largo(200),
      cuit: largo(13),
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un nombre de 201 caracteres (backend: @MaxLength(200))", () => {
    const resultado = editarClienteSchema.safeParse({ ...EDICION_VALIDA, nombre: largo(201) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza una razón social de 201 caracteres (backend: @MaxLength(200))", () => {
    const resultado = editarClienteSchema.safeParse({ ...EDICION_VALIDA, razonSocial: largo(201) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un CUIT de 14 caracteres (columna: cuit VARCHAR(13))", () => {
    const resultado = editarClienteSchema.safeParse({ ...EDICION_VALIDA, cuit: largo(14) });
    expect(resultado.success).toBe(false);
  });
});

describe("configurarCorreoSchema — topes espejados de ConfigurarCorreoClienteDto", () => {
  const schema = configurarCorreoSchema(false);

  it("acepta los valores en el límite exacto", () => {
    const resultado = schema.safeParse({
      ...CORREO_VALIDO,
      host: largo(255),
      user: largo(255),
      from: largo(255),
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un host de 256 caracteres (backend: @MaxLength(255))", () => {
    const resultado = schema.safeParse({ ...CORREO_VALIDO, host: largo(256) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un usuario de 256 caracteres (backend: @MaxLength(255))", () => {
    const resultado = schema.safeParse({ ...CORREO_VALIDO, user: largo(256) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un remitente de 256 caracteres (backend: @MaxLength(255))", () => {
    const resultado = schema.safeParse({ ...CORREO_VALIDO, from: largo(256) });
    expect(resultado.success).toBe(false);
  });

  it("con el correo ya configurado, la contraseña vacía sigue siendo válida", () => {
    const resultado = configurarCorreoSchema(true).safeParse({ ...CORREO_VALIDO, password: undefined });
    expect(resultado.success).toBe(true);
  });
});

/**
 * El mensaje del tope tiene que LLEGAR al usuario, no solo existir.
 *
 * Un schema puede rechazar correctamente y aun así mostrar el copy equivocado:
 * un assert de `success === false` pasa igual con el mensaje en inglés, o con
 * el tope de otro campo. Estos casos fijan el texto exacto.
 *
 * Lo que este bloque NO prueba, para que nadie se confunde: envolver el campo
 * en una unión (`.or(z.literal(""))`) no cambia el mensaje. Se midió con zod
 * 3.25.76 — reintroducir el `.or` deja los 20 casos en verde, y el issue sigue
 * llegando como `too_big` con su texto en español, no como `invalid_union` con
 * "Invalid input". El `.or` se sacó por redundante (`z.string().max(n)` sin
 * `.min` ya acepta la cadena vacía), no porque rompiera el copy.
 */
describe("el mensaje del tope llega al usuario, en español", () => {
  const mensajesDe = (resultado: { success: boolean; error?: { issues: { code: string; message: string }[] } }) =>
    resultado.success ? [] : (resultado.error?.issues ?? []).map((issue) => issue.message);

  it.each([
    ["nombre", { nombre: largo(201) }, "El nombre no puede superar los 200 caracteres"],
    ["razonSocial", { razonSocial: largo(201) }, "La razón social no puede superar los 200 caracteres"],
    ["cuit", { cuit: largo(14) }, "El CUIT no puede superar los 13 caracteres"],
  ])("crearClienteSchema — %s", (_campo, invalido, esperado) => {
    expect(mensajesDe(crearClienteSchema.safeParse({ ...CLIENTE_VALIDO, ...invalido }))).toContain(
      esperado,
    );
  });

  it.each([
    ["host", { host: largo(256) }, "El host no puede superar los 255 caracteres"],
    ["user", { user: largo(256) }, "El usuario no puede superar los 255 caracteres"],
    ["from", { from: largo(256) }, "El remitente no puede superar los 255 caracteres"],
  ])("configurarCorreoSchema — %s", (_campo, invalido, esperado) => {
    expect(
      mensajesDe(configurarCorreoSchema(false).safeParse({ ...CORREO_VALIDO, ...invalido })),
    ).toContain(esperado);
  });
});
