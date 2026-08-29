import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoCreateDialog } from "./equipo-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EQUIPO_CREADO = {
  id: "55555555-5555-5555-5555-555555555555",
  nombre: "Notebook Dell",
  activo: true,
};

/** Registra el handler de alta y devuelve el body que efectivamente viajó. */
function capturarPost(): { body: Record<string, unknown> } {
  const capturado: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post("/api/equipos", async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(EQUIPO_CREADO, { status: 201 });
    }),
  );
  return capturado;
}

/** Abre el diálogo de alta y espera a que el form esté montado. */
async function abrirDialog(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /nuevo equipo/i }));
  await screen.findByLabelText(/^nombre$/i);
  return user;
}

describe("EquipoCreateDialog", () => {
  /**
   * El importe y el valor residual se MUESTRAN formateados al salir del campo
   * (`1.234.567,89`) pero lo que viaja tiene que seguir siendo el número
   * crudo: si la cadena formateada llegara al payload, `parseImporte` la
   * convertiría en `null` y el usuario perdería la carga.
   */
  it("tras el blur muestra el importe formateado pero el POST lleva el número CRUDO", async () => {
    const capturado = capturarPost();
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^nombre$/i), "Notebook Dell");
    const importe = screen.getByLabelText(/importe/i);
    await user.type(importe, "1234567.89");
    const valorResidual = screen.getByLabelText(/^valor residual$/i);
    await user.type(valorResidual, "1000000");
    await user.tab();

    expect(importe).toHaveValue("1.234.567,89");
    expect(valorResidual).toHaveValue("1.000.000,00");

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body.importe).toBe(1234567.89));
    expect(capturado.body.valorResidual).toBe(1000000);
  });

  it("volver a enfocar devuelve el valor editable, sin puntos de miles que borrar a mano", async () => {
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    const importe = screen.getByLabelText(/importe/i);
    await user.type(importe, "1234567.89");
    await user.tab();
    await user.click(importe);

    expect(importe).toHaveValue("1234567.89");
  });

  /**
   * `aplicarDepreciacion` escribe el residual derivado en el formulario: tiene
   * que seguir escribiendo el CRUDO. Si escribiera `"700,00"`, el submit
   * mandaría `null` en vez de `700`.
   */
  it("aplicar depreciación y enviar produce el mismo payload de siempre", async () => {
    const capturado = capturarPost();
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^nombre$/i), "Notebook Dell");
    await user.type(screen.getByLabelText(/importe/i), "1000");
    await user.type(screen.getByLabelText(/% de depreciación/i), "30");
    await user.click(screen.getByRole("button", { name: /^aplicar$/i }));

    expect(screen.getByLabelText(/^valor residual$/i)).toHaveValue("700,00");

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body.valorResidual).toBe(700));
    expect(capturado.body.importe).toBe(1000);
  });

  /**
   * Regresión — `puedeAplicar` solo chequeaba "hay algo tipeado", no si el
   * porcentaje era válido: con importe 1000 y porcentaje "-50", el botón
   * quedaba habilitado y el clic escribía un valor residual (1.500,00)
   * MAYOR que el importe, sin ningún error visible. Ahora reusa el mismo
   * criterio que el schema (`esPorcentajeDepreciacionValido`), que rechaza
   * el signo negativo.
   */
  it("con porcentaje negativo el botón Aplicar queda deshabilitado y no toca el valor residual", async () => {
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/importe/i), "1000");
    await user.type(screen.getByLabelText(/% de depreciación/i), "-50");

    expect(screen.getByRole("button", { name: /^aplicar$/i })).toBeDisabled();
    expect(screen.getByLabelText(/^valor residual$/i)).toHaveValue("");
  });

  it("la base de depreciación se muestra formateada, igual que los campos de al lado", async () => {
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/importe/i), "1234567.89");

    expect(await screen.findByText(/se deprecia sobre el importe: \$1\.234\.567,89/i)).toBeInTheDocument();
  });

  /**
   * Regresión — mismo bug ya corregido una vez en `features/compras/lib/fecha.ts`
   * (ver `shared/lib/formato-fecha.ts`, nota sobre `OFFSET_ARGENTINA_MS`): "Fecha
   * del valor residual" tiene que precargar el día de calendario ARGENTINO (offset
   * fijo -3, la misma regla que valida el backend), no el día local de la máquina
   * del usuario. Con TZ = "Pacific/Kiritimati" (UTC+14) y el instante elegido, el
   * día local de la máquina (15) y el día argentino (14) NO coinciden — el caso que
   * expone el bug.
   */
  it("aplicar depreciación precarga el día de calendario ARGENTINO, no el día local de la máquina", async () => {
    const tzOriginal = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T01:00:00.000Z"));

    try {
      renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/^nombre$/i), "Notebook Dell");
      await user.type(screen.getByLabelText(/importe/i), "1000");
      await user.type(screen.getByLabelText(/% de depreciación/i), "30");
      await user.click(screen.getByRole("button", { name: /^aplicar$/i }));

      expect(screen.getByLabelText(/fecha del valor residual/i)).toHaveValue("2026-03-14");
    } finally {
      vi.useRealTimers();
      if (tzOriginal === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = tzOriginal;
      }
    }
  });

  /**
   * CRITICAL-1 del verify report: antes de este fix, `errors.ubicacion` e
   * `errors.importe` (y los demás campos con regla) NUNCA se renderizaban —
   * el schema rechazaba, `handleSubmit` no llamaba a `submit`, y la pantalla
   * no decía nada. Peor feedback que el 500 remoto que este change vino a
   * arreglar. Monta el diálogo entero (no `safeParse` directo) para que el
   * test cubra lo que realmente ve el usuario.
   */
  it.each([
    ["número de serie", /número de serie/i, "x".repeat(256), /número de serie no puede superar/i],
    ["ubicación", /^ubicación$/i, "ß".repeat(200), /ubicación no puede superar/i],
    ["importe", /^importe/i, "abc", /debe ser un número/i],
    // El valor inválido NO se interpola en el título: `'ß'.repeat(200)` produce
    // un nombre de test de 200 caracteres repetidos, ilegible en el reporte.
  ] as const)(
    "campo %s con valor inválido muestra el mensaje y no envía el POST",
    async (_campo, selectorLabel, valorInvalido, mensajeEsperado) => {
      const capturado = capturarPost();
      renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/^nombre$/i), "Notebook Dell");
      const campo = screen.getByLabelText(selectorLabel);
      await user.click(campo);
      await user.paste(valorInvalido);
      await user.tab();

      await user.click(screen.getByRole("button", { name: /^crear$/i }));

      expect(await screen.findByText(mensajeEsperado)).toBeInTheDocument();
      expect(capturado.body).toEqual({});
    },
  );

  /**
   * Hermano invertido del caso `ß`.repeat(200) de arriba: un valor de
   * ubicación válido NO debe marcar error y el submit SÍ debe viajar,
   * normalizado a mayúscula (mismo criterio que mide el backend).
   */
  it("ubicación con valor válido no muestra error y el POST viaja normalizado", async () => {
    const capturado = capturarPost();
    renderWithProviders(<EquipoCreateDialog />, { user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }) });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^nombre$/i), "Notebook Dell");
    await user.type(screen.getByLabelText(/^ubicación$/i), "oficina 1");

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body.ubicacion).toBe("OFICINA 1"));
    expect(screen.queryByText(/ubicación no puede superar/i)).not.toBeInTheDocument();
  });
});
