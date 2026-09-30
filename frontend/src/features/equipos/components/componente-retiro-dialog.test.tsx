import { describe, it, expect } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteRetiroDialog } from "./componente-retiro-dialog";
import type { ComponenteConTipo } from "../types";

const EQUIPO_ID = "55555555-5555-5555-5555-555555555555";
const INSUMO_ID = "11111111-1111-4111-8111-111111111111";

const componente: ComponenteConTipo = {
  id: "comp-1",
  equipoId: EQUIPO_ID,
  insumoId: INSUMO_ID,
  tipoNombre: "Memoria RAM",
  tipoActivo: true,
  descripcion: null,
  numeroSerie: null,
  capacidad: "8GB",
  activo: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const RUTA = `/api/equipos/${EQUIPO_ID}/componentes/comp-1/baja`;

function render() {
  return renderWithProviders(<ComponenteRetiroDialog equipoId={EQUIPO_ID} componente={componente} />, {
    user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
  });
}

function capturar(respuesta?: () => Response) {
  const cuerpos: unknown[] = [];
  server.use(
    http.post(RUTA, async ({ request }) => {
      cuerpos.push(await request.json());
      return respuesta ? respuesta() : HttpResponse.json({ ...componente, activo: false });
    }),
  );
  return cuerpos;
}

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /dar de baja componente/i }));
}

describe("ComponenteRetiroDialog", () => {
  it("descartar sin motivo bloquea el envío y no llama al backend", async () => {
    const user = userEvent.setup();
    const cuerpos = capturar();
    render();
    await abrir(user);

    await user.click(screen.getByLabelText(/descartar por rotura/i));
    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    expect(await screen.findByText("Indicá el motivo del descarte")).toBeVisible();
    expect(cuerpos).toHaveLength(0);
  });

  it("descartar con motivo envía DESCARTE con el motivo sin espacios sobrantes", async () => {
    const user = userEvent.setup();
    const cuerpos = capturar();
    render();
    await abrir(user);

    await user.click(screen.getByLabelText(/descartar por rotura/i));
    await user.type(screen.getByLabelText(/motivo/i), "  Se quemó  ");
    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    await waitFor(() => expect(cuerpos).toEqual([{ destino: "DESCARTE", motivo: "Se quemó" }]));
  });

  it("devolver al stock sin motivo está permitido y no envía motivo", async () => {
    const user = userEvent.setup();
    const cuerpos = capturar();
    render();
    await abrir(user);

    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    await waitFor(() => expect(cuerpos).toEqual([{ destino: "STOCK_USADO" }]));
  });

  it("un motivo de más de 500 caracteres bloquea el envío", async () => {
    const user = userEvent.setup();
    const cuerpos = capturar();
    render();
    await abrir(user);

    await user.click(screen.getByLabelText(/descartar por rotura/i));
    await user.click(screen.getByLabelText(/motivo/i));
    await user.paste("a".repeat(501));
    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/500/);
    expect(cuerpos).toHaveLength(0);
  });

  it("muestra el 422 del backend dentro del diálogo y lo deja abierto", async () => {
    const user = userEvent.setup();
    capturar(() =>
      HttpResponse.json(
        { statusCode: 422, message: "Indicá el motivo: no hay una salida registrada del depósito." },
        { status: 422 },
      ),
    );
    render();
    await abrir(user);

    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    expect(await screen.findByText(/no hay una salida registrada/i)).toBeVisible();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("al confirmar refresca el equipo y el stock y movimientos del repuesto, y cierra el diálogo", async () => {
    const user = userEvent.setup();
    capturar();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidadas: unknown[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((filtro?: { queryKey?: unknown }) => {
      invalidadas.push(filtro?.queryKey);
      return original(filtro as never);
    }) as typeof queryClient.invalidateQueries;
    rtlRender(
      <QueryClientProvider client={queryClient}>
        <ComponenteRetiroDialog equipoId={EQUIPO_ID} componente={componente} />
      </QueryClientProvider>,
    );
    await abrir(user);

    await user.click(screen.getByRole("button", { name: /confirmar baja/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidadas).toEqual(
      expect.arrayContaining([["equipo", EQUIPO_ID], ["insumo", INSUMO_ID, "stock"], ["insumo", INSUMO_ID, "movimientos"]]),
    );
  });
});
