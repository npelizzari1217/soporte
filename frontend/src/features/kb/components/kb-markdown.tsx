"use client";

/**
 * KbMarkdown — PRESENTATIONAL. Renderiza el contenido de un artículo de Ayuda
 * escrito en markdown (GFM: tablas, tachado, listas de tareas).
 *
 * ## POR QUÉ NO SE HABILITA HTML CRUDO (no lo "arregles" agregando rehype-raw)
 *
 * El contenido lo escribe cualquier usuario con `KB:ALTAS` y lo leen todos los
 * demás: es una superficie de XSS almacenado de manual. `react-markdown` NO
 * renderiza HTML embebido salvo que se le agregue `rehype-raw` (o similar), y
 * ese default es EXACTAMENTE lo que hace segura esta vista — un
 * `<script>alert(1)</script>` o un `<img src=x onerror=...>` pegados en el
 * textarea terminan escapados como texto visible, no como nodos del DOM.
 *
 * Si en el futuro alguien necesita una tabla, un `<details>` o un embed y la
 * tentación es sumar `rehype-raw`: NO. Eso reabre la inyección para TODO el
 * contenido, no solo para el caso que se quería resolver. Las tablas ya andan
 * vía `remark-gfm`; para cualquier otro caso, extendé el mapa `components` de
 * abajo con un nodo markdown, nunca habilitando HTML.
 *
 * Tampoco se usa `dangerouslySetInnerHTML` en ningún punto de este archivo.
 *
 * Estilos: el proyecto NO tiene `@tailwindcss/typography` instalado, así que la
 * tipografía se define acá con el prop `components` en vez de sumar una segunda
 * dependencia solo para las clases `prose`. Todos los colores salen de los
 * tokens del tema (`text-foreground`, `bg-muted`, `border-border`, …) para que
 * el artículo se lea igual de bien en claro y en oscuro.
 */
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface KbMarkdownProps {
  /** Contenido del artículo en markdown, tal cual lo guardó el autor. */
  contenido: string;
  className?: string;
}

/**
 * Un link es externo cuando apunta a otro origen por http(s). Solo esos abren
 * en pestaña nueva, y siempre con `rel="noopener noreferrer"`: sin `noopener`
 * la página destino recibe `window.opener` y puede navegar la nuestra a donde
 * quiera (tabnabbing).
 */
function esExterno(href: string | undefined): boolean {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

const componentes: Components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-8 mb-3 text-2xl font-semibold tracking-tight text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-8 mb-3 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-6 mb-2 text-lg font-semibold text-foreground first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-6 mb-2 text-base font-semibold text-foreground first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => <p className="my-3 leading-relaxed text-foreground">{children}</p>,
  a: ({ href, children }: ComponentPropsWithoutRef<"a">) =>
    esExterno(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4 hover:no-underline"
      >
        {children}
      </a>
    ) : (
      <a href={href} className="font-medium text-primary underline underline-offset-4 hover:no-underline">
        {children}
      </a>
    ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-3 list-disc space-y-1 pl-6 text-foreground marker:text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1 pl-6 text-foreground marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed [&>ul]:my-1 [&>ol]:my-1">{children}</li>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-4 border-l-4 border-border bg-muted/40 py-2 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  // `code` cubre tanto el inline como el de bloque; dentro de `pre` se le sacan
  // fondo y padding para que no se dupliquen con los del contenedor.
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-4 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-[0.85em] leading-relaxed text-foreground [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-8 border-border" />,
  // La tabla scrollea dentro de su propio contenedor: en pantallas angostas no
  // debe empujar el ancho de la página.
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-4 w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-muted">{children}</thead>,
  tr: ({ children }: { children?: ReactNode }) => <tr className="border-b border-border last:border-b-0">{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-3 py-2 font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => <td className="px-3 py-2 text-foreground">{children}</td>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  del: ({ children }: { children?: ReactNode }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),
  input: ({ checked, type }: ComponentPropsWithoutRef<"input">) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} readOnly className="mr-2 -ml-5 align-middle accent-primary" />
    ) : null,
};

/**
 * Renderiza `contenido` como markdown seguro (sin HTML crudo).
 *
 * @param contenido Markdown plano escrito por el autor del artículo.
 * @param className Clases extra para el contenedor.
 * @returns El artículo formateado, acotado a un ancho de lectura cómodo.
 */
export function KbMarkdown({ contenido, className }: KbMarkdownProps) {
  return (
    <div className={cn("max-w-[72ch] text-sm text-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {contenido}
      </ReactMarkdown>
    </div>
  );
}
