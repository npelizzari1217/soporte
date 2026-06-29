/**
 * T4.1 · TEST RED — UserMenu (Radix DropdownMenu migration)
 *
 * Contract under test:
 * - Shows user email in the trigger button
 * - [FAILS TODAY] click-outside closes the dropdown (no handler in current impl)
 * - [FAILS TODAY] ESC closes the dropdown (no handler in current impl)
 * - Focus returns to trigger after closing with ESC
 * - Logout: fetch POST /api/auth/logout called on "Cerrar sesión" selection
 * - Logout loading state: "Cerrando sesión…" + disabled item during in-flight fetch
 *
 * Why Radix: the current user-menu.tsx uses {open && <div>} toggle with zero
 * click-outside or keyboard (ESC) handling. These tests confirm those behaviors
 * are broken today (RED) and will pass after Radix migration (GREEN, T4.2).
 *
 * Portal note: Radix DropdownMenu.Content renders into document.body via Portal.
 * Always query the dropdown items via `within(document.body)`.
 *
 * Spec: [SPEC:frontend-shell/req 5 UserMenu click-outside ESC foco]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JwtPayload } from "@/shared/api/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseSession = vi.fn<() => { user: JwtPayload | null; isLoading: boolean; can: () => boolean }>(
  () => ({
    user: {
      email: "test@example.com",
      sub: "123",
      cliente_id: "abc",
      roles: [],
      permisos: [],
    },
    isLoading: false,
    can: () => false,
  })
);

vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));

// Import after mocks are hoisted
import { UserMenu } from "./user-menu";

// ── Fixture ───────────────────────────────────────────────────────────────────

const MOCK_USER: JwtPayload = {
  email: "test@example.com",
  sub: "123",
  cliente_id: "abc",
  roles: [],
  permisos: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UserMenu", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ user: MOCK_USER, isLoading: false, can: () => false });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("shows the user email in the trigger button", () => {
    render(<UserMenu />);
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("renders nothing when there is no session user", () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false, can: () => false });
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toBeNull();
  });

  // ── [FAILS TODAY] Keyboard and click-outside ───────────────────────────────

  /**
   * The current implementation uses {open && <div>} with no click-outside handler.
   * Clicking document.body will NOT close the menu → test FAILS (RED) today.
   * After Radix migration, DismissableLayer closes the menu automatically → GREEN.
   */
  it("[FAILS TODAY] closes the dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    const trigger = screen.getByRole("button", { name: /test@example\.com/i });
    await user.click(trigger);

    // Verify the dropdown is open (the logout option is visible)
    expect(within(document.body).getByText(/cerrar sesión/i)).toBeInTheDocument();

    // Click outside — use fireEvent.pointerDown to bypass the CSS pointer-events:none
    // that Radix sets on <body> when a layer is open. Radix's DismissableLayer
    // listens for 'pointerdown' on the document (capture phase) to detect outside interaction.
    fireEvent.pointerDown(document.body);

    // The dropdown must be closed
    expect(within(document.body).queryByText(/cerrar sesión/i)).not.toBeInTheDocument();
  });

  /**
   * The current implementation has no keydown handler for Escape.
   * Pressing ESC will NOT close the menu → test FAILS (RED) today.
   * After Radix migration, DropdownMenu.Content handles ESC natively → GREEN.
   */
  it("[FAILS TODAY] closes the dropdown on Escape key press", async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    const trigger = screen.getByRole("button", { name: /test@example\.com/i });
    await user.click(trigger);

    expect(within(document.body).getByText(/cerrar sesión/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(within(document.body).queryByText(/cerrar sesión/i)).not.toBeInTheDocument();
  });

  /**
   * After ESC closes the menu, Radix's FocusScope returns focus to the trigger.
   * Radix handles this automatically via its internal focus management.
   */
  it("returns focus to the trigger button after closing with Escape", async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    const trigger = screen.getByRole("button", { name: /test@example\.com/i });
    trigger.focus();
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  // ── Logout behavior ────────────────────────────────────────────────────────

  it('calls POST /api/auth/logout when "Cerrar sesión" is selected', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(screen.getByRole("button", { name: /test@example\.com/i }));
    await user.click(within(document.body).getByText(/cerrar sesión/i));

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it('shows "Cerrando sesión…" and disables the item while logout is in progress', async () => {
    // Make fetch hang so we can observe the loading state before navigation fires
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));

    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(screen.getByRole("button", { name: /test@example\.com/i }));
    await user.click(within(document.body).getByText(/cerrar sesión/i));

    // The item must show the loading text (menu stays open via e.preventDefault in onSelect)
    expect(within(document.body).getByText(/cerrando sesión/i)).toBeInTheDocument();
  });
});
