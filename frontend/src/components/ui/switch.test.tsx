import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renderiza role=switch con aria-checked=false por defecto", () => {
    render(<Switch aria-label="Root" checked={false} onCheckedChange={() => {}} />);
    const el = screen.getByRole("switch", { name: "Root" });
    expect(el).toHaveAttribute("aria-checked", "false");
  });

  it("checked=true → aria-checked=true", () => {
    render(<Switch aria-label="Root" checked={true} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Root" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("click → llama onCheckedChange con el valor invertido", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Root" checked={false} onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch", { name: "Root" }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("disabled=true → no dispara onCheckedChange al clickear", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Root"
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Root" }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("id se propaga al elemento para asociarlo a un <label htmlFor>", () => {
    render(
      <Switch id="root-switch" aria-label="Root" checked={false} onCheckedChange={() => {}} />,
    );
    expect(screen.getByRole("switch", { name: "Root" })).toHaveAttribute(
      "id",
      "root-switch",
    );
  });
});
