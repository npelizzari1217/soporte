/**
 * PR-14 [UNIT] — RED→GREEN: `CrearCompraUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S1: alta con ciclo activo (numerador, `solicitanteId = JWT.sub`, `n=0`
 *   -> PENDIENTE, `OperacionCompra{CREACION}` exactamente 1 vez, dentro de la tx).
 * - S2: sin ciclo activo -> `SinCicloActivoError`, y el numerador NO se
 *   consume (verificado por spy, no solo por inferencia).
 * - S35: exactamente 1 `OperacionCompra` por creación exitosa, con el `tipo`
 *   correcto (`CREACION`).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1 (S1, S2), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4, ADR-C5. Tarea: PR-14.
 */
import { CrearCompraUseCase, CrearCompraDto } from './crear-compra.use-case';
import { Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import {
  SinCicloActivoError,
  NumeradorCompraAgotadoError,
} from '../../domain/errors/compras.errors';

function baseDto(overrides: Partial<CrearCompraDto> = {}): CrearCompraDto {
  return {
    motivo: 'Compra de insumos de oficina',
    descripcion: 'Resmas de papel y tóner',
    fechaSolicitud: new Date('2026-08-13'),
    solicitanteId: 'solicitante-uuid',
    anio: 2026,
    ...overrides,
  };
}

describe('CrearCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = { guardar: vi.fn().mockResolvedValue(undefined) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('COM-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CrearCompraUseCase(
      compraRepo as never,
      numerador as never,
      resolverCicloActivo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, numerador, resolverCicloActivo, registrarOperacion, txRunner };
  }

  it('S1: crea la compra con el numerador, solicitanteId=JWT.sub y cicloId del ciclo activo, dentro de la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const compra = result.getValue();
    expect(compra).toBeInstanceOf(CompraEntity);
    expect(compra.numero).toBe('COM-2026-00001');
    expect(compra.solicitanteId).toBe('solicitante-uuid');
    expect(compra.cicloId).toBe('ciclo-activo-uuid');
    expect(compra.motivo).toBe('Compra de insumos de oficina');
    expect(compra.items).toHaveLength(0);
    expect(compra.estado).toBe('PENDIENTE');

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo CREACION en la creación exitosa', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());
    const compra = result.getValue();

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('CREACION');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBeNull();
    expect(operacion.usuarioId).toBe('solicitante-uuid');
  });

  it('S2: sin ciclo activo -> SinCicloActivoError, SIN emitir numerador ni abrir la tx', async () => {
    const c = makeCollaborators();
    c.resolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
    // El numerador NO se consume si la creación va a fallar (spec S2).
    expect(c.numerador.generarNumero).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('numerador agotado (falla DENTRO de la tx) -> propaga el error sin persistir ni registrar bitácora', async () => {
    const c = makeCollaborators();
    c.numerador.generarNumero.mockResolvedValue(Result.fail(new NumeradorCompraAgotadoError(2026)));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeradorCompraAgotadoError);
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });
});
