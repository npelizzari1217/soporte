import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

function mockBackend() {
  server.use(http.get("/api/equipos/tipos-componente", () => HttpResponse.json(TIPOS_ACTIVOS)));
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /agregar componente/i }));
  return user;
}

describe("ComponenteCreateDialog", () => {
  beforeEach(() => mockBackend());

  it("al abrir muestra los cuatro campos: tipo, descripción, número de serie y capacidad", async () => {
    renderWithProviders(<ComponenteCreateDialog equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/tipo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capacidad/i)).toBeInTheDocument();
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
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    // Placeholder + exactamente los 2 tipos activos del mock — ningún tipo
    // extra inyectado. Contraste deliberado con `ComponenteEditDialog`, que
    // SÍ agrega una opción fuera de catálogo para el tipo actual dado de
    // baja (ver docblock del componente). Un `toContain`/`arrayContaining`
    // no alcanza acá: no puede fallar si se agrega una opción de más, solo
    // si falta una — por eso pinea la lista completa con `toEqual`.
    expect(options).toEqual(["Elegí un tipo", "Memoria RAM", "Disco rígido"]);
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
