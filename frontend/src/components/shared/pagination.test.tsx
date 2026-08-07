import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("página 2 de 5 (page=2, pageSize=10, total=50) → muestra 'Página 2 de 5'", () => {
    render(<Pagination page={2} pageSize={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText(/página 2 de 5/i)).toBeInTheDocument();
  });

  it("primera página → el botón 'Anterior' está deshabilitado", () => {
    render(<Pagination page={1} pageSize={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
  });

  it("última página → el botón 'Siguiente' está deshabilitado", () => {
    render(<Pagination page={5} pageSize={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
  });

  it("click en 'Siguiente' en una página intermedia → llama onPageChange(page + 1)", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={10} total={50} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("click en 'Anterior' en una página intermedia → llama onPageChange(page - 1)", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageSize={10} total={50} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: /anterior/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
