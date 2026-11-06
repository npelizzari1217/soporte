/**
 * [UNIT] GenerarPdfCertificadoUseCase (odd/edilicia-obra-externa, S7): acceso, certificado del
 * ticket y vista armada con los datos resueltos.
 */
import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { CertificadoAvanceEntity } from '../../../tickets/domain/entities/certificado-avance.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { LogoClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { CertificadoPdfVista } from '../../domain/certificado-pdf-vista';
import { GenerarPdfCertificadoUseCase } from './generar-pdf-certificado.use-case';

const T0 = new Date('2026-11-02T16:00:00Z');
const TIPO = 'tipo-edilicia';

function ticket(): TicketEntity {
  const t = TicketEntity.create(
    {
      numero: 'EDI-2026-00007',
      titulo: 'Techo del gimnasio',
      descripcion: null,
      tipoId: TIPO,
      estadoId: 'e1',
      prioridadId: 'p1',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'u-sol',
    },
    'ticket-1',
  );
  t.actualizarDatos({ modalidad: 'EXTERNA' });
  return t;
}

function certificado(
  id: string,
  numero: number,
  tareaIds: [string, number][],
): CertificadoAvanceEntity {
  return CertificadoAvanceEntity.reconstitute(
    {
      ticketId: 'ticket-1',
      numero,
      porcentaje: tareaIds.reduce((s, [, p]) => s + p, 0),
      emitidoPorId: 'u-cert',
      emitidoEn: T0,
      anuladoEn: null,
      anuladoPorId: null,
      motivoAnulacion: null,
      tareas: tareaIds.map(([tareaId, peso]) => ({ tareaId, peso })),
    },
    id,
    T0,
    T0,
  );
}

function armar(acciones: AccionTipoTicket[] = ['LECTURA', 'IMPRESION']) {
  const anulado = certificado('c-anulado', 1, [['ta-vieja', 10]]);
  anulado.anular('u-admin', 'Se cargó mal', T0);
  const certificados = [
    anulado,
    certificado('c2', 2, [['ta-losa', 20]]),
    certificado('c3', 3, [['ta-membrana', 15]]),
  ];
  const certificadoRepo = { listarPorTicket: vi.fn(async (_ticketId: string) => certificados) };
  const losa = TareaTicketEntity.crear(
    { ticketId: 'ticket-1', descripcion: 'Losa', orden: 0 },
    'ta-losa',
  );
  const generador = {
    generarCertificado: vi.fn(async (_v: CertificadoPdfVista) => Buffer.from('%PDF-')),
  };
  const useCase = new GenerarPdfCertificadoUseCase(
    { execute: vi.fn(async () => Result.ok(ticket())) },
    certificadoRepo,
    { listarPorTicket: vi.fn(async () => [losa]) },
    {
      findById: vi.fn(async () =>
        TipoTicketEntity.create(
          { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
          TIPO,
        ),
      ),
    },
    {
      resolverNombres: vi.fn(
        async () =>
          new Map([
            ['u-cert', { nombre: 'Carla', apellido: 'Gómez' }],
            ['u-admin', { nombre: 'Ana', apellido: 'Paz' }],
          ]),
      ),
    },
    { execute: vi.fn().mockResolvedValue(Result.fail(new LogoClienteNoEncontradoError('cli-1'))) },
    generador,
    () => T0,
  );
  const dto = (certificadoId: string) => ({
    ticketId: 'ticket-1',
    certificadoId,
    actorId: 'u-1',
    permisosPorTipo: new Map<string, ReadonlySet<AccionTipoTicket>>([[TIPO, new Set(acciones)]]),
    clienteId: 'cli-1',
    clienteNombre: 'Colegio Norte',
  });
  return { useCase, generador, dto, certificadoRepo };
}

describe('GenerarPdfCertificadoUseCase', () => {
  it('arma la vista con el porcentaje, el emisor, el acumulado de los VIGENTES y el nombre de archivo', async () => {
    const { useCase, generador, dto } = armar();

    const result = await useCase.execute(dto('c2'));

    expect(result.getValue().nombreArchivo).toBe('certificado-EDI-2026-00007-2.pdf');
    const vista = generador.generarCertificado.mock.calls[0][0];
    expect(vista.numero).toBe(2);
    expect(vista.porcentaje).toBe(20);
    // 20 + 15 de los vigentes; el anulado (10) no cuenta.
    expect(vista.acumuladoVigente).toBe(35);
    expect(vista.emitidoPor).toBe('Carla Gómez');
    expect(vista.anulacion).toBeNull();
    expect(vista.tareas).toEqual([{ descripcion: 'Losa', peso: 20 }]);
    expect(vista.cliente).toEqual({ nombre: 'Colegio Norte', logo: null });
  });

  it('un certificado anulado sale con su anulación, y una tarea que ya no existe queda rotulada', async () => {
    const { useCase, generador, dto } = armar();

    await useCase.execute(dto('c-anulado'));

    const vista = generador.generarCertificado.mock.calls[0][0];
    expect(vista.anulacion).toEqual({
      por: 'Ana Paz',
      en: expect.any(String),
      motivo: 'Se cargó mal',
    });
    expect(vista.tareas).toEqual([{ descripcion: 'Tarea eliminada', peso: 10 }]);
  });

  it('sin IMPRESION sobre el tipo responde 403 y no genera', async () => {
    const { useCase, generador, dto } = armar(['LECTURA']);

    const result = await useCase.execute(dto('c2'));

    expect(result.getError().code).toBe('ACCION_SOBRE_TIPO_NO_PERMITIDA');
    expect(generador.generarCertificado).not.toHaveBeenCalled();
  });

  it('un certificado que no es de este ticket responde 404 y no genera', async () => {
    const { useCase, generador, dto, certificadoRepo } = armar();

    const result = await useCase.execute(dto('c-de-otro-ticket'));

    expect(result.getError().code).toBe('CERTIFICADO_NO_ENCONTRADO');
    // Busca solo entre los certificados del ticket pedido.
    expect(certificadoRepo.listarPorTicket).toHaveBeenCalledWith('ticket-1');
    expect(generador.generarCertificado).not.toHaveBeenCalled();
  });
});
