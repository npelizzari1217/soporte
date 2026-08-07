import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";

describe("Dialog", () => {
  it("el contenido NO está montado hasta que se abre el trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Abrir</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Título del diálogo</DialogTitle>
          </DialogHeader>
          <p>Contenido</p>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText("Título del diálogo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByText("Título del diálogo")).toBeInTheDocument();
  });
});
