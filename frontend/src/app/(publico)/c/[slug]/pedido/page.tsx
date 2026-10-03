/**
 * `/c/:slug/pedido` — Server Component fino (mismo criterio que `encuesta/[token]/page.tsx`).
 * Next.js 15: `params` y `searchParams` son Promises. `?e=` es el token crudo del QR del equipo.
 *
 * Ruta PÚBLICA: la deja pasar el prefijo `/c/` de `RUTAS_PUBLICAS` en `middleware.ts`.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico. Tarea: 16.3.
 */
import { PedidoPublicoView } from "@/features/pedido-publico/components/pedido-publico-view";

interface PedidoPublicoPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string | string[] }>;
}

export default async function PedidoPublicoPage({ params, searchParams }: PedidoPublicoPageProps) {
  const { slug } = await params;
  const { e } = await searchParams;
  const tokenQr = (Array.isArray(e) ? e[0] : e) || null;
  return <PedidoPublicoView slug={slug} tokenQr={tokenQr} />;
}
