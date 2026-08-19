import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("escribir y enviar el buscador (Enter) → llama onSearchChange con el texto ingresado", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<FilterBar searchPlaceholder="Buscar tickets…" onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText("Buscar tickets…");
    await user.type(input, "impresora{Enter}");
    expect(onSearchChange).toHaveBeenCalledWith("impresora");
  });

  it("renders children (filtros adicionales) dentro de la barra", () => {
    render(
      <FilterBar onSearchChange={vi.fn()}>
        <button>Filtro estado</button>
      </FilterBar>,
    );
    expect(screen.getByRole("button", { name: "Filtro estado" })).toBeInTheDocument();
  });

  // Una caja vacía con un filtro aplicado no le deja ver a nadie por qué la
  // lista está recortada: el deep-link `?busqueda=foo` mostraba el listado
  // filtrado con el buscador en blanco, y «Limpiar filtros» dejaba el texto
  // viejo tipeado como si el botón no hubiera hecho nada.
  it.each([
    ["deep-link: monta con el filtro puesto", "foo", "foo", "foo"],
    ["limpiar filtros: el valor externo se vacía", "foo", "", ""],
    ["el consumidor cambia el filtro por afuera", "foo", "bar", "bar"],
  ])("searchValue sincroniza el borrador — %s", (_label, inicial, siguiente, esperado) => {
    const { rerender } = render(<FilterBar searchValue={inicial} onSearchChange={vi.fn()} />);
    expect(screen.getByRole("searchbox")).toHaveValue(inicial);

    rerender(<FilterBar searchValue={siguiente} onSearchChange={vi.fn()} />);
    expect(screen.getByRole("searchbox")).toHaveValue(esperado);
  });

  it("mientras se tipea sin Enter manda el borrador local: no se pisa ni se dispara la búsqueda", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const { rerender } = render(<FilterBar searchValue="foo" onSearchChange={onSearchChange} />);

    const input = screen.getByRole("searchbox");
    await user.clear(input);
    await user.type(input, "impresora");
    // Un rerender del consumidor con el MISMO filtro aplicado (cualquier
    // cambio de estado del listado) no puede devolver la caja a "foo".
    rerender(<FilterBar searchValue="foo" onSearchChange={onSearchChange} />);

    expect(input).toHaveValue("impresora");
    expect(onSearchChange).not.toHaveBeenCalled();

    await user.type(input, "{Enter}");
    expect(onSearchChange).toHaveBeenCalledWith("impresora");
  });

  it("sin searchValue (consumidor viejo) → la caja arranca vacía", () => {
    render(<FilterBar onSearchChange={vi.fn()} />);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("sin onSearchChange (solo filtros) → NO renderiza el input de búsqueda", () => {
    render(
      <FilterBar>
        <button>Filtro estado</button>
      </FilterBar>,
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
