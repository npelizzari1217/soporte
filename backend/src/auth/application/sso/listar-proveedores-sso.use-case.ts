import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION_SSO, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { slugDeProveedor, SlugSso } from '../../domain/sso/proveedor-slug';
import { PROVEEDORES_SSO } from '../../domain/sso/proveedores-sso';

/**
 * ListarProveedoresSsoUseCase — proveedores habilitados para el login (sdd/login-sso, SC2, SC3).
 * Devuelve solo slugs: nunca client ids, secrets ni URLs, ni rastro de los deshabilitados.
 */
@Injectable()
export class ListarProveedoresSsoUseCase {
  constructor(@Inject(CONFIGURACION_SSO) private readonly configuracion: IConfiguracionSso) {}

  execute(): SlugSso[] {
    return PROVEEDORES_SSO.filter((p) => this.configuracion.obtener(p) !== null).map(
      slugDeProveedor,
    );
  }
}
