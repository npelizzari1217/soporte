import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { HorarioLaboralUsuarioPanel } from "./horario-laboral-usuario-panel";

/**
 * HorarioLaboralUsuarioPanel — horario propio de un usuario, abierto desde el botón "Horarios" de
 * `/admin/usuarios` (odd/tasks/tiempo-tecnico.md T2, S1/S2; odd/tasks/pedidos-2026-10-26.md S6). Red
 * simulada con msw sobre `GET`/`PUT`/`DELETE /horario-laboral/usuarios/:usuarioId`.
 */
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ANA = "01900000-0000-7000-8000-0000000000a1";
const BETO = "01900000-0000-7000-8000-0000000000b2";


function semana(apertura: number | null, cierre: number | null) {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
    diaSemana >= 1 && diaSemana <= 5
      ? { diaSemana, aperturaMinuto: apertura, cierreMinuto: cierre }
      : { diaSemana, aperturaMinuto: null, cierreMinuto: null },
  );
}

/** Horario del cliente: 9 a 18. Ana, 8 a 12 propio. Beto, sin propio. */
const DIAS_CLIENTE = semana(540, 1080);
const DIAS_ANA = semana(480, 720);

type Horario = { usuarioId: string; origen: "USUARIO" | "CLIENTE"; dias: ReturnType<typeof semana> };

function mockServidor(horarios: Record<string, Horario>) {
  server.use(
    http.get("/api/horario-laboral/usuarios/:usuarioId", ({ params }) =>
      HttpResponse.json(horarios[String(params.usuarioId)]),
    ),
  );
}

function horariosIniciales(): Record<string, Horario> {
  return {
    [ANA]: { usuarioId: ANA, origen: "USUARIO", dias: DIAS_ANA },
    [BETO]: { usuarioId: BETO, origen: "CLIENTE", dias: DIAS_CLIENTE },
  };
}

const NOMBRES: Record<string, string> = { [ANA]: "Ana López", [BETO]: "Beto Zárate" };

/** Monta el panel del usuario dado; devuelve su contenedor y un `user` para interactuar. */
function renderPanel(usuarioId: string) {
  const user = userEvent.setup();
  renderWithProviders(
    <section aria-label="Panel de horario">
      <HorarioLaboralUsuarioPanel usuarioId={usuarioId} nombreCompleto={NOMBRES[usuarioId]} />
    </section>,
    { user: buildUser({ rol: "ADMINISTRADOR" }) },
  );
  return { seccion: within(screen.getByRole("region", { name: "Panel de horario" })), user };
}

describe("HorarioLaboralUsuarioPanel (tiempo-tecnico T2, pedidos-2026-10-26 S6)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("carga en la grilla el horario propio del usuario", async () => {
    mockServidor(horariosIniciales());
    const { seccion } = renderPanel(ANA);

    expect(await seccion.findByText("Ana López tiene horario propio.")).toBeInTheDocument();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("08:00");
    expect(seccion.getAllByLabelText(/^Cierre/)[1]).toHaveValue("12:00");
    expect(seccion.getByRole("checkbox", { name: "Domingo" })).not.toBeChecked();
  });

  it("si el panel se cierra con el PUT en vuelo, el fallo del guardado igual se avisa (JD-B-005)", async () => {
    mockServidor(horariosIniciales());
    let responder: (() => void) | undefined;
    server.use(
      http.put("/api/horario-laboral/usuarios/:usuarioId", async () => {
        await new Promise<void>((resolve) => {
          responder = resolve;
        });
        return HttpResponse.json({ statusCode: 500, message: "Error interno" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <HorarioLaboralUsuarioPanel usuarioId={ANA} nombreCompleto="Ana López" />,
      { user: buildUser({ rol: "ADMINISTRADOR" }) },
    );
    await user.click(await screen.findByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(responder).toBeDefined());

    unmount();
    responder?.();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  });

  it("con origen CLIENTE avisa que usa el horario del cliente y ofrece Usar horario propio, sin opción de volver", async () => {
    mockServidor(horariosIniciales());

    const { seccion } = renderPanel(BETO);

    expect(await seccion.findByText(/Beto Zárate usa el horario laboral del cliente\./)).toBeInTheDocument();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");
    expect(seccion.getByRole("button", { name: "Usar horario propio" })).toBeInTheDocument();
    expect(seccion.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(seccion.queryByRole("button", { name: "Volver al horario del cliente" })).not.toBeInTheDocument();
  });

  it("con origen USUARIO no muestra el aviso del cliente y ofrece Guardar y Volver al horario del cliente", async () => {
    mockServidor(horariosIniciales());

    const { seccion } = renderPanel(ANA);

    await seccion.findByText("Ana López tiene horario propio.");
    expect(seccion.queryByText(/Ana López usa el horario laboral del cliente/)).not.toBeInTheDocument();
    expect(seccion.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(seccion.getByRole("button", { name: "Volver al horario del cliente" })).toBeInTheDocument();
  });

  it("Usar horario propio hace el PUT del técnico con los valores de la grilla y pasa a horario propio", async () => {
    const horarios = horariosIniciales();
    mockServidor(horarios);
    // El horario del cliente con el viernes cerrado: lo que la grilla debe mandar.
    const diasEsperados = DIAS_CLIENTE.map((dia) =>
      dia.diaSemana === 5 ? { diaSemana: 5, aperturaMinuto: null, cierreMinuto: null } : dia,
    );
    let pedido: { usuarioId: string; body: unknown } | undefined;
    server.use(
      http.put("/api/horario-laboral/usuarios/:usuarioId", async ({ params, request }) => {
        const body: unknown = await request.json();
        pedido = { usuarioId: String(params.usuarioId), body };
        horarios[BETO] = { usuarioId: BETO, origen: "USUARIO", dias: diasEsperados };
        return HttpResponse.json(horarios[BETO]);
      }),
    );

    const { seccion, user } = renderPanel(BETO);
    await seccion.findByRole("button", { name: "Usar horario propio" });
    await user.click(seccion.getByRole("checkbox", { name: "Viernes" }));
    await user.click(seccion.getByRole("button", { name: "Usar horario propio" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Horario del técnico guardado."));
    expect(pedido).toEqual({ usuarioId: BETO, body: { dias: diasEsperados } });
    expect(await seccion.findByText("Beto Zárate tiene horario propio.")).toBeInTheDocument();
    expect(seccion.queryByText(/Beto Zárate usa el horario laboral del cliente/)).not.toBeInTheDocument();
    expect(seccion.getByRole("checkbox", { name: "Viernes" })).not.toBeChecked();
  });

  it("un error al guardar conserva la edición y muestra el mensaje del servidor", async () => {
    mockServidor(horariosIniciales());
    server.use(
      http.put("/api/horario-laboral/usuarios/:usuarioId", () =>
        HttpResponse.json({ statusCode: 422, message: "Debe quedar al menos un día abierto." }, { status: 422 }),
      ),
    );

    const { seccion, user } = renderPanel(ANA);
    await seccion.findByRole("button", { name: "Guardar" });
    await user.click(seccion.getByRole("checkbox", { name: "Martes" }));
    await user.click(seccion.getByRole("button", { name: "Guardar" }));

    expect(await seccion.findByRole("alert")).toHaveTextContent("Debe quedar al menos un día abierto.");
    expect(seccion.getByRole("checkbox", { name: "Martes" })).not.toBeChecked();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Debe quedar al menos un día abierto."));
  });

  it("Volver al horario del cliente pide confirmación y recién al confirmar hace el DELETE", async () => {
    const horarios = horariosIniciales();
    mockServidor(horarios);
    const borrados: string[] = [];
    server.use(
      http.delete("/api/horario-laboral/usuarios/:usuarioId", ({ params }) => {
        borrados.push(String(params.usuarioId));
        horarios[ANA] = { usuarioId: ANA, origen: "CLIENTE", dias: DIAS_CLIENTE };
        return HttpResponse.json(horarios[ANA]);
      }),
    );

    const { seccion, user } = renderPanel(ANA);
    await user.click(await seccion.findByRole("button", { name: "Volver al horario del cliente" }));

    const dialogo = await screen.findByRole("alertdialog", { name: "¿Volver al horario del cliente?" });
    expect(borrados).toEqual([]);
    await user.click(within(dialogo).getByRole("button", { name: "Volver al horario del cliente" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("El técnico vuelve a usar el horario laboral del cliente."),
    );
    expect(borrados).toEqual([ANA]);
    expect(await seccion.findByText(/Ana López usa el horario laboral del cliente\./)).toBeInTheDocument();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");
    expect(seccion.getByRole("button", { name: "Usar horario propio" })).toBeInTheDocument();
  });

  it("cancelar la confirmación no hace el DELETE", async () => {
    mockServidor(horariosIniciales());
    const borrar = vi.fn();
    server.use(
      http.delete("/api/horario-laboral/usuarios/:usuarioId", () => {
        borrar();
        return HttpResponse.json({});
      }),
    );

    const { seccion, user } = renderPanel(ANA);
    await user.click(await seccion.findByRole("button", { name: "Volver al horario del cliente" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(borrar).not.toHaveBeenCalled();
    expect(seccion.getByText("Ana López tiene horario propio.")).toBeInTheDocument();
  });

  it("volver al horario del cliente muestra el del cliente aunque hubiera ediciones sin guardar", async () => {
    const horarios = horariosIniciales();
    mockServidor(horarios);
    server.use(
      http.delete("/api/horario-laboral/usuarios/:usuarioId", () => {
        horarios[ANA] = { usuarioId: ANA, origen: "CLIENTE", dias: DIAS_CLIENTE };
        return HttpResponse.json(horarios[ANA]);
      }),
    );

    const { seccion, user } = renderPanel(ANA);
    await seccion.findByText("Ana López tiene horario propio.");
    await user.click(seccion.getByRole("checkbox", { name: "Lunes" }));
    await user.click(seccion.getByRole("button", { name: "Volver al horario del cliente" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "¿Volver al horario del cliente?" });
    await user.click(within(dialogo).getByRole("button", { name: "Volver al horario del cliente" }));

    await seccion.findByText(/Ana López usa el horario laboral del cliente\./);
    expect(seccion.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");
  });
});
