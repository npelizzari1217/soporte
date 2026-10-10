import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ACCIONES_KEY } from '../../auth/infrastructure/guards/decorators';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { Result } from '../../shared/domain/result';
import { ListarEstadosUseCase } from '../../tickets/application/use-cases/listar-estados.use-case';
import { ListarPrioridadesUseCase } from '../../tickets/application/use-cases/listar-prioridades.use-case';
import { ListarTiposTicketUseCase } from '../../tickets/application/use-cases/listar-tipos-ticket.use-case';
import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { PrioridadEntity } from '../../tickets/domain/entities/prioridad.entity';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { ModuloTipoTicketInvalidoError } from '../../tickets/domain/errors/tickets.errors';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';
import { CatalogosV1Controller } from './catalogos-v1.controller';

async function armar(tiposFallan = false) {
  const tipos = vi
    .fn()
    .mockResolvedValue(
      tiposFallan
        ? Result.fail(new ModuloTipoTicketInvalidoError('X'))
        : Result.ok([
            TipoTicketEntity.create(
              { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
              'tipo-1',
            ),
          ]),
    );
  const prioridades = vi
    .fn()
    .mockResolvedValue(
      Result.ok([
        PrioridadEntity.create(
          { codigo: 'MEDIA', nombre: 'Media', color: null, orden: 20, activo: true },
          'prio-2',
        ),
      ]),
    );
  const estados = vi
    .fn()
    .mockResolvedValue(
      Result.ok([
        EstadoEntity.create(
          { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 10, activo: true },
          'estado-1',
        ),
      ]),
    );
  const modulo = await Test.createTestingModule({
    controllers: [CatalogosV1Controller],
    providers: [
      { provide: ListarTiposTicketUseCase, useValue: { execute: tipos } },
      { provide: ListarPrioridadesUseCase, useValue: { execute: prioridades } },
      { provide: ListarEstadosUseCase, useValue: { execute: estados } },
    ],
  })
    .overrideGuard(ApiClaveGuard)
    .useValue({})
    .overrideGuard(ApiV1ThrottlerGuard)
    .useValue({})
    .overrideGuard(AccionesGuard)
    .useValue({})
    .compile();
  return { controller: modulo.get(CatalogosV1Controller), tipos };
}

describe('CatalogosV1Controller', () => {
  it('lista solo los tipos del modulo TICKETS y arma el contrato v1', async () => {
    const { controller, tipos } = await armar();

    const res = await controller.listar();

    expect(tipos).toHaveBeenCalledWith({ modulo: 'TICKETS' });
    expect(res).toStrictEqual({
      tipos: [{ id: 'tipo-1', codigo: 'SOPORTE', nombre: 'Soporte' }],
      prioridades: [{ id: 'prio-2', codigo: 'MEDIA', nombre: 'Media', orden: 20 }],
      estados: [{ id: 'estado-1', codigo: 'NUEVO', nombre: 'Nuevo', orden: 10 }],
    });
  });

  it('un fallo de un caso de uso se traduce a una excepcion HTTP', async () => {
    const { controller } = await armar(true);

    await expect(controller.listar()).rejects.toBeInstanceOf(HttpException);
  });

  it('exige TICKETS:LECTURA', () => {
    const acciones = new Reflector().get<string[]>(
      ACCIONES_KEY,
      CatalogosV1Controller.prototype.listar,
    );

    expect(acciones).toEqual(['TICKETS:LECTURA']);
  });
});
