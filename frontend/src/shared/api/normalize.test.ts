import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";
import { ApiError } from "./types";

// Spec: PR11 — apiFetch debe normalizar respuestas del BFF a T | throw ApiError.

describe("normalize", () => {
  it("204 No Content → returns undefined without parsing body", async () => {
    const res = new Response(null, { status: 204 });
    const result = await normalize<undefined>(res);
    expect(result).toBeUndefined();
  });

  it("2xx with JSON body → returns parsed body as T", async () => {
    const res = new Response(JSON.stringify({ id: "abc123", nombre: "Ticket 1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const result = await normalize<{ id: string; nombre: string }>(res);
    expect(result).toEqual({ id: "abc123", nombre: "Ticket 1" });
  });

  it("4xx with NestJS { statusCode, message } → throws ApiError with matching statusCode/message", async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 403, message: "Cliente no autorizado" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );

    try {
      await normalize(res);
      throw new Error("expected normalize to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(403);
      expect((err as ApiError).message).toBe("Cliente no autorizado");
    }
  });

  it("4xx with NestJS message as string[] → messages holds full array, message holds first entry", async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 400, message: ["email debe ser válido", "password muy corto"] }),
      { status: 400, headers: { "content-type": "application/json" } },
    );

    try {
      await normalize(res);
      throw new Error("expected normalize to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("email debe ser válido");
      expect((err as ApiError).messages).toEqual([
        "email debe ser válido",
        "password muy corto",
      ]);
    }
  });
});
