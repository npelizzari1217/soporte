import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and description passed in", () => {
    render(<EmptyState icon={Inbox} title="Sin tickets" description="Todavía no creaste ningún ticket." />);
    expect(screen.getByText("Sin tickets")).toBeInTheDocument();
    expect(screen.getByText("Todavía no creaste ningún ticket.")).toBeInTheDocument();
  });

  it("with actionLabel + onAction → renders a button that invokes the callback on click", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <EmptyState icon={Inbox} title="Sin tickets" description="—" actionLabel="Crear ticket" onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: "Crear ticket" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("without actionLabel → does NOT render any button", () => {
    render(<EmptyState icon={Inbox} title="Sin tickets" description="—" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
