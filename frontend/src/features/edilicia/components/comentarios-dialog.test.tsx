import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComentariosDialog } from "./comentarios-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function comentario(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    ticketEdiliciaId: "rep1",
    texto: "Falta el repuesto X",
    autorId: "u1",
    autorNombre: "Ana",
    autorApellido: "Gómez",
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("ComentariosDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
  });

  it("lista los comentarios del GET con autor y fecha visibles", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/reparaciones/rep1/comentarios", () =>
        HttpResponse.json([comentario(), comentario({ id: "c0", texto: "Se pidió el repuesto", autorNombre: null, autorApellido: null })]),
      ),
    );

    renderWithProviders(
      <ComentariosDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver comentarios</button>} />,
      { user: buildUser({ permisos: [] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver comentarios/i }));

    expect(await screen.findByText("Falta el repuesto X")).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    // Sin nombre resuelto (usuario dado de baja) cae al autorId, nunca en blanco.
    expect(screen.getByText("u1")).toBeInTheDocument();
    // Fecha visible, renderizada con `formatearInstante` (día/mes/año + hora).
    // La hora sale en el huso de quien mira; acá el literal es estable porque
    // `vitest.config.ts` fija el TZ de la suite, no porque la función imponga
    // una zona. Literal fijo, NO derivado del mismo `Intl` que usa el
    // componente — derivarlo del mismo formateador deja el test ciego a una
    // regresión de zona horaria (ver `ticket-header` en este cambio).
    // `2026-08-18T10:00:00.000Z` = 07:00 con el TZ de la suite (UTC-3).
    expect(screen.getAllByText("18/08/2026 07:00")).toHaveLength(2);
    // Solo lectura: sin EDILICIA:ALTAS no aparece el form.
    expect(screen.queryByLabelText(/nuevo comentario/i)).not.toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la reparación no tiene comentarios", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/reparaciones/rep1/comentarios", () => HttpResponse.json([])));

    renderWithProviders(
      <ComentariosDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver comentarios</button>} />,
      { user: buildUser({ permisos: [] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver comentarios/i }));

    expect(await screen.findByText(/sin comentarios/i)).toBeInTheDocument();
  });

  it("muestra el estado de error cuando el GET falla", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/reparaciones/rep1/comentarios", () => HttpResponse.json({ message: "boom" }, { status: 500 })),
    );

    renderWithProviders(
      <ComentariosDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver comentarios</button>} />,
      { user: buildUser({ permisos: [] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver comentarios/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar los comentarios/i);
  });

  it("con EDILICIA:ALTAS postea el comentario e invalida la lista (el nuevo aparece)", async () => {
    const user = userEvent.setup();
    let posteado: unknown = null;
    let getsServidos = 0;
    server.use(
      http.get("/api/reparaciones/rep1/comentarios", () => {
        getsServidos += 1;
        // El segundo GET (post-invalidación) ya trae el comentario nuevo.
        return HttpResponse.json(getsServidos === 1 ? [] : [comentario({ texto: "Sigue sin llegar el repuesto" })]);
      }),
      http.post("/api/reparaciones/rep1/comentarios", async ({ request }) => {
        posteado = await request.json();
        return HttpResponse.json(comentario({ texto: "Sigue sin llegar el repuesto" }), { status: 201 });
      }),
    );

    renderWithProviders(
      <ComentariosDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver comentarios</button>} />,
      { user: buildUser({ permisos: ["EDILICIA:ALTAS"] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver comentarios/i }));
    await screen.findByText(/sin comentarios/i);

    await user.type(screen.getByLabelText(/nuevo comentario/i), "Sigue sin llegar el repuesto");
    await user.click(screen.getByRole("button", { name: /^comentar$/i }));

    await waitFor(() => expect(posteado).toEqual({ texto: "Sigue sin llegar el repuesto" }));
    // La invalidación refetchea: el comentario nuevo entra en la lista.
    expect(await screen.findByText("Sigue sin llegar el repuesto")).toBeInTheDocument();
    expect(getsServidos).toBeGreaterThan(1);
  });

  it("no postea un comentario de puro whitespace (lo corta el schema, no el backend)", async () => {
    const user = userEvent.setup();
    let posteos = 0;
    server.use(
      http.get("/api/reparaciones/rep1/comentarios", () => HttpResponse.json([])),
      http.post("/api/reparaciones/rep1/comentarios", () => {
        posteos += 1;
        return HttpResponse.json(comentario(), { status: 201 });
      }),
    );

    renderWithProviders(
      <ComentariosDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver comentarios</button>} />,
      { user: buildUser({ permisos: ["EDILICIA:ALTAS"] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver comentarios/i }));
    await user.type(screen.getByLabelText(/nuevo comentario/i), "    ");
    await user.click(screen.getByRole("button", { name: /^comentar$/i }));

    await waitFor(() => expect(screen.getByLabelText(/nuevo comentario/i)).toBeInvalid());
    expect(posteos).toBe(0);
  });
});
