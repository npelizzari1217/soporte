/**
 * JwtTokenService — implementación de ITokenService con @nestjs/jwt.
 *
 * Delega completamente al JwtService de NestJS (jsonwebtoken internamente).
 * La clave secreta y el tiempo de expiración (15min, R7) se configuran en
 * JwtModule.register() en AuthModule (PR6) — HS256 (R7).
 *
 * verifyJwt() retorna null en lugar de lanzar excepción para que los guards
 * puedan distinguir "token inválido" de "no hay token" sin try/catch en el guard.
 *
 * Tarea: T2.4 (PR2 — Auth domain + ports + hashing + token service)
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ITokenService, JwtPayload } from '../domain/ports/i-token.service';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(private readonly jwtService: JwtService) {}

  signJwt(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  verifyJwt(token: string): JwtPayload | null {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
