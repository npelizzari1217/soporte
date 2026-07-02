/**
 * DashboardPage — estado "Elegí un cliente" (admin-general PR5b — T5.16)
 *
 * Contract under test:
 * - isLoading → skeleton (existing, no-regression)
 * - Operador global (isGlobalAdmin=true) con TenantContext.clienteId=null →
 *   placeholder "Elegí un cliente" en vez del saludo operativo
 * - Operador con cliente ya seleccionado → placeholder desaparece, saludo operativo visible
 * - No-operador (ADMINISTRADOR o USUARIO) → nunca ve el placeholder, aunque
 *   TenantContext.clienteId sea null (no debería serlo en la práctica, pero
 *   el gate es isGlobalAdmin, no la mera ausencia de clienteId)
 *
 * Spec: [SPEC:admin-ui/Estado "Elegí un cliente" para operador sin cliente seleccionado]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JwtPayload } from "@/shared/api/types";
import { TenantContext, type TenantContextValue } from "@/shared/providers/tenant-context";

const mockUseSession = vi.fn<
  () => { user: JwtPayload | null; isLoading: boolean; isGlobalAdmin: boolean }
>(() => ({
  user: null,
  isLoading: false,
  isGlobalAdmin: false,
}));

vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

import DashboardPage from "./page";

const OPERADOR: JwtPayload = {
  sub: "op-1",
  cliente_id: "home",
  email: "operador@sesitec.com.ar",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

const ADMIN_CLIENTE: JwtPayload = {
  sub: "admin-1",
  cliente_id: "cliente-1",
  email: "admin@cliente.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

const USUARIO: JwtPayload = {
  sub: "user-1",
  cliente_id: "cliente-1",
  email: "user@cliente.com",
  roles: ["USUARIO"],
  permisos: [],
  is_global_admin: false,
};

/** Renders DashboardPage under a TenantContext.Provider with the given clienteId. */
function renderWithTenant(clienteId: string | null) {
  const value: TenantContextValue = {
    clienteId,
    clienteNombre: clienteId ? "Acme Corp" : null,
    cicloId: null,
    cicloNombre: null,
    setCliente: () => {},
    setCiclo: () => {},
  };
  return render(
    <TenantContext.Provider value={value}>
      <DashboardPage />
    </TenantContext.Provider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false, isGlobalAdmin: false });
  });

  it("muestra skeleton mientras isLoading (no-regression)", () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: true, isGlobalAdmin: false });
    renderWithTenant(null);
    expect(screen.queryByText("Elegí un cliente")).toBeNull();
    expect(screen.queryByText(/Bienvenido/)).toBeNull();
  });

  it('operador global sin cliente seleccionado ve el placeholder "Elegí un cliente"', () => {
    mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, isGlobalAdmin: true });
    renderWithTenant(null);
    expect(screen.getByText("Elegí un cliente")).toBeInTheDocument();
    expect(screen.queryByText(/Bienvenido/)).toBeNull();
  });

  it("el placeholder desaparece y el saludo operativo aparece cuando el operador elige un cliente", () => {
    mockUseSession.mockReturnValue({ user: OPERADOR, isLoading: false, isGlobalAdmin: true });
    renderWithTenant("cliente-a");
    expect(screen.queryByText("Elegí un cliente")).toBeNull();
    expect(screen.getByText(/Bienvenido/)).toBeInTheDocument();
  });

  it("ADMINISTRADOR (no operador) nunca ve el placeholder aunque clienteId sea null", () => {
    mockUseSession.mockReturnValue({ user: ADMIN_CLIENTE, isLoading: false, isGlobalAdmin: false });
    renderWithTenant(null);
    expect(screen.queryByText("Elegí un cliente")).toBeNull();
    expect(screen.getByText(/Bienvenido/)).toBeInTheDocument();
  });

  it("USUARIO (no operador) nunca ve el placeholder", () => {
    mockUseSession.mockReturnValue({ user: USUARIO, isLoading: false, isGlobalAdmin: false });
    renderWithTenant("cliente-1");
    expect(screen.queryByText("Elegí un cliente")).toBeNull();
    expect(screen.getByText(/Bienvenido/)).toBeInTheDocument();
  });
});
