import { PROVEEDORES_SSO, ProveedorSso } from './proveedores-sso';

/** Slug de URL (`google`, `microsoft`) de un proveedor SSO (sdd/login-sso, ADR-3). */
export type SlugSso = Lowercase<ProveedorSso>;

export function slugDeProveedor(proveedor: ProveedorSso): SlugSso {
  return proveedor.toLowerCase() as SlugSso;
}

/** Devuelve el proveedor del slug, o `null` si no esta en la lista cerrada. */
export function proveedorDeSlug(slug: string): ProveedorSso | null {
  return PROVEEDORES_SSO.find((proveedor) => slugDeProveedor(proveedor) === slug) ?? null;
}
