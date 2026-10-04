/**
 * `/c/:slug/pedido/confirmar#token=<raw>` — Server Component fino. El token vive en el fragmento,
 * que el servidor nunca recibe: lo lee el container en el navegador. Next.js 15: `params` es una
 * Promise. Ruta PÚBLICA por el prefijo `/c/` de `RUTAS_PUBLICAS`.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico. Tarea: 19.2.
 */
import { ConfirmarPedidoView } from "@/features/pedido-publico/components/confirmar-pedido-view";

interface ConfirmarPedidoPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ConfirmarPedidoPage({ params }: ConfirmarPedidoPageProps) {
  const { slug } = await params;
  return <ConfirmarPedidoView slug={slug} />;
}
