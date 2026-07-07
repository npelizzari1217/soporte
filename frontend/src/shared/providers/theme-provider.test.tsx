/**
 * ThemeProvider + useTheme() — TEST RED
 *
 * Contract under test:
 * - useTheme() exposes { theme, toggle, setTheme }
 * - toggle() flips light<->dark
 * - setTheme()/toggle() apply/remove the `.dark` class on document.documentElement
 *   (Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *))` — the class
 *   strategy is the wire contract of the dual-mode system, not a styling detail)
 * - setTheme()/toggle() persist the choice to localStorage under the 'theme' key
 *   (same key the FOUC script in app/layout.tsx already reads)
 * - Initial state matches what the FOUC script already computed/applied — verified
 *   by seeding localStorage before render and asserting the first render already
 *   reflects it (no flash / no desync via a delayed useEffect)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./theme-provider";

function Consumer() {
  const { theme, toggle, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setTheme("light")}>set-light</button>
      <button onClick={() => setTheme("dark")}>set-dark</button>
    </div>
  );
}

describe("ThemeProvider / useTheme()", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("toggle() flips the theme from dark to light", async () => {
    localStorage.setItem("theme", "dark");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
  });

  it("toggle() flips the theme from light back to dark", async () => {
    localStorage.setItem("theme", "light");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
  });

  it("setTheme('dark') adds the .dark class to document.documentElement", async () => {
    localStorage.setItem("theme", "light");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button", { name: "set-dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme('light') removes the .dark class from document.documentElement", async () => {
    localStorage.setItem("theme", "dark");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "set-light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the chosen theme to localStorage under the 'theme' key", async () => {
    localStorage.setItem("theme", "dark");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "set-light" }));
    expect(localStorage.getItem("theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: "set-dark" }));
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("initial state reflects the localStorage preference already applied by the FOUC script (no flash)", () => {
    localStorage.setItem("theme", "light");
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    // First render already shows 'light' — not the 'dark' default, and not
    // requiring a subsequent effect/re-render to correct itself.
    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
  });

  it("initial state falls back to 'dark' when there is no stored preference", () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
  });
});
