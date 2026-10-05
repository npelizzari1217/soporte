import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateRespuestaPredefinidaDto,
  EditRespuestaPredefinidaDto,
  ListarRespuestasPredefinidasQueryDto,
  toRespuestaPredefinidaResponseDto,
} from './respuestas-predefinidas.dto';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';

/** Los topes están declarados a mano en los DOS DTOs: se recorren ambos. */
describe.each([
  ['CreateRespuestaPredefinidaDto', CreateRespuestaPredefinidaDto],
  ['EditRespuestaPredefinidaDto', EditRespuestaPredefinidaDto],
])('%s — largos espejando la columna', (_nombre, Dto) => {
  const valido = { titulo: 'Saludo', texto: 'Hola' };
  const errores = async (cambios: Record<string, unknown>) =>
    validate(plainToInstance(Dto, { ...valido, ...cambios }));

  it('acepta un caso válido', async () => {
    expect(await errores({})).toHaveLength(0);
  });

  it('rechaza titulo de más de 100 y acepta exactamente 100', async () => {
    expect(await errores({ titulo: 'T'.repeat(101) })).not.toHaveLength(0);
    expect(await errores({ titulo: 'T'.repeat(100) })).toHaveLength(0);
  });

  it('rechaza texto de más de 4000 y acepta exactamente 4000', async () => {
    expect(await errores({ texto: 'x'.repeat(4001) })).not.toHaveLength(0);
    expect(await errores({ texto: 'x'.repeat(4000) })).toHaveLength(0);
  });

  it('rechaza titulo y texto vacíos o de solo espacios (se recortan antes de validar)', async () => {
    expect(await errores({ titulo: '' })).not.toHaveLength(0);
    expect(await errores({ titulo: '   ' })).not.toHaveLength(0);
    expect(await errores({ texto: '   ' })).not.toHaveLength(0);
  });
});

describe('ListarRespuestasPredefinidasQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])("transforma activas='%s'", async (crudo, esperado) => {
    const dto = plainToInstance(ListarRespuestasPredefinidasQueryDto, { activas: crudo });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.activas).toBe(esperado);
  });

  it('permite omitirlo y rechaza un valor que no es booleano', async () => {
    expect(await validate(plainToInstance(ListarRespuestasPredefinidasQueryDto, {}))).toHaveLength(
      0,
    );
    expect(
      await validate(plainToInstance(ListarRespuestasPredefinidasQueryDto, { activas: 'quizas' })),
    ).not.toHaveLength(0);
  });
});

describe('toRespuestaPredefinidaResponseDto', () => {
  it('mapea la entidad al shape HTTP', () => {
    const dto = toRespuestaPredefinidaResponseDto(
      RespuestaPredefinidaEntity.create({ titulo: 'A', texto: 'B', activo: true }),
    );
    expect(dto).toMatchObject({ titulo: 'A', texto: 'B', activo: true });
    expect(typeof dto.createdAt).toBe('string');
  });
});
