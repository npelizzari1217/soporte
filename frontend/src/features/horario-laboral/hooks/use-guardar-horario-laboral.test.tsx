import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useGuardarHorarioLaboral } from "./use-guardar-horario-laboral";
import { HORARIO_LABORAL_QUERY_KEY } from "./use-horario-laboral";
import type { HorarioLaboralDto } from "../types";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const DTO: HorarioLaboralDto = {
  dias: [
    { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
    { diaSemana: 1, aperturaMinuto: 480, cierreMinuto: 720 },
    { diaSemana: 2, aperturaMinuto: 480, cierreMinuto: 720 },
    { diaSemana: 3, aperturaMinuto: 480, cierreMinuto: 720 },
    { diaSemana: 4, aperturaMinuto: 480, cierreMinuto: 720 },
    { diaSemana: 5, aperturaMinuto: 480, cierreMinuto: 720 },
    { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
  ],
};

describe("useGuardarHorarioLaboral", () => {
  it('invalida ["horario-laboral"] al guardar', async () => {
    server.use(http.put("/api/horario-laboral", () => HttpResponse.json(DTO)));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGuardarHorarioLaboral(), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate(DTO);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(HORARIO_LABORAL_QUERY_KEY);
    invalidateSpy.mockRestore();
  });

  it("un 422 de dominio (7 días cerrados) NO invalida la query y queda en isError", async () => {
    const MENSAJE_BACKEND = "Debe quedar al menos un día abierto.";
    server.use(
      http.put("/api/horario-laboral", () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGuardarHorarioLaboral(), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate(DTO);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(MENSAJE_BACKEND);
    expect(invalidateSpy).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });
});
