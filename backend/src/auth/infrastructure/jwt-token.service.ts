/**
 * JwtTokenService — implementación de ITokenService con @nestjs/jwt.
 *
 * Delega completamente al JwtService de NestJS (que usa jsonwebtoken internamente).
 * La clave secreta y el tiempo de expiración se configuran en JwtModule.register()
 * en AuthModule.
 *
 * verifyJwt() retorna null en lugar de lanzar excepción para que los guards
 * puedan distinguir "token inválido" de "no hay token" sin try/catch en el guard.
 *
 * Tarea: 2.C.2
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
