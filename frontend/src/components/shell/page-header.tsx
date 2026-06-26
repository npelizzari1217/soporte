/**
 * PageHeader — shared dashboard page title with an optional actions slot.
 *
 * Usage:
 *   <PageHeader title="Tickets" actions={<Button>+ Nuevo</Button>} />
 *
 * Spec: [SPEC:frontend-design-system/radios rounded-md/-lg in shell]
 */
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
