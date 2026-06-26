/**
 * T07 smoke test — validates ApiError, SessionExpiredError, and type contracts.
 * Validates T02 test infrastructure (Vitest + jsdom) is functional.
 */
import { describe, it, expect } from "vitest";
import { ApiError, SessionExpiredError } from "./types";

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
