import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const replaceMock = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/listado",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { useUrlFilters } from "./use-url-filters";

/**
 * Tipo de filtros de prueba: declara AMBOS nombres de página reales del repo
 * (`page` en KB, `pagina` en tickets/compras) para poder parametrizar los
 * mismos casos sobre la única variación real entre features.
 */
interface FiltrosDePrueba {
  busqueda?: string;
  estado?: string;
  sectorId?: string;
  page?: number;
  pagina?: number;
}

/** Params de la última URL con la que se llamó a `router.replace`. */
function ultimosParams(): URLSearchParams {
  const url = replaceMock.mock.calls.at(-1)?.[0] as string;
  return new URL(url, "http://localhost").searchParams;
}

describe.each(["page", "pagina"] as const)("useUrlFilters — parámetro de página «%s»", (paramPagina) => {
  beforeEach(() => {
    replaceMock.mockClear();
    currentSearch = "";
  });

  it("el patch borra las claves undefined y vacías, y setea las demás", () => {
    currentSearch = "busqueda=vieja&estado=ABIERTO";
    const { result } = renderHook(() => useUrlFilters<FiltrosDePrueba>(paramPagina));

    result.current.updateFiltros({ busqueda: "", estado: undefined, sectorId: "s1" });

    const params = ultimosParams();
    expect(params.get("busqueda")).toBeNull();
    expect(params.get("estado")).toBeNull();
    expect(params.get("sectorId")).toBe("s1");
  });

  it("por defecto vuelve a la página 1, usando el nombre de parámetro configurado", () => {
    currentSearch = `${paramPagina}=3`;
    const { result } = renderHook(() => useUrlFilters<FiltrosDePrueba>(paramPagina));

    result.current.updateFiltros({ estado: "CERRADO" });

    expect(ultimosParams().get(paramPagina)).toBe("1");
  });

  it("con resetPage:false conserva la página actual", () => {
    currentSearch = `${paramPagina}=3`;
    const { result } = renderHook(() => useUrlFilters<FiltrosDePrueba>(paramPagina));

    result.current.updateFiltros({ estado: "CERRADO" }, { resetPage: false });

    const params = ultimosParams();
    expect(params.get(paramPagina)).toBe("3");
    expect(params.get("estado")).toBe("CERRADO");
  });

  it("irAPagina cambia solo la página y conserva el resto de los filtros", () => {
    currentSearch = `estado=ABIERTO&${paramPagina}=1`;
    const { result } = renderHook(() => useUrlFilters<FiltrosDePrueba>(paramPagina));

    result.current.irAPagina(4);

    const params = ultimosParams();
    expect(params.get(paramPagina)).toBe("4");
    expect(params.get("estado")).toBe("ABIERTO");
  });

  it("limpiarFiltros deja la URL sin ningún parámetro, la página incluida", () => {
    currentSearch = `estado=ABIERTO&busqueda=algo&${paramPagina}=2`;
    const { result } = renderHook(() => useUrlFilters<FiltrosDePrueba>(paramPagina));

    result.current.limpiarFiltros();

    expect(replaceMock.mock.calls.at(-1)?.[0]).toBe("/listado");
  });
});
