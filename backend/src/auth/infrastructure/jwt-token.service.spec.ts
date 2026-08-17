/**
 * T2.4 TEST — Unit tests de JwtTokenService (RED → GREEN)
 *
 * Cubre (R6, R7 — HS256, exp 15min, payload nuevo con rol singular):
 * - signJwt(): produce un JWT firmable/verificable con el JwtService inyectado
 * - verifyJwt(): retorna el payload original en un round-trip válido
 * - verifyJwt(): retorna null (no throw) ante un token inválido/manipulado
 * - verifyJwt(): retorna null ante un token expirado
 * - el token firmado expira en 15 minutos
 */
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';
import { JwtPayload, VERSION_PAYLOAD_JWT } from '../domain/ports/i-token.service';
import { payloadDeTest } from '../test-helpers/payload-de-test';

const SECRET = 'test-secret-for-unit-tests';

const makePayload = (overrides: Partial<JwtPayload> = {}): JwtPayload =>
  payloadDeTest({
    sub: 'usuario-uuid',
    cliente_id: 'cliente-uuid',
    rol: 'TECNICO',
    permisos: ['ticket:crear', 'ticket:editar'],
    cliente_nombre: 'Acme SA',
    membresias: [{ cliente_id: 'cliente-uuid', nombre: 'Acme SA', rol: 'TECNICO' }],
    ...overrides,
  });

describe('JwtTokenService', () => {
  const makeService = (signOptions?: Record<string, unknown>) => {
    const jwtService = new JwtService({
      secret: SECRET,
      signOptions: { expiresIn: '15m', algorithm: 'HS256', ...signOptions },
    });
    return new JwtTokenService(jwtService);
  };

  describe('signJwt() + verifyJwt() round-trip', () => {
    it('verifica correctamente un token recién firmado', () => {
      const service = makeService();
      const payload = makePayload();

      const token = service.signJwt(payload);
      const verified = service.verifyJwt(token);

      expect(verified).not.toBeNull();
      expect(verified!.sub).toBe(payload.sub);
      expect(verified!.cliente_id).toBe(payload.cliente_id);
      expect(verified!.rol).toBe('TECNICO');
      expect(verified!.permisos).toEqual(['ticket:crear', 'ticket:editar']);
      expect(verified!.is_global_admin).toBe(false);
      expect(verified!.membresias).toHaveLength(1);
      expect(verified!.v).toBe(VERSION_PAYLOAD_JWT);
    });

    it('preserva cliente_id/rol null (token master de root)', () => {
      const service = makeService();
      const payload = makePayload({
        cliente_id: null,
        rol: null,
        permisos: [],
        is_global_admin: true,
        cliente_nombre: null,
        membresias: [],
      });

      const token = service.signJwt(payload);
      const verified = service.verifyJwt(token);

      expect(verified!.cliente_id).toBeNull();
      expect(verified!.rol).toBeNull();
      expect(verified!.is_global_admin).toBe(true);
    });

    it('produce un string JWT con 3 segmentos (header.payload.signature)', () => {
      const service = makeService();
      const token = service.signJwt(makePayload());
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyJwt() — casos inválidos', () => {
    it('retorna null (no throw) ante un token manipulado', () => {
      const service = makeService();
      const token = service.signJwt(makePayload());
      const tampered = token.slice(0, -2) + 'xx';

      expect(() => service.verifyJwt(tampered)).not.toThrow();
      expect(service.verifyJwt(tampered)).toBeNull();
    });

    it('retorna null ante un token vacío', () => {
      const service = makeService();
      expect(service.verifyJwt('')).toBeNull();
    });

    it('retorna null ante un token firmado con otro secret', () => {
      const service = makeService();
      const otherJwt = new JwtService({
        secret: 'a-completely-different-secret',
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      });
      const foreignService = new JwtTokenService(otherJwt);
      const token = foreignService.signJwt(makePayload());

      expect(service.verifyJwt(token)).toBeNull();
      // sanity: el emisor original sí verifica su propio token
      expect(foreignService.verifyJwt(token)).not.toBeNull();
    });

    it('retorna null ante un token ya expirado', () => {
      const jwtService = new JwtService({
        secret: SECRET,
        signOptions: { expiresIn: '-1s', algorithm: 'HS256' },
      });
      const service = new JwtTokenService(jwtService);
      const token = jwtService.sign(makePayload());

      expect(service.verifyJwt(token)).toBeNull();
    });
  });

  describe('expiración', () => {
    it('el token firmado expira 15 minutos después de emitido (exp - iat === 900s)', () => {
      const jwtService = new JwtService({
        secret: SECRET,
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      });
      const service = new JwtTokenService(jwtService);
      const token = service.signJwt(makePayload());
      const decoded = jwtService.decode<{ exp: number; iat: number }>(token);

      expect(decoded.exp - decoded.iat).toBe(15 * 60);
    });
  });
});
