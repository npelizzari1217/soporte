import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  DesafioVigente,
  IDesafioLoginRepository,
  PropositoDesafio,
} from '../../domain/ports/desafio-login-repository.port';
import {
  DESAFIO_DURACION_MS,
  DESAFIO_ENROLAMIENTO_DURACION_MS,
  TICKET_DURACION_MS,
} from '../../domain/tfa/tfa.constants';

const hashear = (token: string): string => createHash('sha256').update(token).digest('hex');
const nuevoToken = (): string => randomBytes(32).toString('hex');

/** Adaptador Prisma de `IDesafioLoginRepository` sobre `auth_desafios` (master). */
@Injectable()
export class PrismaDesafioLoginRepository implements IDesafioLoginRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async crear(usuarioId: string, proposito: PropositoDesafio): Promise<string> {
    const token = nuevoToken();
    const ahora = this.reloj();
    const duracion =
      proposito === 'ENROLAR'
        ? DESAFIO_ENROLAMIENTO_DURACION_MS
        : proposito === 'SELECCIONAR'
          ? TICKET_DURACION_MS
          : DESAFIO_DURACION_MS;
    await this.client.authDesafio.create({
      data: {
        usuarioId,
        tokenHash: hashear(token),
        proposito,
        verificadoAt: proposito === 'SELECCIONAR' ? ahora : null,
        expiraAt: new Date(ahora.getTime() + duracion),
      },
    });
    return token;
  }

  async buscarSinVerificar(
    token: string,
    proposito: PropositoDesafio,
  ): Promise<DesafioVigente | null> {
    return this.client.authDesafio.findFirst({
      where: {
        tokenHash: hashear(token),
        proposito,
        verificadoAt: null,
        usadoAt: null,
        expiraAt: { gt: this.reloj() },
      },
      select: { usuarioId: true },
    });
  }

  async buscarTicket(ticket: string): Promise<DesafioVigente | null> {
    return this.client.authDesafio.findFirst({
      where: {
        tokenHash: hashear(ticket),
        verificadoAt: { not: null },
        usadoAt: null,
        expiraAt: { gt: this.reloj() },
      },
      select: { usuarioId: true },
    });
  }

  async verificar(
    token: string,
    proposito: PropositoDesafio,
    usuarioId: string,
  ): Promise<string | null> {
    const ahora = this.reloj();
    const ticket = nuevoToken();
    const { count } = await this.client.authDesafio.updateMany({
      where: {
        tokenHash: hashear(token),
        proposito,
        usuarioId,
        verificadoAt: null,
        usadoAt: null,
        expiraAt: { gt: ahora },
      },
      data: {
        tokenHash: hashear(ticket),
        verificadoAt: ahora,
        expiraAt: new Date(ahora.getTime() + TICKET_DURACION_MS),
      },
    });
    return count === 1 ? ticket : null;
  }

  async consumir(ticket: string, usuarioId: string): Promise<boolean> {
    const ahora = this.reloj();
    const { count } = await this.client.authDesafio.updateMany({
      where: {
        tokenHash: hashear(ticket),
        usuarioId,
        verificadoAt: { not: null },
        usadoAt: null,
        expiraAt: { gt: ahora },
      },
      data: { usadoAt: ahora },
    });
    return count === 1;
  }
}
