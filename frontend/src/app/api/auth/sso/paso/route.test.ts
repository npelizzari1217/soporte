import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as ruta from "./route";

// Spec: SL14 — BFF `paso`: la cookie `sso_paso` se lee, se borra y se valida una sola vez.

function pedir(valor?: string): Promise<Response> {
  const req = new NextRequest("http://localhost/api/auth/sso/paso", {
    method: "POST",
    headers: valor === undefined ? {} : { cookie: `sso_paso=${encodeURIComponent(valor)}` },
  });
  return ruta.POST(req);
}

function borrada(res: Response): boolean {
  const c = res.headers.getSetCookie().find((x) => x.startsWith("sso_paso=")) ?? "";
  return c.includes("Max-Age=0");
}

describe("POST /api/auth/sso/paso", () => {
  it.each([
    ["2fa", { k: "2fa", t: "des-1" }, { needs2fa: true, desafio: "des-1" }],
    ["enrol", { k: "enrol", t: "des-2" }, { needsEnrolamiento2fa: true, desafio: "des-2" }],
    ["ticket", { k: "ticket", t: "tk-1" }, { ticket: "tk-1" }],
  ])("clase %s → cuerpo del flujo existente y cookie borrada", async (_n, cookie, esperado) => {
    const res = await pedir(JSON.stringify(cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(esperado);
    expect(borrada(res)).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sin cookie → 404 (segunda lectura incluida)", async () => {
    const res = await pedir();
    expect(res.status).toBe(404);
  });

  it.each([
    ["JSON roto", "{no-json"],
    ["clase desconocida", JSON.stringify({ k: "otro", t: "x" })],
    ["sin t", JSON.stringify({ k: "2fa" })],
    ["t vacío", JSON.stringify({ k: "ticket", t: "" })],
    ["no objeto", JSON.stringify("hola")],
  ])("forma inválida (%s) → 404 y la cookie se borra", async (_n, valor) => {
    const res = await pedir(valor);
    expect(res.status).toBe(404);
    expect(borrada(res)).toBe(true);
  });

  it("no filtra campos extra de la cookie hacia el navegador", async () => {
    const res = await pedir(JSON.stringify({ k: "ticket", t: "tk", accessToken: "jwt" }));
    expect(await res.json()).toEqual({ ticket: "tk" });
  });
});

describe("GET /api/auth/sso/paso", () => {
  it("no existe como handler: un GET no consume la cookie", () => {
    expect("GET" in ruta).toBe(false);
  });
});
