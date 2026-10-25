import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { HorarioLaboralTecnicoSeccion } from "./horario-laboral-tecnico-seccion";

/**
 * HorarioLaboralTecnicoSeccion — sección "Horario por técnico" de
 * `/horario-laboral` (odd/tasks/tiempo-tecnico.md T2, S1/S2). Red simulada
 * con msw sobre `GET /usuarios` y `GET`/`PUT`/`DELETE
 * /horario-laboral/usuarios/:usuarioId`.
 */
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ANA = "01900000-0000-7000-8000-0000000000a1";
const BETO = "01900000-0000-7000-8000-0000000000b2";

const USUARIOS = [
  { id: BETO, nombre: "Beto", apellido: "Zárate", rol: "COLABORADOR" },
  { id: "admin-1", nombre: "Carla", apellido: "Admin", rol: "ADMINISTRADOR" },
  { id: ANA, nombre: "Ana", apellido: "López", rol: "TECNICO" },
  { id: "sol-1", nombre: "Dora", apellido: "Pedido", rol: "SOLICITANTE" },
];

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
    http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
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

function renderSeccion() {
  renderWithProviders(<HorarioLaboralTecnicoSeccion />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
  return within(screen.getByRole("region", { name: "Horario por técnico" }));
}

async function elegirTecnico(nombre: string) {
  const user = userEvent.setup();
  const selector = await screen.findByRole("combobox", { name: "Técnico" });
  await user.selectOptions(selector, nombre);
  return user;
}

describe("HorarioLaboralTecnicoSeccion (tiempo-tecnico T2)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("ofrece solo a los TECNICO y COLABORADOR, ordenados por apellido", async () => {
    mockServidor(horariosIniciales());
    renderSeccion();

    const selector = await screen.findByRole("combobox", { name: "Técnico" });
    const opciones = within(selector)
      .getAllByRole("option")
      .map((opcion) => opcion.textContent);
    expect(opciones).toEqual(["Seleccionar técnico", "Ana López", "Beto Zárate"]);
  });

  it("elegir un técnico carga su horario en la grilla", async () => {
    mockServidor(horariosIniciales());
    const seccion = renderSeccion();

    expect(seccion.queryByRole("checkbox", { name: "Lunes" })).not.toBeInTheDocument();
    await elegirTecnico("Ana López");

    expect(await seccion.findByText("Ana López tiene horario propio.")).toBeInTheDocument();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("08:00");
    expect(seccion.getAllByLabelText(/^Cierre/)[1]).toHaveValue("12:00");
    expect(seccion.getByRole("checkbox", { name: "Domingo" })).not.toBeChecked();
  });

  it("con origen CLIENTE avisa que usa el horario del cliente y ofrece Usar horario propio, sin opción de volver", async () => {
    mockServidor(horariosIniciales());
    const seccion = renderSeccion();

    await elegirTecnico("Beto Zárate");

    expect(await seccion.findByText(/Beto Zárate usa el horario laboral del cliente\./)).toBeInTheDocument();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");
    expect(seccion.getByRole("button", { name: "Usar horario propio" })).toBeInTheDocument();
    expect(seccion.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(seccion.queryByRole("button", { name: "Volver al horario del cliente" })).not.toBeInTheDocument();
  });

  it("con origen USUARIO no muestra el aviso del cliente y ofrece Guardar y Volver al horario del cliente", async () => {
    mockServidor(horariosIniciales());
    const seccion = renderSeccion();

    await elegirTecnico("Ana López");

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
    const seccion = renderSeccion();

    const user = await elegirTecnico("Beto Zárate");
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
    const seccion = renderSeccion();

    const user = await elegirTecnico("Ana López");
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
    const seccion = renderSeccion();

    const user = await elegirTecnico("Ana López");
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
    const seccion = renderSeccion();

    const user = await elegirTecnico("Ana López");
    await user.click(await seccion.findByRole("button", { name: "Volver al horario del cliente" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(borrar).not.toHaveBeenCalled();
    expect(seccion.getByText("Ana López tiene horario propio.")).toBeInTheDocument();
  });

  it("cambiar de técnico resetea la grilla con el horario del nuevo y descarta la edición del anterior", async () => {
    mockServidor(horariosIniciales());
    const seccion = renderSeccion();

    const user = await elegirTecnico("Ana López");
    await seccion.findByText("Ana López tiene horario propio.");
    // Edita a Ana sin guardar: si el form no se sincronizara al cambiar de
    // técnico, esta edición (o el 08:00 de Ana) aparecería en la grilla de Beto.
    await user.click(seccion.getByRole("checkbox", { name: "Lunes" }));
    expect(seccion.getByRole("checkbox", { name: "Lunes" })).not.toBeChecked();

    await user.selectOptions(screen.getByRole("combobox", { name: "Técnico" }), "Beto Zárate");
    await seccion.findByText(/Beto Zárate usa el horario laboral del cliente\./);
    expect(seccion.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");

    // Volver a Ana muestra su horario del servidor, no la edición descartada.
    await user.selectOptions(screen.getByRole("combobox", { name: "Técnico" }), "Ana López");
    await seccion.findByText("Ana López tiene horario propio.");
    expect(seccion.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
    expect(seccion.getAllByLabelText("Apertura")[1]).toHaveValue("08:00");
  });

  it("el error de guardado de un técnico no aparece al cambiar a otro", async () => {
    mockServidor(horariosIniciales());
    server.use(
      http.put("/api/horario-laboral/usuarios/:usuarioId", () =>
        HttpResponse.json({ statusCode: 500, message: "Error interno" }, { status: 500 }),
      ),
    );
    const seccion = renderSeccion();

    const user = await elegirTecnico("Ana López");
    await user.click(await seccion.findByRole("button", { name: "Guardar" }));
    expect(await seccion.findByRole("alert")).toHaveTextContent("Error interno");

    await user.selectOptions(screen.getByRole("combobox", { name: "Técnico" }), "Beto Zárate");
    await seccion.findByText(/Beto Zárate usa el horario laboral del cliente\./);
    expect(seccion.queryByRole("alert")).not.toBeInTheDocument();
  });
});
