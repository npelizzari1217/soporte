/**
 * Compra detail — /compras/:id (stub)
 *
 * Spec: [SPEC:frontend-design-system/atomos in routing context]
 */

import { PageHeader } from "@/components/shell/page-header";

interface CompraDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CompraDetailPage({
  params,
}: CompraDetailPageProps) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title={`Compra #${id}`} />
      <p className="text-sm text-muted-foreground">
        Detalle de la compra — próximamente.
      </p>
    </div>
  );
}
