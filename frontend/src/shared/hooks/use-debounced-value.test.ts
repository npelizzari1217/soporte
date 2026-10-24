import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publica el valor nuevo recién cuando pasa la demora sin cambios", () => {
    const { result, rerender } = renderHook(({ valor }) => useDebouncedValue(valor, 300), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "pin" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("pin");
  });

  it("cada cambio reinicia la demora: mientras se tipea conserva el último valor estable", () => {
    const { result, rerender } = renderHook(({ valor }) => useDebouncedValue(valor, 300), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "p" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ valor: "pi" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("pi");
  });
});
