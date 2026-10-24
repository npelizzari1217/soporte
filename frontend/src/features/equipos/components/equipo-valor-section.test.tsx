import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { EquipoValorSection } from "./equipo-valor-section";

const EQUIPO_ID = "55555555-5555-4555-8555-555555555555";
const URL_HISTORIAL = `/api/equipos/${EQUIPO_ID}/valoraciones`;

const EQUIPO = {
  id: EQUIPO_ID,
  importe: 1000,
  fechaValoracion: "2026-01-10T00:00:00.000Z",
  valorResidual: 490,
  fechaValorResidual: "2026-10-24T00:00:00.000Z",
};

const HISTORIAL = [
  {
    fecha: "2026-01-10T00:00:00.000Z",
    importe: 1000,
    origen: "MIGRACION",
    usuarioId: null,
    usuarioNombre: null,
    usuarioApellido: null,
  },
  {
    fecha: "2026-06-01T00:00:00.000Z",
    importe: 700,
    origen: "MANUAL",
    usuarioId: "u-1",
    usuarioNombre: "Ana",
    usuarioApellido: "Pérez",
  },
  {
    fecha: "2026-10-24T00:00:00.000Z",
    importe: 490.5,
    origen: "MANUAL",
    usuarioId: "u-2",
    usuarioNombre: null,
    usuarioApellido: null,
  },
];

/** Filas del `<tbody>` como texto de cada celda. */
function filas(tabla: HTMLElement): string[][] {
  return [...tabla.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent ?? ""),
  );
}

describe("EquipoValorSection (historial-valor-residual, S5)", () => {
  it("muestra el importe y el valor residual vigentes, cada uno con su fecha de calendario", async () => {
    server.use(http.get(URL_HISTORIAL, () => HttpResponse.json([])));
    renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    const seccion = screen.getByRole("region", { name: "Valor del equipo" });
    expect(seccion).toHaveTextContent("Importe1.000,00 al 10/01/2026");
    expect(seccion).toHaveTextContent("Valor residual490,00 al 24/10/2026");
  });

  it("un monto sin cargar o sin fecha se dice como tal", async () => {
    server.use(http.get(URL_HISTORIAL, () => HttpResponse.json([])));
    renderWithProviders(
      <EquipoValorSection
        equipo={{ ...EQUIPO, importe: null, fechaValoracion: null, fechaValorResidual: null }}
      />,
    );

    const seccion = screen.getByRole("region", { name: "Valor del equipo" });
    expect(seccion).toHaveTextContent("ImporteSin cargar");
    expect(seccion).toHaveTextContent("Valor residual490,00 (sin fecha)");
  });

  it("lista el historial por fecha con importe, origen y usuario", async () => {
    server.use(http.get(URL_HISTORIAL, () => HttpResponse.json(HISTORIAL)));
    renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    const tabla = await screen.findByRole("table", { name: "Historial del valor" });
    expect([...tabla.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Fecha",
      "Importe",
      "Origen",
      "Usuario",
    ]);
    expect(filas(tabla)).toEqual([
      ["10/01/2026", "1.000,00", "Valor previo al historial", "—"],
      ["01/06/2026", "700,00", "Guardado en el equipo", "Ana Pérez"],
      // Usuario que ya no existe en master: la fila se muestra igual, sin nombre.
      ["24/10/2026", "490,50", "Guardado en el equipo", "—"],
    ]);
  });

  it("el gráfico de línea tiene un punto por fila y su tabla accesible lee fecha e importe", async () => {
    server.use(http.get(URL_HISTORIAL, () => HttpResponse.json(HISTORIAL)));
    const { container } = renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    const grafico = await screen.findByRole("img", { name: "Evolución del valor del equipo" });
    const puntos = container.querySelector("polyline[data-testid='line-path']")?.getAttribute("points");
    expect(puntos?.trim().split(/\s+/)).toHaveLength(3);
    const tablaA11y = within(grafico).getByRole("table", { hidden: true });
    expect([...tablaA11y.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Fecha", "Importe"]);
    expect(filas(tablaA11y)).toEqual([
      ["10/01/2026", "1.000,00"],
      ["01/06/2026", "700,00"],
      ["24/10/2026", "490,50"],
    ]);
  });

  it("sin historial muestra el estado vacío, sin tabla ni gráfico", async () => {
    server.use(http.get(URL_HISTORIAL, () => HttpResponse.json([])));
    renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    expect(await screen.findByText("Todavía no hay valores registrados")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Historial del valor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Evolución del valor del equipo" })).not.toBeInTheDocument();
  });

  it("mientras carga muestra el esqueleto de la tabla", async () => {
    server.use(
      http.get(URL_HISTORIAL, async () => {
        await delay("infinite");
        return HttpResponse.json([]);
      }),
    );
    renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    expect(screen.getByRole("status", { name: "Cargando tabla" })).toBeInTheDocument();
  });

  it("si el historial falla muestra el error con Reintentar, y reintentar lo trae", async () => {
    let llamadas = 0;
    server.use(
      http.get(URL_HISTORIAL, () => {
        llamadas += 1;
        return llamadas === 1
          ? HttpResponse.json({ message: "falla" }, { status: 500 })
          : HttpResponse.json(HISTORIAL);
      }),
    );
    renderWithProviders(<EquipoValorSection equipo={EQUIPO} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo cargar el historial del valor.");
    // El valor vigente sale del detalle: se sigue viendo aunque falle el historial.
    expect(screen.getByRole("region", { name: "Valor del equipo" })).toHaveTextContent(
      "Valor residual490,00 al 24/10/2026",
    );

    await userEvent.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByRole("table", { name: "Historial del valor" })).toBeInTheDocument());
  });
});
