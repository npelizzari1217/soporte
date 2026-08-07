import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdleWarningDialog } from "./idle-warning-dialog";

// Spec: PR11 — IdleWarningDialog: aviso de countdown, única acción "Seguir conectado".

describe("IdleWarningDialog", () => {
  it("open: false → dialog is not rendered", () => {
    render(<IdleWarningDialog open={false} secondsLeft={30} onStayConnected={vi.fn()} />);
    expect(screen.queryByText(/sesión está por expirar/i)).not.toBeInTheDocument();
  });

  it("open: true → shows the countdown seconds and the 'Seguir conectado' action", () => {
    render(<IdleWarningDialog open secondsLeft={42} onStayConnected={vi.fn()} />);
    expect(screen.getByText(/sesión está por expirar/i)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("42");
    expect(screen.getByRole("button", { name: /seguir conectado/i })).toBeInTheDocument();
  });

  it("clicking 'Seguir conectado' calls onStayConnected exactly once", async () => {
    const onStayConnected = vi.fn();
    const user = userEvent.setup();
    render(<IdleWarningDialog open secondsLeft={10} onStayConnected={onStayConnected} />);

    await user.click(screen.getByRole("button", { name: /seguir conectado/i }));

    expect(onStayConnected).toHaveBeenCalledTimes(1);
  });

  it("does NOT render a 'Cancelar' or dismiss action — decision is forced", () => {
    render(<IdleWarningDialog open secondsLeft={10} onStayConnected={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });
});
