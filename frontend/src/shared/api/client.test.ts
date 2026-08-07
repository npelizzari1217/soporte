import { describe, expect, it } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../test/msw/server";
import { apiFetch } from "./client";
import { ApiError, SessionExpiredError } from "./types";

// Spec: PR11 — apiFetch: fetch autenticado same-origin `/api/...` con refresh
// transparente single-flight ante 401 (dedupe con refreshPromise ??=).

describe("apiFetch", () => {
  it("2xx → returns the parsed JSON body as T", async () => {
    server.use(
      http.get("/api/tickets/1", () =>
        HttpResponse.json({ id: "1", nombre: "Ticket 1" }),
      ),
    );

    const result = await apiFetch<{ id: string; nombre: string }>("tickets/1");
    expect(result).toEqual({ id: "1", nombre: "Ticket 1" });
  });

  it("single 401 → refreshes once via /api/auth/refresh, then retries original request once and returns its result", async () => {
    let ticketCallCount = 0;
    let refreshCallCount = 0;

    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
      http.get("/api/tickets/1", () => {
        ticketCallCount += 1;
        if (ticketCallCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: "1", nombre: "Ticket 1 (post-refresh)" });
      }),
    );

    const result = await apiFetch<{ id: string; nombre: string }>("tickets/1");

    expect(result).toEqual({ id: "1", nombre: "Ticket 1 (post-refresh)" });
    expect(refreshCallCount).toBe(1);
    expect(ticketCallCount).toBe(2);
  });

  it("N concurrent 401s → triggers exactly ONE refresh call (single-flight dedupe)", async () => {
    let refreshCallCount = 0;
    // Tracks which ticket ids already saw their forced 401 — each unique path
    // fails exactly once, then succeeds on the post-refresh retry.
    const seen = new Set<string>();

    server.use(
      http.post("/api/auth/refresh", async () => {
        refreshCallCount += 1;
        await delay(30); // hold the refresh in-flight so concurrent 401s overlap
        return HttpResponse.json({ ok: true });
      }),
      http.get("/api/tickets/:id", ({ params }) => {
        const key = String(params.id);
        if (!seen.has(key)) {
          seen.add(key);
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: params.id, nombre: `Ticket ${params.id}` });
      }),
    );

    const results = await Promise.all([
      apiFetch<{ id: string }>("tickets/1"),
      apiFetch<{ id: string }>("tickets/2"),
      apiFetch<{ id: string }>("tickets/3"),
    ]);

    expect(results.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(refreshCallCount).toBe(1);
  });

  it("refresh fails (401) → throws SessionExpiredError, does NOT retry the original request", async () => {
    let ticketCallCount = 0;

    server.use(
      http.post("/api/auth/refresh", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/tickets/1", () => {
        ticketCallCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiFetch("tickets/1")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(ticketCallCount).toBe(1); // no retry after refresh failure
  });

  it("retry after successful refresh still returns 401 → throws SessionExpiredError (no infinite loop)", async () => {
    server.use(
      http.post("/api/auth/refresh", () => HttpResponse.json({ ok: true })),
      http.get("/api/tickets/1", () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiFetch("tickets/1")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("path === 'auth/refresh' → skips the refresh loop entirely (prevents infinite recursion)", async () => {
    let refreshCallCount = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiFetch("auth/refresh", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(refreshCallCount).toBe(1);
  });

  it("4xx non-401 error → throws ApiError with the backend message, no refresh triggered", async () => {
    let refreshCallCount = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCallCount += 1;
        return HttpResponse.json({ ok: true });
      }),
      http.post("/api/tickets", () =>
        HttpResponse.json({ statusCode: 400, message: "nombre es requerido" }, { status: 400 }),
      ),
    );

    await expect(apiFetch("tickets", { method: "POST", json: {} })).rejects.toMatchObject({
      statusCode: 400,
      message: "nombre es requerido",
    });
    expect(refreshCallCount).toBe(0);
  });

  it("json shorthand → serializes body and sets Content-Type: application/json", async () => {
    let capturedBody: unknown = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post("/api/tickets", async ({ request }) => {
        capturedContentType = request.headers.get("content-type");
        capturedBody = await request.json();
        return HttpResponse.json({ id: "1" });
      }),
    );

    await apiFetch("tickets", { method: "POST", json: { nombre: "Nuevo ticket" } });

    expect(capturedContentType).toContain("application/json");
    expect(capturedBody).toEqual({ nombre: "Nuevo ticket" });
  });
});
