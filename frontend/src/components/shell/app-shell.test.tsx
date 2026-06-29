/**
 * T2.3 · TEST RED — AppShell drawer behavior
 *
 * Contract under test (state logic — not CSS visibility, jsdom has no media queries):
 * - Hamburger button with aria-label="Abrir menú" is in the DOM
 * - Initially: drawer (role="dialog") is NOT rendered
 * - Click hamburger → drawer (role="dialog" aria-modal="true") appears + overlay visible
 * - Drawer open + ESC → drawer closes; focus returns to hamburger button
 * - Drawer open + click overlay → drawer closes
 * - Drawer open + pathname change (rerender) → drawer closes automatically
 *
 * Why we test state, not CSS:
 *   jsdom does not execute CSS media queries, so `hidden md:flex` visibility cannot be
 *   asserted via getComputedStyle. We test the BEHAVIOR (open/close state, a11y attrs)
 *   instead.
 *
 * Spec: [SPEC:frontend-shell/req 2 flex-row layout], [SPEC:frontend-shell/req 6 responsive drawer],
 *       [SPEC:frontend-shell/req 7 accesibilidad]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JwtPayload } from "@/shared/api/types";

// ── Mocks ─────────────────────────────────────────────────────────────────
// Sidebar is mocked to isolate AppShell behavior from Sidebar's own dependencies.
vi.mock("./sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar-mock">Sidebar</div>,
}));

const mockUsePathname = vi.fn<() => string>(() => "/tickets");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Vitest hoists vi.mock calls — imports below are resolved after mocking
import { AppShell } from "./app-shell";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderAppShell() {
  return render(
    <AppShell>
      <div data-testid="page-content">Page content</div>
    </AppShell>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/tickets");
  });

  it("renders the hamburger button with correct aria-label", () => {
    renderAppShell();
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument();
  });

  it("drawer is not rendered initially (closed state)", () => {
    renderAppShell();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders page children in a <main> element", () => {
    renderAppShell();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("click hamburger → drawer opens with role='dialog' and aria-modal='true'", async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("click hamburger → overlay backdrop appears", async () => {
    const user = userEvent.setup();
    renderAppShell();

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    // Overlay is the aria-hidden backdrop div behind the drawer
    const overlay = document.querySelector("[aria-hidden='true'].fixed");
    expect(overlay).not.toBeNull();
  });

  it("drawer open + ESC → drawer closes", async () => {
    const user = userEvent.setup();
    renderAppShell();

    // Open
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Close with ESC
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("after ESC, focus returns to the hamburger button", async () => {
    const user = userEvent.setup();
    renderAppShell();

    const hamburger = screen.getByRole("button", { name: "Abrir menú" });

    // Open drawer
    await user.click(hamburger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Close with ESC — focus should return to hamburger
    await user.keyboard("{Escape}");

    // The ESC handler explicitly calls hamburgerRef.current?.focus()
    expect(document.activeElement).toBe(hamburger);
  });

  it("drawer open + click overlay → drawer closes", async () => {
    const user = userEvent.setup();
    renderAppShell();

    // Open
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Click the overlay (aria-hidden backdrop)
    const overlay = document.querySelector("[aria-hidden='true'].fixed") as HTMLElement;
    expect(overlay).not.toBeNull();
    await user.click(overlay);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drawer auto-closes when pathname changes (route navigation)", async () => {
    const user = userEvent.setup();
    const { rerender } = renderAppShell();

    // Open drawer
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Simulate route change by updating what usePathname returns and re-rendering
    mockUsePathname.mockReturnValue("/compras");
    rerender(
      <AppShell>
        <div data-testid="page-content">Page content</div>
      </AppShell>,
    );

    // useEffect watching [pathname] should have fired and closed the drawer
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
