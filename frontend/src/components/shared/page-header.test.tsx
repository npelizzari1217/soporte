import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Ticket } from "lucide-react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as a heading and the description text", () => {
    render(<PageHeader title="Tickets" description="Gestioná los tickets de tu organización." />);
    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByText("Gestioná los tickets de tu organización.")).toBeInTheDocument();
  });

  it("with actions → renders the actions node next to the title", () => {
    render(<PageHeader title="Tickets" actions={<button>Nuevo ticket</button>} />);
    expect(screen.getByRole("button", { name: "Nuevo ticket" })).toBeInTheDocument();
  });

  it("without description → does not render an empty description paragraph", () => {
    const { container } = render(<PageHeader title="Tickets" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("with icon → renders the icon (decorative) next to the heading", () => {
    const { container } = render(<PageHeader title="Tickets" icon={Ticket} />);
    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument();
    expect(container.querySelector("svg[aria-hidden='true']")).toBeInTheDocument();
  });

  it("without icon → no icon is rendered", () => {
    const { container } = render(<PageHeader title="Tickets" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("without icon → keeps the original heading size", () => {
    render(<PageHeader title="Tickets" />);
    expect(screen.getByRole("heading", { name: "Tickets" })).toHaveClass("text-2xl", "font-semibold");
  });
});
