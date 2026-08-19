/**
 * [UNIT] RED→GREEN: `ExportarEquiposUseCase` — exportación del listado de
 * equipos IT a CSV (sdd/exportar-listados-csv, capability
 * exportacion-equipos).
 *
 * Lo que se fija acá:
 * - `ExportarEquiposUseCase` COMPONE `ListarEquiposUseCase` (no un
 *   `IEquipoInformaticoRepository` propio) — igual criterio D4 que tickets:
 *   con un solo argumento en el constructor no hay NADA que consultar por
 *   fila, el tipo lo impide.
 * - Sin filtros: `execute()` no recibe parámetros — `findAllActive()` no
 *   acepta ninguno (spec, "No filter parameters are accepted").
 * - Columnas fijas y en orden: Nombre, Marca, N.º de serie, Estado.
 * - El tope de filas corta con un error de dominio, sin truncar en silencio.
 *   `total` es `items.length` (D4: no hay `count()` en el puerto — cap
 *   post-fetch, aceptado, documentado en el use case).
 * - Inyección de fórmula CSV en una celda de texto libre (`nombre`).
 */
import { ExportarEquiposUseCase } from './exportar-equipos.use-case';
import { ListarEquiposUseCase } from './listar-equipos.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/equipos.errors';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';

const BOM = '﻿';

/** Devuelve las líneas del CSV, sin BOM. */
function lineas(contenido: string): string[] {
  return contenido.slice(BOM.length).split('\r\n');
}

function crearEquipo(
  overrides: Partial<{
    nombre: string;
    marca: string | null;
    numeroSerie: string | null;
    activo: boolean;
  }> = {},
  id = 'equipo-1',
): EquipoInformaticoEntity {
  const equipo = EquipoInformaticoEntity.create(
    {
      nombre: overrides.nombre ?? 'Notebook Dell',
      numeroSerie: overrides.numeroSerie !== undefined ? overrides.numeroSerie : 'SN-001',
      marca: overrides.marca ?? 'Dell',
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    },
    id,
  );
  if (overrides.activo === false) {
    equipo.deactivate();
  }
  return equipo;
}

/** `ListarEquiposUseCase` FAKE — controla la lista sin pasar por el repositorio real. */
function crearListarEquiposFake(equipos: EquipoInformaticoEntity[]) {
  const execute = vi.fn().mockResolvedValue({
    isFail: () => false,
    getValue: () => equipos,
  });
  return { execute } as unknown as ListarEquiposUseCase;
}

describe('ExportarEquiposUseCase', () => {
  it('emite el encabezado y una fila por equipo, con las 4 columnas fijas en orden', async () => {
    const activo = crearEquipo(
      { nombre: 'Notebook Dell', marca: 'Dell', numeroSerie: 'SN-001' },
      'e1',
    );
    const deBaja = crearEquipo(
      { nombre: 'Monitor LG', marca: 'LG', numeroSerie: null, activo: false },
      'e2',
    );
    const useCase = new ExportarEquiposUseCase(crearListarEquiposFake([activo, deBaja]));

    const result = await useCase.execute();

    expect(result.isFail()).toBe(false);
    const filas = lineas(result.getValue().contenido);
    expect(filas).toHaveLength(3); // encabezado + 2 equipos
    expect(filas[0]).toBe('Nombre;Marca;N.º de serie;Estado');
    expect(filas[1]).toBe('Notebook Dell;Dell;SN-001;Activo');
    expect(filas[2]).toBe('Monitor LG;LG;;Baja');
  });

  it('sin filtros: execute() no recibe parámetros ni se los pasa a ListarEquiposUseCase', async () => {
    const listarEquipos = crearListarEquiposFake([]);
    const useCase = new ExportarEquiposUseCase(listarEquipos);

    await useCase.execute();

    expect(listarEquipos.execute).toHaveBeenCalledWith();
  });

  it('tope de filas: total === TOPE arma el archivo; total === TOPE + 1 falla y NO arma contenido', async () => {
    const equipoBase = crearEquipo();
    const listaEnElTope = Array.from({ length: TOPE_FILAS_EXPORT }, () => equipoBase);
    const listaSobreElTope = Array.from({ length: TOPE_FILAS_EXPORT + 1 }, () => equipoBase);

    const okResult = await new ExportarEquiposUseCase(
      crearListarEquiposFake(listaEnElTope),
    ).execute();
    expect(okResult.isFail()).toBe(false);

    const failResult = await new ExportarEquiposUseCase(
      crearListarEquiposFake(listaSobreElTope),
    ).execute();
    expect(failResult.isFail()).toBe(true);
    expect(failResult.getError()).toBeInstanceOf(ExportacionDemasiadoGrandeError);
    expect(failResult.getError().message).not.toContain('filtros');
    expect(failResult.getError().message).toContain('partes');
  });

  it('neutraliza inyección de fórmula CSV en el nombre (celda de texto libre)', async () => {
    const equipo = crearEquipo({ nombre: '=HYPERLINK("http://evil","clic")' });
    const useCase = new ExportarEquiposUseCase(crearListarEquiposFake([equipo]));

    const result = await useCase.execute();

    const [, fila] = lineas(result.getValue().contenido);
    expect(fila).toContain("'=HYPERLINK");
  });

  it('nombra el archivo con la fecha de exportación', async () => {
    const useCase = new ExportarEquiposUseCase(crearListarEquiposFake([]));

    const { nombreArchivo } = (await useCase.execute()).getValue();

    expect(nombreArchivo).toMatch(/^equipos-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
