import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { PedidoQrLanding, MENSAJE_QR_OTRA_ORGANIZACION } from "./pedido-qr-landing";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Spec: sdd/formulario-publico-qr, pedido-publico (D3) — landing autenticada del QR.
const PRIORIDAD_ID = "22222222-2222-2222-2222-222222222222";
const EQUIPO_ID = "33333333-3333-3333-3333-333333333333";
const PRIORIDAD = { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" };

function mockCatalogos() {
  server.use(
    http.get("/api/catalogos/prioridades", () => HttpResponse.json([PRIORIDAD])),
    // Un USUARIO sin EQUIPOS:LECTURA recibe 403: el equipo del QR tiene que estar igual.
    http.get("/api/equipos", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
  );
}

const sesion = { user: buildUser({ permisos: ["ticket:crear"] }) };

describe("PedidoQrLanding", () => {
  it("si el QR coincide, abre el dialogo con el equipo preseleccionado y consulta con c y e", async () => {
    mockCatalogos();
    let url: URL | null = null;
    server.use(
      http.get("/api/soporte/qr", ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ equipo: { id: EQUIPO_ID, nombre: "Notebook Dell" } });
      }),
    );

    renderWithProviders(<PedidoQrLanding slug="mi-colegio" tokenQr="tok-1" />, sesion);

    const select = (await screen.findByLabelText(/equipo/i)) as HTMLSelectElement;
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(select.value).toBe(EQUIPO_ID);
    expect(screen.getByRole("option", { name: "Notebook Dell" })).toBeInTheDocument();
    expect(url!.searchParams.get("c")).toBe("mi-colegio");
    expect(url!.searchParams.get("e")).toBe("tok-1");
  });

  it("si el token no resuelve a un equipo, abre el dialogo sin preseleccion", async () => {
    mockCatalogos();
    server.use(http.get("/api/soporte/qr", () => HttpResponse.json({ equipo: null })));

    renderWithProviders(<PedidoQrLanding slug="mi-colegio" tokenQr="tok-baja" />, sesion);

    const select = (await screen.findByLabelText(/equipo/i)) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText(/no encontramos el equipo/i)).toBeInTheDocument();
  });

  it("404 (QR de otra organizacion): muestra el mensaje, sin dialogo ni reintento", async () => {
    mockCatalogos();
    server.use(http.get("/api/soporte/qr", () => HttpResponse.json({ message: "Not found" }, { status: 404 })));

    renderWithProviders(<PedidoQrLanding slug="otro" tokenQr="tok-1" />, sesion);

    expect(await screen.findByText(MENSAJE_QR_OTRA_ORGANIZACION)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("403 (sin TICKETS:ALTAS): avisa que no tiene permiso", async () => {
    mockCatalogos();
    server.use(http.get("/api/soporte/qr", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })));

    renderWithProviders(<PedidoQrLanding slug="mi-colegio" tokenQr="tok-1" />, sesion);

    await waitFor(() => expect(screen.getByText(/no tenés permiso/i)).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
