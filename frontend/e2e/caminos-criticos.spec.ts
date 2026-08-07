import { test, expect, type Page } from "@playwright/test";

/**
 * caminos-criticos.spec.ts — smoke e2e de los caminos críticos (T6.3/T6.4,
 * sdd/beta-frontend batch B6). Playwright REAL (sin MSW) contra
 * backend+frontend LEVANTADOS y con el tenant demo ya sembrado
 * (`pnpm seed:demo` en `backend/`, ver README del backend).
 *
 * NO se corren como parte de `pnpm test` (eso es Vitest/MSW) — se corren
 * aparte con `pnpm test:e2e` (ver `playwright.config.ts`: `webServer`
 * levanta `pnpm run dev` automáticamente si no hay uno corriendo, PERO el
 * backend + el seed demo son prerequisito manual, Playwright no los levanta).
 *
 * Credenciales: las del seed demo (`backend/prisma_master/seeds/demo-seed.ts`),
 * overrideables por env si se corre con datos demo custom.
 *
 * Cada test es AUTÓNOMO (crea su propio ticket cuando lo necesita) — no
 * depende del orden ni de datos creados por otro test (`fullyParallel: true`).
 */

const PASSWORD = process.env.DEMO_SEED_PASSWORD ?? "Demo1234$";
const ADMIN = { email: process.env.DEMO_ADMIN_EMAIL ?? "admin.demo@soporte-demo.local", password: PASSWORD };
const TECNICO = { email: process.env.DEMO_TECNICO_EMAIL ?? "tecnico.demo@soporte-demo.local", password: PASSWORD };
const USUARIO = { email: process.env.DEMO_USUARIO_EMAIL ?? "usuario.demo@soporte-demo.local", password: PASSWORD };

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/contraseña/i).fill(creds.password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL("**/tickets");
}

/** Crea un ticket mínimo (título único) y devuelve el título usado. */
async function crearTicket(page: Page, prefijo: string): Promise<string> {
  const titulo = `${prefijo} ${Date.now()}`;
  await page.goto("/tickets/nuevo");
  await page.getByLabel(/título/i).fill(titulo);
  await page.getByLabel(/^tipo$/i).selectOption({ index: 1 });
  await page.getByLabel(/^prioridad$/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /crear ticket/i }).click();
  await page.waitForURL(/\/tickets\/[^/]+$/);
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
  return titulo;
}

test.describe("Caminos críticos — smoke (requiere backend+frontend levantados + seed demo)", () => {
  test("login como ADMIN → ve la lista de tickets y accede al dashboard", async ({ page }) => {
    await login(page, ADMIN);
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();

    await page.getByRole("link", { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("crear ticket → aparece en la lista", async ({ page }) => {
    await login(page, ADMIN);
    const titulo = await crearTicket(page, "E2E crear");

    await page.goto("/tickets");
    await expect(page.getByText(titulo)).toBeVisible();
  });

  test("comentar un ticket", async ({ page }) => {
    await login(page, ADMIN);
    await crearTicket(page, "E2E comentar");

    const texto = `Comentario e2e ${Date.now()}`;
    await page.getByLabel(/comentario/i).fill(texto);
    await page.getByRole("button", { name: /^enviar$/i }).click();

    await expect(page.getByText(texto)).toBeVisible();
  });

  test("TECNICO transiciona un ticket recién creado (NUEVO → ASIGNADO)", async ({ page }) => {
    await login(page, TECNICO);
    await crearTicket(page, "E2E transicionar");

    await page.getByRole("combobox", { name: /nuevo estado/i }).selectOption("ASIGNADO");
    await page.getByRole("button", { name: /confirmar/i }).click();

    await expect(page.getByText(/estado actualizado/i)).toBeVisible();
  });

  test("gating: USUARIO no ve Dashboard en el nav ni el control de transicionar en un ticket", async ({ page }) => {
    await login(page, USUARIO);
    await expect(page.getByRole("link", { name: /dashboard/i })).toHaveCount(0);

    await crearTicket(page, "E2E gating");
    await expect(page.getByRole("combobox", { name: /nuevo estado/i })).toHaveCount(0);
  });
});
