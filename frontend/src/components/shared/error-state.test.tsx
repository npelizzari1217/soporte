import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders with role='alert' so assistive tech announces it, and shows the message", () => {
    render(<ErrorState message="No se pudo cargar la lista de tickets." />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de tickets.");
  });

  it("with onRetry → renders a 'Reintentar' button that invokes the callback", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Error de red" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("without onRetry → does NOT render a retry button", () => {
    render(<ErrorState message="Error de red" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
