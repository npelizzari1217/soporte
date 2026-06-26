/**
 * Equipo detail — /equipos/:id (stub)
 *
 * Spec: [SPEC:frontend-design-system/atomos in routing context]
 */

import { PageHeader } from "@/components/shell/page-header";

interface EquipoDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EquipoDetailPage({
  params,
}: EquipoDetailPageProps) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title={`Equipo #${id}`} />
      <p className="text-sm text-muted-foreground">
        Detalle del equipo — próximamente.
      </p>
    </div>
  );
}
