import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { ApiClave, NuevaApiClave } from '../domain/api-clave';
import { ApiClaveDuplicadaError } from '../domain/api-clave-repository.port';
import { hashearClaveApi } from '../domain/generar-clave-api';
import { Result } from '../../shared/domain/result';
import { emailIntegracion } from './configurar-api-cliente.use-case';
import { CrearApiClaveUseCase, LARGO_MAXIMO_NOMBRE_CLAVE } from './crear-api-clave.use-case';

function armar(
  opciones: { apiHabilitada?: boolean; conUsuario?: boolean; colisiones?: number } = {},
) {
  const cliente = ClienteEntity.create({
    nombre: 'Acme',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_db',
    activo: true,
    apiHabilitada: opciones.apiHabilitada ?? true,
  });
  const usuario = UsuarioEntity.create({
    email: emailIntegracion(cliente.id),
    nombre: 'Integracion',
    apellido: 'API',
    passwordHash: 'x',
    activo: true,
    esIntegracion: true,
  });
  const guardadas: NuevaApiClave[] = [];
  let colisiones = opciones.colisiones ?? 0;
  const useCase = new CrearApiClaveUseCase(
    { findById: async (id) => (id === cliente.id ? cliente : null) },
    {
      findByEmail: async (email) =>
        opciones.conUsuario === false || email !== usuario.email ? null : usuario,
    },
    {
      crear: async (datos): Promise<Result<ApiClave, ApiClaveDuplicadaError>> => {
        if (colisiones > 0) {
          colisiones--;
          return Result.fail(new ApiClaveDuplicadaError());
        }
        guardadas.push(datos);
        return Result.ok({
          ...datos,
          id: `clave-${guardadas.length}`,
          creadaAt: new Date('2026-10-10T12:00:00Z'),
          ultimoUsoAt: null,
          revocadaAt: null,
        });
      },
    },
  );
  const comando = (extra: Partial<Parameters<CrearApiClaveUseCase['execute']>[0]> = {}) => ({
    clienteId: cliente.id,
    creadaPorId: 'admin-1',
    nombre: 'ERP',
    permisos: ['TICKETS:LECTURA'],
    ...extra,
  });
  return { cliente, usuario, guardadas, useCase, comando };
}

describe('CrearApiClaveUseCase', () => {
  it('devuelve la clave en claro y guarda solo su sha256 y su prefijo, atada al usuario de integracion', async () => {
    const { usuario, cliente, guardadas, useCase, comando } = armar();

    const r = await useCase.execute(comando({ permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'] }));

    const salida = r.getValue();
    expect(salida.clave).toMatch(/^sop_/);
    expect(salida).toMatchObject({
      id: 'clave-1',
      nombre: 'ERP',
      permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
    });
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({
      clienteId: cliente.id,
      usuarioId: usuario.id,
      creadaPorId: 'admin-1',
      prefijo: salida.prefijo,
      hash: hashearClaveApi(salida.clave),
    });
    expect(JSON.stringify(guardadas[0])).not.toContain(salida.clave);
  });

  it('recorta el nombre y descarta permisos repetidos', async () => {
    const { guardadas, useCase, comando } = armar();
    await useCase.execute(
      comando({ nombre: '  ERP  ', permisos: ['TICKETS:COMENTAR', 'TICKETS:COMENTAR'] }),
    );
    expect(guardadas[0]).toMatchObject({ nombre: 'ERP', permisos: ['TICKETS:COMENTAR'] });
  });

  it.each([
    ['vacios', []],
    ['fuera del subconjunto', ['TICKETS:TRANSICIONAR']],
    ['mezclados con uno invalido', ['TICKETS:LECTURA', 'USUARIOS:ALTAS']],
  ])('rechaza permisos %s', async (_caso, permisos) => {
    const { guardadas, useCase, comando } = armar();
    const r = await useCase.execute(comando({ permisos }));
    expect(r.getError().code).toBe('API_PERMISOS_INVALIDOS');
    expect(guardadas).toHaveLength(0);
  });

  it.each([
    ['en blanco', '   '],
    ['demasiado largo', 'x'.repeat(LARGO_MAXIMO_NOMBRE_CLAVE + 1)],
  ])('rechaza un nombre %s', async (_caso, nombre) => {
    const { guardadas, useCase, comando } = armar();
    const r = await useCase.execute(comando({ nombre }));
    expect(r.getError().code).toBe('API_NOMBRE_CLAVE_INVALIDO');
    expect(guardadas).toHaveLength(0);
  });

  it('con la API deshabilitada no emite nada', async () => {
    const { guardadas, useCase, comando } = armar({ apiHabilitada: false });
    const r = await useCase.execute(comando());
    expect(r.getError().code).toBe('API_NO_HABILITADA');
    expect(guardadas).toHaveLength(0);
  });

  it('sin usuario de integracion falla', async () => {
    const { useCase, comando } = armar({ conUsuario: false });
    const r = await useCase.execute(comando());
    expect(r.getError().code).toBe('API_USUARIO_INTEGRACION_NO_ENCONTRADO');
  });

  it('reintenta ante una colision y falla si persiste', async () => {
    const una = armar({ colisiones: 1 });
    expect((await una.useCase.execute(una.comando())).isOk()).toBe(true);

    const siempre = armar({ colisiones: 10 });
    const r = await siempre.useCase.execute(siempre.comando());
    expect(r.getError().code).toBe('API_CLAVE_DUPLICADA');
  });
});
