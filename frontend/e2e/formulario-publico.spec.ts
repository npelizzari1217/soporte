import { test, expect } from "@playwright/test";

/**
 * formulario-publico.spec.ts — smoke e2e de las rutas públicas `publico/*`
 * (cierra S3 del verify-report de `formulario-publico-qr`). Playwright REAL
 * (sin MSW): prueba navegador -> BFF de Next (`/api/[...path]`) -> Nest en una
 * sola corrida, SIN cookie de sesión.
 *
 * NO se corre como parte de `pnpm test` (eso es Vitest/MSW) — se corre aparte
 * con `pnpm test:e2e e2e/formulario-publico.spec.ts` (ver `playwright.config.ts`:
 * `webServer` levanta `pnpm run dev` si no hay uno corriendo, PERO el backend
 * es prerequisito manual, Playwright no lo levanta).
 *
 * - Test 1 corre siempre: no necesita seed, usa un slug inexistente.
 * - Test 2 corre solo con `E2E_FORM_SLUG` = slug de un cliente con el formulario
 *   público habilitado (estado LISTO). Opcional `E2E_FORM_CLIENTE_NOMBRE` para
 *   verificar el nombre del cliente. Crea un pedido pendiente (email único) en
 *   ese tenant; no confirma nada.
 *
 * Cada test es AUTÓNOMO y usa un contexto nuevo (sin cookies).
 */

// Mensaje fijo de `FormularioPublicoNoDisponibleError` (backend/src/publico/domain/errors).
const MENSAJE_BACKEND_NO_DISPONIBLE = "El formulario no está disponible.";
const MENSAJE_UI_NO_DISPONIBLE = "Este formulario no está disponible o el link no es válido.";

test.describe("Formulario público — smoke browser -> BFF -> backend (sin sesión)", () => {
  test("slug inexistente: el 404 lo responde Nest a través del BFF y la UI muestra 'no disponible'", async ({ browser }) => {
    const context = await browser.newContext();
    expect(await context.cookies()).toHaveLength(0);
    const page = await context.newPage();

    const slug = `e2e-inexistente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const respuesta = page.waitForResponse(
      (r) => r.url().includes(`/api/publico/c/${slug}/pedido/contexto`) && r.request().method() === "GET",
    );
    await page.goto(`/c/${slug}/pedido`);
    const r = await respuesta;

    expect(r.status()).toBe(404);
    // El mensaje fijo del dominio prueba que contestó Nest, no un 404 de Next.
    expect(JSON.stringify(await r.json())).toContain(MENSAJE_BACKEND_NO_DISPONIBLE);

    await expect(page.getByText(MENSAJE_UI_NO_DISPONIBLE)).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await context.close();
  });

  test("formulario habilitado: contexto 200, envío 202 y confirmación 'revisá tu correo'", async ({ browser }) => {
    test.skip(!process.env.E2E_FORM_SLUG, "Requiere E2E_FORM_SLUG: slug de un cliente con el formulario público habilitado (LISTO)");
    const slug = process.env.E2E_FORM_SLUG as string;
    const nombreCliente = process.env.E2E_FORM_CLIENTE_NOMBRE;

    const context = await browser.newContext();
    const page = await context.newPage();

    const contexto = page.waitForResponse(
      (r) => r.url().includes(`/api/publico/c/${slug}/pedido/contexto`) && r.request().method() === "GET",
    );
    await page.goto(`/c/${slug}/pedido`);
    expect((await contexto).status()).toBe(200);
    await expect(page.getByText("Pedido de soporte")).toBeVisible();
    if (nombreCliente) await expect(page.getByText(nombreCliente)).toBeVisible();

    const unico = Date.now();
    await page.getByLabel("Tu nombre").fill("E2E Smoke");
    await page.getByLabel("Tu email").fill(`e2e-smoke-${unico}@example.com`);
    await page.getByLabel("Asunto").fill(`E2E smoke ${unico}`);
    await page.getByLabel("¿Qué pasa?").fill("Pedido generado por el smoke e2e del formulario público.");

    const solicitud = page.waitForResponse(
      (r) => r.url().includes(`/api/publico/c/${slug}/pedido/solicitud`) && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enviar pedido" }).click();
    expect((await solicitud).status()).toBe(202);

    await expect(page.getByRole("heading", { name: "Revisá tu correo" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Te enviamos un correo");
    await expect(page).not.toHaveURL(/\/login/);
    await context.close();
  });
});
