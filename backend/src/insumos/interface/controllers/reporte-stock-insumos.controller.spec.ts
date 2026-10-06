/**
 * ReporteStockInsumosController — unit test (sin Nest ni guards reales, mismo
 * patron que `equipos.controller.spec.ts`): traduccion HTTP ↔ casos de uso,
 * error de tope → 422 y metadata de permisos. Los guards en accion los cubre
 * el e2e.
 */
import 'reflect-metadata';
import { StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { Result } from '../../../shared/domain/result';
import { ExportacionStockDemasiadoGrandeError } from '../../domain/errors/insumos.errors';
import { unstubbed } from '../../../testing/mocks';
import {
  ConsultarReporteStockUseCase,
  ReporteStock,
} from '../../application/use-cases/consultar-reporte-stock.use-case';
import { ExportarReporteStockUseCase } from '../../application/use-cases/exportar-reporte-stock.use-case';
import { ReporteStockQueryDto } from '../dtos/reporte-stock.dto';
import { ReporteStockInsumosController } from './reporte-stock-insumos.controller';

const REPORTE: ReporteStock = {
  generadoEn: new Date('2026-10-02T01:30:00.000Z'),
  filas: [
    {
      insumoId: 'i-1',
      codigo: 'INS-1',
      nombre: 'Toner',
      activo: true,
      seguimiento: 'NINGUNO',
      familia: { id: 'f-1', nombre: 'Toners', esRepuesto: false },
      unidadMedida: { codigo: 'UN', nombre: 'Unidad', entera: true },
      saldos: { NUEVO: 3, USADO: 2, total: 5 },
      stockMinimo: 5,
      estadoReposicion: 'BAJO_MINIMO',
    },
  ],
};

/**
 * Casos de uso reales con colaboradores sin stubear y `execute` espiado: el
 * controller recibe instancias del tipo exacto sin casts (ratchet de casts en
 * specs, `scripts/check-casts-en-specs.mjs`).
 */
function build() {
  const consultarReal = new ConsultarReporteStockUseCase(
    { listarParaReporteStock: unstubbed('listarParaReporteStock') },
    { sumByTipoDeInsumos: unstubbed('sumByTipoDeInsumos') },
    { contarEnDepositoPorCondicionDeInsumos: unstubbed('contarEnDepositoPorCondicionDeInsumos') },
    () => REPORTE.generadoEn,
  );
  const exportarReal = new ExportarReporteStockUseCase(consultarReal);
  const consultar = { execute: vi.spyOn(consultarReal, 'execute').mockResolvedValue(REPORTE) };
  const exportar = { execute: vi.spyOn(exportarReal, 'execute') };
  const controller = new ReporteStockInsumosController(consultarReal, exportarReal);
  const headers = new Map<string, string>();
  const res = { setHeader: (n: string, v: string) => void headers.set(n, v) };
  return { controller, consultar, exportar, res, headers };
}

describe('ReporteStockInsumosController', () => {
  describe('permisos (metadata)', () => {
    it('declara INSUMOS:LECTURA en los dos handlers', () => {
      const proto = ReporteStockInsumosController.prototype;
      expect(Reflect.getMetadata(ACCIONES_KEY, proto.consultar)).toEqual(['INSUMOS:LECTURA']);
      expect(Reflect.getMetadata(ACCIONES_KEY, proto.exportar)).toEqual(['INSUMOS:LECTURA']);
    });

    it('JwtAuthGuard y TenantGuard a nivel de clase, AccionesGuard por metodo', () => {
      const deClase = Reflect.getMetadata(
        GUARDS_METADATA,
        ReporteStockInsumosController,
      ) as unknown[];
      expect(deClase).toEqual([JwtAuthGuard, TenantGuard]);
      for (const handler of [
        ReporteStockInsumosController.prototype.consultar,
        ReporteStockInsumosController.prototype.exportar,
      ]) {
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(AccionesGuard);
      }
    });
  });

  describe('GET /insumos/reporte-stock', () => {
    it('devuelve generadoEn en ISO y las filas, y pasa los filtros al caso de uso', async () => {
      const { controller, consultar } = build();
      const query = { familiaId: 'f-1', soloBajoMinimo: true };

      const salida = await controller.consultar(query);

      expect(consultar.execute).toHaveBeenCalledWith(query);
      expect(salida.generadoEn).toBe('2026-10-02T01:30:00.000Z');
      expect(salida.filas).toHaveLength(1);
      expect(salida.filas[0].saldos).toEqual({ NUEVO: 3, USADO: 2, total: 5 });
    });
  });

  describe('GET /insumos/reporte-stock/export', () => {
    it('entrega el CSV como descarga con los mismos filtros', async () => {
      const { controller, exportar, res, headers } = build();
      exportar.execute.mockResolvedValue(
        Result.ok({ contenido: 'Codigo', nombreArchivo: 'reporte-stock-insumos-2026-10-01.csv' }),
      );
      const query = { esRepuesto: true };

      const salida = await controller.exportar(query, res);

      expect(exportar.execute).toHaveBeenCalledWith(query, 'csv');
      expect(salida).toBe('Codigo');
      expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
      expect(headers.get('Content-Disposition')).toBe(
        'attachment; filename="reporte-stock-insumos-2026-10-01.csv"',
      );
      expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
    });

    it('con ?formato=xlsx entrega un StreamableFile con el content-type y el nombre de xlsx', async () => {
      const { controller, exportar, res, headers } = build();
      exportar.execute.mockResolvedValue(
        Result.ok({
          contenido: Buffer.from('PK'),
          nombreArchivo: 'reporte-stock-insumos-2026-10-01.xlsx',
        }),
      );
      const query = { esRepuesto: true };

      const salida = await controller.exportar(query, res, 'xlsx');

      expect(salida).toBeInstanceOf(StreamableFile);
      expect(exportar.execute).toHaveBeenCalledWith(query, 'xlsx');
      expect(headers.get('Content-Type')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(headers.get('Content-Disposition')).toBe(
        'attachment; filename="reporte-stock-insumos-2026-10-01.xlsx"',
      );
      expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
    });

    it('el error de tope es 422 y no deja headers de descarga', async () => {
      const { controller, exportar, res, headers } = build();
      exportar.execute.mockResolvedValue(
        Result.fail(new ExportacionStockDemasiadoGrandeError(5001, 5000)),
      );

      await expect(controller.exportar({}, res)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(headers.size).toBe(0);
    });
  });

  describe('ReporteStockQueryDto', () => {
    it('rechaza un familiaId que no es uuid', async () => {
      const dto = plainToInstance(ReporteStockQueryDto, { familiaId: 'no-es-uuid' });
      const errores = await validate(dto);
      expect(errores.map((e) => e.property)).toEqual(['familiaId']);
    });

    it('parsea los booleanos de la query y rechaza valores ajenos', async () => {
      const ok = plainToInstance(ReporteStockQueryDto, {
        esRepuesto: 'true',
        soloBajoMinimo: 'false',
      });
      expect(await validate(ok)).toHaveLength(0);
      expect(ok.esRepuesto).toBe(true);
      expect(ok.soloBajoMinimo).toBe(false);

      const mal = plainToInstance(ReporteStockQueryDto, { ocultarSinStock: 'si' });
      expect((await validate(mal)).map((e) => e.property)).toEqual(['ocultarSinStock']);
    });
  });
});
