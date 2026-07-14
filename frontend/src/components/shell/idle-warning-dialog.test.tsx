/**
 * Tests for IdleWarningDialog (idle-session-timeout, Fase 3 — dialog presentacional)
 * Spec: [SPEC:frontend-auth/Aviso de cuenta regresiva antes del corte]
 *       [SPEC:frontend-auth/"Seguir conectado" reinicia la sesión sin re-login]
 * Task: T7
 * Design: ADR-6 (UI del modal, espejo de confirm-dialog.tsx — AlertDialog no-dismissable)
 */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { IdleWarningDialog } from "./idle-warning-dialog";

describe("IdleWarningDialog", () => {
  it("renders countdown text when open=true and secondsLeft=45", () => {
    render(
      <IdleWarningDialog open={true} secondsLeft={45} onStayConnected={vi.fn()} />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("does NOT render content in the DOM when open=false (Radix Portal)", () => {
    render(
      <IdleWarningDialog open={false} secondsLeft={45} onStayConnected={vi.fn()} />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it('clicking "Seguir conectado" invokes onStayConnected exactly once', async () => {
    const user = userEvent.setup();
    const onStayConnected = vi.fn();
    render(
      <IdleWarningDialog open={true} secondsLeft={30} onStayConnected={onStayConnected} />,
    );
    await user.click(screen.getByRole("button", { name: /Seguir conectado/i }));
    expect(onStayConnected).toHaveBeenCalledTimes(1);
  });

  it("ESC key does NOT close the dialog (stays in the DOM)", () => {
    render(
      <IdleWarningDialog open={true} secondsLeft={30} onStayConnected={vi.fn()} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it('countdown container has role="timer" and aria-live="polite"', () => {
    render(
      <IdleWarningDialog open={true} secondsLeft={20} onStayConnected={vi.fn()} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("aria-live", "polite");
    expect(timer).toHaveTextContent("20");
  });

  it("has no Cancelar/Cancel button (no-dismiss by design, ADR-6)", () => {
    render(
      <IdleWarningDialog open={true} secondsLeft={30} onStayConnected={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Cancelar|Cancel/i }),
    ).not.toBeInTheDocument();
  });
});
