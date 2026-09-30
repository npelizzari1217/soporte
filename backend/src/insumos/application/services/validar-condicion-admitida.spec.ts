import { describe, expect, it } from 'vitest';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { familiaRepoFake } from '../../testing/familia-repo-fake';
import { validarCondicionAdmitida } from './validar-insumo.service';

describe('validarCondicionAdmitida', () => {
  const insumo = InsumoEntity.create(
    {
      codigo: 'REP-001',
      nombre: 'Mouse',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    },
    'ins-1',
  );

  it('admite NUEVO sin consultar la familia', async () => {
    const familias = familiaRepoFake({ esRepuesto: false });

    const result = await validarCondicionAdmitida(familias, insumo, 'NUEVO');

    expect(result.isOk()).toBe(true);
    expect(familias.findById).not.toHaveBeenCalled();
  });

  it('admite USADO para una familia de repuestos vigente', async () => {
    const familias = familiaRepoFake();

    const result = await validarCondicionAdmitida(familias, insumo, 'USADO');

    expect(result.isOk()).toBe(true);
    expect(familias.findById).toHaveBeenCalledWith('fam-1');
  });

  it('rechaza USADO para una familia que no es de repuestos', async () => {
    const result = await validarCondicionAdmitida(
      familiaRepoFake({ esRepuesto: false }),
      insumo,
      'USADO',
    );

    expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
  });

  it.each([
    ['con baja lógica', { dadaDeBaja: true }],
    ['deshabilitada', { activo: false }],
    ['inexistente', { inexistente: true }],
  ])('rechaza USADO si la familia está %s', async (_caso, estado) => {
    const result = await validarCondicionAdmitida(familiaRepoFake(estado), insumo, 'USADO');

    expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
  });

  describe('con admitirFamiliaNoVigente', () => {
    const opciones = { admitirFamiliaNoVigente: true };

    it.each([
      ['con baja lógica', { dadaDeBaja: true }],
      ['deshabilitada', { activo: false }],
    ])('admite USADO si la familia de repuestos está %s', async (_caso, estado) => {
      const result = await validarCondicionAdmitida(
        familiaRepoFake(estado),
        insumo,
        'USADO',
        opciones,
      );

      expect(result.isOk()).toBe(true);
    });

    it('rechaza USADO si la familia no es de repuestos, aunque no esté vigente', async () => {
      const result = await validarCondicionAdmitida(
        familiaRepoFake({ esRepuesto: false, dadaDeBaja: true }),
        insumo,
        'USADO',
        opciones,
      );

      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
    });

    it('rechaza USADO si la familia no existe', async () => {
      const result = await validarCondicionAdmitida(
        familiaRepoFake({ inexistente: true }),
        insumo,
        'USADO',
        opciones,
      );

      expect(result.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
    });
  });
});
