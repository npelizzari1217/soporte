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

  it("sin onSearchChange (solo filtros) → NO renderiza el input de búsqueda", () => {
    render(
      <FilterBar>
        <button>Filtro estado</button>
      </FilterBar>,
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
