import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import type { ReactElement } from "react";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoEntradaDialog } from "./movimiento-entrada-dialog";
import { MovimientoSalidaDialog } from "./movimiento-salida-dialog";
import { MovimientoAjusteDialog } from "./movimiento-ajuste-dialog";
import type { StockInsumo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * Selector de condición (ADR-7, a1) en las tres puertas de la bitácora. Vive
 * en un archivo aparte para no triplicar el arnés: cada puerta solo cambia el
 * elemento, el segmento de la URL y el permiso.
 */
const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const PUERTAS: {
  nombre: string;
  segmento: string;
  trigger: RegExp;
  permiso: string;
  elemento: () => ReactElement;
  completar: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
}[] = [
  {
    nombre: "entrada",
    segmento: "entrada",
    trigger: /registrar entrada/i,
    permiso: "INSUMOS:ALTAS",
    elemento: () => <MovimientoEntradaDialog insumoId={INSUMO_ID} activo />,
    completar: async () => {},
  },
  {
    nombre: "salida",
    segmento: "salida",
    trigger: /registrar salida/i,
    permiso: "INSUMOS:ALTAS",
    elemento: () => <MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />,
    completar: async () => {},
  },
  {
    nombre: "ajuste",
    segmento: "ajuste",
    trigger: /registrar ajuste/i,
    permiso: "INSUMOS:AJUSTAR",
    elemento: () => <MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />,
    completar: async (user) => {
      await user.type(screen.getByLabelText(/^motivo/i), "Conteo físico");
    },
  },
];

function stock(saldos: { NUEVO: number; USADO: number }, admiteUsado: boolean): StockInsumo {
  return {
    insumoId: INSUMO_ID,
    stock: saldos.NUEVO + saldos.USADO,
    saldos,
    admiteUsado,
    stockMinimo: null,
    estadoReposicion: "SIN_PUNTO_DEFINIDO",
    seguimiento: "NINGUNO",
    pendientesDeSerie: 0,
  };
}

function mockearStock(respuesta: StockInsumo | "403") {
  server.use(
    http.get(`/api/insumos/${INSUMO_ID}/stock`, () =>
      respuesta === "403"
        ? HttpResponse.json({ statusCode: 403, message: "Prohibido" }, { status: 403 })
        : HttpResponse.json(respuesta),
    ),
    http.get("/api/equipos", () => HttpResponse.json([])),
    http.get("/api/sectores", () => HttpResponse.json([])),
  );
}

function capturarPost(segmento: string, status = 201, cuerpo: Record<string, unknown> = { id: "mov-1" }) {
  const capturado: { body?: Record<string, unknown> } = {};
  server.use(
    http.post(`/api/insumos/${INSUMO_ID}/movimientos/${segmento}`, async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(cuerpo, { status });
    }),
  );
  return capturado;
}

describe.each(PUERTAS)("selector de condición en la $nombre", (puerta) => {
  async function abrir() {
    renderWithProviders(puerta.elemento(), { user: buildUser({ permisos: [puerta.permiso] }) });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: puerta.trigger }));
    await screen.findByLabelText(/^cantidad$/i);
    return user;
  }

  async function enviar(user: ReturnType<typeof userEvent.setup>) {
    await puerta.completar(user);
    await user.type(screen.getByLabelText(/^cantidad$/i), "2");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));
  }

  it("queda oculto si el insumo no admite usado y el payload no lleva condicion", async () => {
    mockearStock(stock({ NUEVO: 5, USADO: 0 }, false));
    const capturado = capturarPost(puerta.segmento);
    const user = await abrir();

    await waitFor(() => expect(screen.queryByLabelText(/^condición$/i)).not.toBeInTheDocument());
    await enviar(user);

    await waitFor(() => expect(capturado.body?.cantidad).toBe(2));
    expect(capturado.body).not.toHaveProperty("condicion");
  });

  it("con admiteUsado y ambos saldos, arranca en NUEVO y permite enviar USADO", async () => {
    mockearStock(stock({ NUEVO: 5, USADO: 3 }, true));
    const capturado = capturarPost(puerta.segmento);
    const user = await abrir();

    const selector = await screen.findByLabelText(/^condición$/i);
    expect(selector).toHaveValue("NUEVO");
    expect(selector).toBeEnabled();
    await user.selectOptions(selector, "USADO");
    await enviar(user);

    await waitFor(() => expect(capturado.body?.condicion).toBe("USADO"));
  });

  it("con un solo saldo positivo queda fijo en esa condición y deshabilitado", async () => {
    mockearStock(stock({ NUEVO: 0, USADO: 4 }, true));
    const capturado = capturarPost(puerta.segmento);
    const user = await abrir();

    const selector = await screen.findByLabelText(/^condición$/i);
    await waitFor(() => expect(selector).toHaveValue("USADO"));
    expect(selector).toBeDisabled();
    await enviar(user);

    await waitFor(() => expect(capturado.body?.condicion).toBe("USADO"));
  });

  it("sin acceso a la consulta de stock queda habilitado y en NUEVO", async () => {
    mockearStock("403");
    const capturado = capturarPost(puerta.segmento);
    const user = await abrir();

    const selector = await screen.findByLabelText(/^condición$/i);
    expect(selector).toBeEnabled();
    expect(selector).toHaveValue("NUEVO");
    await enviar(user);

    await waitFor(() => expect(capturado.body?.condicion).toBe("NUEVO"));
  });
});

describe("selector de condición: error del backend", () => {
  it("la salida en NUEVO sin saldo suficiente en esa condición muestra el error del backend", async () => {
    const MENSAJE = "Stock insuficiente en condición NUEVO: se pidieron 5, hay 2 disponibles.";
    mockearStock(stock({ NUEVO: 2, USADO: 8 }, true));
    capturarPost("salida", 422, { statusCode: 422, message: MENSAJE });
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /registrar salida/i }));
    await screen.findByLabelText(/^condición$/i);
    await user.type(screen.getByLabelText(/^cantidad$/i), "5");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE));
    expect(screen.getByLabelText(/^cantidad$/i)).toBeInTheDocument();
  });
});
