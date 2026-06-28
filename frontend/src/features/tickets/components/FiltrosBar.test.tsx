/**
 * Tests for FiltrosBar component (PR4 — T4.8).
 *
 * TDD RED — written before implementation.
 * FiltrosBar is a purely presentational component — no hooks to mock.
 * Tests drive props → rendered output and callback behavior.
 *
 * Covers:
 *   1. Renders exactly 3 tipo checkboxes (Soporte, Compras, Edilicia)
 *   2. isLoadingCiclo=true → date inputs show skeleton (not interactive)
 *   3. isLoadingCiclo=false → date inputs are interactive
 *   4. Tipo checkboxes are interactive regardless of ciclo loading state
 *   5. Clicking a selected tipo calls onChange with it removed
 *   6. ciclo present → date inputs have ciclo.fechaInicio / ciclo.fechaFin as values
 *   7. ciclo=null → date inputs have no value
 *
 * Spec: ADR-7, ADR-8 (tickets-list-filtros-resolucion)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltrosBar } from "./FiltrosBar";
import type { CicloActivo } from "../types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const soporte = { id: "e0000000-0000-4000-e000-000000000001", nombre: "Soporte" };
const compras = { id: "e0000000-0000-4000-e000-000000000002", nombre: "Compras" };
const edilicia = { id: "e0000000-0000-4000-e000-000000000003", nombre: "Edilicia" };
const tiposDisponibles = [soporte, compras, edilicia];

const mockCiclo: CicloActivo = {
  id: "ciclo-uuid-001",
  nombre: "Ciclo 2026",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-12-31",
  activo: true,
};

// ─── Default props helper ─────────────────────────────────────────────────────

function makeProps(overrides: Partial<Parameters<typeof FiltrosBar>[0]> = {}): Parameters<typeof FiltrosBar>[0] {
  return {
    filtros: {},
    onChange: vi.fn(),
    ciclo: null,
    isLoadingCiclo: false,
    tiposDisponibles,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("FiltrosBar", () => {
  it("renders exactly 3 tipo checkboxes", () => {
    render(<FiltrosBar {...makeProps()} />);

    expect(screen.getByRole("checkbox", { name: /Soporte/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Compras/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Edilicia/i })).toBeInTheDocument();

    // Exactly 3 checkboxes total
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("shows skeleton placeholders (not interactive inputs) for dates when isLoadingCiclo=true", () => {
    render(<FiltrosBar {...makeProps({ isLoadingCiclo: true })} />);

    // Date inputs should NOT be in the DOM when loading
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // No date input (type=date inputs have no accessible role in jsdom, check by label)
    expect(screen.queryByLabelText(/desde/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hasta/i)).not.toBeInTheDocument();

    // Skeleton placeholder(s) should be present (animate-pulse)
    const container = document.querySelector("[data-testid='filtros-bar']") ?? document.body;
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows interactive date inputs when isLoadingCiclo=false", () => {
    render(<FiltrosBar {...makeProps({ isLoadingCiclo: false })} />);

    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hasta/i)).toBeInTheDocument();
  });

  it("tipo checkboxes are interactive regardless of isLoadingCiclo", async () => {
    const onChange = vi.fn();
    render(<FiltrosBar {...makeProps({ isLoadingCiclo: true, onChange })} />);

    const soporteCheckbox = screen.getByRole("checkbox", { name: /Soporte/i });
    expect(soporteCheckbox).not.toBeDisabled();

    await userEvent.click(soporteCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clicking a selected tipo calls onChange with it removed (deselect)", async () => {
    const onChange = vi.fn();
    // Start with soporte selected
    render(
      <FiltrosBar
        {...makeProps({
          filtros: { tiposIds: [soporte.id] },
          onChange,
        })}
      />,
    );

    // Soporte checkbox should be checked
    const soporteCheckbox = screen.getByRole("checkbox", { name: /Soporte/i });
    expect(soporteCheckbox).toBeChecked();

    // Click to deselect
    await userEvent.click(soporteCheckbox);
    expect(onChange).toHaveBeenCalledWith({ tiposIds: [] });
  });

  it("clicking an unselected tipo calls onChange with it added (select)", async () => {
    const onChange = vi.fn();
    render(
      <FiltrosBar
        {...makeProps({
          filtros: {},
          onChange,
        })}
      />,
    );

    // No tipos selected yet → checkbox unchecked
    const comprasCheckbox = screen.getByRole("checkbox", { name: /Compras/i });
    expect(comprasCheckbox).not.toBeChecked();

    await userEvent.click(comprasCheckbox);
    expect(onChange).toHaveBeenCalledWith({ tiposIds: [compras.id] });
  });

  it("sets fechaDesde and fechaHasta inputs to ciclo dates when ciclo is present", () => {
    render(
      <FiltrosBar
        {...makeProps({
          ciclo: mockCiclo,
          filtros: {
            fechaDesde: mockCiclo.fechaInicio,
            fechaHasta: mockCiclo.fechaFin,
          },
          isLoadingCiclo: false,
        })}
      />,
    );

    const desdeInput = screen.getByLabelText(/desde/i) as HTMLInputElement;
    const hastaInput = screen.getByLabelText(/hasta/i) as HTMLInputElement;

    expect(desdeInput.value).toBe(mockCiclo.fechaInicio);
    expect(hastaInput.value).toBe(mockCiclo.fechaFin);
  });

  it("leaves date inputs without value when ciclo is null", () => {
    render(
      <FiltrosBar
        {...makeProps({
          ciclo: null,
          filtros: {},
          isLoadingCiclo: false,
        })}
      />,
    );

    const desdeInput = screen.getByLabelText(/desde/i) as HTMLInputElement;
    const hastaInput = screen.getByLabelText(/hasta/i) as HTMLInputElement;

    expect(desdeInput.value).toBe("");
    expect(hastaInput.value).toBe("");
  });
});
