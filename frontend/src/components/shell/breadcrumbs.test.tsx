import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./breadcrumbs";

let mockPathname = "/tickets";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("Breadcrumbs", () => {
  it("/tickets → renders a single 'Tickets' crumb, marked as current page", () => {
    mockPathname = "/tickets";
    render(<Breadcrumbs />);
    const crumb = screen.getByText("Tickets");
    expect(crumb).toBeInTheDocument();
    expect(crumb.closest("[aria-current='page']")).not.toBeNull();
  });

  it("/tickets/nuevo → renders TWO crumbs: 'Tickets' (link) then 'Nuevo' (current)", () => {
    mockPathname = "/tickets/nuevo";
    render(<Breadcrumbs />);
    expect(screen.getByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/tickets");
    const current = screen.getByText("Nuevo");
    expect(current.closest("[aria-current='page']")).not.toBeNull();
  });

  it("/admin/catalogos → humanizes unknown segment 'catalogos' to 'Catalogos' (capitalized)", () => {
    mockPathname = "/admin/catalogos";
    render(<Breadcrumbs />);
    expect(screen.getByText("Catalogos")).toBeInTheDocument();
  });
});
