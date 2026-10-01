import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { RepuestosListView } from "./repuestos-list-view";
import type { Insumo } from "../types";

/**
 * RepuestosListView reusa `CatalogoInsumosListView`: la cobertura de
 * resolución de familia/unidad, estados de carga y el badge
 * Habilitado/Deshabilitado ya está en `insumos-list-view.test.tsx`, contra el
 * MISMO componente compartido. Repetirla en este archivo sería la duplicación que el WU
 * pidió evitar. Este archivo cubre solo lo que ES DISTINTO de la sección
 * Repuestos: el filtro que manda, el título y el gate.
 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

const MOUSE: Insumo = {
  id: "33333333-3333-3333-3333-333333333333",
  codigo: "MOU-001",
  nombre: "Mouse óptico USB",
  familiaId: "fam-mouse",
  unidadMedidaId: "um-1",
  stockMinimo: null,
  activo: true,
  seguimiento: "NINGUNO",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

function mockCatalogos(insumos: Insumo[]): void {
  server.use(
    http.get("/api/insumos", () => HttpResponse.json(insumos)),
    http.get("/api/familias-insumo", () => HttpResponse.json([])),
    http.get("/api/unidades-medida", () => HttpResponse.json([])),
  );
}

describe("RepuestosListView — la página de Repuestos renderiza", () => {
  it("muestra el título Repuestos y el catálogo que devuelve el endpoint", async () => {
    mockCatalogos([MOUSE]);
    renderWithProviders(<RepuestosListView />, { user: LECTOR });

    expect(await screen.findByRole("heading", { name: "Repuestos" })).toBeInTheDocument();
    expect(await screen.findByText("MOU-001")).toBeInTheDocument();
  });
});

/**
 * El gemelo de este test vive en `insumos-list-view.test.tsx` (esRepuesto=false):
 * juntos prueban que las dos secciones NUNCA comparten el mismo llamado, algo
 * que un `useInsumos()` sin argumento en cualquiera de las dos dejaría pasar.
 */
describe("RepuestosListView — filtro esRepuesto (WU-2)", () => {
  it("pide el catálogo con esRepuesto=true", async () => {
    let queryRecibida: string | null = null;
    server.use(
      http.get("/api/insumos", ({ request }) => {
        queryRecibida = new URL(request.url).searchParams.get("esRepuesto");
        return HttpResponse.json([]);
      }),
      http.get("/api/familias-insumo", () => HttpResponse.json([])),
      http.get("/api/unidades-medida", () => HttpResponse.json([])),
    );
    renderWithProviders(<RepuestosListView />, { user: LECTOR });

    await screen.findByText(/sin repuestos/i);
    expect(queryRecibida).toBe("true");
  });
});

describe("RepuestosListView — gate INSUMOS:LECTURA", () => {
  it("sin INSUMOS:LECTURA → no ve el catálogo", async () => {
    mockCatalogos([MOUSE]);
    renderWithProviders(<RepuestosListView />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText(/no tiene permiso/i)).toBeInTheDocument();
  });

  it("con INSUMOS:LECTURA → sí ve el catálogo", async () => {
    mockCatalogos([MOUSE]);
    renderWithProviders(<RepuestosListView />, { user: LECTOR });

    expect(await screen.findByText("MOU-001")).toBeInTheDocument();
    expect(screen.queryByText(/no tiene permiso/i)).not.toBeInTheDocument();
  });
});

describe("RepuestosListView — navegación a la ficha del repuesto", () => {
  it("al hacer click en una fila navega a /repuestos/:id, no a /insumos/:id", async () => {
    mockCatalogos([MOUSE]);
    renderWithProviders(<RepuestosListView />, { user: LECTOR });

    await userEvent.click(await screen.findByText("MOU-001"));

    expect(pushMock).toHaveBeenCalledWith(`/repuestos/${MOUSE.id}`);
  });
});
