import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AlmanaqueFeriados, type FeriadoAlmanaqueRow } from "./almanaque-feriados";

// Octubre 2026 (verificado en almanaque.test.ts): día 3 sábado, día 6 martes.
const HOY = "2026-10-15";
const GLOBAL: FeriadoAlmanaqueRow = { id: "g1", fecha: "2026-10-12", descripcion: "Feriado nacional", origen: "GLOBAL" };
const CLIENTE: FeriadoAlmanaqueRow = { id: "c1", fecha: "2026-10-20", descripcion: "Feriado del cliente", origen: "CLIENTE" };
// Única celda de relleno de noviembre visible en el grid de octubre 2026.
const FUERA_DE_MES: FeriadoAlmanaqueRow = { id: "n1", fecha: "2026-11-01", descripcion: "Feriado de noviembre", origen: "GLOBAL" };

// El nombre del feriado aparece en la mini etiqueta de la celda y en el panel:
// las aserciones sobre el detalle se acotan a la región del panel.
const panel = () => within(screen.getByRole("region", { name: "Detalle del día" }));

describe("AlmanaqueFeriados", () => {
  it("renders the 7 weekday headers Monday to Sunday in Spanish", () => {
    render(<AlmanaqueFeriados feriados={[]} hoy={HOY} />);
    for (const nombre of ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]) {
      expect(screen.getByRole("columnheader", { name: nombre })).toBeInTheDocument();
    }
  });

  it("bolds the day number for Saturday but not for a weekday", () => {
    render(<AlmanaqueFeriados feriados={[]} hoy={HOY} />);
    expect(screen.getByRole("gridcell", { name: "03/10/2026" }).querySelector("span")).toHaveClass("font-bold");
    expect(screen.getByRole("gridcell", { name: "06/10/2026" }).querySelector("span")).not.toHaveClass("font-bold");
  });

  it("renders GLOBAL and CLIENTE holiday marks with their own color classes", () => {
    render(<AlmanaqueFeriados feriados={[GLOBAL, CLIENTE]} hoy={HOY} />);
    const celdaGlobal = screen.getByRole("gridcell", { name: `12/10/2026, feriado: ${GLOBAL.descripcion}` });
    const celdaCliente = screen.getByRole("gridcell", { name: `20/10/2026, feriado: ${CLIENTE.descripcion}` });
    expect(celdaGlobal.querySelector("[aria-hidden='true']")).toHaveClass("bg-success-light", "text-success");
    expect(celdaCliente.querySelector("[aria-hidden='true']")).toHaveClass("bg-info-light", "text-info");
  });

  it("each holiday mark is a truncated mini label with the holiday name", () => {
    render(<AlmanaqueFeriados feriados={[GLOBAL]} hoy={HOY} />);
    const celda = screen.getByRole("gridcell", { name: `12/10/2026, feriado: ${GLOBAL.descripcion}` });
    const etiqueta = celda.querySelector("[aria-hidden='true']");
    expect(etiqueta).toHaveTextContent(GLOBAL.descripcion);
    expect(etiqueta).toHaveClass("truncate");
  });

  it("a date with both a GLOBAL and a CLIENTE holiday shows both marks and lists both in the panel", () => {
    const AMBOS_GLOBAL: FeriadoAlmanaqueRow = { id: "g2", fecha: "2026-10-20", descripcion: "Feriado nacional agregado", origen: "GLOBAL" };
    const acciones = vi.fn((f: FeriadoAlmanaqueRow) => <button>{`Editar ${f.descripcion}`}</button>);
    render(<AlmanaqueFeriados feriados={[CLIENTE, AMBOS_GLOBAL]} hoy={HOY} renderAcciones={acciones} />);

    const celda = screen.getByRole("gridcell", {
      name: `20/10/2026, feriados: ${CLIENTE.descripcion}, ${AMBOS_GLOBAL.descripcion}`,
    });
    const marcas = celda.querySelectorAll("[aria-hidden='true']");
    expect(marcas).toHaveLength(2);
    expect(marcas[0]).toHaveClass("bg-info-light", "text-info");
    expect(marcas[1]).toHaveClass("bg-success-light", "text-success");

    fireEvent.click(celda);
    expect(panel().getByText(CLIENTE.descripcion)).toBeInTheDocument();
    expect(panel().getByText(AMBOS_GLOBAL.descripcion)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Editar ${CLIENTE.descripcion}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Editar ${AMBOS_GLOBAL.descripcion}` })).toBeInTheDocument();
  });

  it("does not render a mark for a holiday outside the shown month", () => {
    render(<AlmanaqueFeriados feriados={[FUERA_DE_MES]} hoy={HOY} />);
    expect(screen.queryByText(FUERA_DE_MES.descripcion)).not.toBeInTheDocument();
    const celda = screen.getByRole("gridcell", { name: "01/11/2026" });
    expect(celda.querySelector("[aria-hidden='true']")).not.toBeInTheDocument();
  });

  it("hovering a holiday shows its description and renderAcciones; click opens the same panel", () => {
    const acciones = vi.fn((f: FeriadoAlmanaqueRow) => <button>{`Editar ${f.descripcion}`}</button>);
    render(<AlmanaqueFeriados feriados={[GLOBAL]} hoy={HOY} renderAcciones={acciones} />);
    expect(screen.getByText(/Pasá el mouse o seleccioná/)).toBeInTheDocument();
    const celda = screen.getByRole("gridcell", { name: `12/10/2026, feriado: ${GLOBAL.descripcion}` });
    fireEvent.mouseEnter(celda);
    expect(panel().getByText(GLOBAL.descripcion)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Editar ${GLOBAL.descripcion}` })).toBeInTheDocument();
  });

  it("clicking a free day calls onDiaLibre; clicking a holiday opens its panel instead", () => {
    const onDiaLibre = vi.fn();
    render(<AlmanaqueFeriados feriados={[GLOBAL]} hoy={HOY} onDiaLibre={onDiaLibre} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "06/10/2026" }));
    expect(onDiaLibre).toHaveBeenCalledTimes(1);
    expect(onDiaLibre).toHaveBeenCalledWith("2026-10-06");
    fireEvent.click(screen.getByRole("gridcell", { name: `12/10/2026, feriado: ${GLOBAL.descripcion}` }));
    expect(onDiaLibre).toHaveBeenCalledTimes(1); // no se dispara para un día con feriado
    expect(panel().getByText(GLOBAL.descripcion)).toBeInTheDocument(); // touch/click abre el mismo panel que el hover
  });

  it("moves month with the arrows, including a year change in both directions", () => {
    render(<AlmanaqueFeriados feriados={[]} hoy="2026-12-15" />);
    expect(screen.getByText("Diciembre 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByText("Enero 2027")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(screen.getByText("Diciembre 2026")).toBeInTheDocument();
  });
});
