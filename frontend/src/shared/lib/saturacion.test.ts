import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";
import { avisarSaturacion, esSaturacion, ID_AVISO_SATURACION } from "./saturacion";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

/** Aviso de servidor saturado (odd/saturacion-conexiones, S2). */
describe("esSaturacion", () => {
  it("reconoce el código SERVICIO_SATURADO del backend", () => {
    expect(esSaturacion(new ApiError(503, "Saturado", ["Saturado"], undefined, "SERVICIO_SATURADO"))).toBe(true);
  });

  it("no confunde otro 503 ni otro error con una saturación", () => {
    expect(esSaturacion(new ApiError(503, "Mantenimiento"))).toBe(false);
    expect(esSaturacion(new ApiError(422, "Inválido", ["Inválido"], undefined, "OTRO"))).toBe(false);
    expect(esSaturacion(new Error("boom"))).toBe(false);
  });
});

describe("avisarSaturacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explica qué pasó y los pasos para volver a ver la información, con un id fijo", () => {
    avisarSaturacion(() => undefined);

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = vi.mocked(toast.error).mock.calls[0] as [string, Record<string, unknown>];
    expect(titulo).toBe("El sistema está saturado en este momento");
    expect(opciones.id).toBe(ID_AVISO_SATURACION);
    expect(opciones.description).toBe(
      "Hay muchas consultas al mismo tiempo y no se pudo mostrar lo que pidió. Sus datos no se perdieron. " +
        "Para verlo: 1) espere unos segundos; 2) presione «Reintentar»; 3) si sigue sin aparecer, actualice la página (F5).",
    );
  });

  it("«Reintentar» vuelve a pedir lo que falló", () => {
    const reintentar = vi.fn();
    avisarSaturacion(reintentar);

    const [, opciones] = vi.mocked(toast.error).mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(opciones.action.label).toBe("Reintentar");
    opciones.action.onClick();
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it("sin forma de reintentar, el paso dice actualizar la página y no hay botón", () => {
    avisarSaturacion();

    const [, opciones] = vi.mocked(toast.error).mock.calls[0] as [string, Record<string, unknown>];
    expect(opciones.action).toBeUndefined();
    expect(opciones.description).toBe(
      "Hay muchas consultas al mismo tiempo y no se pudo completar lo que pidió. Sus datos no se perdieron. " +
        "Espere unos segundos y vuelva a intentarlo; si sigue fallando, actualice la página (F5).",
    );
  });
});
