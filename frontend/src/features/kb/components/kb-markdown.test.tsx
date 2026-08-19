import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KbMarkdown } from "./kb-markdown";

function renderMarkdown(contenido: string): HTMLElement {
  const { container } = render(<KbMarkdown contenido={contenido} />);
  return container;
}

describe("KbMarkdown", () => {
  describe("seguridad — el HTML crudo del autor NUNCA llega al DOM", () => {
    it("no crea nodos ejecutables a partir de HTML embebido en el contenido", () => {
      const contenidoMalicioso = [
        "# Guía",
        "",
        '<script>alert(1)</script>',
        "",
        '<img src=x onerror="alert(1)">',
        "",
        "Fin.",
      ].join("\n");

      const container = renderMarkdown(contenidoMalicioso);

      // Ni el script ni la imagen existen como elementos: react-markdown, sin
      // `rehype-raw`, escapa el HTML del autor en vez de parsearlo.
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[onerror]")).toBeNull();
      // Ningún elemento quedó con un handler inline: lo único que sobrevive del
      // payload es texto escapado y visible (ver aserción siguiente).
      for (const el of container.querySelectorAll("*")) {
        expect(el.getAttributeNames().filter((nombre) => nombre.startsWith("on"))).toEqual([]);
      }
      expect(container.textContent).toContain("<script>alert(1)</script>");

      // El markdown legítimo del mismo artículo sigue funcionando.
      expect(screen.getByRole("heading", { name: "Guía" })).toBeInTheDocument();
    });

    it.each([
      ["script", "<script>alert(1)</script>"],
      ["img con onerror", '<img src=x onerror="alert(1)">'],
      ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
      ["handler inline en un div", '<div onclick="alert(1)">click</div>'],
    ])("neutraliza %s mostrándolo como texto, no como elemento", (_etiqueta, payload) => {
      const container = renderMarkdown(payload);

      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("[onerror]")).toBeNull();
      expect(container.querySelector("[onclick]")).toBeNull();
    });

    it("no genera un href con protocolo javascript:", () => {
      const container = renderMarkdown("[click acá](javascript:alert(1))");

      const link = container.querySelector("a");
      expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    });
  });

  describe("markdown renderizado de verdad", () => {
    it("convierte `##` en un heading real, no en texto con numerales", () => {
      renderMarkdown("## Cómo pedir acceso");

      const heading = screen.getByRole("heading", { name: "Cómo pedir acceso" });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).not.toContain("#");
    });

    it("convierte una lista en <li>, no en texto con guiones", () => {
      const container = renderMarkdown("- Primero\n- Segundo\n- Tercero");

      const items = container.querySelectorAll("li");
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toBe("Primero");
      expect(container.textContent).not.toContain("- Primero");
    });

    it("numera los pasos de una lista ordenada en un <ol>", () => {
      const container = renderMarkdown("1. Abrir el ticket\n2. Cargar el detalle");

      const lista = container.querySelector("ol");
      expect(lista).not.toBeNull();
      expect(lista?.querySelectorAll("li")).toHaveLength(2);
    });

    it("arma una tabla GFM con sus celdas", () => {
      renderMarkdown("| Campo | Valor |\n| --- | --- |\n| Estado | Abierto |");

      const tabla = screen.getByRole("table");
      expect(within(tabla).getByRole("columnheader", { name: "Campo" })).toBeInTheDocument();
      expect(within(tabla).getByRole("cell", { name: "Abierto" })).toBeInTheDocument();
    });

    it("renderiza código inline en un <code>", () => {
      const container = renderMarkdown("Ejecutá `pnpm test` antes de subir.");

      expect(container.querySelector("code")?.textContent).toBe("pnpm test");
    });
  });

  describe("links", () => {
    it("abre los externos en pestaña nueva con rel=noopener noreferrer", () => {
      renderMarkdown("[Documentación](https://ejemplo.com/docs)");

      const link = screen.getByRole("link", { name: "Documentación" });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("deja los internos navegando en la misma pestaña", () => {
      renderMarkdown("[Ver tickets](/tickets)");

      const link = screen.getByRole("link", { name: "Ver tickets" });
      expect(link).not.toHaveAttribute("target");
    });
  });
});
