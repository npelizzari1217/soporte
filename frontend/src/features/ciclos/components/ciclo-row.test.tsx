import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { CicloRow } from "./ciclo-row";
import type { CicloTenant } from "@/features/dashboard/types";

/**
 * CicloRow — regresión de render-fechas-frontend: `fechaInicio`/`fechaFin`
 * (`@db.Date`, fecha de calendario) ahora se renderizan con
 * `formatearFechaCalendario` en vez del string ISO crudo del backend.
 * Literales fijos, NO derivados de `Intl` — y un caso explícito de
 * `"01-01"` para probar que el día NO se corre (la trampa clásica de
 * parsear con `Date` en un huso al oeste de UTC).
 */
function buildCiclo(overrides: Partial<CicloTenant> = {}): CicloTenant {
  return {
    id: "c1",
    nombre: "2026-S1",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-06-30",
    activo: false,
    cicloVigenteId: "cv1",
    ...overrides,
  };
}

describe("CicloRow", () => {
  it("muestra fechaInicio y fechaFin en formato dd/mm/yyyy, nunca el ISO crudo", () => {
    renderWithProviders(<CicloRow ciclo={buildCiclo()} />);

    expect(screen.getByText("01/01/2026 → 30/06/2026")).toBeInTheDocument();
    expect(screen.queryByText(/2026-01-01/)).not.toBeInTheDocument();
  });

  it("con fechaInicio en el primer día del año, el día no se corre a diciembre del año anterior", () => {
    renderWithProviders(<CicloRow ciclo={buildCiclo({ fechaInicio: "2026-01-01", fechaFin: "2026-01-01" })} />);

    expect(screen.getByText("01/01/2026 → 01/01/2026")).toBeInTheDocument();
    expect(screen.queryByText(/31\/12\/2025/)).not.toBeInTheDocument();
  });
});
