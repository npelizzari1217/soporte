import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClienteSelection } from "./ClienteSelection";

// Spec: PR11 — Login multi-membresía: selector de cliente tras el 1er POST.

const MEMBRESIAS = [
  { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
  { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
];

describe("ClienteSelection", () => {
  it("renders one option per membresía, showing cliente nombre and rol", () => {
    render(<ClienteSelection membresias={MEMBRESIAS} onSelect={vi.fn()} isLoading={false} />);
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("ADMINISTRADOR")).toBeInTheDocument();
    expect(screen.getByText("Cliente Dos")).toBeInTheDocument();
    expect(screen.getByText("TECNICO")).toBeInTheDocument();
  });

  it("clicking a membresía calls onSelect with its cliente_id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ClienteSelection membresias={MEMBRESIAS} onSelect={onSelect} isLoading={false} />);

    await user.click(screen.getByRole("button", { name: /cliente dos/i }));

    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("isLoading=true → disables every membresía option", () => {
    render(<ClienteSelection membresias={MEMBRESIAS} onSelect={vi.fn()} isLoading />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
