/**
 * ThemeToggle — TEST RED
 *
 * Contract under test:
 * - Light mode  → shows the Moon icon (click to go to night)
 * - Dark mode   → shows the Sun icon (click to go to day)
 * - aria-label describes the action ("Cambiar a modo noche" / "Cambiar a modo día")
 * - Click calls toggle() from useTheme()
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./theme-toggle";

const mockToggle = vi.fn();
const mockUseTheme = vi.fn();

vi.mock("@/shared/providers/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

describe("ThemeToggle", () => {
  it("shows the Moon icon and 'noche' label in light mode", () => {
    mockUseTheme.mockReturnValue({ theme: "light", toggle: mockToggle, setTheme: vi.fn() });
    render(<ThemeToggle />);

    const btn = screen.getByRole("button", { name: /cambiar a modo noche/i });
    expect(btn.querySelector("svg.lucide-moon")).not.toBeNull();
    expect(btn.querySelector("svg.lucide-sun")).toBeNull();
  });

  it("shows the Sun icon and 'día' label in dark mode", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", toggle: mockToggle, setTheme: vi.fn() });
    render(<ThemeToggle />);

    const btn = screen.getByRole("button", { name: /cambiar a modo día/i });
    expect(btn.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(btn.querySelector("svg.lucide-moon")).toBeNull();
  });

  it("calls toggle() when clicked", async () => {
    mockUseTheme.mockReturnValue({ theme: "light", toggle: mockToggle, setTheme: vi.fn() });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});
