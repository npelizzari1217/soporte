/**
 * `/pedido-qr` — Server Component fino. Landing autenticada del camino D3: `?c=` es el slug del
 * cliente y `?e=` el token crudo del QR del equipo. Next.js 15: `searchParams` es una Promise.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico (D3). Tarea: 18.4.
 */
import { PedidoQrLanding } from "@/features/equipos/components/pedido-qr-landing";

interface PedidoQrPageProps {
  searchParams: Promise<{ c?: string | string[]; e?: string | string[] }>;
}

function primero(valor: string | string[] | undefined): string | null {
  return (Array.isArray(valor) ? valor[0] : valor) || null;
}

export default async function PedidoQrPage({ searchParams }: PedidoQrPageProps) {
  const { c, e } = await searchParams;
  return <PedidoQrLanding slug={primero(c)} tokenQr={primero(e)} />;
}
