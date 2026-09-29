import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useHorarioLaboral } from "./use-horario-laboral";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useHorarioLaboral", () => {
  it("devuelve las 7 filas del GET", async () => {
    const dias = [
      { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
      { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
      { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
      { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
      { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
      { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
      { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
    ];
    server.use(http.get("/api/horario-laboral", () => HttpResponse.json({ dias })));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHorarioLaboral(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.dias).toEqual(dias);
  });

  it("isError queda true si el GET falla", async () => {
    server.use(
      http.get("/api/horario-laboral", () =>
        HttpResponse.json({ statusCode: 500, message: "Error interno" }, { status: 500 }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHorarioLaboral(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
