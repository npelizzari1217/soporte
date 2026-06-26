/**
 * Reparación detail — /reparaciones/:id (stub)
 *
 * Spec: [SPEC:frontend-design-system/atomos in routing context]
 */

import { PageHeader } from "@/components/shell/page-header";

interface ReparacionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReparacionDetailPage({
  params,
}: ReparacionDetailPageProps) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title={`Reparación #${id}`} />
      <p className="text-sm text-muted-foreground">
        Detalle de la reparación — próximamente.
      </p>
    </div>
  );
}
