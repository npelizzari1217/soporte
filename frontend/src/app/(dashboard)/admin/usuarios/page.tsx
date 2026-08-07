/**
 * `/admin/usuarios` — Server Component fino (ADR-1). Gate `usuario:gestionar`
 * (+ `rol:asignar` para mutar) vive dentro de `UsuariosAdminView` (`<Can>`).
 */
import { UsuariosAdminView } from "@/features/usuarios/components/usuarios-admin-view";

export default function AdminUsuariosPage() {
  return <UsuariosAdminView />;
}
