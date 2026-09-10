import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext } from "@/shared/providers/session-provider";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteCreateDialog } from "./componente-create-dialog";

const EQUIPO_ID = "77777777-7777-7777-7777-777777777777";

const TIPOS_ACTIVOS = [
  { codigo: "RAM", nombre: "Memoria RAM" },
  { codigo: "DISCO", nombre: "Disco rígido" },
];

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
    http.get("/api/equipos/tipos-componente", () => HttpResponse.json(TIPOS_ACTIVOS)),
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

describe("ComponenteCreateDialog", () => {
  beforeEach(() => mockBackend());

  it("al abrir muestra los cinco campos: repuesto, tipo, descripción, número de serie y capacidad", async () => {
    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/repuesto del catálogo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^tipo$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capacidad/i)).toBeInTheDocument();
  });

  it("elegir un repuesto deshabilita el select de tipo y envía insumoId sin tipoComponenteCodigo", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "MOUSE",
          insumoId: "11111111-1111-4111-8111-111111111111",
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(
      await screen.findByLabelText(/repuesto del catálogo/i),
      "11111111-1111-4111-8111-111111111111",
    );

    expect(screen.getByLabelText(/^tipo$/i)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(capturedBody.insumoId).toBe("11111111-1111-4111-8111-111111111111"));
    expect(capturedBody.tipoComponenteCodigo).toBeUndefined();
  });

  it("envía descripción y número de serie al hacer POST (regresión: campos ausentes del payload)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "RAM",
          descripcion: "Slot 2",
          numeroSerie: "SN-999",
          capacidad: "32GB",
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();

    await user.selectOptions(await screen.findByLabelText(/tipo/i), "RAM");
    await user.type(screen.getByLabelText(/descripción/i), "Slot 2");
    await user.type(screen.getByLabelText(/número de serie/i), "SN-999");
    await user.type(screen.getByLabelText(/capacidad/i), "32GB");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(capturedBody.tipoComponenteCodigo).toBe("RAM"));
    expect(capturedBody.descripcion).toBe("Slot 2");
    expect(capturedBody.numeroSerie).toBe("SN-999");
    expect(capturedBody.descripcion).not.toBeUndefined();
    expect(capturedBody.numeroSerie).not.toBeUndefined();
    expect(capturedBody.capacidad).toBe("32GB");
  });

  it("el selector de tipo ofrece EXACTAMENTE el catálogo de tipos activos, sin opciones fuera de catálogo (a diferencia de ComponenteEditDialog)", async () => {
    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await abrirDialog();

    await screen.findByRole("option", { name: /memoria ram/i });
    // Acotado al select de "Tipo" con `within()`: el de "Repuesto del
    // catálogo" (WU-3) también renderiza `<option>`s propias, y mezclarlas
    // en un solo `getAllByRole` global rompería este pin sin que el
    // catálogo de tipos haya cambiado.
    const options = within(screen.getByLabelText(/^tipo$/i))
      .getAllByRole("option")
      .map((option) => option.textContent);
    // Placeholder + exactamente los 2 tipos activos del mock — ningún tipo
    // extra inyectado. Contraste deliberado con `ComponenteEditDialog`, que
    // SÍ agrega una opción fuera de catálogo para el tipo actual dado de
    // baja (ver docblock del componente). Un `toContain`/`arrayContaining`
    // no alcanza acá: no puede fallar si se agrega una opción de más, solo
    // si falta una — por eso pinea la lista completa con `toEqual`.
    expect(options).toEqual(["Elegí un tipo", "Memoria RAM", "Disco rígido"]);
  });

  it("pide el catálogo con esRepuesto=true y soloVinculables=true, y el select de repuesto ofrece EXACTAMENTE ese catálogo (WU-3)", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get("/api/insumos", ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(repuestosParaQuery(capturedUrl));
      }),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await abrirDialog();

    await screen.findByRole("option", { name: /mouse-001/i });
    // Fija que `useInsumos(true, true)` de verdad pide REPUESTOS VINCULABLES
    // (`esRepuesto=true&soloVinculables=true`) al servidor — sin este assert,
    // un `useInsumos(true, true)` que significara otra cosa habría pasado
    // desapercibido: el select mostraría lo que devuelva el mock, no
    // necesariamente repuestos vinculables reales.
    expect(capturedUrl?.searchParams.get("esRepuesto")).toBe("true");
    expect(capturedUrl?.searchParams.get("soloVinculables")).toBe("true");

    // Mismo criterio `toEqual` que el pin del select de "Tipo": un
    // `toContain`/`arrayContaining` no alcanza, no puede fallar si se cuela
    // una opción de más (por ejemplo un consumible), solo si falta una.
    const options = within(screen.getByLabelText(/repuesto del catálogo/i))
      .getAllByRole("option")
      .map((option) => option.textContent);
    // El pin `toEqual` es el que atrapa a los DOS repuestos que el servidor
    // excluye: TECLA-009 (`activo: false`) y AURI-004 (familia deshabilitada,
    // el hallazgo que originó WU-3). Con un `toContain` cualquiera de los dos
    // filtros podría desaparecer sin que nada se ponga rojo.
    expect(options).toEqual(["Sin repuesto — cargar tipo a mano", "MOUSE-001 — Mouse óptico USB"]);
  });

  it("enviar vacío muestra el error del refine y, al elegir un repuesto, el error desaparece (bug: setValue sin shouldValidate)", async () => {
    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    expect(
      await screen.findByText(/elegí un tipo de componente o un repuesto del catálogo/i),
    ).toBeInTheDocument();

    await user.selectOptions(
      await screen.findByLabelText(/repuesto del catálogo/i),
      "11111111-1111-4111-8111-111111111111",
    );

    // Sin `shouldValidate: true` en el `setValue` que limpia el tipo, el
    // mensaje de error quedaba en pantalla — apuntando a un select que en
    // ese momento está deshabilitado — aunque el formulario ya sea válido.
    await waitFor(() =>
      expect(
        screen.queryByText(/elegí un tipo de componente o un repuesto del catálogo/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("cierra el dialog cuando el POST tiene éxito", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, () =>
        HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "RAM",
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();

    await user.selectOptions(await screen.findByLabelText(/tipo/i), "RAM");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  it("al reabrir después de un alta previa, muestra los campos vacíos (reset al abrir)", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, () =>
        HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "RAM",
          descripcion: "Slot 2",
          numeroSerie: "SN-999",
          capacidad: "32GB",
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/tipo/i), "RAM");
    await user.type(screen.getByLabelText(/descripción/i), "Slot 2");
    await user.type(screen.getByLabelText(/número de serie/i), "SN-999");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("");
    expect(screen.getByLabelText(/número de serie/i)).toHaveValue("");
    expect(screen.getByLabelText(/capacidad/i)).toHaveValue("");
    expect(screen.getByLabelText(/tipo/i)).toHaveValue("");
  });

  it("C6: al dar de alta con éxito, invalida ['equipo', equipoId] (refresco por invalidación, spec R4)", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, () =>
        HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "RAM",
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["equipo", EQUIPO_ID], { id: EQUIPO_ID, nombre: "Notebook" });
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
    await user.selectOptions(await screen.findByLabelText(/tipo/i), "RAM");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(queryClient.getQueryState(["equipo", EQUIPO_ID])!.isInvalidated).toBe(true));
  });

  it("deshabilita el botón «Agregar» mientras el POST está pendiente (evita doble submit, spec R1)", async () => {
    server.use(
      http.post(`/api/equipos/${EQUIPO_ID}/componentes`, async () => {
        await delay(50);
        return HttpResponse.json({
          id: "c9",
          equipoId: EQUIPO_ID,
          tipoComponenteCodigo: "RAM",
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
          activo: true,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(await screen.findByLabelText(/tipo/i), "RAM");

    const submitButton = screen.getByRole("button", { name: /agregar$/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());

    // Deja resolver el POST (delay de 50ms) para no dejar una promesa
    // pendiente al terminar el test.
    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });
});
