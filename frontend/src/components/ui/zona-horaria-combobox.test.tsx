import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonaHorariaCombobox } from "./zona-horaria-combobox";

/**
 * ZonaHorariaCombobox — combobox con búsqueda para elegir zona horaria.
 *
 * La validez real del valor la sigue decidiendo `esZonaValida` en el schema
 * de Zod que envuelve este campo (`esZonaValida`, `shared/lib/formato-fecha.ts`), nunca
 * este componente: acá solo se prueba que `onChange` jamás se dispare con
 * texto libre que no corresponda a una opción del catálogo mostrado.
 */
const CATALOGO_TEST = ["America/Argentina/Buenos_Aires", "Europe/Madrid", "UTC"];

function renderCombobox(props: Partial<React.ComponentProps<typeof ZonaHorariaCombobox>> = {}) {
  const onChange = vi.fn();
  render(
    <div>
      <label htmlFor="zona-test">Zona horaria</label>
      <ZonaHorariaCombobox id="zona-test" value="" onChange={onChange} catalogo={CATALOGO_TEST} {...props} />
    </div>,
  );
  return { onChange };
}

describe("ZonaHorariaCombobox", () => {
  it("filtra las opciones por el texto tipeado", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.type(screen.getByLabelText(/zona horaria/i), "Madrid");

    expect(await screen.findByRole("option", { name: "Europe/Madrid" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "UTC" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "America/Argentina/Buenos_Aires" })).not.toBeInTheDocument();
  });

  it("no dispara onChange con un valor que no está en el catálogo", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.type(screen.getByLabelText(/zona horaria/i), "Europe/Madriz");
    expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("admite un valorVigente que se muestra aunque no esté en el catálogo base", async () => {
    const user = userEvent.setup();
    renderCombobox({ catalogo: ["UTC"], valorVigente: "America/Argentina/ComodRivadavia" });

    await user.click(screen.getByLabelText(/zona horaria/i));

    expect(await screen.findByRole("option", { name: "America/Argentina/ComodRivadavia" })).toBeInTheDocument();
  });

  it("selecciona una opción con click y la reporta por onChange", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.type(screen.getByLabelText(/zona horaria/i), "Madrid");
    await user.click(await screen.findByRole("option", { name: "Europe/Madrid" }));

    expect(onChange).toHaveBeenCalledWith("Europe/Madrid");
  });

  it("permite elegir con teclado: flecha abajo + Enter selecciona la opción resaltada", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByLabelText(/zona horaria/i));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(CATALOGO_TEST[0]);
  });

  it("Escape cierra la lista sin comitear el texto tipeado", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.type(screen.getByLabelText(/zona horaria/i), "Europe/Madriz");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowUp con la lista cerrada la reabre, igual que ArrowDown", async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByLabelText(/zona horaria/i);
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.keyboard("{ArrowUp}");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("clickear el campo ya enfocado reabre la lista, incluso después de elegir una opción", async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByLabelText(/zona horaria/i);
    await user.type(input, "Madrid");
    await user.click(await screen.findByRole("option", { name: "Europe/Madrid" }));
    // El click sobre la opción nunca le saca el foco al input (el mousedown
    // del popover está prevenido), así que "onFocus" no vuelve a disparar:
    // sin un `onClick` propio en el input, un segundo click no haría nada.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(input);

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("aria-controls solo apunta al listbox mientras está abierto", async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByLabelText(/zona horaria/i);
    expect(input).not.toHaveAttribute("aria-controls");

    await user.click(input);
    expect(input).toHaveAttribute("aria-controls");
  });

  /**
   * Estos dos tests usan el catálogo REAL (`obtenerCatalogoZonasHorarias()`,
   * sin la prop `catalogo` de test) a propósito: `CATALOGO_TEST` tiene 3
   * opciones sin guion bajo, así que nunca podía reproducir ni el desajuste
   * espacio/guion bajo ni el tope de 50 resultados — el mismo hueco que dejó
   * pasar ambos hallazgos reales de GGA en la primera ronda de este commit.
   */
  it("encuentra la zona por defecto del producto tipeando con espacio, como escribe una persona", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <label htmlFor="zona-real">Zona horaria</label>
        <ZonaHorariaCombobox id="zona-real" value="" onChange={onChange} />
      </div>,
    );

    await user.type(screen.getByLabelText(/zona horaria/i), "buenos aires");

    expect(await screen.findByRole("option", { name: "America/Argentina/Buenos_Aires" })).toBeInTheDocument();
  });

  it("avisa cuando el tope de resultados visibles oculta coincidencias", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <label htmlFor="zona-real-2">Zona horaria</label>
        <ZonaHorariaCombobox id="zona-real-2" value="" onChange={onChange} />
      </div>,
    );

    await user.type(screen.getByLabelText(/zona horaria/i), "america");

    expect(await screen.findByText(/mostrando 50 de/i)).toBeInTheDocument();
  });
});
