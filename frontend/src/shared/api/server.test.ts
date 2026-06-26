import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { serverFetch } from "@/shared/api/server";
import { ApiError } from "@/shared/api/types";

// Spec: [SPEC:frontend-api-client/server-components]

// Use a dedicated test hostname so MSW intercepts it cleanly
const BACKEND = "http://testbackend";

describe("serverFetch", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("calls BACKEND_URL/api/path with Authorization: Bearer <at> extracted from Cookie header", async () => {
    let capturedAuth: string | null = null;
    let capturedUrl: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/tickets`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        capturedUrl = request.url;
        return HttpResponse.json({ id: "1", status: "open" });
      }),
    );

    await serverFetch("tickets", "at=token123; other=ignored");

    expect(capturedUrl).toBe(`${BACKEND}/api/tickets`);
    expect(capturedAuth).toBe("Bearer token123");
  });

  it("200 + JSON → returns parsed DTO", async () => {
    server.use(
      http.get(`${BACKEND}/api/tickets`, () =>
        HttpResponse.json({ id: "42", titulo: "Test ticket" }),
      ),
    );

    const result = await serverFetch<{ id: string; titulo: string }>(
      "tickets",
      "at=tok",
    );
    expect(result).toEqual({ id: "42", titulo: "Test ticket" });
  });

  it("204 → returns undefined", async () => {
    server.use(
      http.get(`${BACKEND}/api/tickets/1`, () => new HttpResponse(null, { status: 204 })),
    );

    const result = await serverFetch("tickets/1", "at=tok");
    expect(result).toBeUndefined();
  });

  it("401 → throws ApiError(401)", async () => {
    server.use(
      http.get(`${BACKEND}/api/tickets`, () => new HttpResponse(null, { status: 401 })),
    );

    const err = (await serverFetch("tickets", "at=expired").catch(
      (e) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
  });
});
