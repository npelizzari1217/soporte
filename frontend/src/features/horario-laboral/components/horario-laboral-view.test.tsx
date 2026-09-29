import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { HorarioLaboralView } from "./horario-laboral-view";

/**
 * HorarioLaboralView — container montado por `/horario-laboral` (task 8b.3,
 * WU-8b, sdd/horario-laboral-por-cliente). Cubre D16 (design.md): skeleton
 * solo por `isLoading`, `ErrorState` solo si `isError && !data`, un error de
 * guardado nunca desmonta el form, el botón se deshabilita solo mientras
 * `isPending`, y el éxito resetea la grilla con el dato del servidor.
 */
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DEFAULT_DIAS = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
];

const NUEVOS_DIAS = DEFAULT_DIAS.map((dia) =>
  dia.diaSemana >= 1 && dia.diaSemana <= 5 ? { ...dia, aperturaMinuto: 480, cierreMinuto: 720 } : dia,
);

function mockGetOk(dias = DEFAULT_DIAS) {
  server.use(http.get("/api/horario-laboral", () => HttpResponse.json({ dias })));
}

describe("HorarioLaboralView (task 8b.3, WU-8b)", () => {
  it("muestra el skeleton mientras isLoading, no bloquea la grilla en un refetch de fondo (isFetching)", async () => {
    let cargas = 0;
    server.use(
      http.get("/api/horario-laboral", async () => {
        cargas += 1;
        if (cargas === 1) await delay(30);
        return HttpResponse.json({ dias: cargas === 1 ? DEFAULT_DIAS : NUEVOS_DIAS });
      }),
      http.put("/api/horario-laboral", async () => {
        await delay(30);
        return HttpResponse.json({ dias: NUEVOS_DIAS });
      }),
    );

    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    expect(screen.getByRole("status", { name: "Cargando detalle" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /guardar/i });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    // Mientras el PUT y el refetch de invalidateQueries están en vuelo, el
    // form sigue montado: el skeleton NUNCA vuelve a aparecer por un
    // isFetching (D16) — solo se usó una vez, en la carga inicial.
    expect(screen.queryByRole("status", { name: "Cargando detalle" })).not.toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Horario laboral guardado."));
    expect(screen.queryByRole("status", { name: "Cargando detalle" })).not.toBeInTheDocument();
  });

  it("ErrorState con retry solo cuando isError && !data (la carga inicial falla)", async () => {
    let intentos = 0;
    server.use(
      http.get("/api/horario-laboral", () => {
        intentos += 1;
        if (intentos === 1) {
          return HttpResponse.json({ statusCode: 500, message: "Error interno" }, { status: 500 });
        }
        return HttpResponse.json({ dias: DEFAULT_DIAS });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    expect(await screen.findByText("No se pudo cargar el horario laboral.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await screen.findByRole("button", { name: /guardar/i });
    expect(screen.queryByText("No se pudo cargar el horario laboral.")).not.toBeInTheDocument();
  });

  it.each([
    [422, "Debe quedar al menos un día abierto."],
    [500, "Error interno"],
  ])(
    "un %i al guardar conserva el form CON LA EDICIÓN en curso, muestra el alert inline y llama a notifyError (regresión S3/W1)",
    async (statusCode, mensaje) => {
      mockGetOk();
      server.use(
        http.put("/api/horario-laboral", () => HttpResponse.json({ statusCode, message: mensaje }, { status: statusCode })),
      );

      const user = userEvent.setup();
      renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

      await screen.findByRole("button", { name: /guardar/i });
      // Edita ANTES de guardar (S3): sin esto, "conserva sus valores" es
      // trivialmente cierto porque nunca cambió nada.
      await user.click(screen.getByRole("checkbox", { name: "Martes" }));
      expect(screen.getByRole("checkbox", { name: "Martes" })).not.toBeChecked();

      await user.click(screen.getByRole("button", { name: /guardar/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
      // el form sigue montado CON la edición: ni el checkbox de lunes (sin
      // tocar) ni la edición de martes (recién hecha) se pierden.
      expect(screen.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Martes" })).not.toBeChecked();
      expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
    },
  );

  it("un guardado exitoso seguido de un guardado fallido conserva la SEGUNDA edición (regresión W1)", async () => {
    mockGetOk();
    let intentos = 0;
    server.use(
      http.put("/api/horario-laboral", () => {
        intentos += 1;
        if (intentos === 1) return HttpResponse.json({ dias: NUEVOS_DIAS });
        return HttpResponse.json(
          { statusCode: 422, message: "Debe quedar al menos un día abierto." },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    // Primer guardado: exitoso, sin editar nada.
    await screen.findByRole("button", { name: /guardar/i });
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Horario laboral guardado."));

    // Segunda edición, DESPUÉS del guardado exitoso: destilda martes.
    await user.click(screen.getByRole("checkbox", { name: "Martes" }));
    expect(screen.getByRole("checkbox", { name: "Martes" })).not.toBeChecked();

    // Segundo guardado: falla con 422.
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await screen.findByRole("alert");

    // La segunda edición sigue en los inputs — antes de W1, el `reset` que
    // dispara `guardarMutation.data` volviendo a `undefined` la pisaba con
    // el valor todavía sin refetchear.
    expect(screen.getByRole("checkbox", { name: "Martes" })).not.toBeChecked();
  });

  it("el botón Guardar se deshabilita solo mientras la mutación está isPending", async () => {
    mockGetOk();
    server.use(
      http.put("/api/horario-laboral", async () => {
        await delay(30);
        return HttpResponse.json({ dias: DEFAULT_DIAS });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    const boton = await screen.findByRole("button", { name: /guardar/i });
    expect(boton).not.toBeDisabled();

    await user.click(boton);
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    await waitFor(() => expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled());
  });

  it("al guardar con éxito, la grilla se resetea con el horario devuelto por el servidor y notifica éxito", async () => {
    // GET refleja el guardado a partir de la 2da llamada — mismo criterio
    // que el 1er test de este archivo: un backend real devuelve el dato ya
    // guardado en el refetch que dispara `invalidateQueries` (WU-9, fix W1:
    // `valoresIniciales` ahora sale solo de la query, así que un GET mockeado
    // que ignorara el guardado pisaría el `setQueryData` con el default viejo).
    let cargas = 0;
    server.use(
      http.get("/api/horario-laboral", () => {
        cargas += 1;
        return HttpResponse.json({ dias: cargas === 1 ? DEFAULT_DIAS : NUEVOS_DIAS });
      }),
      http.put("/api/horario-laboral", () => HttpResponse.json({ dias: NUEVOS_DIAS })),
    );

    const user = userEvent.setup();
    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await screen.findByRole("button", { name: /guardar/i });
    expect(screen.getAllByLabelText("Apertura")[1]).toHaveValue("09:00");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Horario laboral guardado."));
    expect(screen.getAllByLabelText("Apertura")[1]).toHaveValue("08:00");
  });

  it("un rol no-admin ve la grilla de solo lectura, sin botón Guardar", async () => {
    mockGetOk();
    renderWithProviders(<HorarioLaboralView />, { user: buildUser({ rol: "TECNICO", permisos: [] }) });

    expect(await screen.findByRole("checkbox", { name: "Lunes" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });
});
