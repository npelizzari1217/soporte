import { Inject, Injectable } from '@nestjs/common';
import { SsoNoDisponibleError } from '../../domain/errors/sso.errors';
import { CONFIGURACION_SSO, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { IProveedorOidc, PROVEEDOR_OIDC } from '../../domain/ports/proveedor-oidc.port';
import {
  ISsoEstadoRepository,
  SSO_ESTADO_REPOSITORY,
} from '../../domain/ports/sso-estado-repository.port';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { calcularCodeChallenge, generarAleatorioUrl, generarCodeVerifier, sha256Hex } from './pkce';

/** Vigencia del estado de un flujo SSO (SL9). */
export const SSO_ESTADO_TTL_MS = 10 * 60 * 1000;

export interface IniciarSsoInput {
  proveedor: ProveedorSso;
  /** Destino posterior al login. El BFF ya lo paso por la lista permitida (SL10). */
  siguiente?: string | null;
}

export interface IniciarSsoOutput {
  authorizeUrl: string;
  /** Valor de la cookie `sso_st`; solo su hash queda en la base. */
  bindingToken: string;
}

/**
 * IniciarSsoUseCase — abre un flujo OIDC (sdd/login-sso, SL9, SL10, SC2). Genera `state`,
 * `nonce`, PKCE S256 y el `bindingToken` del navegador; persiste solo los hashes del `state` y
 * del `bindingToken`. La URL de autorizacion y el `redirect_uri` salen de la configuracion del
 * servidor, nunca de datos del navegador.
 */
@Injectable()
export class IniciarSsoUseCase {
  constructor(
    @Inject(CONFIGURACION_SSO) private readonly configuracion: IConfiguracionSso,
    @Inject(PROVEEDOR_OIDC) private readonly oidc: IProveedorOidc,
    @Inject(SSO_ESTADO_REPOSITORY) private readonly estados: ISsoEstadoRepository,
  ) {}

  async execute(input: IniciarSsoInput): Promise<IniciarSsoOutput> {
    if (this.configuracion.obtener(input.proveedor) === null) throw new SsoNoDisponibleError();

    const state = generarAleatorioUrl();
    const nonce = generarAleatorioUrl();
    const bindingToken = generarAleatorioUrl();
    const codeVerifier = generarCodeVerifier();

    const authorizeUrl = this.oidc.construirUrlAutorizacion(input.proveedor, {
      state,
      nonce,
      codeChallenge: calcularCodeChallenge(codeVerifier),
    });

    await this.estados.crear({
      stateHash: sha256Hex(state),
      proveedor: input.proveedor,
      nonce,
      codeVerifier,
      navegadorHash: sha256Hex(bindingToken),
      siguiente: input.siguiente ?? null,
      expiraAt: new Date(Date.now() + SSO_ESTADO_TTL_MS),
    });

    return { authorizeUrl, bindingToken };
  }
}
