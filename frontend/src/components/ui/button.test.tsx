import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  describe("isLoading={false} (default)", () => {
    it("renders children", () => {
      render(<Button>Guardar</Button>);
      expect(screen.getByText("Guardar")).toBeInTheDocument();
    });

    it("does not render spinner", () => {
      render(<Button>Guardar</Button>);
      expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it("is not disabled by default", () => {
      render(<Button>Guardar</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    it("has rounded-md class in default state", () => {
      render(<Button>Guardar</Button>);
      expect(screen.getByRole("button")).toHaveClass("rounded-md");
    });
  });

  describe("isLoading={true}", () => {
    it("is disabled", () => {
      render(<Button isLoading>Guardar</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("renders the spinner element", () => {
      render(<Button isLoading>Guardar</Button>);
      expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    });

    it("children remain in DOM", () => {
      render(<Button isLoading>Guardar</Button>);
      expect(screen.getByText("Guardar")).toBeInTheDocument();
    });

    it("has rounded-md class in loading state", () => {
      render(<Button isLoading>Guardar</Button>);
      expect(screen.getByRole("button")).toHaveClass("rounded-md");
    });
  });

  describe("isLoading wins over explicit disabled={false}", () => {
    it("is disabled even when disabled={false} is passed", () => {
      render(
        <Button isLoading disabled={false}>
          Guardar
        </Button>
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("rounded-md is always present", () => {
    it("has rounded-md when explicitly disabled", () => {
      render(<Button disabled>Guardar</Button>);
      expect(screen.getByRole("button")).toHaveClass("rounded-md");
    });
  });
});
