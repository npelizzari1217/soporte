import { describe, it, expect, vi } from "vitest";
import { redirect } from "next/navigation";
import Home from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("Home (\"/\") — T6.2, sdd/beta-frontend B6", () => {
  it("redirige a /tickets (ruta universal, visible para todos los roles)", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/tickets");
  });
});
