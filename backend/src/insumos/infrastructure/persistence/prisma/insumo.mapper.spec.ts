import { describe, expect, it } from 'vitest';
import { Prisma } from '.prisma/tenant';
import {
  CompatibilidadModeloMapper,
  InsumoCodigoAlternativoMapper,
  InsumoMapper,
} from './insumo.mapper';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../../domain/entities/insumo-codigo-alternativo.entity';

/** Fila base de `insumos`, para que cada caso sobrescriba solo lo suyo. */
function filaInsumo(
  overrides: Partial<Parameters<typeof InsumoMapper.toDomain>[0]> = {},
): Parameters<typeof InsumoMapper.toDomain>[0] {
  return {
    id: 'insumo-1',
    codigo: 'TON-001',
    nombre: 'Tóner negro',
    familiaId: 'familia-1',
    unidadMedidaId: 'unidad-1',
    stockMinimo: new Prisma.Decimal('5.00'),
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    codigosAlternativos: [],
    compatibilidad: [],
    ...overrides,
  };
}

describe('InsumoMapper', () => {
  it('toDomain() convierte una fila Prisma a InsumoEntity', () => {
    const entity = InsumoMapper.toDomain(filaInsumo());

    expect(entity.id).toBe('insumo-1');
    expect(entity.codigo).toBe('TON-001');
    expect(entity.nombre).toBe('Tóner negro');
    expect(entity.familiaId).toBe('familia-1');
    expect(entity.unidadMedidaId).toBe('unidad-1');
    expect(entity.activo).toBe(true);
    expect(entity.createdAt).toEqual(new Date('2026-01-01'));
  });

  /**
   * `stock_minimo` es `DECIMAL(10,2)`, o sea un `Prisma.Decimal` — un OBJETO.
   * Sin la conversión a `number`, el dominio compara un objeto contra el techo
   * de negocio y toda la aritmética de reposición opera sobre algo que no es
   * un número. Se assertea el TIPO además del valor: `toEqual` contra un
   * `Decimal` de igual valor pasaría igual.
   */
  it('toDomain() convierte el Decimal de stockMinimo a number', () => {
    const entity = InsumoMapper.toDomain(filaInsumo({ stockMinimo: new Prisma.Decimal('12.34') }));

    expect(typeof entity.stockMinimo).toBe('number');
    expect(entity.stockMinimo).toBe(12.34);
  });

  /**
   * Hermano invertido del caso de arriba: `null` es "sin punto de reposición
   * definido", que NO es lo mismo que cero. Un `Number(null)` da `0` y
   * convertiría un insumo sin punto de reposición en uno que avisa a las cero
   * unidades.
   */
  it('toDomain() preserva el null de stockMinimo sin convertirlo en cero', () => {
    const entity = InsumoMapper.toDomain(filaInsumo({ stockMinimo: null }));

    expect(entity.stockMinimo).toBeNull();
  });

  it('toDomain() reconstituye los códigos alternativos del agregado', () => {
    const entity = InsumoMapper.toDomain(
      filaInsumo({
        codigosAlternativos: [
          {
            id: 'cod-1',
            insumoId: 'insumo-1',
            codigo: 'CE285A',
            fabricante: 'HP',
            createdAt: new Date('2026-01-03'),
            updatedAt: new Date('2026-01-04'),
            deletedAt: null,
          },
        ],
      }),
    );

    expect(entity.codigosAlternativos).toHaveLength(1);
    expect(entity.codigosAlternativos[0]!.id).toBe('cod-1');
    expect(entity.codigosAlternativos[0]!.codigo).toBe('CE285A');
    expect(entity.codigosAlternativos[0]!.fabricante).toBe('HP');
  });

  /**
   * La compatibilidad tiene que VOLVER del mapeo. Si se leyera como lista
   * vacía, el agregado llegaría a medio cargar y el `save()` siguiente
   * persistiría esa lista vacía como si el usuario hubiera borrado todos los
   * modelos: pérdida de datos sin un solo error ni log.
   *
   * Las dos filas del fixture cubren las dos formas del rol —cargado y
   * `null`— porque son ramas distintas del mapeo: la columna admite las dos y
   * `null` es "no cumple ningún rol distinguible", no "rol vacío".
   */
  it('toDomain() reconstituye la compatibilidad del agregado, con rol y sin rol', () => {
    const entity = InsumoMapper.toDomain(
      filaInsumo({
        compatibilidad: [
          {
            insumoId: 'insumo-1',
            modeloEquipoId: 'modelo-1',
            rol: 'NEGRO',
            createdAt: new Date('2026-01-05'),
          },
          {
            insumoId: 'insumo-1',
            modeloEquipoId: 'modelo-2',
            rol: null,
            createdAt: new Date('2026-01-06'),
          },
        ],
      }),
    );

    expect(entity.compatibilidad).toHaveLength(2);
    expect(entity.compatibilidad[0]!.modeloEquipoId).toBe('modelo-1');
    expect(entity.compatibilidad[0]!.rol).toBe('NEGRO');
    expect(entity.compatibilidad[1]!.modeloEquipoId).toBe('modelo-2');
    expect(entity.compatibilidad[1]!.rol).toBeNull();
  });

  /**
   * Hermano invertido del caso de arriba: sin filas en la tabla la lista SÍ
   * viene vacía. Sin este caso, un mapeo que devolviera siempre la lista vacía
   * quedaría a medias probado, y uno que inventara un elemento pasaría el otro
   * assert igual.
   */
  it('toDomain() devuelve la compatibilidad vacía cuando el insumo no tiene modelos', () => {
    const entity = InsumoMapper.toDomain(filaInsumo({ compatibilidad: [] }));

    expect(entity.compatibilidad).toEqual([]);
  });

  // El soft delete tiene que sobrevivir al viaje de vuelta: si `deletedAt` se
  // pierde en el mapeo, un insumo dado de baja reaparece como vigente.
  it('toDomain() preserva el deletedAt de una fila dada de baja', () => {
    const deletedAt = new Date('2026-02-01');
    const entity = InsumoMapper.toDomain(filaInsumo({ deletedAt }));

    expect(entity.deletedAt).toEqual(deletedAt);
    expect(entity.isDeleted()).toBe(true);
  });

  it('toPersistence() convierte un InsumoEntity al shape de fila Prisma', () => {
    const entity = InsumoEntity.create(
      {
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: 'familia-1',
        unidadMedidaId: 'unidad-1',
        stockMinimo: 5,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      },
      'insumo-1',
    );

    const row = InsumoMapper.toPersistence(entity);

    expect(row.id).toBe('insumo-1');
    expect(row.codigo).toBe('TON-001');
    expect(row.familiaId).toBe('familia-1');
    expect(row.unidadMedidaId).toBe('unidad-1');
    expect(row.stockMinimo).toBe(5);
    expect(row.activo).toBe(true);
    expect(row.deletedAt).toBeNull();
    expect(row.createdAt).toEqual(entity.createdAt);
  });

  /**
   * El `null` tiene que VIAJAR en el objeto, no desaparecer de él: el UPDATE
   * del upsert manda este mismo shape, así que un `stockMinimo` ausente sería
   * un punto de reposición que no se puede borrar nunca más. Se assertea la
   * PRESENCIA de la clave, no solo su valor.
   */
  it('toPersistence() manda el stockMinimo nulo como clave presente en null', () => {
    const entity = InsumoEntity.create({
      codigo: 'TON-002',
      nombre: 'Sin punto de reposición',
      familiaId: 'familia-1',
      unidadMedidaId: 'unidad-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    });

    const row = InsumoMapper.toPersistence(entity);

    expect('stockMinimo' in row).toBe(true);
    expect(row.stockMinimo).toBeNull();
  });
});

describe('InsumoCodigoAlternativoMapper', () => {
  it('toDomain() convierte una fila Prisma a InsumoCodigoAlternativoEntity', () => {
    const entity = InsumoCodigoAlternativoMapper.toDomain({
      id: 'cod-1',
      insumoId: 'insumo-1',
      codigo: 'CE285A',
      fabricante: 'HP',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    });

    expect(entity.id).toBe('cod-1');
    expect(entity.codigo).toBe('CE285A');
    expect(entity.fabricante).toBe('HP');
    expect(entity.createdAt).toEqual(new Date('2026-01-01'));
  });

  /**
   * `fabricante` en `null` es el código GENÉRICO. Mapearlo a `''` lo sacaría
   * del `NULLS NOT DISTINCT` del índice y el mismo código genérico entraría
   * dos veces.
   */
  it('toDomain() preserva el fabricante nulo del código genérico', () => {
    const entity = InsumoCodigoAlternativoMapper.toDomain({
      id: 'cod-2',
      insumoId: 'insumo-1',
      codigo: 'GENERICO-1',
      fabricante: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    });

    expect(entity.fabricante).toBeNull();
  });

  /**
   * El shape va SIN `insumoId`: se usa como escritura anidada bajo el insumo,
   * donde Prisma resuelve la FK solo. Incluirlo haría que el tipo de entrada
   * anidado no compile.
   */
  it('toPersistence() convierte la entidad al shape anidado, sin insumoId', () => {
    const entity = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      'cod-1',
    );

    const row = InsumoCodigoAlternativoMapper.toPersistence(entity);

    expect(row.id).toBe('cod-1');
    expect(row.codigo).toBe('CE285A');
    expect(row.fabricante).toBe('HP');
    expect(row.deletedAt).toBeNull();
    expect(row.createdAt).toEqual(entity.createdAt);
    expect('insumoId' in row).toBe(false);
  });
});

describe('CompatibilidadModeloMapper', () => {
  it('toDomain() convierte una fila Prisma al value object', () => {
    const vo = CompatibilidadModeloMapper.toDomain({
      insumoId: 'insumo-1',
      modeloEquipoId: 'modelo-1',
      rol: 'NEGRO',
      createdAt: new Date('2026-01-01'),
    });

    expect(vo.modeloEquipoId).toBe('modelo-1');
    expect(vo.rol).toBe('NEGRO');
  });

  /**
   * Hermano invertido: `null` es "no cumple ningún rol distinguible" —una
   * lámpara no es de ningún color—. Mapearlo a `''` haría convivir dos formas
   * de decir lo mismo, que es justo lo que la normalización del dominio
   * existe para impedir.
   */
  it('toDomain() preserva el rol nulo', () => {
    const vo = CompatibilidadModeloMapper.toDomain({
      insumoId: 'insumo-1',
      modeloEquipoId: 'modelo-2',
      rol: null,
      createdAt: new Date('2026-01-01'),
    });

    expect(vo.rol).toBeNull();
  });

  /**
   * El shape va SIN `insumoId` —Prisma resuelve la FK desde el insumo padre—
   * y SIN `createdAt`: la fila no tiene id ni `updatedAt`, así que su
   * `createdAt` es el único rastro de cuándo se declaró la compatibilidad, y
   * el `upsert` manda este mismo shape en la rama de UPDATE. Emitirlo le
   * pisaría la fecha de alta a un par que no cambió. En el CREATE lo pone el
   * `@default(now())` de la columna.
   */
  it('toPersistence() emite el shape anidado, sin insumoId y sin createdAt', () => {
    const row = CompatibilidadModeloMapper.toPersistence({
      modeloEquipoId: 'modelo-1',
      rol: 'NEGRO',
    });

    expect(row).toEqual({ modeloEquipoId: 'modelo-1', rol: 'NEGRO' });
    expect('insumoId' in row).toBe(false);
    expect('createdAt' in row).toBe(false);
  });

  /**
   * El `null` tiene que VIAJAR en el objeto, no desaparecer de él: el UPDATE
   * del upsert manda este mismo shape, así que un `rol` ausente sería un rol
   * imposible de borrar. Se assertea la PRESENCIA de la clave.
   */
  it('toPersistence() manda el rol nulo como clave presente en null', () => {
    const row = CompatibilidadModeloMapper.toPersistence({
      modeloEquipoId: 'modelo-1',
      rol: null,
    });

    expect('rol' in row).toBe(true);
    expect(row.rol).toBeNull();
  });
});
