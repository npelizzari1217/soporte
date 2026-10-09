import { proveedorDeSlug, slugDeProveedor } from './proveedor-slug';

describe('proveedor-slug', () => {
  it('convierte proveedor a slug y de vuelta', () => {
    expect(slugDeProveedor('GOOGLE')).toBe('google');
    expect(slugDeProveedor('MICROSOFT')).toBe('microsoft');
    expect(proveedorDeSlug('google')).toBe('GOOGLE');
    expect(proveedorDeSlug('microsoft')).toBe('MICROSOFT');
  });

  it.each(['', 'GOOGLE', 'github', 'google '])('rechaza el slug %j', (slug) => {
    expect(proveedorDeSlug(slug)).toBeNull();
  });
});
