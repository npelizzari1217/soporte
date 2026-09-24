import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";

describe("OrigenFeriadoBadge", () => {
  it("GLOBAL → renders label 'Nacional' with the success-light variant (soft green)", () => {
    render(<OrigenFeriadoBadge origen="GLOBAL" />);
    expect(screen.getByText("Nacional")).toBeInTheDocument();
    const badge = screen.getByTestId("origen-feriado-badge");
    expect(badge).toHaveClass("bg-success-light", "text-success");
  });

  it("CLIENTE → renders label 'Del cliente' with the info variant (pale blue)", () => {
    render(<OrigenFeriadoBadge origen="CLIENTE" />);
    expect(screen.getByText("Del cliente")).toBeInTheDocument();
    const badge = screen.getByTestId("origen-feriado-badge");
    expect(badge).toHaveClass("bg-info-light", "text-info");
  });

  it("GLOBAL and CLIENTE never share a variant class (visually distinct)", () => {
    const { unmount } = render(<OrigenFeriadoBadge origen="GLOBAL" />);
    const globalClasses = screen.getByTestId("origen-feriado-badge").className;
    unmount();
    render(<OrigenFeriadoBadge origen="CLIENTE" />);
    const clienteClasses = screen.getByTestId("origen-feriado-badge").className;
    expect(globalClasses).not.toBe(clienteClasses);
  });
});
