/**
 * BotonesSso — PRESENTATIONAL component.
 *
 * Un enlace por proveedor habilitado, con navegación completa (no una llamada asíncrona): el
 * navegador sigue el 302 del BFF hacia el proveedor. Con lista vacía no renderiza nada.
 * Sin controles de vincular o desvincular: esa vía es solo del administrador (SC5).
 *
 * Spec: sdd/login-sso — SC4, SC5.
 */
import { Button } from "@/components/ui/button";
import type { SlugSso } from "../schemas";

const ETIQUETAS: Record<SlugSso, string> = {
  google: "Continuar con Google",
  microsoft: "Continuar con Microsoft",
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
    <div className="mt-4 flex flex-col gap-2">
      {proveedores.map((slug) => (
        <Button key={slug} asChild variant="outline" className="w-full">
          <a href={`/api/auth/sso/${slug}/iniciar${query}`}>{ETIQUETAS[slug]}</a>
        </Button>
      ))}
    </div>
  );
}
