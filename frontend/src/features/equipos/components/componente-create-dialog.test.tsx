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

function mockStock(saldos: { NUEVO: number; USADO: number }, admiteUsado: boolean) {
  server.use(
    http.get(`/api/insumos/${MOUSE_ID}/stock`, () =>
      HttpResponse.json({
        insumoId: MOUSE_ID,
        saldo: saldos.NUEVO + saldos.USADO,
        saldos,
        admiteUsado,
        stockMinimo: null,
        estadoReposicion: "SIN_MINIMO",
      }),
    ),
  );
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

  describe("selector de condición", () => {
    const CON_AMBOS = { NUEVO: 3, USADO: 2 };

    it("con descuento y ambos saldos muestra NUEVO preseleccionado y USADO elegible; el POST lleva la condición elegida", async () => {
      mockStock(CON_AMBOS, true);
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);

      const selector = await screen.findByLabelText("Condición");
      expect(selector).toHaveValue("NUEVO");
      expect(selector).toBeEnabled();
      await user.selectOptions(selector, "USADO");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
      expect(post.body().condicion).toBe("USADO");
      expect(post.body().descontarStock).toBe(true);
    });

    it("con un solo saldo positivo queda fijo y deshabilitado en ese saldo", async () => {
      mockStock({ NUEVO: 0, USADO: 2 }, true);
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);

      const selector = await screen.findByLabelText("Condición");
      expect(selector).toHaveValue("USADO");
      expect(selector).toBeDisabled();
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
      expect(post.body().condicion).toBe("USADO");
    });

    it("si el insumo no admite usado no hay selector y el POST no lleva condición", async () => {
      mockStock({ NUEVO: 3, USADO: 0 }, false);
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
      await waitFor(() => expect(screen.queryByLabelText("Condición")).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
      expect(post.body()).not.toHaveProperty("condicion");
    });

    it("desmarcar la casilla tras elegir USADO oculta el selector y no envía condición", async () => {
      mockStock(CON_AMBOS, true);
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
      await user.selectOptions(await screen.findByLabelText("Condición"), "USADO");
      await user.click(screen.getByRole("checkbox", { name: /descontar del depósito/i }));

      expect(screen.queryByLabelText("Condición")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
      expect(post.body().descontarStock).toBe(false);
      expect(post.body()).not.toHaveProperty("condicion");
    });

    it("sin acceso a la consulta de stock el selector queda habilitado en NUEVO y el POST lleva NUEVO", async () => {
      server.use(
        http.get(`/api/insumos/${MOUSE_ID}/stock`, () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
      );
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);

      const selector = await screen.findByLabelText("Condición");
      expect(selector).toHaveValue("NUEVO");
      expect(selector).toBeEnabled();
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().insumoId).toBe(MOUSE_ID));
      expect(post.body().condicion).toBe("NUEVO");
    });

    describe("al cambiar de repuesto", () => {
      const OTRO_ID = "44444444-4444-4444-8444-444444444444";

      function mockDosRepuestos(saldosOtro: { NUEVO: number; USADO: number }) {
        server.use(
          http.get("/api/insumos", () =>
            HttpResponse.json([REPUESTOS_CATALOGO[0], { ...REPUESTOS_CATALOGO[0], id: OTRO_ID, codigo: "RAM-002", nombre: "Memoria RAM" }]),
          ),
          http.get(`/api/insumos/${OTRO_ID}/stock`, () =>
            HttpResponse.json({
              insumoId: OTRO_ID,
              saldo: saldosOtro.NUEVO + saldosOtro.USADO,
              saldos: saldosOtro,
              admiteUsado: true,
              stockMinimo: null,
              estadoReposicion: "SIN_MINIMO",
            }),
          ),
        );
      }

      it("el selector vuelve a NUEVO y el POST lleva NUEVO aunque antes se eligió USADO", async () => {
        mockStock(CON_AMBOS, true);
        mockDosRepuestos(CON_AMBOS);
        const post = capturarPost();
        renderDialog();
        const user = await abrirDialog();
        const repuesto = await screen.findByLabelText(/repuesto del catálogo/i);
        await screen.findByRole("option", { name: /ram-002/i });
        await user.selectOptions(repuesto, MOUSE_ID);
        await user.selectOptions(await screen.findByLabelText("Condición"), "USADO");
        expect(screen.getByLabelText("Condición")).toHaveValue("USADO");

        await user.selectOptions(repuesto, OTRO_ID);

        await waitFor(() => expect(screen.getByLabelText("Condición")).toHaveValue("NUEVO"));
        await user.click(screen.getByRole("button", { name: /agregar$/i }));
        await waitFor(() => expect(post.body().insumoId).toBe(OTRO_ID));
        expect(post.body().condicion).toBe("NUEVO");
      });

      it("si el nuevo repuesto solo tiene saldo USADO, el selector queda fijo en USADO", async () => {
        mockStock(CON_AMBOS, true);
        mockDosRepuestos({ NUEVO: 0, USADO: 4 });
        renderDialog();
        const user = await abrirDialog();
        const repuesto = await screen.findByLabelText(/repuesto del catálogo/i);
        await screen.findByRole("option", { name: /ram-002/i });
        await user.selectOptions(repuesto, MOUSE_ID);
        await user.selectOptions(await screen.findByLabelText("Condición"), "USADO");

        await user.selectOptions(repuesto, OTRO_ID);

        await waitFor(() => expect(screen.getByLabelText("Condición")).toBeDisabled());
        expect(screen.getByLabelText("Condición")).toHaveValue("USADO");
      });
    });
  });

  describe("repuesto con seguimiento por serie (SERIE)", () => {
    const UNIDADES = [
      { id: "u1", insumoId: MOUSE_ID, numeroSerie: "SN-AAA", condicion: "NUEVO", estado: "EN_DEPOSITO", equipoId: null, equipoNombre: null },
      { id: "u2", insumoId: MOUSE_ID, numeroSerie: "SN-BBB", condicion: "USADO", estado: "EN_DEPOSITO", equipoId: null, equipoNombre: null },
    ];

    function mockSerie() {
      server.use(
        http.get("/api/insumos", () => HttpResponse.json([{ ...REPUESTOS_CATALOGO[0], seguimiento: "SERIE" }])),
      );
    }

    it("con descuento ofrece las piezas disponibles, sin saldo ni serial de texto, y envía unidadId", async () => {
      mockSerie();
      let consulta: URL | undefined;
      server.use(
        http.get(`/api/insumos/${MOUSE_ID}/unidades`, ({ request }) => {
          consulta = new URL(request.url);
          return HttpResponse.json(UNIDADES);
        }),
      );
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);

      const pieza = await screen.findByLabelText(/pieza \(por número de serie\)/i);
      await screen.findByRole("option", { name: /SN-AAA/ });
      expect(consulta?.searchParams.get("disponibles")).toBe("true");
      expect(screen.queryByLabelText("Condición")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^número de serie/i)).not.toBeInTheDocument();

      await user.selectOptions(pieza, "u1");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().unidadId).toBe("u1"));
      expect(post.body()).toMatchObject({ insumoId: MOUSE_ID, descontarStock: true });
      expect(post.body()).not.toHaveProperty("condicion");
      expect(post.body()).not.toHaveProperty("numeroSerie");
    });

    it("con descuento y sin elegir pieza muestra el error y no hace POST", async () => {
      mockSerie();
      server.use(http.get(`/api/insumos/${MOUSE_ID}/unidades`, () => HttpResponse.json(UNIDADES)));
      let posteado = false;
      server.use(
        http.post(`/api/equipos/${EQUIPO_ID}/componentes`, () => {
          posteado = true;
          return HttpResponse.json(COMPONENTE_RESPUESTA, { status: 201 });
        }),
      );
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
      await screen.findByRole("option", { name: /SN-AAA/ });
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      expect(await screen.findByText("Elegí la pieza")).toBeInTheDocument();
      expect(posteado).toBe(false);
    });

    it("sin descuento pide el serial y la condición, y no envía unidadId", async () => {
      mockSerie();
      const post = capturarPost();
      renderDialog();
      const user = await abrirDialog();
      await user.selectOptions(await screen.findByLabelText(/repuesto del catálogo/i), MOUSE_ID);
      await user.click(screen.getByRole("checkbox", { name: /descontar del depósito/i }));

      expect(screen.queryByLabelText(/pieza \(por número de serie\)/i)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /agregar$/i }));
      expect(await screen.findByText("El número de serie es requerido")).toBeInTheDocument();
      expect(post.body()).toEqual({});

      await user.type(screen.getByLabelText(/número de serie \(obligatorio\)/i), "  SN-777 ");
      await user.selectOptions(screen.getByLabelText("Condición"), "USADO");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(post.body().numeroSerie).toBe("SN-777"));
      expect(post.body()).toMatchObject({ descontarStock: false, condicion: "USADO" });
      expect(post.body()).not.toHaveProperty("unidadId");
    });
  });
});
