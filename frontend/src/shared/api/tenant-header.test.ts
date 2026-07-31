import { describe, it, expect, afterEach } from "vitest";
import { getTenantHeader, setTenantHeader } from "./tenant-header";

/**
 * tenant-header — holder module-level de X-Tenant-Id (Dz5/R5).
 * Spec: [SPEC:frontend-api-client/R5 Propagación centralizada de X-Tenant-Id]
 */
describe("tenant-header", () => {
  afterEach(() => {
    // Aislar tests entre sí — el holder es module-level (singleton).
    setTenantHeader(null);
  });

  it("getTenantHeader() devuelve null por defecto (R5-c: no-root nunca envía el header)", () => {
    expect(getTenantHeader()).toBeNull();
  });

  it("setTenantHeader(id) → getTenantHeader() devuelve ese id", () => {
    setTenantHeader("cliente-123");
    expect(getTenantHeader()).toBe("cliente-123");
  });

  it("setTenantHeader(null) resetea el holder a null (logout/unmount)", () => {
    setTenantHeader("cliente-123");
    setTenantHeader(null);
    expect(getTenantHeader()).toBeNull();
  });

  // ─── Guarda SSR (Judgment Day R1 — defensa en profundidad) ────────────────
  //
  // jsdom siempre define `window`, así que el branch real de servidor no es
  // alcanzable en este entorno de test sin inyección. `getTenantHeader` acepta
  // un `checkIsServer` inyectable (default = detección real de `window`) para
  // poder ejercitar el branch server sin `as any` ni mockear globals.
  it("getTenantHeader(checkIsServer): si checkIsServer() === true, SIEMPRE null aunque el holder tenga valor (guarda SSR)", () => {
    setTenantHeader("cliente-poison");

    expect(getTenantHeader(() => true)).toBeNull();
  });

  it("getTenantHeader(checkIsServer): si checkIsServer() === false (browser), devuelve el valor del holder", () => {
    setTenantHeader("cliente-123");

    expect(getTenantHeader(() => false)).toBe("cliente-123");
  });
});
