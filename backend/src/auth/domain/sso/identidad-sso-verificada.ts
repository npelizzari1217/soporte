/**
 * Identidad que un proveedor OIDC afirmo y que los validadores ya verificaron
 * (sdd/login-sso, ADR-3). Es lo unico que sale del adaptador hacia el caso de uso.
 */
export interface IdentidadSsoVerificada {
  /** Google: `sub`. Microsoft: `<tid>:<oid>`. */
  subject: string;
  /** Email que el proveedor declaro verificado. */
  email: string;
}
