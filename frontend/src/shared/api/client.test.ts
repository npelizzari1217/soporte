import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { apiFetch } from "@/shared/api/client";
import { ApiError, SessionExpiredError } from "@/shared/api/types";

// Spec: [SPEC:frontend-api-client/retry-401]
// Spec: [SPEC:frontend-api-client/single-flight]

const BASE = "http://localhost";

describe("apiFetch", () => {
  // ─── Basic success ──────────────────────────────────────────────────────────

  it("resolves JSON response as typed T", async () => {
    server.use(
      http.get(`${BASE}/api/tickets`, () =>
        HttpResponse.json([{ id: "1" }]),
      ),
    );
    const result = await apiFetch<{ id: string }[]>("tickets");
    expect(result).toEqual([{ id: "1" }]);
  });

  // ─── 401 + successful refresh → retry succeeds ──────────────────────────────

  it("401 → refresh 200 → retries original request → returns success", async () => {
    let ticketsCallCount = 0;
    let refreshCallCount = 0;

    server.use(
      http.get(`${BASE}/api/tickets`, () => {
        ticketsCallCount++;
        if (ticketsCallCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json([{ id: "1" }]);
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const result = await apiFetch<{ id: string }[]>("tickets");

    expect(result).toEqual([{ id: "1" }]);
    expect(refreshCallCount).toBe(1);
    expect(ticketsCallCount).toBe(2); // initial 401 + retry 200
  });

  // ─── 401 + refresh 401 → SessionExpiredError ────────────────────────────────

  it("401 → refresh 401 → throws SessionExpiredError without retrying original", async () => {
    let ticketsCallCount = 0;
    let refreshCallCount = 0;

    server.use(
      http.get(`${BASE}/api/tickets`, () => {
        ticketsCallCount++;
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const err = (await apiFetch("tickets").catch((e) => e)) as SessionExpiredError;
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(refreshCallCount).toBe(1);
    expect(ticketsCallCount).toBe(1); // no retry after failed refresh
  });

  // ─── Direct call to auth/refresh with 401 → no loop ─────────────────────────

  it("direct apiFetch('auth/refresh') with 401 → throws ApiError(401) immediately, no additional refresh calls", async () => {
    let refreshCallCount = 0;

    server.use(
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const err = (await apiFetch("auth/refresh", { method: "POST" }).catch(
      (e) => e,
    )) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(refreshCallCount).toBe(1); // exactly 1 call — no retry loop
  });

  // ─── Single-flight: 3 concurrent 401s → exactly 1 refresh ──────────────────

  it("SINGLE-FLIGHT: 3 concurrent 401s → exactly 1 POST /api/auth/refresh", async () => {
    let refreshCallCount = 0;
    let refreshed = false;

    server.use(
      http.get(`${BASE}/api/tickets`, () => {
        if (!refreshed) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json([{ id: "1" }]);
      }),
      http.get(`${BASE}/api/compras`, () => {
        if (!refreshed) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json([{ id: "2" }]);
      }),
      http.get(`${BASE}/api/equipos`, () => {
        if (!refreshed) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json([{ id: "3" }]);
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        refreshed = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const [r1, r2, r3] = await Promise.all([
      apiFetch("tickets"),
      apiFetch("compras"),
      apiFetch("equipos"),
    ]);

    // All 3 must succeed
    expect(r1).toEqual([{ id: "1" }]);
    expect(r2).toEqual([{ id: "2" }]);
    expect(r3).toEqual([{ id: "3" }]);

    // EXACTLY 1 refresh call — the single-flight guarantee
    expect(refreshCallCount).toBe(1);
  });

  // ─── In-flight refresh → new 401 joins, no second refresh ──────────────────

  it("request during in-flight refresh joins existing promise; does NOT create second refresh", async () => {
    let refreshCallCount = 0;
    let refreshed = false;

    server.use(
      http.get(`${BASE}/api/tickets`, () => {
        if (!refreshed) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json([{ id: "1" }]);
      }),
      http.get(`${BASE}/api/compras`, () => {
        if (!refreshed) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json([{ id: "2" }]);
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        refreshed = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    // Fire two concurrent requests — the second joins the in-flight refresh
    await Promise.all([apiFetch("tickets"), apiFetch("compras")]);

    expect(refreshCallCount).toBe(1);
  });

  // ─── Post-refresh: a later 401 triggers a new refresh ───────────────────────

  it("refreshPromise resets after single-flight completes — subsequent 401 triggers new refresh", async () => {
    let refreshCallCount = 0;
    let ticketsCallCount = 0;

    server.use(
      http.get(`${BASE}/api/tickets`, () => {
        ticketsCallCount++;
        // Alternates: 401 on odd calls, 200 on even calls
        if (ticketsCallCount % 2 === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json([{ id: "1" }]);
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCallCount++;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    // First cycle: 401 → refresh → retry
    await apiFetch("tickets");
    expect(refreshCallCount).toBe(1);

    // Second cycle (separate call later): 401 → fresh refresh → retry
    await apiFetch("tickets");
    expect(refreshCallCount).toBe(2); // new refresh initiated
  });
});
