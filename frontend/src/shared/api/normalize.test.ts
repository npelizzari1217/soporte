import { describe, it, expect } from "vitest";
import { normalize } from "@/shared/api/normalize";
import { ApiError } from "@/shared/api/types";

// Spec: [SPEC:frontend-api-client/normalizacion-respuestas]
// Spec: [SPEC:frontend-api-client/normalizacion-errores]

describe("normalize", () => {
  it("200 + JSON → returns parsed body without modification", async () => {
    const res = new Response(JSON.stringify({ id: "1", nombre: "Ticket #1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const result = await normalize<{ id: string; nombre: string }>(res);
    expect(result).toEqual({ id: "1", nombre: "Ticket #1" });
  });

  it("204 No Content → returns undefined without attempting JSON parse", async () => {
    const res = new Response(null, { status: 204 });
    const result = await normalize<void>(res);
    expect(result).toBeUndefined();
  });

  it("400 + message string → throws ApiError(400, 'bad input', ['bad input'])", async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 400, message: "bad input" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
    const err = (await normalize(res).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("bad input");
    expect(err.messages).toEqual(["bad input"]);
  });

  it("422 + message array → throws ApiError(422) with first element as message and full array as messages", async () => {
    const res = new Response(
      JSON.stringify({
        statusCode: 422,
        message: ["campo req", "email inválido"],
      }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
    const err = (await normalize(res).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe("campo req");
    expect(err.messages).toEqual(["campo req", "email inválido"]);
  });

  it("TypeError (network) → throws ApiError(0, 'Error de red')", async () => {
    // Simulate a TypeError thrown during response body parsing
    const badRes = {
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => {
        throw new TypeError("Failed to fetch");
      },
      text: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as Response;

    const err = (await normalize(badRes).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(0);
    expect(err.message).toBe("Error de red");
  });
});
