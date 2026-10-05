import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoDetailView } from "./equipo-detail-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const dispararDescarga = vi.fn();
vi.mock("@/shared/lib/descarga", () => ({ dispararDescarga: (...a: unknown[]) => dispararDescarga(...a) }));

const EQUIPO_ID = "44444444-4444-4444-4444-444444444444";
const URL_1 = "https://soporte.example.com/c/acme/pedido?e=TOKEN_UNO_aaaaaaaaaaaaaa";
const URL_2 = "https://soporte.example.com/c/acme/pedido?e=TOKEN_DOS_bbbbbbbbbbbbbb";

function equipo(activo = true) {
  return {
    id: EQUIPO_ID,
    nombre: "Notebook Dell",
    numeroSerie: "SN-001",
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacionId: null,
    activo,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    componentes: [],
  };
}

type QrLeidoMock = { estado: "VIGENTE" | "SIN_EMITIR" | "REQUIERE_REGENERAR"; url: string | null; emitidoAt: string | null };
const SIN_EMITIR: QrLeidoMock = { estado: "SIN_EMITIR", url: null, emitidoAt: null };

function montar(opts: { permisos?: string[]; activo?: boolean; qr?: QrLeidoMock; lecturas?: { n: number } } = {}) {
  server.use(
    http.get(`/api/equipos/${EQUIPO_ID}/qr`, () => {
      if (opts.lecturas) opts.lecturas.n += 1;
      return HttpResponse.json(opts.qr ?? SIN_EMITIR);
    }),
    http.get(`/api/equipos/${EQUIPO_ID}`, () => HttpResponse.json(equipo(opts.activo ?? true))),
    http.get("/api/usuarios", () => HttpResponse.json([])),
  );
  return renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
    user: buildUser({ permisos: opts.permisos ?? ["EQUIPOS:MODIFICACION"] }),
  });
}

async function emitirConfirmando() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Emitir QR" }));
  const dialogo = await screen.findByRole("alertdialog");
  await user.click(within(dialogo).getByRole("button", { name: "Generar QR" }));
  return user;
}

describe("EquipoQrPanel", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    dispararDescarga.mockClear();
  });

  it("emite el QR tras confirmar y lo dibuja como SVG propio", async () => {
    let llamadas = 0;
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () => {
        llamadas += 1;
        return HttpResponse.json({ url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" }, { status: 201 });
      }),
    );
    montar();
    await emitirConfirmando();

    const svg = await screen.findByRole("img", { name: "QR del equipo Notebook Dell" });
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(llamadas).toBe(1);
    expect(toast.success).toHaveBeenCalledWith("QR generado.");
    expect(screen.getByRole("button", { name: "Regenerar QR" })).toBeInTheDocument();
  });

  it("no llama al backend si se cancela la confirmación", async () => {
    let llamadas = 0;
    server.use(http.post(`/api/equipos/${EQUIPO_ID}/qr`, () => ((llamadas += 1), HttpResponse.json({}, { status: 500 }))));
    montar();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Emitir QR" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/deja de funcionar al instante/i)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(llamadas).toBe(0);
    expect(screen.queryByRole("img", { name: /QR del equipo/ })).not.toBeInTheDocument();
  });

  it("regenerar reemplaza el QR mostrado por el nuevo", async () => {
    let n = 0;
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ url: n++ === 0 ? URL_1 : URL_2, emitidoAt: "2026-10-03T10:00:00.000Z" }, { status: 201 }),
      ),
    );
    montar();
    const user = await emitirConfirmando();
    const primero = (await screen.findByRole("img", { name: /QR del equipo/ })).querySelector("path")?.getAttribute("d");

    await user.click(screen.getByRole("button", { name: "Regenerar QR" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Generar QR" }));

    await waitFor(() => {
      const segundo = screen.getByRole("img", { name: /QR del equipo/ }).querySelector("path")?.getAttribute("d");
      expect(segundo).not.toBe(primero);
    });
    expect(n).toBe(2);
  });

  it.each([
    ["QR_REQUIERE_SLUG", /todavía no tiene un slug/i],
    ["QR_SLUG_CAMBIADO", /slug del cliente cambió/i],
  ])("el 409 %s muestra su aviso por código", async (code, aviso) => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ statusCode: 409, message: "texto del backend", code }, { status: 409 }),
      ),
    );
    montar();
    await emitirConfirmando();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(aviso)));
    expect(screen.queryByRole("img", { name: /QR del equipo/ })).not.toBeInTheDocument();
  });

  it("un 404 sin código cae al mensaje del backend", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ statusCode: 404, message: "Equipo no encontrado" }, { status: 404 }),
      ),
    );
    montar();
    await emitirConfirmando();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Equipo no encontrado"));
  });

  it("descarga el SVG con un nombre derivado del equipo", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" }, { status: 201 }),
      ),
    );
    montar();
    const user = await emitirConfirmando();
    await user.click(await screen.findByRole("button", { name: "Descargar SVG" }));

    expect(dispararDescarga).toHaveBeenCalledTimes(1);
    const [blob, nombre] = dispararDescarga.mock.calls[0] as [Blob, string];
    expect(nombre).toBe("qr-notebook-dell.svg");
    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).not.toContain("TOKEN_UNO");
  });

  it("descarga el PNG dibujando en un canvas", async () => {
    const fillRect = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect } as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" }, { status: 201 }),
      ),
    );
    montar();
    const user = await emitirConfirmando();
    await user.click(await screen.findByRole("button", { name: "Descargar PNG" }));

    await waitFor(() => expect(dispararDescarga).toHaveBeenCalled());
    expect((dispararDescarga.mock.calls[0] as [Blob, string])[1]).toBe("qr-notebook-dell.png");
    expect(fillRect.mock.calls.length).toBeGreaterThan(1);
    getContext.mockRestore();
    toBlob.mockRestore();
  });

  it("imprime solo este QR en una ventana propia", async () => {
    const ventana = {
      document: {
        body: { innerHTML: "", appendChild: vi.fn() },
        createElement: () => ({ style: {} }),
        title: "",
      },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi.spyOn(window, "open").mockReturnValue(ventana as never);
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" }, { status: 201 }),
      ),
    );
    montar();
    const user = await emitirConfirmando();
    await user.click(await screen.findByRole("button", { name: "Imprimir" }));

    expect(ventana.print).toHaveBeenCalledTimes(1);
    expect(ventana.document.body.innerHTML).toContain("<svg");
    open.mockRestore();
  });

  it("al montar muestra el QR guardado y descarga sin volver a emitir", async () => {
    let emisiones = 0;
    server.use(http.post(`/api/equipos/${EQUIPO_ID}/qr`, () => ((emisiones += 1), HttpResponse.json({}, { status: 500 }))));
    montar({ qr: { estado: "VIGENTE", url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" } });

    expect(await screen.findByRole("img", { name: "QR del equipo Notebook Dell" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerar QR" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Descargar SVG" }));
    await user.click(screen.getByRole("button", { name: "Descargar SVG" }));

    expect(dispararDescarga).toHaveBeenCalledTimes(2);
    expect((dispararDescarga.mock.calls[0] as [Blob, string])[1]).toBe("qr-notebook-dell.svg");
    expect(emisiones).toBe(0);
  });

  it("un QR anterior al cambio avisa que hay que regenerarlo una vez y no muestra imagen", async () => {
    montar({ qr: { estado: "REQUIERE_REGENERAR", url: null, emitidoAt: null } });

    expect(await screen.findByText(/Regeneralo una vez para verlo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerar QR" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR del equipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar SVG" })).not.toBeInTheDocument();
  });

  it("regenerar con un QR guardado muestra el nuevo y no vuelve a leer el viejo", async () => {
    const lecturas = { n: 0 };
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/qr`, () =>
        HttpResponse.json({ url: URL_2, emitidoAt: "2026-10-05T10:00:00.000Z" }, { status: 201 }),
      ),
    );
    montar({ qr: { estado: "VIGENTE", url: URL_1, emitidoAt: "2026-10-03T10:00:00.000Z" }, lecturas });
    const primero = (await screen.findByRole("img", { name: /QR del equipo/ })).querySelector("path")?.getAttribute("d");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Regenerar QR" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Generar QR" }));

    await waitFor(() => {
      const segundo = screen.getByRole("img", { name: /QR del equipo/ }).querySelector("path")?.getAttribute("d");
      expect(segundo).not.toBe(primero);
    });
    expect(lecturas.n).toBe(1);
  });

  it("sin EQUIPOS:MODIFICACION no hay panel de QR", async () => {
    montar({ permisos: [] });
    await screen.findByText("Notebook Dell");
    expect(screen.queryByText("QR del equipo")).not.toBeInTheDocument();
  });

  it("un equipo dado de baja no ofrece emitir QR", async () => {
    montar({ activo: false });
    await screen.findByText("Notebook Dell");
    expect(screen.queryByRole("button", { name: /QR/ })).not.toBeInTheDocument();
  });
});
