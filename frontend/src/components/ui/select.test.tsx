import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select } from "./select";

/**
 * Regresión: `bg-transparent` sin color de texto/opciones explícito dejaba
 * las opciones del `<select>` nativo ilegibles en modo noche (blanco sobre
 * blanco / oscuro sobre oscuro) — reportado en el listado de tipo de
 * usuario (rol). Fix: fondo/texto por token (`bg-background`/
 * `text-foreground`, ambos con contraste correcto en día Y noche vía
 * `globals.css`) + color de `<option>` forzado con `[&>option]`.
 */
describe("Select — contraste día/noche", () => {
  it("usa bg-background/text-foreground (no bg-transparent) y fuerza color de <option>", () => {
    render(
      <Select aria-label="Rol">
        <option value="admin">Administrador</option>
        <option value="usuario">Usuario</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Rol" });
    expect(select.className).not.toContain("bg-transparent");
    expect(select.className).toContain("bg-background");
    expect(select.className).toContain("text-foreground");
    expect(select.className).toContain("[&>option]:bg-background");
    expect(select.className).toContain("[&>option]:text-foreground");
  });
});
