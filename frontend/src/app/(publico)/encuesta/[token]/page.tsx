/**
 * `/encuesta/:token` — Server Component fino (mismo criterio que
 * `app/(dashboard)/kb/[id]/page.tsx`). Next.js 15: `params` es una Promise.
 *
 * Ruta PÚBLICA: alcanzable sin sesión gracias a la allowlist de
 * `middleware.ts` (ADR-C7) — el route group `(publico)` por sí solo NO
 * alcanza, es transparente a la URL.
 *
 * Ref spec: sdd/csat/spec. Ref design: ADR-C7. Tarea: 8.2.
 */
import { EncuestaView } from "@/features/csat/components/encuesta-view";

interface EncuestaPageProps {
  params: Promise<{ token: string }>;
}

export default async function EncuestaPage({ params }: EncuestaPageProps) {
  const { token } = await params;
  return <EncuestaView token={token} />;
}
