import { ConfigProveedorSso, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { slugDeProveedor } from '../../domain/sso/proveedor-slug';

type PartesFijas = Omit<ConfigProveedorSso, 'clientId' | 'clientSecret' | 'redirectUri'>;

const FIJAS: Record<ProveedorSso, PartesFijas> = {
  GOOGLE: {
    urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth',
    urlToken: 'https://oauth2.googleapis.com/token',
    urlJwks: 'https://www.googleapis.com/oauth2/v3/certs',
    emisores: ['https://accounts.google.com', 'accounts.google.com'],
  },
  MICROSOFT: {
    urlAutorizacion: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    urlToken: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    urlJwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    plantillaEmisor: 'https://login.microsoftonline.com/{tid}/v2.0',
  },
};

/**
 * Lee `SSO_<P>_CLIENT_ID` y `SSO_<P>_CLIENT_SECRET` en cada llamada (ADR-10). Ausente, vacio o
 * solo espacios es "sin configurar": nunca se degrada a string vacio. No forman parte de
 * `VARIABLES_REQUERIDAS`: la aplicacion arranca sin ellas.
 */
export class ConfiguracionSsoDesdeEntorno implements IConfiguracionSso {
  /**
   * @param appBaseUrl `entorno.APP_BASE_URL`, sin barra final. Nunca se arma desde `Host`.
   * @param env fuente de las variables; por defecto `process.env`, leida en cada llamada.
   */
  constructor(
    private readonly appBaseUrl: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  obtener(proveedor: ProveedorSso): ConfigProveedorSso | null {
    const clientId = this.leer(`SSO_${proveedor}_CLIENT_ID`);
    const clientSecret = this.leer(`SSO_${proveedor}_CLIENT_SECRET`);
    if (clientId === null || clientSecret === null) return null;
    return {
      ...FIJAS[proveedor],
      clientId,
      clientSecret,
      redirectUri: `${this.appBaseUrl}/api/auth/sso/${slugDeProveedor(proveedor)}/callback`,
    };
  }

  private leer(nombre: string): string | null {
    const v = this.env[nombre];
    if (v === undefined || v.trim() === '') return null;
    return v.trim();
  }
}
