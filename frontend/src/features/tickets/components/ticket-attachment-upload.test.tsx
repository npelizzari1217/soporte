import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketAttachmentUpload } from "./ticket-attachment-upload";

function buildFile({ name = "foto.png", type = "image/png", size = 1024 }: Partial<{ name: string; type: string; size: number }> = {}) {
  const file = new File(["contenido"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/**
 * Regla no obvia: rechazar CLIENTE-SIDE antes de llamar `onUpload` (evita un
 * roundtrip de red que el backend va a rechazar de todos modos con 422 —
 * `validarAdjunto`, T21). Si esta validación se rompe, el usuario ve un 422
 * genérico en vez de feedback inmediato, y el mutation dispara innecesario.
 */
describe("TicketAttachmentUpload", () => {
  it("archivo > 10MB → rechaza SIN llamar onUpload, muestra el error inline", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<TicketAttachmentUpload onUpload={onUpload} isUploading={false} />);

    const input = screen.getByLabelText(/adjuntar archivo/i);
    await user.upload(input, buildFile({ size: 11 * 1024 * 1024 }));

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/10MB/);
  });

  it("mime no permitido (ej. ejecutable) → rechaza SIN llamar onUpload", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<TicketAttachmentUpload onUpload={onUpload} isUploading={false} />);

    const input = screen.getByLabelText(/adjuntar archivo/i);
    await user.upload(input, buildFile({ name: "virus.exe", type: "application/x-msdownload" }));

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/no permitido/i);
  });

  it("archivo válido (PDF, dentro del límite) → llama onUpload con el archivo, sin error", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<TicketAttachmentUpload onUpload={onUpload} isUploading={false} />);

    const input = screen.getByLabelText(/adjuntar archivo/i);
    const file = buildFile({ name: "informe.pdf", type: "application/pdf", size: 2048 });
    await user.upload(input, file);

    expect(onUpload).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
