/**
 * [UNIT] `GenerarPdfCompraUseCase` — arma la vista de la "Solicitud de compra"
 * (odd/tasks/compra-export-secciones-y-pdf.md, S4-S6). El generador es un
 * doble que captura la vista: acá se prueba QUÉ se imprime, no cómo se dibuja.
 */
import { Result } from '../../../shared/domain/result';
import { LogoClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import { CompraPdfVista } from '../../domain/compra-pdf-vista';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { ResolverTiposDeCompra } from '../services/tipos-de-compra';
import { GenerarPdfCompraUseCase } from './generar-pdf-compra.use-case';

const AHORA = new Date('2026-11-17T13:30:00.000Z');

function crearItem(overrides: Partial<ItemCompraCreateProps> = {}): ItemCompraEntity {
  return ItemCompraEntity.create({
    compraId: 'c1',
    descripcion: 'Notebook',
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 1250000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15T00:00:00.000Z'),
    observaciones: null,
    ...overrides,
  });
}

function crearCompra(
  items: ItemCompraEntity[],
  overrides: Partial<CompraProps> = {},
  deletedAt: Date | null = null,
): CompraEntity {
  const props: CompraProps = {
    numero: 'COM-2026-00007',
    fechaSolicitud: new Date('2026-08-19T00:00:00.000Z'),
    motivo: 'Renovación del laboratorio',
    descripcion: 'Aula de informática',
    solicitanteId: 'solicitante-1',
    cicloId: 'ciclo-1',
    sectorId: null,
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    tipoTicketId: 'tipo-soporte',
    ...overrides,
  };
  return CompraEntity.reconstitute(props, items, 'c1', AHORA, AHORA, deletedAt);
}

function armar(compra: CompraEntity | null) {
  const vistas: CompraPdfVista[] = [];
  const casoDeUso = new GenerarPdfCompraUseCase(
    { findByIdConItems: vi.fn<ICompraRepository['findByIdConItems']>().mockResolvedValue(compra) },
    {
      resolver: vi
        .fn<ResolverTiposDeCompra['resolver']>()
        .mockResolvedValue(new Map([['tipo-soporte', { id: 'tipo-soporte', nombre: 'Soporte' }]])),
    },
    {
      resolverNombres: async () =>
        new Map([['solicitante-1', { nombre: 'Ana', apellido: 'Pérez' }]]),
    },
    { execute: async () => Result.fail(new LogoClienteNoEncontradoError('cliente-1')) },
    {
      generar: async (vista) => {
        vistas.push(vista);
        return Buffer.from('%PDF-falso');
      },
    },
    () => AHORA,
  );
  return { casoDeUso, vistas };
}

const DTO = { compraId: 'c1', clienteId: 'cliente-1', clienteNombre: 'Colegio San Martín' };

describe('GenerarPdfCompraUseCase', () => {
  it('arma la vista con los datos generales, el solicitante por nombre y el nombre del archivo', async () => {
    const { casoDeUso, vistas } = armar(crearCompra([crearItem()]));

    const result = await casoDeUso.execute(DTO);

    expect(result.getValue()).toEqual({
      buffer: Buffer.from('%PDF-falso'),
      nombreArchivo: 'solicitud-de-compra-COM-2026-00007.pdf',
    });
    expect(vistas[0]).toMatchObject({
      cliente: { nombre: 'Colegio San Martín', logo: null },
      numero: 'COM-2026-00007',
      fechaSolicitud: '19/08/2026',
      estado: 'Pendiente',
      motivo: 'Renovación del laboratorio',
      descripcion: 'Aula de informática',
      tipo: 'Soporte',
      solicitante: 'Ana Pérez',
    });
    expect(vistas[0].generadoEl).toMatch(/^17\/11\/2026 \d{2}:\d{2}$/);
  });

  it('formatea cada ítem con importes al estilo argentino y su estado de aprobación', async () => {
    const { casoDeUso, vistas } = armar(
      crearCompra([crearItem({ esServicio: true, observaciones: 'Con garantía' })]),
    );

    await casoDeUso.execute(DTO);

    expect(vistas[0].items).toEqual([
      {
        descripcion: 'Notebook',
        esServicio: true,
        cantidad: '2',
        proveedor: 'Proveedor SA',
        moneda: 'ARS',
        precioUnitario: '1.250.000,00',
        total: '2.500.000,00',
        aprobacion: 'Pendiente',
        fechaCotizacion: '15/01/2026',
        observaciones: 'Con garantía',
      },
    ]);
  });

  it('incluye todos los ítems no eliminados, también los rechazados, y excluye los eliminados', async () => {
    const rechazado = crearItem({ descripcion: 'Monitor' });
    rechazado.rechazar('aprobador-1');
    const eliminado = crearItem({ descripcion: 'Borrado' });
    eliminado.softDelete();

    const { casoDeUso, vistas } = armar(crearCompra([crearItem(), rechazado, eliminado]));
    await casoDeUso.execute(DTO);

    expect(vistas[0].items.map((i) => [i.descripcion, i.aprobacion])).toEqual([
      ['Notebook', 'Pendiente'],
      ['Monitor', 'Rechazado'],
    ]);
  });

  it('totaliza por moneda, en orden alfabético', async () => {
    const { casoDeUso, vistas } = armar(
      crearCompra([
        crearItem({ moneda: 'USD', monto: 100, cantidad: 3 }),
        crearItem({ moneda: 'ARS', monto: 0.1, cantidad: 3 }),
      ]),
    );

    await casoDeUso.execute(DTO);

    expect(vistas[0].totales).toEqual([
      { moneda: 'ARS', total: '0,30' },
      { moneda: 'USD', total: '300,00' },
    ]);
  });

  it('sin descripción, sin tipo y con solicitante desconocido: null, null y "Usuario"', async () => {
    const { casoDeUso, vistas } = armar(
      crearCompra([], { descripcion: '  ', tipoTicketId: null, solicitanteId: 'otro' }),
    );

    await casoDeUso.execute(DTO);

    expect(vistas[0]).toMatchObject({ descripcion: null, tipo: null, solicitante: 'Usuario' });
    expect(vistas[0].items).toEqual([]);
  });

  it('compra inexistente o eliminada → CompraNoEncontradaError, sin generar nada', async () => {
    for (const compra of [null, crearCompra([], {}, AHORA)]) {
      const { casoDeUso, vistas } = armar(compra);

      const result = await casoDeUso.execute(DTO);

      expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
      expect(vistas).toHaveLength(0);
    }
  });
});
