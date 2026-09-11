import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteInstalarDialog } from "./componente-instalar-dialog";

const EQUIPO_ID = "88888888-8888-8888-8888-888888888888";
const INSUMO_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Mismo catálogo vinculable que `ComponenteCreateDialog` — este diálogo pide
 * el MISMO `useInsumos(true, true)`, `soloVinculables=true` incluido.
 */
const REPUESTOS_VINCULABLES = [
  {
    id: INSUMO_ID,
    codigo: "MOUSE-001",
    nombre: "Mouse óptico USB",
    familiaId: "familia-mouse",
    unidadMedidaId: "unidad-1",
    stockMinimo: null,
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function mockBackend() {
  server.use(http.get("/api/insumos", () => HttpResponse.json(REPUESTOS_VINCULABLES)));
}

function respuestaComponente(overrides: Record<string, unknown> = {}) {
  return {
    id: "c9",
    equipoId: EQUIPO_ID,
    tipoComponenteCodigo: "MOUSE",
    insumoId: INSUMO_ID,
    descripcion: null,
    numeroSerie: null,
    capacidad: null,
    activo: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /instalar desde depósito/i }));
  return user;
}

describe("ComponenteInstalarDialog (WU-4, issue #153)", () => {
  beforeEach(() => mockBackend());

  it("al abrir muestra el repuesto (sin selector de tipo) + descripción, número de serie y capacidad", async () => {
    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/repuesto del catálogo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^tipo$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capacidad/i)).toBeInTheDocument();
  });

  it("pide el catálogo con esRepuesto=true y soloVinculables=true (misma fuente que ComponenteCreateDialog)", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get("/api/insumos", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(REPUESTOS_VINCULABLES);
      }),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    await abrirDialog();
    await screen.findByRole("option", { name: /mouse-001/i });

    expect(capturedUrl?.searchParams.get("esRepuesto")).toBe("true");
    expect(capturedUrl?.searchParams.get("soloVinculables")).toBe("true");
  });

  it("sin elegir repuesto, enviar muestra el error de validación y NO hace POST", async () => {
    let sePostió = false;
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, () => {
        sePostió = true;
        return HttpResponse.json(respuestaComponente());
      }),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.click(screen.getByRole("button", { name: /^instalar$/i }));

    expect(await screen.findByText(/elegí un repuesto del catálogo/i)).toBeInTheDocument();
    expect(sePostió).toBe(false);
  });

  it("elegir un repuesto y enviar hace POST a instalar-desde-deposito SIN tipoComponenteCodigo en el body", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(respuestaComponente());
      }),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), INSUMO_ID);
    await user.type(screen.getByLabelText(/número de serie/i), "SN-777");
    await user.click(screen.getByRole("button", { name: /^instalar$/i }));

    await waitFor(() => expect(capturedBody.insumoId).toBe(INSUMO_ID));
    expect(capturedBody.numeroSerie).toBe("SN-777");
    expect(capturedBody.tipoComponenteCodigo).toBeUndefined();
    expect("tipoComponenteCodigo" in capturedBody).toBe(false);
  });

  it("el select ofrece EXACTAMENTE el catálogo vinculable, sin opción de 'sin repuesto' (a diferencia de ComponenteCreateDialog)", async () => {
    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    await abrirDialog();
    await screen.findByRole("option", { name: /mouse-001/i });

    const options = within(screen.getByLabelText(/repuesto del catálogo/i))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Elegí un repuesto", "MOUSE-001 — Mouse óptico USB"]);
  });

  it("stock insuficiente (422 del backend): NO cierra el diálogo y no navega a un estado de éxito", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, () =>
        HttpResponse.json(
          { message: `El insumo con id "${INSUMO_ID}" no tiene stock suficiente.` },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), INSUMO_ID);
    await user.click(screen.getByRole("button", { name: /^instalar$/i }));

    // El diálogo sigue abierto y con sus campos — un 422 no es un éxito.
    await waitFor(() => expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument());
  });

  it("cierra el diálogo cuando el POST tiene éxito", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, () =>
        HttpResponse.json(respuestaComponente()),
      ),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), INSUMO_ID);
    await user.click(screen.getByRole("button", { name: /^instalar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  it("deshabilita el botón «Instalar» mientras el POST está pendiente (evita doble submit)", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, async () => {
        await delay(50);
        return HttpResponse.json(respuestaComponente());
      }),
    );

    renderWithProviders(<ComponenteInstalarDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), INSUMO_ID);

    const submitButton = screen.getByRole("button", { name: /^instalar$/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });
});
