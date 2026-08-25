/**
 * next.config.test.ts — el frontend espeja el contrato de entorno del backend.
 *
 * Sin esto, la mitad del arreglo de `sdd/fail-fast-env` WU-3 que vive en el
 * frontend viajaba sin ninguna prueba: el backend firma con el valor trimeado
 * (`leerValidada`, backend/src/config/validar-entorno.ts) y si acá no se
 * trimea, ningún token valida y todos los usuarios rebotan al login sin dejar
 * rastro en ningún log.
 */
import { describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";

const SECRETO_VALIDO = "jwt-secret-de-test";
const URL_VALIDA = "http://localhost:3000";

/**
 * Carga `next.config.ts` de cero con el entorno indicado, restaurando siempre
 * el `process.env` original.
 *
 * @param vars Valores a usar; `undefined` borra la variable.
 * @returns El objeto `env` que expone la config.
 */
async function cargarConfig(vars: {
  jwtSecret?: string | undefined;
  backendUrl?: string | undefined;
}): Promise<Record<string, string>> {
  const originales = {
    JWT_SECRET: process.env.JWT_SECRET,
    BACKEND_URL: process.env.BACKEND_URL,
  };
  const aplicar = (clave: string, valor: string | undefined): void => {
    if (valor === undefined) {
      delete process.env[clave];
    } else {
      process.env[clave] = valor;
    }
  };

  aplicar("JWT_SECRET", "jwtSecret" in vars ? vars.jwtSecret : SECRETO_VALIDO);
  aplicar("BACKEND_URL", "backendUrl" in vars ? vars.backendUrl : URL_VALIDA);

  vi.resetModules();
  try {
    const modulo = (await import("./next.config")) as { default: NextConfig };
    return (modulo.default.env ?? {}) as Record<string, string>;
  } finally {
    aplicar("JWT_SECRET", originales.JWT_SECRET);
    aplicar("BACKEND_URL", originales.BACKEND_URL);
    vi.resetModules();
  }
}

describe("next.config — JWT_SECRET", () => {
  it("trimea el secreto, para firmar y verificar con el mismo valor que el backend", async () => {
    const env = await cargarConfig({ jwtSecret: "  jwt-secret-con-padding  " });

    expect(env.JWT_SECRET).toBe("jwt-secret-con-padding");
  });

  it("deja intacto un secreto que ya viene limpio", async () => {
    const env = await cargarConfig({ jwtSecret: "jwt-secret-limpio" });

    expect(env.JWT_SECRET).toBe("jwt-secret-limpio");
  });

  it("corta el build cuando el secreto falta, nombrando la variable", async () => {
    await expect(cargarConfig({ jwtSecret: undefined })).rejects.toThrow(/JWT_SECRET/);
  });

  it("trata solo-espacios como ausente, igual que el backend", async () => {
    // `estaAusente` del backend (validar-entorno.ts) mete ausente, cadena
    // vacía y solo-espacios en la misma bolsa. Si acá solo se chequeara
    // nullish, "   " pasaría el `??` y se colaría como "" tras el trim.
    await expect(cargarConfig({ jwtSecret: "   " })).rejects.toThrow(/JWT_SECRET/);
  });
});

describe("next.config — BACKEND_URL", () => {
  it("trimea la URL, que se interpola en new URL() y en los fetch de auth", async () => {
    const env = await cargarConfig({ backendUrl: "  http://localhost:3000  " });

    expect(env.BACKEND_URL).toBe("http://localhost:3000");
  });

  it("sigue siendo opcional: ausente cae en cadena vacía y NO corta el build", async () => {
    // A diferencia de JWT_SECRET, volverla requerida es un cambio de
    // comportamiento propio y queda fuera de este work unit.
    const env = await cargarConfig({ backendUrl: undefined });

    expect(env.BACKEND_URL).toBe("");
  });
});
