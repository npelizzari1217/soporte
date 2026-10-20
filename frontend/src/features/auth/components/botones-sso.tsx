/**
 * BotonesSso — PRESENTATIONAL component.
 *
 * Un enlace por proveedor habilitado, con navegación completa (no una llamada asíncrona): el
 * navegador sigue el 302 del BFF hacia el proveedor. Con lista vacía no renderiza nada.
 * Sin controles de vincular o desvincular: esa vía es solo del administrador (SC5).
 *
 * Spec: sdd/login-sso — SC4, SC5.
 */
import type * as React from "react";
import { Button } from "@/components/ui/button";
import type { SlugSso } from "../schemas";

const ETIQUETAS: Record<SlugSso, string> = {
  google: "Continuar con Google",
  microsoft: "Continuar con Microsoft",
};

/** Logos oficiales de cada proveedor, decorativos: el nombre ya va en el texto del enlace. */
const LOGOS: Record<SlugSso, React.ReactNode> = {
  google: (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  ),
  microsoft: (
    <svg aria-hidden viewBox="0 0 23 23" className="size-5">
      <path fill="#F35325" d="M1 1h10v10H1z" />
      <path fill="#81BC06" d="M12 1h10v10H12z" />
      <path fill="#05A6F0" d="M1 12h10v10H1z" />
      <path fill="#FFBA08" d="M12 12h10v10H12z" />
    </svg>
  ),
};

interface BotonesSsoProps {
  proveedores: readonly SlugSso[];
  /** Destino post-login pedido en la URL; el BFF lo sanea antes de usarlo. */
  siguiente: string | null;
}

export function BotonesSso({ proveedores, siguiente }: BotonesSsoProps) {
  if (proveedores.length === 0) return null;

  const query = siguiente ? `?siguiente=${encodeURIComponent(siguiente)}` : "";

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />O ingresar con
        <span className="h-px flex-1 bg-border" />
      </div>
      {proveedores.map((slug) => (
        <Button
          key={slug}
          asChild
          variant="secondary"
          className="h-11 w-full rounded-full border border-gray-500 hover:bg-gray-300 dark:border-gray-500 dark:hover:bg-gray-900"
        >
          <a href={`/api/auth/sso/${slug}/iniciar${query}`} className="gap-2">
            {LOGOS[slug]}
            {ETIQUETAS[slug]}
          </a>
        </Button>
      ))}
    </div>
  );
}
