import { describe, expect, it } from "vitest";
import { crearUsuarioTenantSchema, editarUsuarioSchema } from "./schemas";
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from "@/shared/lib/limites-usuario";

/**
 * Los schemas de usuarios espejan `CreateUsuarioTenantDto` y `EditarUsuarioDto`,
 * que a su vez importan sus topes de `UsuarioEntity`. Un front más laxo manda al
 * usuario a comerse un error remoto por algo que se veía en pantalla, y le borra
 * lo tipeado.
 *
 * Hasta este cambio la EDICIÓN acotaba a 100 y el ALTA no acotaba nada, así que
 * un nombre de 120 se podía crear y después nunca editar.
 *
 * `email` SÍ lleva tope acá, aunque en el DTO no haga falta: `@IsEmail()` corta
 * en 254, pero `z.string().email()` es solo un regex y no acota nada. Ver el
 * bloque del final, que lo mide.
 */
const ALTA_VALIDA = {
  email: "nuevo@acme.com",
  nombre: "Ada",
  apellido: "Lovelace",
  password: "unaClaveLarga",
  rolCodigo: "TECNICO",
};

const largo = (n: number) => "a".repeat(n);

const mensajes = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);

describe("crearUsuarioTenantSchema — topes espejados del alta", () => {
  it("acepta nombre y apellido en el límite exacto", () => {
    const r = crearUsuarioTenantSchema.safeParse({
      ...ALTA_VALIDA,
      nombre: largo(USUARIO_NOMBRE_MAX_LENGTH),
      apellido: largo(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["nombre", USUARIO_NOMBRE_MAX_LENGTH],
    ["apellido", USUARIO_APELLIDO_MAX_LENGTH],
  ])("rechaza un %s que pasa el tope", (campo, max) => {
    const r = crearUsuarioTenantSchema.safeParse({ ...ALTA_VALIDA, [campo]: largo(max + 1) });
    expect(r.success).toBe(false);
  });

  it("el mensaje del tope llega en español", () => {
    const r = crearUsuarioTenantSchema.safeParse({
      ...ALTA_VALIDA,
      nombre: largo(USUARIO_NOMBRE_MAX_LENGTH + 1),
    });
    expect(mensajes(r)).toContain(`El nombre no puede superar los ${USUARIO_NOMBRE_MAX_LENGTH} caracteres`);
  });
});

describe("editarUsuarioSchema — el MISMO tope que el alta", () => {
  it("acepta los valores en el límite exacto", () => {
    const r = editarUsuarioSchema.safeParse({
      nombre: largo(USUARIO_NOMBRE_MAX_LENGTH),
      apellido: largo(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["nombre", USUARIO_NOMBRE_MAX_LENGTH],
    ["apellido", USUARIO_APELLIDO_MAX_LENGTH],
  ])("rechaza un %s que pasa el tope", (campo, max) => {
    const base = { nombre: "Ada", apellido: "Lovelace" };
    const r = editarUsuarioSchema.safeParse({ ...base, [campo]: largo(max + 1) });
    expect(r.success).toBe(false);
  });
});

/** Centinela: el alta y la edición no pueden divergir, que era el defecto original. */
it("el alta y la edición usan el mismo tope", () => {
  const pasado = { nombre: largo(USUARIO_NOMBRE_MAX_LENGTH + 1), apellido: "Lovelace" };
  expect(crearUsuarioTenantSchema.safeParse({ ...ALTA_VALIDA, ...pasado }).success).toBe(false);
  expect(editarUsuarioSchema.safeParse(pasado).success).toBe(false);
});

/**
 * `z.string().email()` NO acota el largo: es solo un regex. Medido — acepta un
 * email de 309 caracteres. `@IsEmail()` del backend SÍ corta en 254
 * (`validator`, `defaultMaxEmailLength`), así que sin este tope el front queda
 * MÁS LAXO que el servidor: 400 remoto por algo que se veía en pantalla.
 *
 * El número es 254 y no 255 (el ancho de la columna) a propósito: se espeja lo
 * que el backend REALMENTE rechaza, que es lo que el usuario se comería.
 */
describe("el email también necesita tope, porque zod no lo trae", () => {
  it("acepta un email en el límite exacto", () => {
    const email = "a".repeat(USUARIO_EMAIL_MAX_LENGTH - "@acme.com".length) + "@acme.com";
    expect(email).toHaveLength(USUARIO_EMAIL_MAX_LENGTH);
    expect(crearUsuarioTenantSchema.safeParse({ ...ALTA_VALIDA, email }).success).toBe(true);
  });

  it("rechaza un email que pasa el tope", () => {
    const email = "a".repeat(USUARIO_EMAIL_MAX_LENGTH + 1 - "@acme.com".length) + "@acme.com";
    expect(email.length).toBeGreaterThan(USUARIO_EMAIL_MAX_LENGTH);
    expect(crearUsuarioTenantSchema.safeParse({ ...ALTA_VALIDA, email }).success).toBe(false);
  });
});

/**
 * Centinela de VALOR, no de cableado.
 *
 * Los casos de arriba derivan sus largos de la propia constante, así que
 * verifican que el `.max()` esté enchufado pero NO que el número sea el
 * correcto: subirla a 500 los dejaría a todos en verde con el front otra vez
 * más laxo que el servidor. Este caso clava el número contra su autoridad real,
 * que es el `defaultMaxEmailLength` de `validator` — el que aplica `@IsEmail()`
 * del backend. Si alguien lo mueve, este test avisa.
 */
it("el tope de email es exactamente el que aplica @IsEmail del backend", () => {
  expect(USUARIO_EMAIL_MAX_LENGTH).toBe(254);
  expect(USUARIO_NOMBRE_MAX_LENGTH).toBe(100);
  expect(USUARIO_APELLIDO_MAX_LENGTH).toBe(100);
});
