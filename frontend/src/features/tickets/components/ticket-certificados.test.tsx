import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketCertificados } from "./ticket-certificados";
import type { CertificadoAvance, TareaTicket } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * Certificados de avance en el detalle (odd/edilicia-obra-externa, T4, S5, S6, S8).
 */
const TICKET_ID = "t-ext";

function tarea(id: string, descripcion: string, peso: number, completada: boolean): TareaTicket {
  return {
    id,
    ticketId: TICKET_ID,
    descripcion,
    orden: 1,
    tecnicoId: null,
    tecnicoNombre: null,
    tecnicoApellido: null,
    completada,
    completadaEn: completada ? "2026-11-01T10:00:00.000Z" : null,
    completadaPorId: completada ? "u-tec" : null,
    completadaPorNombre: null,
    completadaPorApellido: null,
    peso,
    createdAt: "2026-11-01T10:00:00.000Z",
  };
}

const LOSA = tarea("ta-losa", "Losa", 20, true);
const REVOQUE = tarea("ta-revoque", "Revoque", 15, true);
const PINTURA = tarea("ta-pintura", "Pintura", 65, false);

function certificado(overrides: Partial<CertificadoAvance> = {}): CertificadoAvance {
  return {
    id: "c1",
    ticketId: TICKET_ID,
    numero: 1,
    porcentaje: 20,
    vigente: true,
    emitidoPorId: "u-cert",
    emitidoPorNombre: "Carla",
    emitidoPorApellido: "Gómez",
    emitidoEn: "2026-11-02T13:00:00.000Z",
    anuladoEn: null,
    anuladoPorId: null,
    anuladoPorNombre: null,
    anuladoPorApellido: null,
    motivoAnulacion: null,
    tareas: [{ tareaId: "ta-losa", descripcion: "Losa", peso: 20 }],
    ...overrides,
  };
}

function mockBackend(tareas: TareaTicket[], certificados: CertificadoAvance[]) {
  const posts: unknown[] = [];
  server.use(
    http.get(`/api/tickets/${TICKET_ID}/tareas`, () =>
      HttpResponse.json({ items: tareas, avance: { total: tareas.length, completadas: 0, porcentaje: 0 } }),
    ),
    http.get(`/api/tickets/${TICKET_ID}/certificados`, () => HttpResponse.json(certificados)),
    http.post(`/api/tickets/${TICKET_ID}/certificados`, async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json(certificado({ id: "c-nuevo", numero: 2, porcentaje: 15 }), { status: 201 });
    }),
    http.post(`/api/tickets/${TICKET_ID}/certificados/:certificadoId/anular`, async ({ request, params }) => {
      posts.push({ certificadoId: params.certificadoId, ...((await request.json()) as Record<string, unknown>) });
      return HttpResponse.json(certificado({ vigente: false }));
    }),
  );
  return { posts };
}

function render(puedeCertificar = true, estadoCodigo = "EN_PROCESO") {
  return renderWithProviders(
    <TicketCertificados ticketId={TICKET_ID} puedeCertificar={puedeCertificar} estadoCodigo={estadoCodigo} />,
    { user: buildUser({ permisos: [] }) },
  );
}

describe("TicketCertificados — lista (S5, S6, S8)", () => {
  it("muestra cada certificado con su porcentaje, quién lo emitió y los pesos copiados; el anulado con su motivo", async () => {
    mockBackend(
      [LOSA, REVOQUE, PINTURA],
      [
        certificado(),
        certificado({
          id: "c0",
          numero: 2,
          porcentaje: 15,
          vigente: false,
          anuladoEn: "2026-11-03T10:00:00.000Z",
          anuladoPorId: "u-admin",
          anuladoPorNombre: "Ana",
          anuladoPorApellido: "Paz",
          motivoAnulacion: "Se cargó mal",
          tareas: [{ tareaId: "ta-revoque", descripcion: "Revoque", peso: 15 }],
        }),
      ],
    );
    render(false);

    const vigente = await screen.findByRole("listitem", { name: "Certificado N.º 1" });
    expect(within(vigente).getByText("Certificado N.º 1 · 20 %")).toBeInTheDocument();
    expect(within(vigente).getByText("Vigente")).toBeInTheDocument();
    expect(within(vigente).getByText(/por Carla Gómez/)).toBeInTheDocument();
    expect(within(vigente).getByText("Losa · 20 %")).toBeInTheDocument();
    const anulado = screen.getByRole("listitem", { name: "Certificado N.º 2" });
    expect(within(anulado).getByText("Anulado")).toBeInTheDocument();
    expect(within(anulado).getByText(/por Ana Paz: Se cargó mal/)).toBeInTheDocument();
  });

  it("sin CERTIFICAR no hay emisión ni anulación", async () => {
    mockBackend([LOSA, REVOQUE, PINTURA], [certificado()]);
    render(false);

    await screen.findByText("Certificado N.º 1 · 20 %");
    expect(screen.queryByText("Emitir certificado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });
});

describe("TicketCertificados — emitir (S4, S5)", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("ofrece solo las completadas sin certificar, calcula el porcentaje y manda las elegidas", async () => {
    const user = userEvent.setup();
    const { posts } = mockBackend([LOSA, REVOQUE, PINTURA], [certificado()]);
    render();

    await screen.findByRole("heading", { name: "Emitir certificado" });
    // Losa ya está en el certificado vigente y Pintura está pendiente.
    expect(screen.queryByText("Losa · 20 %", { selector: "label" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pintura/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Emitir certificado" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Certifica 15 %")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Emitir certificado" }));

    await waitFor(() => expect(posts).toEqual([{ tareaIds: ["ta-revoque"] }]));
  });

  it("con pesos que no suman 100 muestra el motivo y no ofrece tareas", async () => {
    mockBackend([LOSA, REVOQUE], []);
    render();

    expect(
      await screen.findByText("Los pesos de las tareas suman 35 %: tienen que sumar 100 % antes de certificar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("con el ticket cerrado no emite ni anula", async () => {
    mockBackend([LOSA, REVOQUE, PINTURA], [certificado()]);
    render(true, "CERRADO");

    expect(await screen.findByText("Un ticket cerrado o cancelado no admite emitir certificados.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("el rechazo del servidor llega con su mensaje", async () => {
    const user = userEvent.setup();
    const mensaje = "La tarea «Revoque» ya está en un certificado vigente.";
    mockBackend([LOSA, REVOQUE, PINTURA], [certificado()]);
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/certificados`, () =>
        HttpResponse.json({ statusCode: 422, message: mensaje, error: "Unprocessable Entity" }, { status: 422 }),
      ),
    );
    render();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Emitir certificado" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
  });
});

describe("TicketCertificados — anular (S8)", () => {
  it("exige motivo: en blanco no se manda; con motivo, POST .../anular", async () => {
    const user = userEvent.setup();
    const { posts } = mockBackend([LOSA, REVOQUE, PINTURA], [certificado()]);
    render();

    await user.click(await screen.findByRole("button", { name: "Anular" }));
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Motivo"), "   ");
    await user.click(within(dialogo).getByRole("button", { name: "Anular certificado" }));
    expect(await within(dialogo).findByText("El motivo es requerido")).toBeInTheDocument();
    expect(posts).toEqual([]);

    await user.clear(within(dialogo).getByLabelText("Motivo"));
    await user.type(within(dialogo).getByLabelText("Motivo"), "Se certificó de más");
    await user.click(within(dialogo).getByRole("button", { name: "Anular certificado" }));

    await waitFor(() => expect(posts).toEqual([{ certificadoId: "c1", motivo: "Se certificó de más" }]));
  });
});
