import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

/**
 * Regresión: `asChild` con Radix `Slot` requiere EXACTAMENTE un hijo
 * elemento. El ícono condicional de `isLoading` (`{isLoading && <Loader2 />}`)
 * cuenta como un 2do hijo aunque sea `false`, y `Slot` tira
 * "Slot failed to slot onto its children" — rompía cualquier
 * `<Button asChild><Link .../></Button>` (ej. `KbDetailView`, T3.3).
 */
describe("Button asChild", () => {
  it("con asChild + un solo hijo (ej. Link) NO rompe Slot (isLoading=false por defecto)", () => {
    render(
      <Button asChild>
        <a href="/destino">Ir</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Ir" })).toBeInTheDocument();
  });
});
