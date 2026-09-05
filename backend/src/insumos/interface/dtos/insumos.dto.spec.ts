import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateInsumoDto, EditInsumoDto, toInsumoResponseDto } from './insumos.dto';
import {
  InsumoEntity,
  INSUMO_CODIGOS_ALTERNATIVOS_MAX,
  INSUMO_CODIGO_MAX_LENGTH,
  INSUMO_NOMBRE_MAX_LENGTH,
  INSUMO_STOCK_MINIMO_MAXIMO,
} from '../../domain/entities/insumo.entity';
import {
  InsumoCodigoAlternativoEntity,
  INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH,
  INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH,
} from '../../domain/entities/insumo-codigo-alternativo.entity';

const FAMILIA_ID = '11111111-1111-4111-8111-111111111111';
const UNIDAD_ID = '22222222-2222-4222-8222-222222222222';

/** Body mínimo válido del alta, para que cada caso sobrescriba solo lo suyo. */
function bodyAlta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    codigo: 'TON-001',
    nombre: 'Tóner negro',
    familiaId: FAMILIA_ID,
    unidadMedidaId: UNIDAD_ID,
    ...overrides,
  };
}

/** Lista de códigos alternativos válidos y distintos entre sí, para medir el techo. */
function codigosAlternativosDe(cantidad: number): Array<{ codigo: string }> {
  return Array.from({ length: cantidad }, (_valor, indice) => ({ codigo: `ALT-${indice}` }));
}

/**
 * Recopila las restricciones que fallaron, para poder assertar CUÁL regla
 * rechazó y no solo "hubo algún error": con `@IsString`, `@MinLength` y
 * `@MaxLength` sobre el mismo campo, un `not.toHaveLength(0)` queda verde por
 * la regla equivocada.
 */
async function restriccionesDe(dto: object): Promise<string[]> {
  const errores = await validate(dto);
  const propias = errores.flatMap((e) => Object.keys(e.constraints ?? {}));
  const anidadas = errores.flatMap((e) =>
    (e.children ?? []).flatMap((hijo) => [
      ...Object.keys(hijo.constraints ?? {}),
      ...(hijo.children ?? []).flatMap((nieto) => Object.keys(nieto.constraints ?? {})),
    ]),
  );
  return [...propias, ...anidadas];
}

describe('CreateInsumoDto', () => {
  it('acepta un alta mínima y normaliza el código a mayúscula', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ codigo: '  ton-001  ' }));

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigo).toBe('TON-001');
  });

  /**
   * El nombre se recorta pero NO se grita: es la descripción que lee una
   * persona en el listado.
   */
  it('recorta el nombre sin pasarlo a mayúscula', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ nombre: '  Tóner negro  ' }));

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nombre).toBe('Tóner negro');
  });

  /**
   * `familiaId` y `unidadMedidaId` viajan en el BODY, así que `ParseUUIDPipe`
   * no los alcanza: sin `@IsUUID` el id crudo llega a Prisma contra una
   * columna `@db.Uuid`, Postgres tira 22P02 —que no está en el mapa cerrado de
   * `PrismaExceptionFilter`— y el usuario se come un 500.
   */
  it.each([['familiaId'], ['unidadMedidaId']])('rechaza %s que no es un UUID', async (campo) => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ [campo]: 'no-es-un-uuid' }));

    expect(await restriccionesDe(dto)).toContain('isUuid');
  });

  it('acepta el alta sin stockMinimo (sin punto de reposición definido)', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta());

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.stockMinimo).toBeUndefined();
  });

  it('acepta stockMinimo explícito en null, que borra el punto de reposición', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: null }));

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.stockMinimo).toBeNull();
  });

  it('acepta stockMinimo con dos decimales', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: 12.34 }));

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * Postgres NO falla ante un tercer decimal en un `DECIMAL(10,2)`: lo REDONDEA
   * en silencio. El usuario guardaría `0.005` y le quedaría `0.01`. El borde y
   * el dominio son los únicos lugares donde eso se atrapa, y se assertea la
   * restricción `isNumber` en particular porque el campo tiene además `@Min` y
   * `@Max`.
   */
  it('rechaza stockMinimo con más de dos decimales', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: 0.005 }));

    expect(await restriccionesDe(dto)).toContain('isNumber');
  });

  it('rechaza stockMinimo negativo', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: -1 }));

    expect(await restriccionesDe(dto)).toContain('min');
  });

  it('rechaza stockMinimo por encima del techo de negocio', async () => {
    const dto = plainToInstance(
      CreateInsumoDto,
      bodyAlta({ stockMinimo: INSUMO_STOCK_MINIMO_MAXIMO + 1 }),
    );

    expect(await restriccionesDe(dto)).toContain('max');
  });

  it('acepta stockMinimo exactamente en el techo de negocio (límite inclusive)', async () => {
    const dto = plainToInstance(
      CreateInsumoDto,
      bodyAlta({ stockMinimo: INSUMO_STOCK_MINIMO_MAXIMO }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Los topes y la normalización están declarados en LOS DOS DTOs (alta y
 * edición). Recorrer los dos no es redundancia: con un solo caso, borrar el
 * decorador de `EditInsumoDto` no pone nada en rojo y el camino PATCH queda
 * sin guard.
 */
describe.each([
  ['CreateInsumoDto', CreateInsumoDto],
  ['EditInsumoDto', EditInsumoDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza un codigo de más de 50 caracteres', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ codigo: 'A'.repeat(INSUMO_CODIGO_MAX_LENGTH + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un codigo de exactamente 50 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigo: 'A'.repeat(INSUMO_CODIGO_MAX_LENGTH) }));

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un nombre de más de 255 caracteres', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ nombre: 'A'.repeat(INSUMO_NOMBRE_MAX_LENGTH + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un nombre de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ nombre: 'A'.repeat(INSUMO_NOMBRE_MAX_LENGTH) }));

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un codigo de solo espacios', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigo: '   ' }));

    expect(await restriccionesDe(dto)).toContain('minLength');
  });

  it('rechaza un nombre de solo espacios', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ nombre: '   ' }));

    expect(await restriccionesDe(dto)).toContain('minLength');
  });

  /**
   * El tope se mide sobre el código YA NORMALIZADO: `'ß'.toUpperCase()` es
   * `'SS'`, así que 50 `ß` crudas son 100 caracteres en la columna. Midiendo el
   * crudo, este valor pasa el DTO y explota recién en Postgres. Es el bug que
   * ya mordió a `tipos-componente` en este repo.
   */
  it('rechaza un codigo que entra crudo pero se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigo: 'ß'.repeat(INSUMO_CODIGO_MAX_LENGTH) }));

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('normaliza el código alternativo a mayúscula y colapsa el fabricante vacío a null', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: '  ce285a  ', fabricante: '   ' }],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigosAlternativos![0]!.codigo).toBe('CE285A');
    expect(dto.codigosAlternativos![0]!.fabricante).toBeNull();
  });

  it('pasa el fabricante a mayúscula, para que "hp" y "HP" no sean dos fabricantes', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: 'CE285A', fabricante: ' hp ' }],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigosAlternativos![0]!.fabricante).toBe('HP');
  });

  /**
   * El tope del código alternativo se mide DESPUÉS de normalizar, igual que el
   * del insumo: sin eso el valor atraviesa el borde y muere en la columna
   * `VarChar(50)`.
   */
  it('rechaza un código alternativo que se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          { codigo: 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH), fabricante: 'HP' },
        ],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('rechaza un fabricante que se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          {
            codigo: 'CE285A',
            fabricante: 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH),
          },
        ],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un código alternativo de exactamente 50 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          { codigo: 'A'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH), fabricante: null },
        ],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un código alternativo de solo espacios', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: '   ', fabricante: 'HP' }],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('minLength');
  });

  /**
   * Sin `@ValidateNested`, `class-validator` mira el array como un valor
   * opaco: los códigos alternativos entrarían crudos y sin medir, y este caso
   * quedaría verde con un array de cualquier cosa adentro.
   */
  it('rechaza un elemento de codigosAlternativos que no es un objeto con codigo', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: [{ fabricante: 'HP' }] }));

    expect(await restriccionesDe(dto)).toContain('isString');
  });

  /**
   * `codigosAlternativos: null` NO es lo mismo que ausente: la capa de
   * aplicación distingue `undefined` ("no tocar la lista") de una lista, y un
   * `null` que se cuele llega como iterable inválido y sale por 500. El borde
   * lo tiene que rechazar con un 400.
   */
  it('rechaza codigosAlternativos en null', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: null }));

    expect(await restriccionesDe(dto)).toContain('isArray');
  });

  it('acepta la lista vacía de códigos alternativos, que es la orden de vaciarla', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: [] }));

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * El techo se assertea por SU restricción y no por "hubo algún error":
   * `@IsArray`, `@ArrayMaxSize` y `@ValidateNested` conviven sobre el mismo
   * campo, así que un array de 51 elementos podría quedar verde por la regla
   * equivocada.
   */
  it('rechaza más códigos alternativos que el techo del dominio', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta el techo exacto de códigos alternativos (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX) }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('EditInsumoDto — PATCH parcial', () => {
  it('acepta un body vacío: no tocar nada es un PATCH válido', async () => {
    const dto = plainToInstance(EditInsumoDto, {});

    expect(await validate(dto)).toHaveLength(0);
  });

  it('acepta un PATCH de un solo campo', async () => {
    const dto = plainToInstance(EditInsumoDto, { nombre: 'Renombrado' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigo).toBeUndefined();
  });

  /**
   * El techo tiene que estar en las DOS puntas. La edición es el camino más
   * probable para pasarse —a un insumo se le agregan códigos con el tiempo—,
   * así que un techo puesto solo en el alta no protege nada.
   */
  it('rechaza más códigos alternativos que el techo del dominio', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1),
    });

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta el techo exacto de códigos alternativos (límite inclusive)', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX),
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('toInsumoResponseDto', () => {
  it('mapea la entidad al shape de respuesta HTTP, con sus códigos alternativos', () => {
    const codigo = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      '33333333-3333-4333-8333-333333333333',
    );
    const insumo = InsumoEntity.create({
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: 5.5,
      activo: true,
      codigosAlternativos: [codigo],
    });

    const dto = toInsumoResponseDto(insumo);

    expect(dto.codigo).toBe('TON-001');
    expect(dto.nombre).toBe('Tóner negro');
    expect(dto.familiaId).toBe(FAMILIA_ID);
    expect(dto.unidadMedidaId).toBe(UNIDAD_ID);
    expect(dto.stockMinimo).toBe(5.5);
    expect(dto.activo).toBe(true);
    expect(typeof dto.createdAt).toBe('string');
    // El agregado no se puede editar sin ver sus códigos: el formulario manda
    // la lista COMPLETA, así que una respuesta sin ellos obligaría al usuario a
    // recargarlos de memoria.
    expect(dto.codigosAlternativos).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', codigo: 'CE285A', fabricante: 'HP' },
    ]);
  });

  it('serializa el stockMinimo nulo como null, no como cero', () => {
    const insumo = InsumoEntity.create({
      codigo: 'TON-002',
      nombre: 'Sin punto de reposición',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
    });

    expect(toInsumoResponseDto(insumo).stockMinimo).toBeNull();
  });
});
