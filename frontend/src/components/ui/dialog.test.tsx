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

  // Un diálogo con un formulario largo se desbordaba por arriba Y por abajo:
  // centrado con `translate-y-[-50%]`, el excedente superior quedaba
  // inalcanzable. El default acota el alto y da scroll para TODOS los
  // diálogos, no sólo para los que se acuerden de pedirlo.
  it("acota el alto y ofrece scroll por defecto", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Abrir</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Formulario largo</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveClass("max-h-[85vh]");
    expect(dialogo).toHaveClass("overflow-y-auto");
  });

  // `cn` usa tailwind-merge: el consumidor que necesita otro comportamiento
  // (scroll interno propio, por ejemplo) tiene que poder pisar el default.
  it("el consumidor puede pisar el scroll del default", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Abrir</button>
        </DialogTrigger>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Scroll interno</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveClass("overflow-hidden");
    expect(dialogo).not.toHaveClass("overflow-y-auto");
  });
});
