import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoEditDialog } from "./equipo-edit-dialog";
import type { EquipoDetalle } from "../types";

const EQUIPO_ID = "44444444-4444-4444-4444-444444444444";

const EQUIPO: EquipoDetalle = {
  id: EQUIPO_ID,
  nombre: "Notebook Dell",
  numeroSerie: "SN-001",
  marca: "Dell",
  modelo: "Latitude",
  modeloEquipoId: null,
  fechaAdquisicion: null,
  ubicacion: "OFICINA 1",
  importe: 1000,
  fechaValoracion: null,
  observaciones: null,
  valorResidual: null,
  fechaValorResidual: null,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  componentes: [],
};

/** Registra el handler de edición y devuelve el body que efectivamente viajó. */
function capturarPatch(): { body: Record<string, unknown> } {
  const capturado: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.patch(`/api/equipos/${EQUIPO_ID}`, async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...EQUIPO, nombre: "Editado" });
    }),
  );
  return capturado;
}

describe("EquipoEditDialog", () => {
  // Handler PATCH por defecto: cubre los tests que NO llaman a `capturarPatch()`
  // (no necesitan inspeccionar el body, solo que el PATCH resuelva 200). Para
  // los que sí la llaman, `capturarPatch()` registra su propio handler DESPUÉS
  // de este — msw prioriza el último registrado — así que este queda sin
  // invocar en esos casos, no removido porque los demás tests SÍ lo necesitan.
  beforeEach(() => {
    server.use(http.patch(`/api/equipos/${EQUIPO_ID}`, () => HttpResponse.json({ ...EQUIPO, nombre: "Editado" })));
  });

  it("el form abre en un MODAL (no inline) y pre-pobla los valores actuales", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    // Sin abrir, el form no está en el DOM (es popup, no inline).
    expect(screen.queryByText("Editar equipo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(await screen.findByText("Editar equipo")).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Notebook Dell");
    // El importe se LEE formateado; el valor del form sigue siendo el crudo.
    expect(screen.getByLabelText(/importe/i)).toHaveValue("1.000,00");
  });

  // render-fechas-frontend: `Equipo.fechaAdquisicion`/`fechaValoracion`/
  // `fechaValorResidual` pre-pueblan `<input type="date">` vía `aFechaInput`
  // (antes `.slice(0, 10)` open-coded en este mismo archivo) — deduplicación,
  // no cambio de comportamiento: sigue aceptando el ISO completo del backend.
  it("las tres fechas pre-pueblan el input date en YYYY-MM-DD a partir del ISO completo del backend", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipoEditDialog
        equipo={{
          ...EQUIPO,
          fechaAdquisicion: "2026-08-17T00:00:00.000Z",
          fechaValoracion: "2026-08-18T00:00:00.000Z",
          fechaValorResidual: "2026-08-19T00:00:00.000Z",
        }}
      />,
      { user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }) },
    );

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    expect(screen.getByLabelText(/fecha de adquisición/i)).toHaveValue("2026-08-17");
    expect(screen.getByLabelText(/fecha de valoración/i)).toHaveValue("2026-08-18");
    expect(screen.getByLabelText(/fecha del valor residual/i)).toHaveValue("2026-08-19");
  });

  it("guardar dispara el PATCH y cierra el modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(screen.queryByText("Editar equipo")).not.toBeInTheDocument());
  });

  /**
   * El importe y el valor residual se MUESTRAN formateados al salir del campo,
   * pero lo que viaja tiene que seguir siendo el número crudo: si la cadena
   * formateada llegara al payload, `parseImporte` la convertiría en `null` y
   * el equipo perdería su valuación.
   */
  it("tras el blur el PATCH lleva el número CRUDO, no la cadena formateada", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/importe/i);
    await user.clear(importe);
    await user.type(importe, "1234567.89");
    await user.tab();

    expect(importe).toHaveValue("1.234.567,89");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.importe).toBe(1234567.89));
    expect(capturado.body.nombre).toBe("Notebook Dell");
  });

  it("volver a enfocar devuelve el valor editable, sin puntos de miles que borrar a mano", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/importe/i);
    await user.click(importe);

    expect(importe).toHaveValue("1000");
  });

  /**
   * `aplicarDepreciacion` escribe el residual derivado en el formulario: tiene
   * que seguir escribiendo el CRUDO. Si escribiera `"700,00"`, el PATCH
   * mandaría `null` en vez de `700`.
   */
  it("aplicar depreciación y guardar produce el mismo payload de siempre", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    await user.type(screen.getByLabelText(/% de depreciación/i), "30");
    await user.click(screen.getByRole("button", { name: /^aplicar$/i }));

    expect(screen.getByLabelText(/^valor residual$/i)).toHaveValue("700,00");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

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
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    await user.type(screen.getByLabelText(/% de depreciación/i), "-50");

    expect(screen.getByRole("button", { name: /^aplicar$/i })).toBeDisabled();
    expect(screen.getByLabelText(/^valor residual$/i)).toHaveValue("");
  });

  it("la base de depreciación se muestra formateada, igual que los campos de al lado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(await screen.findByText(/se deprecia sobre el importe: \$1\.000,00/i)).toBeInTheDocument();
  });

  /**
   * CRITICAL-1 del verify report: antes de este fix, `errors.ubicacion` e
   * `errors.importe` (y los demás campos con regla) NUNCA se renderizaban —
   * el schema rechazaba, `handleSubmit` no llamaba a `submit`, y la pantalla
   * no decía nada. Monta el diálogo entero (no `safeParse` directo) para que
   * el test cubra lo que realmente ve el usuario.
   */
  it.each([
    ["número de serie", /número de serie/i, "x".repeat(256), /número de serie no puede superar/i],
    ["ubicación", /^ubicación$/i, "ß".repeat(200), /ubicación no puede superar/i],
    ["importe", /^importe/i, "abc", /debe ser un número/i],
    // El valor inválido NO se interpola en el título: `'ß'.repeat(200)` produce
    // un nombre de test de 200 caracteres repetidos, ilegible en el reporte.
  ] as const)(
    "campo %s con valor inválido muestra el mensaje y no envía el PATCH",
    async (_campo, selectorLabel, valorInvalido, mensajeEsperado) => {
      const capturado = capturarPatch();
      const user = userEvent.setup();
      renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
        user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
      });

      await user.click(screen.getByRole("button", { name: /^editar$/i }));
      await screen.findByText("Editar equipo");

      const campo = screen.getByLabelText(selectorLabel);
      await user.clear(campo);
      await user.click(campo);
      await user.paste(valorInvalido);
      await user.tab();

      await user.click(screen.getByRole("button", { name: /^guardar$/i }));

      expect(await screen.findByText(mensajeEsperado)).toBeInTheDocument();
      expect(capturado.body).toEqual({});
    },
  );

  /**
   * Regresión crítica (Esc. 3.3, sdd/equipos-parse-importe-miles): igual que
   * en el alta (D4 del design), `Enter` dentro del `<form>` dispara el click
   * sobre "Guardar" (`type="submit"`) sin mover el foco, así que `MontoInput`
   * no llega a canonizar. Antes del fix, el schema roto frenaba el submit
   * (protección indirecta); con el schema arreglado ese guard deja de actuar
   * por accidente, así que este test prueba que `parseImporte` sigue
   * mandando el número real y NUNCA `null` sobre un equipo que ya tenía
   * importe cargado.
   *
   * El PATCH se difiere con una promesa manual: si se resuelve de entrada
   * (como `capturarPatch()`), el `onSuccess` cierra el diálogo dentro del
   * mismo `await user.keyboard("{Enter}")` y el foco vuelve al botón
   * disparador ANTES de poder comprobarlo — falso negativo del guard, no un
   * blur real.
   */
  it("Enter sin blur con importe reescrito en miles no pierde el dato (regresión crítica, Esc. 3.3)", async () => {
    let resolverRespuesta: () => void = () => {};
    const respuestaPendiente = new Promise<void>((resolve) => {
      resolverRespuesta = resolve;
    });
    const capturado: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.patch(`/api/equipos/${EQUIPO_ID}`, async ({ request }) => {
        capturado.body = (await request.json()) as Record<string, unknown>;
        await respuestaPendiente;
        return HttpResponse.json({ ...EQUIPO, nombre: "Editado" });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/^importe/i);
    await user.clear(importe);
    await user.click(importe);
    await user.paste("1.234.567,89");
    await user.keyboard("{Enter}");

    expect(importe).toHaveFocus();
    resolverRespuesta();
    await waitFor(() => expect(capturado.body.importe).toBe(1234567.89));
    expect(capturado.body.importe).not.toBeNull();
  });

  /**
   * Hermano invertido de 3.3 (Esc. 3.4): borrar el campo intencionalmente
   * sigue siendo la forma de limpiar el importe — el payload manda `null`
   * (contrato ya vigente en `equipo-edit-dialog.tsx:139`, "null = limpiar").
   * No se confunde con 3.3: ahí el dato viaja, acá se borra a propósito.
   */
  it("Enter sin blur con importe vaciado intencionalmente sigue borrando el valor (hermano invertido, Esc. 3.4)", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/^importe/i);
    await user.clear(importe);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(capturado.body).toHaveProperty("importe"));
    expect(capturado.body.importe).toBeNull();
  });

  /**
   * Hermano invertido del caso `ß`.repeat(200) de arriba: un valor de
   * ubicación válido NO debe marcar error y el PATCH SÍ debe viajar,
   * normalizado a mayúscula.
   */
  it("ubicación con valor válido no muestra error y el PATCH viaja normalizado", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["EQUIPOS:MODIFICACION"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const ubicacion = screen.getByLabelText(/^ubicación$/i);
    await user.clear(ubicacion);
    await user.type(ubicacion, "oficina 2");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.ubicacion).toBe("OFICINA 2"));
    expect(screen.queryByText(/ubicación no puede superar/i)).not.toBeInTheDocument();
  });
});
