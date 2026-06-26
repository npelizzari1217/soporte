import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders required title", () => {
    render(<EmptyState title="No hay registros" />);
    expect(screen.getByText("No hay registros")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="Vacío" description="Crea uno nuevo para empezar" />);
    expect(screen.getByText("Crea uno nuevo para empezar")).toBeInTheDocument();
  });

  it("does not render description element when not provided", () => {
    const { container } = render(<EmptyState title="Vacío" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders icon when provided", () => {
    render(<EmptyState title="Vacío" icon={<svg data-testid="test-icon" />} />);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        title="Vacío"
        action={<button>Crear nuevo</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Crear nuevo" })).toBeInTheDocument();
  });

  it("has vertical centered flexbox layout", () => {
    const { container } = render(<EmptyState title="Vacío" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("flex");
    expect(root).toHaveClass("flex-col");
    expect(root).toHaveClass("items-center");
  });
});
