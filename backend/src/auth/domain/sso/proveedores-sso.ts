/** Proveedores de identidad soportados por el login SSO (ADR-3). */
export const PROVEEDORES_SSO = ['GOOGLE', 'MICROSOFT'] as const;

export type ProveedorSso = (typeof PROVEEDORES_SSO)[number];
