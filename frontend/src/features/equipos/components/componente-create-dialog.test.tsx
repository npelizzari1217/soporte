import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext } from "@/shared/providers/session-provider";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteCreateDialog } from "./componente-create-dialog";

const EQUIPO_ID = "77777777-7777-7777-7777-777777777777";

/**
 * Catálogo CRUDO de repuestos (WU-3, sdd/repuestos-vinculo-componente) —
 * misma fuente que `useInsumos(true, true)`. Simula lo que `GET /insumos`
 * devolvería SIN el filtro `soloVinculables`: incluye el insumo deshabilitado
 * y el de familia deshabilitada, que el SERVIDOR saca cuando el diálogo pide
 * `soloVinculables=true` — ver `repuestosParaQuery()` más abajo.
 */
const REPUESTOS_CATALOGO = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    codigo: "MOUSE-001",
    nombre: "Mouse óptico USB",
    familiaId: "familia-mouse",
    unidadMedidaId: "unidad-1",
    stockMinimo: null,
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    // Insumo dado de baja A PROPÓSITO: el diálogo NO debe ofrecerlo —
    // elegirlo termina en un 422 `INSUMO_REPUESTO_INEXISTENTE` por algo que
    // el usuario vio en la lista.
    id: "22222222-2222-4222-8222-222222222222",
    codigo: "TECLA-009",
    nombre: "Teclado retirado de circulación",
    familiaId: "familia-teclado",
    unidadMedidaId: "unidad-1",
    stockMinimo: null,
    activo: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    // NUEVO (WU-3) — el hallazgo que originó este work unit: insumo
    // HABILITADO cuya FAMILIA está deshabilitada. El diálogo tampoco debe
    // ofrecerlo — elegirlo terminaba en un 422 `FAMILIA_REPUESTO_DESHABILITADA`
    // por algo que el usuario acababa de leer en pantalla. `Insumo`
    // (frontend) no expone el estado de la familia — el mock lo marca aparte
    // en `IDS_FAMILIA_DESHABILITADA`, sin inventarle un campo a la respuesta
    // real.
    id: "33333333-3333-4333-8333-333333333333",
    codigo: "AURI-004",
    nombre: "Auriculares con diadema",
    familiaId: "familia-auriculares-deshabilitada",
    unidadMedidaId: "unidad-1",
    stockMinimo: null,
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * Ids que el SERVIDOR excluye cuando `soloVinculables=true` por tener la
 * FAMILIA deshabilitada. Aparte de `REPUESTOS_CATALOGO` a propósito: ese
 * estado no viaja en `InsumoResponseDto`, así que mezclarlo ahí simularía un
 * campo que la API real no manda.
 */
const IDS_FAMILIA_DESHABILITADA = new Set(["33333333-3333-4333-8333-333333333333"]);

/**
 * Simula el filtro `soloVinculables` que corre en el SERVIDOR
 * (`PrismaInsumoRepository.findAllActive`, WU-3): con `soloVinculables=true`
 * en la querystring, saca el insumo deshabilitado (`activo: false`) Y el de
 * familia deshabilitada — las DOS condiciones que `AgregarComponenteUseCase`
 * exige para aceptar un vínculo. Sin ese parámetro, devuelve el catálogo
 * crudo tal cual.
 */
function repuestosParaQuery(url: URL): typeof REPUESTOS_CATALOGO {
  if (url.searchParams.get("soloVinculables") !== "true") return REPUESTOS_CATALOGO;
  return REPUESTOS_CATALOGO.filter(
    (repuesto) => repuesto.activo && !IDS_FAMILIA_DESHABILITADA.has(repuesto.id),
  );
}

function mockBackend() {
  server.use(
    http.get("/api/insumos", ({ request }) =>
      HttpResponse.json(repuestosParaQuery(new URL(request.url))),
    ),
  );
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /agregar componente/i }));
  return user;
}

const COMPONENTE_RESPUESTA = {
  id: "c9",
  equipoId: EQUIPO_ID,
  insumoId: "11111111-1111-4111-8111-111111111111",
  descripcion: null,
  numeroSerie: null,
  capacidad: null,
  activo: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const MOUSE_ID = "11111111-1111-4111-8111-111111111111";

/** Captura el body del POST de alta y responde 201. */
function capturarPost(): { body: () => Record<string, unknown> } {
  let capturedBody: Record<string, unknown> = {};
  server.use(
    http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async ({ request }) => {
      capturedBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(COMPONENTE_RESPUESTA, { status: 201 });
    }),
  );
  return { body: () => capturedBody };
}

function renderDialog() {
  return renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
    user: buildUser({ permisos: ["equipo:gestionar"] }),
  });
}

describe("ComponenteCreateDialog", () => {
  beforeEach(() => mockBackend());

  it("al abrir muestra repuesto, descripción, número de serie, capacidad y la casilla, y NO hay selector de tipo", async () => {
    renderDialog();
    await abrirDialog();

    expect(await screen.findByLabelText(/repuesto del catálogo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capacidad/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /descontar del depósito/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^tipo$/i)).not.toBeInTheDocument();
  });

  it("la casilla «Descontar del depósito» arranca marcada", async () => {
    renderDialog();
    await abrirDialog();

    expect(await screen.findByRole("checkbox", { name: /descontar del depósito/i })).toBeChecked();
  });

  it("con la casilla marcada el POST lleva descontarStock: true explícito", async () => {
    const post = capturarPost();
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
    expect(post.body().descontarStock).toBe(true);
    expect(post.body()).not.toHaveProperty("tipoComponenteCodigo");
  });

  it("con la casilla desmarcada el POST lleva descontarStock: false explícito", async () => {
    const post = capturarPost();
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.click(screen.getByRole("checkbox", { name: /descontar del depósito/i }));
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
    expect(post.body().descontarStock).toBe(false);
  });

  it("envía descripción, número de serie y capacidad en el POST", async () => {
    const post = capturarPost();
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.type(screen.getByLabelText(/descripción/i), "Slot 2");
    await user.type(screen.getByLabelText(/número de serie/i), "SN-999");
    await user.type(screen.getByLabelText(/capacidad/i), "32GB");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(post.body().descripcion).toBe("Slot 2"));
    expect(post.body().numeroSerie).toBe("SN-999");
    expect(post.body().capacidad).toBe("32GB");
  });

  it("pide el catálogo con esRepuesto=true y soloVinculables=true, y el select ofrece EXACTAMENTE ese catálogo", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get("/api/insumos", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(repuestosParaQuery(capturedUrl));
      }),
    );
    renderDialog();
    await abrirDialog();

    await screen.findByRole("option", { name: /mouse-001/i });
    expect(capturedUrl?.searchParams.get("esRepuesto")).toBe("true");
    expect(capturedUrl?.searchParams.get("soloVinculables")).toBe("true");

    // `toEqual` y no `toContain`: atrapa a los DOS repuestos que el servidor
    // excluye (insumo dado de baja y familia deshabilitada).
    const options = within(screen.getByLabelText(/repuesto del catálogo/i))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Elegí un repuesto", "MOUSE-001 — Mouse óptico USB"]);
  });

  it("enviar sin elegir repuesto muestra el error y no hace POST", async () => {
    let posteado = false;
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, () => {
        posteado = true;
        return HttpResponse.json(COMPONENTE_RESPUESTA, { status: 201 });
      }),
    );
    renderDialog();
    const user = await abrirDialog();
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    expect(await screen.findByText(/elegí un repuesto del catálogo/i)).toBeInTheDocument();
    expect(posteado).toBe(false);
  });

  it("cierra el dialog cuando el POST tiene éxito", async () => {
    capturarPost();
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  it("al reabrir después de un alta previa, vuelve a los valores vigentes: campos vacíos y casilla marcada (reset al abrir)", async () => {
    capturarPost();
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.type(screen.getByLabelText(/descripción/i), "Slot 2");
    await user.click(screen.getByRole("checkbox", { name: /descontar del depósito/i }));
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("");
    expect(screen.getByLabelText(/número de serie/i)).toHaveValue("");
    expect(screen.getByLabelText(/capacidad/i)).toHaveValue("");
    expect(screen.getByLabelText(/repuesto del catálogo/i)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /descontar del depósito/i })).toBeChecked();
  });

  it("al dar de alta con éxito invalida el equipo, el stock y los movimientos del repuesto y el listado de insumos", async () => {
    capturarPost();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider
          value={{ user: buildUser({ permisos: ["equipo:gestionar"] }), isLoading: false, setUser: () => {} }}
        >
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );

    render(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, { wrapper });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => {
      const claves = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
      expect(claves).toContain(JSON.stringify(["equipo", EQUIPO_ID]));
      expect(claves).toContain(JSON.stringify(["insumo", MOUSE_ID, "stock"]));
      expect(claves).toContain(JSON.stringify(["insumo", MOUSE_ID, "movimientos"]));
      expect(claves).toContain(JSON.stringify(["insumos"]));
    });
  });

  it("deshabilita el botón «Agregar» mientras el POST está pendiente (evita doble submit)", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async () => {
        await delay(50);
        return HttpResponse.json(COMPONENTE_RESPUESTA, { status: 201 });
      }),
    );
    renderDialog();
    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);

    const submitButton = screen.getByRole("button", { name: /agregar$/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });
});
