import { describe, expect, it } from "vitest";
import { loginSchema, proveedoresSsoSchema, restablecerPasswordSchema, solicitarResetSchema } from "./schemas";

describe("loginSchema", () => {
  it("valid email + non-empty password → parses successfully", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "secret123" });
    expect(result.success).toBe(true);
  });

  it("invalid email format → fails with a Spanish validation message", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Ingresá un email válido");
    }
  });

  it("empty password → fails validation", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("empty email → fails validation", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret123" });
    expect(result.success).toBe(false);
  });
});

describe("solicitarResetSchema", () => {
  it("valid email → parses successfully", () => {
    const result = solicitarResetSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("invalid email format → fails with a Spanish validation message", () => {
    const result = solicitarResetSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Ingresá un email válido");
    }
  });
});

describe("restablecerPasswordSchema", () => {
  it("passwordNueva y repetirPassword iguales, con largo mínimo → parsea", () => {
    const result = restablecerPasswordSchema.safeParse({
      passwordNueva: "nuevaClave123",
      repetirPassword: "nuevaClave123",
    });
    expect(result.success).toBe(true);
  });

  it("passwordNueva menor a 8 caracteres → falla", () => {
    const result = restablecerPasswordSchema.safeParse({
      passwordNueva: "corta1",
      repetirPassword: "corta1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Mínimo 8 caracteres");
    }
  });

  it("passwordNueva y repetirPassword distintas → falla en repetirPassword", () => {
    const result = restablecerPasswordSchema.safeParse({
      passwordNueva: "nuevaClave123",
      repetirPassword: "otraClave456",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Las contraseñas no coinciden");
      expect(result.error.issues[0].path).toEqual(["repetirPassword"]);
    }
  });
});

describe("proveedoresSsoSchema", () => {
  it("lista con ambos proveedores → parsea", () => {
    const result = proveedoresSsoSchema.safeParse({ proveedores: ["google", "microsoft"] });
    expect(result.success).toBe(true);
  });

  it("lista vacía → parsea", () => {
    expect(proveedoresSsoSchema.safeParse({ proveedores: [] }).success).toBe(true);
  });

  it("proveedor desconocido → falla", () => {
    expect(proveedoresSsoSchema.safeParse({ proveedores: ["github"] }).success).toBe(false);
  });

  it("sin la clave `proveedores` → falla", () => {
    expect(proveedoresSsoSchema.safeParse({}).success).toBe(false);
  });
});
