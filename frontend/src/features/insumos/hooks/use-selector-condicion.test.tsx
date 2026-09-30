import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { useSelectorCondicion } from "./use-selector-condicion";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function stock(id: string, saldos: { NUEVO: number; USADO: number }) {
  return http.get(`/api/insumos/${id}/stock`, () =>
    HttpResponse.json({
      insumoId: id,
      saldo: saldos.NUEVO + saldos.USADO,
      saldos,
      admiteUsado: true,
      stockMinimo: null,
      estadoReposicion: "SIN_MINIMO",
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSelectorCondicion", () => {
  it("vuelve a NUEVO cuando cambia el insumoId, aunque antes se haya elegido USADO", async () => {
    server.use(stock(A, { NUEVO: 3, USADO: 2 }), stock(B, { NUEVO: 1, USADO: 1 }));
    const { result, rerender } = renderHook(({ id }) => useSelectorCondicion(id), {
      wrapper,
      initialProps: { id: A },
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
    act(() => result.current.onChange("USADO"));
    expect(result.current.valor).toBe("USADO");

    rerender({ id: B });

    expect(result.current.valor).toBe("NUEVO");
  });
});
