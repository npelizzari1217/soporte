import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { ConfigurarTfaDialog } from "./configurar-tfa-dialog";

// Spec: sdd/verificacion-dos-pasos — T3, T7, T8, T9, T10.

const SECRETO = { otpauthUri: "otpauth://totp/Soporte:u?secret=JBSWY3DPEHPK3PXP", claveManual: "JBSW Y3DP EHPK 3PXP" };
const CODIGOS = Array.from({ length: 10 }, (_, i) => `AAAA-BBBB-C${String(i).padStart(3, "0")}`);

function estado(parcial: { activo?: boolean; obligado?: boolean; codigosRestantes?: number } = {}) {
  server.use(
    http.get("/api/auth/2fa", () =>
      HttpResponse.json({ activo: false, obligado: false, codigosRestantes: 0, pendiente: false, ...parcial }),
    ),
  );
}

async function abrir() {
  const user = userEvent.setup();
  renderWithProviders(<ConfigurarTfaDialog />);
  await user.click(screen.getByRole("button", { name: /verificación en dos pasos/i }));
  return user;
}

describe("ConfigurarTfaDialog", () => {
  it("sin 2FA: activa con QR, confirma el código y muestra los 10 códigos una sola vez", async () => {
    estado();
    server.use(
      http.post("/api/auth/2fa/secreto/iniciar", () => HttpResponse.json(SECRETO)),
      http.post("/api/auth/2fa/secreto/confirmar", () => HttpResponse.json({ codigosRecuperacion: CODIGOS })),
    );
    const user = await abrir();
    await user.click(await screen.findByRole("button", { name: /activar verificación/i }));
    expect(await screen.findByRole("img", { name: /qr/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/código de verificación/i), "123456");
    await user.click(screen.getByRole("button", { name: /^activar$/i }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(10);
  });

  it("con 2FA: cambiar celular pide el código ANTES del QR y no muestra códigos al confirmar", async () => {
    estado({ activo: true, codigosRestantes: 8 });
    let cuerpo: unknown;
    server.use(
      http.post("/api/auth/2fa/secreto/iniciar", async ({ request }) => {
        cuerpo = await request.json();
        return HttpResponse.json(SECRETO);
      }),
      http.post("/api/auth/2fa/secreto/confirmar", () => HttpResponse.json({})),
    );
    const user = await abrir();
    await user.click(await screen.findByRole("button", { name: /cambiar celular/i }));
    expect(screen.queryByRole("img", { name: /qr/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/código de verificación/i), "654321");
    await user.click(screen.getByRole("button", { name: /^cambiar celular$/i }));
    expect(await screen.findByRole("img", { name: /qr/i })).toBeInTheDocument();
    expect(cuerpo).toEqual({ codigo: "654321" });
    await user.type(screen.getByLabelText(/código de verificación/i), "111222");
    await user.click(screen.getByRole("button", { name: /^activar$/i }));
    expect(await screen.findByText(/celular nuevo/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("con 2FA: regenerar pide el código y muestra el juego nuevo", async () => {
    estado({ activo: true, codigosRestantes: 2 });
    server.use(http.post("/api/auth/2fa/codigos", () => HttpResponse.json({ codigosRecuperacion: CODIGOS })));
    const user = await abrir();
    await user.click(await screen.findByRole("button", { name: /regenerar códigos/i }));
    await user.type(screen.getByLabelText(/código de verificación/i), "123456");
    await user.click(screen.getByRole("button", { name: /^regenerar códigos$/i }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(10);
  });

  it("con 2FA: desactivar pide el código y confirma", async () => {
    estado({ activo: true });
    server.use(http.post("/api/auth/2fa/desactivar", () => new HttpResponse(null, { status: 204 })));
    const user = await abrir();
    await user.click(await screen.findByRole("button", { name: /^desactivar$/i }));
    await user.type(screen.getByLabelText(/código de verificación/i), "123456");
    await user.click(screen.getByRole("button", { name: /^desactivar$/i }));
    expect(await screen.findByText(/desactivaste/i)).toBeInTheDocument();
  });

  it("obligado: no ofrece desactivar y explica por qué", async () => {
    estado({ activo: true, obligado: true });
    await abrir();
    expect(await screen.findByText(/no podés desactivarla/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^desactivar$/i })).not.toBeInTheDocument();
  });

  it("código incorrecto (422): muestra el error sin disparar refresh", async () => {
    estado({ activo: true });
    let refreshes = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("/api/auth/2fa/codigos", () =>
        HttpResponse.json({ statusCode: 422, message: "Código incorrecto." }, { status: 422 }),
      ),
    );
    const user = await abrir();
    await user.click(await screen.findByRole("button", { name: /regenerar códigos/i }));
    await user.type(screen.getByLabelText(/código de verificación/i), "000000");
    await user.click(screen.getByRole("button", { name: /^regenerar códigos$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/código incorrecto/i);
    expect(refreshes).toBe(0);
  });
});
