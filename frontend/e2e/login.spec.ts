/**
 * E2E: Login flow — cookie assertions + route guard
 *
 * Tests the complete auth flow end-to-end using Playwright's context.cookies()
 * to assert httpOnly cookie attributes (not visible to client JS).
 *
 * IMPORTANT: This spec is written but NOT executed in PR7.
 * It is deferred to sdd-verify, which runs after the full stack
 * (backend + Next.js dev server) is available.
 *
 * Prerequisites:
 * - Backend running at BACKEND_URL with a valid test user (see playwright.config.ts)
 * - Next.js dev server running at http://localhost:3000
 *
 * Spec: [SPEC:frontend-auth/login-exitoso e2e cookie validation]
 * Spec: [SPEC:frontend-auth/login-exitoso httpOnly via context.cookies()]
 * Spec: [SPEC:frontend-route-protection/sin-sesion redirect guard]
 * Spec: [SPEC:frontend-auth/logout e2e]
 */

import { test, expect } from "@playwright/test";

// ─── Credentials (configure via env or use test defaults) ───────────────────

const VALID_EMAIL = process.env.E2E_USER_EMAIL ?? "test@example.com";
const VALID_PASSWORD = process.env.E2E_USER_PASSWORD ?? "password123";

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe("Login flow", () => {
  // Ensure a clean slate before each test (no leftover cookies)
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ─── Route guard: unauthenticated ─────────────────────────────────────────

  test("unauthenticated /tickets → redirects to /login", async ({ page }) => {
    await page.goto("/tickets");
    // Middleware redirects to /login when no session cookies present
    await expect(page).toHaveURL(/\/login/);
  });

  // ─── Login form renders ───────────────────────────────────────────────────

  test("login page renders email, password fields and submit button", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /iniciar sesión/i }),
    ).toBeVisible();
  });

  // ─── Successful login + cookie assertions ─────────────────────────────────

  test("valid credentials → sets at + rt httpOnly cookies with correct attributes", async ({
    page,
    context,
  }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/contraseña/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    // Wait for redirect away from /login (success navigates to /dashboard or /)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Assert cookie attributes via context.cookies() (not visible to client JS)
    const cookies = await context.cookies();
    const atCookie = cookies.find((c) => c.name === "at");
    const rtCookie = cookies.find((c) => c.name === "rt");

    // at: access token
    expect(atCookie, "at cookie must be set").toBeDefined();
    expect(atCookie!.httpOnly, "at must be httpOnly").toBe(true);
    expect(atCookie!.sameSite, "at SameSite must be Lax").toBe("Lax");
    expect(atCookie!.path, "at path must be /").toBe("/");
    // maxAge ≈ 900s (allow ±30s for test timing)
    expect(
      atCookie!.expires,
      "at expires must be ~900s from now",
    ).toBeGreaterThanOrEqual(Date.now() / 1000 + 870);
    expect(atCookie!.expires).toBeLessThanOrEqual(Date.now() / 1000 + 930);

    // rt: refresh token
    expect(rtCookie, "rt cookie must be set").toBeDefined();
    expect(rtCookie!.httpOnly, "rt must be httpOnly").toBe(true);
    expect(rtCookie!.sameSite, "rt SameSite must be Lax").toBe("Lax");
    expect(rtCookie!.path, "rt path must be /").toBe("/");
    // maxAge ≈ 604800s (7 days) — allow ±60s for test timing
    expect(
      rtCookie!.expires,
      "rt expires must be ~7 days from now",
    ).toBeGreaterThanOrEqual(Date.now() / 1000 + 604740);
    expect(rtCookie!.expires).toBeLessThanOrEqual(Date.now() / 1000 + 604860);
  });

  // ─── Post-login navigation ────────────────────────────────────────────────

  test("after login: page URL is / or /dashboard (NOT /login)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/contraseña/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Must be / or /dashboard — not /login
    const url = page.url();
    expect(url).toMatch(/\/(dashboard)?$/);
  });

  test("after login: /tickets renders tickets placeholder (no redirect to login)", async ({
    page,
  }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/contraseña/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Navigate to /tickets — should render (not redirect)
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/tickets/);
    // The tickets page renders its heading
    await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();
  });

  // ─── Logout ──────────────────────────────────────────────────────────────

  test("logout: click Cerrar sesión → redirect to /login, at + rt cookies absent", async ({
    page,
    context,
  }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/contraseña/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Click "Cerrar sesión" in the user menu (UserMenu component in AppNav)
    await page.getByRole("button", { name: /cerrar sesión/i }).click();

    // Should redirect to /login after logout
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Cookies must be cleared
    const cookiesAfterLogout = await context.cookies();
    const atAfterLogout = cookiesAfterLogout.find((c) => c.name === "at");
    const rtAfterLogout = cookiesAfterLogout.find((c) => c.name === "rt");
    expect(atAfterLogout, "at cookie must be absent after logout").toBeUndefined();
    expect(rtAfterLogout, "rt cookie must be absent after logout").toBeUndefined();
  });

  // ─── Route guard: after logout ────────────────────────────────────────────

  test("after logout: /tickets → redirects to /login again", async ({
    page,
  }) => {
    // Login, then logout
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/contraseña/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Navigate to /tickets without session
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});
