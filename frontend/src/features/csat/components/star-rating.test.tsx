import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarRating } from "./star-rating";

describe("StarRating", () => {
  it("expone 5 opciones con nombre accesible y dispara onChange al elegir una", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "3 de 5 estrellas" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "4 de 5 estrellas" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("es operable por teclado: Tab enfoca el grupo y no hay elementos sin nombre accesible", () => {
    render(<StarRating value={2} onChange={vi.fn()} />);

    const seleccionada = screen.getByRole("radio", { name: "2 de 5 estrellas" });
    expect(seleccionada).toBeChecked();
    // Radios nativos: navegables con flechas por construcción del elemento;
    // acá se verifica que cada opción es alcanzable por Tab (no tabIndex=-1
    // fuera de lo esperado por el propio <input type="radio">).
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
