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

  it("4xx con `code` de dominio en el cuerpo → ApiError.code lo expone", async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 422, message: "Algo falló", code: "UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );

    await expect(normalize(res)).rejects.toMatchObject({
      statusCode: 422,
      code: "UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE",
    });
  });

  it("4xx sin `code`, o con un `code` que no es texto → ApiError.code queda undefined", async () => {
    for (const cuerpo of [{ statusCode: 400, message: "x" }, { statusCode: 400, message: "x", code: 42 }]) {
      const res = new Response(JSON.stringify(cuerpo), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

      const error = await normalize(res).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBeUndefined();
    }
  });
});
