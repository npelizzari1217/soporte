/**
 * T07 smoke test — validates ApiError, SessionExpiredError, and type contracts.
 * Validates T02 test infrastructure (Vitest + jsdom) is functional.
 *
 * Extended by auth-cliente-nombre: JwtPayload cliente_nombre contract.
 */
import { describe, it, expect } from "vitest";
import type { JwtPayload } from "./types";
import { ApiError, SessionExpiredError } from "./types";

describe("JwtPayload — contrato de tipo", () => {
  it("acepta payload sin cliente_nombre (tokens legados)", () => {
    const payload: JwtPayload = {
      sub: "uuid-1",
      cliente_id: "c-uuid",
      email: "a@b.com",
      roles: [],
      permisos: [],
    };
    expect(payload.cliente_nombre).toBeUndefined();
  });

  it("acepta payload con cliente_nombre (tokens nuevos)", () => {
    const payload: JwtPayload = {
      sub: "uuid-1",
      cliente_id: "c-uuid",
      email: "a@b.com",
      roles: [],
      permisos: [],
      cliente_nombre: "Acme Corp",
    };
    expect(payload.cliente_nombre).toBe("Acme Corp");
  });
});

describe("ApiError", () => {
  it("is discriminable by instanceof", () => {
    const err = new ApiError(400, "bad input");
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores statusCode and message", () => {
    const err = new ApiError(422, "campo requerido", ["campo requerido", "email inválido"]);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe("campo requerido");
    expect(err.messages).toEqual(["campo requerido", "email inválido"]);
  });

  it("defaults messages to [message] when not provided", () => {
    const err = new ApiError(404, "not found");
    expect(err.messages).toEqual(["not found"]);
  });

  it("name is ApiError", () => {
    expect(new ApiError(500, "oops").name).toBe("ApiError");
  });

  it("stores raw payload", () => {
    const raw = { statusCode: 400, message: "bad" };
    const err = new ApiError(400, "bad", ["bad"], raw);
    expect(err.raw).toBe(raw);
  });
});

describe("SessionExpiredError", () => {
  it("extends ApiError with statusCode 401", () => {
    const err = new SessionExpiredError();
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
  });

  it("name is SessionExpiredError", () => {
    expect(new SessionExpiredError().name).toBe("SessionExpiredError");
  });
});

/**
 * T1.8 [RED → GREEN T1.9] — JwtPayload.is_global_admin claim
 *
 * Spec ref: auth-rbac/Claim is_global_admin disponible en JwtPayload frontend
 * Tarea: T1.8 (PR1, admin-general)
 *
 * RED: tsc --noEmit falla porque is_global_admin no existe aún en JwtPayload.
 * GREEN (T1.9): se agrega is_global_admin?: boolean y tsc pasa.
 */
describe("JwtPayload — is_global_admin claim (admin-general)", () => {
  it("acepta payload con is_global_admin: true (admin global)", () => {
    const payload: JwtPayload = {
      sub: "uuid-1",
      cliente_id: "c-uuid",
      email: "nestor@sesitec.com.ar",
      roles: [],
      permisos: [],
      is_global_admin: true,
    };
    expect(payload.is_global_admin).toBe(true);
  });

  it("acepta payload con is_global_admin: false (usuario normal)", () => {
    const payload: JwtPayload = {
      sub: "uuid-2",
      cliente_id: "c-uuid",
      email: "user@test.com",
      roles: ["ADMINISTRADOR"],
      permisos: [],
      is_global_admin: false,
    };
    expect(payload.is_global_admin).toBe(false);
  });

  it("acepta payload sin is_global_admin (retrocompatibilidad — tokens legados)", () => {
    const payload: JwtPayload = {
      sub: "uuid-3",
      cliente_id: "c-uuid",
      email: "legacy@test.com",
      roles: [],
      permisos: [],
    };
    expect(payload.is_global_admin).toBeUndefined();
  });

  it("cliente_nombre sigue presente sin regresión (auth-cliente-nombre)", () => {
    const payload: JwtPayload = {
      sub: "uuid-4",
      cliente_id: "c-uuid",
      email: "a@b.com",
      roles: [],
      permisos: [],
      cliente_nombre: "Test Corp",
      is_global_admin: true,
    };
    expect(payload.cliente_nombre).toBe("Test Corp");
  });
});
