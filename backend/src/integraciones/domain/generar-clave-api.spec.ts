import { generarClaveApi, hashearClaveApi, PREFIJO_CLAVE_API } from './generar-clave-api';

describe('generarClaveApi', () => {
  it('lleva el prefijo reconocible y 32 bytes en base64url', () => {
    const { clave } = generarClaveApi();
    expect(clave.startsWith(PREFIJO_CLAVE_API)).toBe(true);
    expect(clave.slice(PREFIJO_CLAVE_API.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('el prefijo visible es el comienzo de la clave y no la revela', () => {
    const { clave, prefijo } = generarClaveApi();
    expect(clave.startsWith(prefijo)).toBe(true);
    expect(prefijo).toHaveLength(12);
  });

  it('el hash es el sha256 hexadecimal de la clave completa', () => {
    const { clave, hash } = generarClaveApi();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashearClaveApi(clave)).toBe(hash);
  });

  it('dos claves generadas nunca coinciden', () => {
    const claves = new Set(Array.from({ length: 50 }, () => generarClaveApi().clave));
    expect(claves.size).toBe(50);
  });
});
