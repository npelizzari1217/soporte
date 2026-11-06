/**
 * [UNIT] Mapeo HTTP y validación de entrada de los certificados (odd/edilicia-obra-externa, T3b).
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DomainError } from '../../../shared/domain/result';
import {
  CertificacionTicketCerradoError,
  CertificadoNoEncontradoError,
  CertificadoSoloExternoError,
  CertificadoYaAnuladoError,
  PesosIncompletosParaCertificarError,
  TareaNoCertificableError,
} from '../../domain/errors/certificados.errors';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { AnularCertificadoBodyDto, EmitirCertificadoBodyDto } from '../dtos/certificado.dto';
import { toHttpExceptionCertificados } from './certificados.controller';

describe('toHttpExceptionCertificados', () => {
  it.each<[string, DomainError, new (...args: never[]) => Error]>([
    ['CERTIFICADO_NO_ENCONTRADO', new CertificadoNoEncontradoError('c'), NotFoundException],
    ['TICKET_NO_ENCONTRADO', new TicketNoEncontradoError('t'), NotFoundException],
    ['CERTIFICADO_YA_ANULADO', new CertificadoYaAnuladoError(1), ConflictException],
    [
      'ACCION_SOBRE_TIPO_NO_PERMITIDA',
      new AccionSobreTipoNoPermitidaError('CERTIFICAR'),
      ForbiddenException,
    ],
    ['CERTIFICADO_SOLO_EXTERNO', new CertificadoSoloExternoError(), UnprocessableEntityException],
    [
      'PESOS_INCOMPLETOS',
      new PesosIncompletosParaCertificarError(35),
      UnprocessableEntityException,
    ],
    [
      'TAREA_NO_CERTIFICABLE',
      new TareaNoCertificableError('x', 'no-completada'),
      UnprocessableEntityException,
    ],
    [
      'CERTIFICACION_TICKET_CERRADO',
      new CertificacionTicketCerradoError(),
      UnprocessableEntityException,
    ],
  ])('%s → %s', (_codigo, error, esperado) => {
    expect(toHttpExceptionCertificados(error)).toBeInstanceOf(esperado);
  });
});

const UUID_A = '01900000-0000-7000-8000-0000000000a1';
const UUID_B = '01900000-0000-7000-8000-0000000000b2';

describe('EmitirCertificadoBodyDto', () => {
  const valida = (tareaIds: unknown): boolean =>
    validateSync(plainToInstance(EmitirCertificadoBodyDto, { tareaIds })).length === 0;

  it('acepta una o más tareas distintas', () => {
    expect(valida([UUID_A])).toBe(true);
    expect(valida([UUID_A, UUID_B])).toBe(true);
  });

  it.each([
    ['vacía', []],
    ['repetida', [UUID_A, UUID_A]],
    ['con un id que no es UUID', ['no-es-uuid']],
    ['ausente', undefined],
  ])('rechaza una lista %s', (_caso, tareaIds) => {
    expect(valida(tareaIds)).toBe(false);
  });
});

describe('AnularCertificadoBodyDto', () => {
  const valida = (motivo: unknown): boolean =>
    validateSync(plainToInstance(AnularCertificadoBodyDto, { motivo })).length === 0;

  it('acepta un motivo visible de hasta 2000', () => {
    expect(valida('Se certificó de más')).toBe(true);
    expect(valida('a'.repeat(2000))).toBe(true);
  });

  it.each([
    ['en blanco', '   '],
    ['de 2001', 'a'.repeat(2001)],
    ['ausente', undefined],
  ])('rechaza un motivo %s', (_caso, motivo) => {
    expect(valida(motivo)).toBe(false);
  });
});
