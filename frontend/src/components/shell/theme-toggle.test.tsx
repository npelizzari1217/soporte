import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./theme-toggle";
import { ThemeProvider } from "@/shared/providers/theme-provider";

// Spec: PR11 — ThemeToggle: alterna día/noche, persiste en localStorage,
// sin flash-of-wrong-theme (mount-gating).

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("clicking the toggle flips the .dark class on <html> and persists the choice to localStorage", async () => {
    window.localStorage.setItem("theme", "light");
    const user = userEvent.setup();
    renderToggle();

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));

    await user.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("clicking twice returns to the original theme (light → dark → light)", async () => {
    window.localStorage.setItem("theme", "light");
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("exposes an accessible label that reflects the action the click will perform", async () => {
    window.localStorage.setItem("theme", "light");
    renderToggle();

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAccessibleName(/modo noche/i),
    );
  });
});
