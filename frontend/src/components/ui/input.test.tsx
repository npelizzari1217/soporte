import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("forwards placeholder prop to the native input", () => {
    render(<Input placeholder="tu@email.com" />);
    expect(screen.getByPlaceholderText("tu@email.com")).toBeInTheDocument();
  });

  it("disabled prop → the native input is disabled and rejects typing", () => {
    render(<Input data-testid="inp" disabled />);
    expect(screen.getByTestId("inp")).toBeDisabled();
  });

  it("error=true → sets aria-invalid so assistive tech announces the validation error", () => {
    render(<Input data-testid="inp" error />);
    expect(screen.getByTestId("inp")).toHaveAttribute("aria-invalid", "true");
  });

  it("error absent → aria-invalid is not set to true", () => {
    render(<Input data-testid="inp" />);
    expect(screen.getByTestId("inp")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("forwards ref to the underlying <input> DOM node", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
