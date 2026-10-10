import type { Mocked } from 'vitest';
import { ListarProveedoresSsoUseCase } from './listar-proveedores-sso.use-case';
import { ConfigProveedorSso, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';

const config: ConfigProveedorSso = {
  clientId: 'id',
  clientSecret: 'secreto',
  urlAutorizacion: 'https://idp.test/auth',
  urlToken: 'https://idp.test/token',
  urlJwks: 'https://idp.test/jwks',
  redirectUri: 'https://soporte.test/api/auth/sso/x/callback',
};

function configurados(habilitados: ProveedorSso[]): Mocked<IConfiguracionSso> {
  return {
    obtener: vi.fn((p: ProveedorSso) => (habilitados.includes(p) ? config : null)),
  };
}

describe('ListarProveedoresSsoUseCase', () => {
  it('devuelve los slugs en minuscula de los proveedores configurados', () => {
    const uc = new ListarProveedoresSsoUseCase(configurados(['GOOGLE', 'MICROSOFT']));
    expect(uc.execute()).toEqual(['google', 'microsoft']);
  });

  it('omite el proveedor sin configuracion valida', () => {
    const uc = new ListarProveedoresSsoUseCase(configurados(['MICROSOFT']));
    expect(uc.execute()).toEqual(['microsoft']);
  });

  it('con ninguno configurado devuelve una lista vacia', () => {
    const uc = new ListarProveedoresSsoUseCase(configurados([]));
    expect(uc.execute()).toEqual([]);
  });
});
