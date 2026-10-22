import { describe, expect, it } from 'vitest';
import { PermisosPorTipoUsuarioTenantUseCase } from './permisos-por-tipo-usuario-tenant.use-case';
import {
  MembresiaNoEncontradaError,
  PermisosPorTipoInvalidosError,
  PermisosPorTipoSinRestriccionError,
} from '../../domain/errors/auth.errors';
import type {
  IMembresiaRepository,
  MembresiaResuelta,
} from '../../domain/ports/i-membresia.repository';
import type { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import type { PermisoTipoTicketFila } from '../../../tickets/domain/ports/i-permiso-tipo-ticket.repository';
import {
  PermisosTipoTicketEnMemoria,
  TipoDePrueba,
} from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';

const CLIENTE = 'cliente-token';
const TIPOS: TipoDePrueba[] = [
  { id: 'tipo-soporte', modulo: 'TICKETS', nombre: 'Soporte' },
  { id: 'tipo-mant', modulo: 'EDILICIA', nombre: 'Mantenimiento' },
  { id: 'tipo-viejo', modulo: 'TICKETS', nombre: 'Antiguo', activo: false },
];

/** Usuarios del cliente con su rol; `root` marca el flag global. */
interface Miembro {
  rol: string;
  root?: boolean;
}

function armar(
  miembros: Record<string, Miembro>,
  filas: PermisoTipoTicketFila[] = [],
): { useCase: PermisosPorTipoUsuarioTenantUseCase; repo: PermisosTipoTicketEnMemoria } {
  const membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'> = {
    async findActivaByUsuarioYCliente(usuarioId, clienteId): Promise<MembresiaResuelta | null> {
      const miembro = clienteId === CLIENTE ? miembros[usuarioId] : undefined;
      if (!miembro) return null;
      return {
        clienteId,
        clienteNombre: 'Cliente',
        rolCodigo: miembro.rol,
        clienteRequiere2fa: false,
      };
    },
  };
  const usuarioRepo: Pick<IUsuarioRepository, 'findById'> = {
    async findById(id) {
      const miembro = miembros[id];
      if (!miembro) return null;
      return UsuarioEntity.create(
        {
          email: `${id}@test.local`,
          nombre: id,
          apellido: 'Test',
          passwordHash: 'hash',
          activo: true,
          isGlobalAdmin: miembro.root === true,
        },
        id,
      );
    },
  };
  const repo = new PermisosTipoTicketEnMemoria(TIPOS, filas);
  return {
    useCase: new PermisosPorTipoUsuarioTenantUseCase(membresiaRepo, usuarioRepo, repo),
    repo,
  };
}

describe('PermisosPorTipoUsuarioTenantUseCase (odd/permisos-por-tipo-ticket, T7, S5)', () => {
  describe('obtener', () => {
    it('da una fila por tipo, dados de baja incluidos, con las acciones del usuario y la plantilla de su rol', async () => {
      const { useCase } = armar({ ana: { rol: 'USUARIO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-soporte', accion: 'ALTAS' },
        { usuarioId: 'ana', tipoId: 'tipo-soporte', accion: 'LECTURA' },
        { usuarioId: 'otro', tipoId: 'tipo-mant', accion: 'LECTURA' },
      ]);

      const result = await useCase.obtener({ clienteId: CLIENTE, usuarioId: 'ana' });

      expect(result.getValue()).toEqual({
        sinRestriccion: false,
        rolCodigo: 'USUARIO',
        tipos: [
          {
            tipoId: 'tipo-viejo',
            nombre: 'Antiguo',
            modulo: 'TICKETS',
            activo: false,
            acciones: [],
            plantilla: ['LECTURA', 'ALTAS', 'COMENTAR', 'IMPRESION'],
          },
          {
            tipoId: 'tipo-mant',
            nombre: 'Mantenimiento',
            modulo: 'EDILICIA',
            activo: true,
            acciones: [],
            // Un tipo de Edilicia suma las celdas de TICKETS; Ver todos sale solo de
            // TICKETS:VER_TODOS, que USUARIO no tiene (L35).
            plantilla: ['LECTURA', 'ALTAS', 'COMENTAR', 'IMPRESION'],
          },
          {
            tipoId: 'tipo-soporte',
            nombre: 'Soporte',
            modulo: 'TICKETS',
            activo: true,
            acciones: ['LECTURA', 'ALTAS'],
            plantilla: ['LECTURA', 'ALTAS', 'COMENTAR', 'IMPRESION'],
          },
        ],
      });
    });

    it('un rol sin plantilla definida devuelve plantilla null, no una fila vacía', async () => {
      const { useCase } = armar({ ana: { rol: 'ROL_SIN_PRESET' } });

      const result = await useCase.obtener({ clienteId: CLIENTE, usuarioId: 'ana' });

      expect(result.getValue().tipos.map((t) => t.plantilla)).toEqual([null, null, null]);
    });

    it('ADMINISTRADOR y ROOT vuelven sin restricción y sin filas editables', async () => {
      const { useCase } = armar({
        jefa: { rol: 'ADMINISTRADOR' },
        raiz: { rol: 'TECNICO', root: true },
      });

      for (const usuarioId of ['jefa', 'raiz']) {
        const result = await useCase.obtener({ clienteId: CLIENTE, usuarioId });
        expect(result.getValue()).toMatchObject({ sinRestriccion: true, tipos: [] });
      }
    });

    it('sin membresía activa en el cliente del token: 404', async () => {
      const { useCase } = armar({ ana: { rol: 'USUARIO' } });

      const result = await useCase.obtener({ clienteId: 'otro-cliente', usuarioId: 'ana' });

      expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    });
  });

  describe('reemplazar', () => {
    it('reemplaza todas las filas: un tipo ausente del pedido queda sin acciones', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'TECNICO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-soporte', accion: 'LECTURA' },
        { usuarioId: 'ana', tipoId: 'tipo-mant', accion: 'LECTURA' },
      ]);

      const result = await useCase.reemplazar({
        clienteId: CLIENTE,
        usuarioId: 'ana',
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['MODIFICACION', 'LECTURA', 'VER_TODOS'] }],
      });

      expect(repo.filasDe('ana')).toEqual([
        'tipo-soporte:LECTURA',
        'tipo-soporte:MODIFICACION',
        'tipo-soporte:VER_TODOS',
      ]);
      const soporte = result.getValue().tipos.find((t) => t.tipoId === 'tipo-soporte');
      expect(soporte?.acciones).toEqual(['LECTURA', 'VER_TODOS', 'MODIFICACION']);
    });

    it('concede Borrar con Ver en un tipo y no en otro (S2, S8)', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'TECNICO' } }, []);

      const result = await useCase.reemplazar({
        clienteId: CLIENTE,
        usuarioId: 'ana',
        tipos: [
          { tipoId: 'tipo-soporte', acciones: ['LECTURA', 'BORRADO'] },
          { tipoId: 'tipo-mant', acciones: ['LECTURA'] },
        ],
      });

      expect(repo.filasDe('ana')).toEqual([
        'tipo-mant:LECTURA',
        'tipo-soporte:BORRADO',
        'tipo-soporte:LECTURA',
      ]);
      const soporte = result.getValue().tipos.find((t) => t.tipoId === 'tipo-soporte');
      expect(soporte?.acciones).toEqual(['LECTURA', 'BORRADO']);
    });

    it('acepta una fila vacía y un tipo dado de baja', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'TECNICO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-soporte', accion: 'LECTURA' },
      ]);

      const result = await useCase.reemplazar({
        clienteId: CLIENTE,
        usuarioId: 'ana',
        tipos: [
          { tipoId: 'tipo-soporte', acciones: [] },
          { tipoId: 'tipo-viejo', acciones: ['LECTURA'] },
        ],
      });

      expect(result.isOk()).toBe(true);
      expect(repo.filasDe('ana')).toEqual(['tipo-viejo:LECTURA']);
    });

    /** Cada caso inválido: 422 con el mensaje exacto y las filas sin tocar. */
    it.each([
      {
        caso: 'una acción sin Ver (S3)',
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['ALTAS', 'MODIFICACION'] }],
        mensaje:
          'Sin Ver no se puede conceder ninguna otra acción en el tipo «Soporte» (se pidió ALTAS, MODIFICACION).',
      },
      {
        caso: 'Ver todos sin Ver',
        tipos: [{ tipoId: 'tipo-mant', acciones: ['VER_TODOS'] }],
        mensaje:
          'Sin Ver no se puede conceder ninguna otra acción en el tipo «Mantenimiento» (se pidió VER_TODOS).',
      },
      {
        caso: 'Borrar sin Ver (S3, S8)',
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['BORRADO'] }],
        mensaje:
          'Sin Ver no se puede conceder ninguna otra acción en el tipo «Soporte» (se pidió BORRADO).',
      },
      {
        caso: 'una acción fuera del vocabulario',
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['LECTURA', 'APROBACION'] }],
        mensaje: 'Acción desconocida en el tipo «Soporte»: APROBACION.',
      },
      {
        caso: 'un tipo que no existe en el tenant',
        tipos: [{ tipoId: 'tipo-de-otro-tenant', acciones: ['LECTURA'] }],
        mensaje: 'El tipo de ticket tipo-de-otro-tenant no existe.',
      },
      {
        caso: 'un tipo repetido',
        tipos: [
          { tipoId: 'tipo-soporte', acciones: ['LECTURA'] },
          { tipoId: 'tipo-soporte', acciones: [] },
        ],
        mensaje: 'El tipo de ticket «Soporte» aparece más de una vez.',
      },
    ])('rechaza $caso con 422 y no toca las filas', async ({ tipos, mensaje }) => {
      const { useCase, repo } = armar({ ana: { rol: 'TECNICO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-mant', accion: 'LECTURA' },
      ]);

      const result = await useCase.reemplazar({ clienteId: CLIENTE, usuarioId: 'ana', tipos });

      expect(result.getError()).toBeInstanceOf(PermisosPorTipoInvalidosError);
      expect(result.getError().message).toBe(mensaje);
      expect(repo.filasDe('ana')).toEqual(['tipo-mant:LECTURA']);
    });

    it('un destino ADMINISTRADOR o ROOT: 422 sin escribir filas', async () => {
      const { useCase, repo } = armar({
        jefa: { rol: 'ADMINISTRADOR' },
        raiz: { rol: 'USUARIO', root: true },
      });

      for (const usuarioId of ['jefa', 'raiz']) {
        const result = await useCase.reemplazar({
          clienteId: CLIENTE,
          usuarioId,
          tipos: [{ tipoId: 'tipo-soporte', acciones: ['LECTURA'] }],
        });
        expect(result.getError()).toBeInstanceOf(PermisosPorTipoSinRestriccionError);
        expect(result.getError().message).toBe(
          'El usuario es administrador: opera todos los tipos de ticket y sus permisos por tipo no se editan.',
        );
        expect(repo.filasDe(usuarioId)).toEqual([]);
      }
    });

    it('sin membresía activa: 404 sin escribir filas', async () => {
      const { useCase, repo } = armar({});

      const result = await useCase.reemplazar({
        clienteId: CLIENTE,
        usuarioId: 'nadie',
        tipos: [{ tipoId: 'tipo-soporte', acciones: ['LECTURA'] }],
      });

      expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(repo.filasDe('nadie')).toEqual([]);
    });
  });

  describe('copiarDe', () => {
    it('reemplaza las filas del destino por las del origen y no toca al origen', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'USUARIO' }, beto: { rol: 'TECNICO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-mant', accion: 'LECTURA' },
        { usuarioId: 'beto', tipoId: 'tipo-soporte', accion: 'LECTURA' },
        { usuarioId: 'beto', tipoId: 'tipo-soporte', accion: 'ASIGNAR' },
      ]);

      const result = await useCase.copiarDe({
        clienteId: CLIENTE,
        usuarioId: 'ana',
        origenId: 'beto',
      });

      expect(repo.filasDe('ana')).toEqual(['tipo-soporte:ASIGNAR', 'tipo-soporte:LECTURA']);
      expect(repo.filasDe('beto')).toEqual(['tipo-soporte:ASIGNAR', 'tipo-soporte:LECTURA']);
      // La plantilla sigue siendo la del rol del destino.
      expect(result.getValue().rolCodigo).toBe('USUARIO');
    });

    it('copia Borrar junto con Ver (S8)', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'USUARIO' }, beto: { rol: 'TECNICO' } }, [
        { usuarioId: 'beto', tipoId: 'tipo-soporte', accion: 'LECTURA' },
        { usuarioId: 'beto', tipoId: 'tipo-soporte', accion: 'BORRADO' },
      ]);

      await useCase.copiarDe({ clienteId: CLIENTE, usuarioId: 'ana', origenId: 'beto' });

      expect(repo.filasDe('ana')).toEqual(['tipo-soporte:BORRADO', 'tipo-soporte:LECTURA']);
    });

    it('un origen sin filas deja al destino sin filas', async () => {
      const { useCase, repo } = armar({ ana: { rol: 'USUARIO' }, beto: { rol: 'TECNICO' } }, [
        { usuarioId: 'ana', tipoId: 'tipo-mant', accion: 'LECTURA' },
      ]);

      await useCase.copiarDe({ clienteId: CLIENTE, usuarioId: 'ana', origenId: 'beto' });

      expect(repo.filasDe('ana')).toEqual([]);
    });

    it.each([
      {
        caso: 'el mismo usuario',
        origenId: 'ana',
        error: PermisosPorTipoInvalidosError,
        mensaje: 'No se pueden copiar los permisos de un usuario sobre sí mismo.',
      },
      {
        caso: 'un origen ADMINISTRADOR',
        origenId: 'jefa',
        error: PermisosPorTipoSinRestriccionError,
        mensaje: 'El usuario de origen es administrador: no tiene permisos por tipo para copiar.',
      },
      {
        caso: 'un origen ROOT',
        origenId: 'raiz',
        error: PermisosPorTipoSinRestriccionError,
        mensaje: 'El usuario de origen es administrador: no tiene permisos por tipo para copiar.',
      },
      {
        caso: 'un origen sin membresía en el cliente',
        origenId: 'ajeno',
        error: MembresiaNoEncontradaError,
        mensaje: new MembresiaNoEncontradaError().message,
      },
    ])('rechaza $caso sin tocar las filas del destino', async ({ origenId, error, mensaje }) => {
      const { useCase, repo } = armar(
        {
          ana: { rol: 'USUARIO' },
          jefa: { rol: 'ADMINISTRADOR' },
          raiz: { rol: 'USUARIO', root: true },
        },
        [{ usuarioId: 'ana', tipoId: 'tipo-mant', accion: 'LECTURA' }],
      );

      const result = await useCase.copiarDe({ clienteId: CLIENTE, usuarioId: 'ana', origenId });

      expect(result.getError()).toBeInstanceOf(error);
      expect(result.getError().message).toBe(mensaje);
      expect(repo.filasDe('ana')).toEqual(['tipo-mant:LECTURA']);
    });

    /**
     * W2 (judgment-day de la etapa 1): la copia valida las filas que resultarían con la misma regla
     * que el PUT. Un origen puede tener filas que el PUT rechazaría (el backfill deja filas sin Ver,
     * L34): copiarlas propagaría un estado inválido.
     */
    it.each([
      {
        caso: 'una fila sin Ver (S3)',
        filasOrigen: [{ tipoId: 'tipo-mant', accion: 'COMENTAR' }],
        mensaje:
          'Sin Ver no se puede conceder ninguna otra acción en el tipo «Mantenimiento» (se pidió COMENTAR).',
      },
      {
        caso: 'Borrar sin Ver (S3, S8)',
        filasOrigen: [{ tipoId: 'tipo-soporte', accion: 'BORRADO' }],
        mensaje:
          'Sin Ver no se puede conceder ninguna otra acción en el tipo «Soporte» (se pidió BORRADO).',
      },
    ] as const)(
      'W2: un origen con $caso se rechaza con el 422 del PUT, sin tocar al destino',
      async ({ filasOrigen, mensaje }) => {
        const { useCase, repo } = armar({ ana: { rol: 'USUARIO' }, beto: { rol: 'TECNICO' } }, [
          { usuarioId: 'ana', tipoId: 'tipo-viejo', accion: 'LECTURA' },
          { usuarioId: 'beto', tipoId: 'tipo-viejo', accion: 'LECTURA' },
          ...filasOrigen.map((fila) => ({ usuarioId: 'beto', ...fila })),
        ]);

        const result = await useCase.copiarDe({
          clienteId: CLIENTE,
          usuarioId: 'ana',
          origenId: 'beto',
        });

        expect(result.getError()).toBeInstanceOf(PermisosPorTipoInvalidosError);
        expect(result.getError().message).toBe(mensaje);
        expect(repo.filasDe('ana')).toEqual(['tipo-viejo:LECTURA']);
      },
    );

    it('un destino ADMINISTRADOR: 422', async () => {
      const { useCase } = armar({ jefa: { rol: 'ADMINISTRADOR' }, beto: { rol: 'TECNICO' } });

      const result = await useCase.copiarDe({
        clienteId: CLIENTE,
        usuarioId: 'jefa',
        origenId: 'beto',
      });

      expect(result.getError()).toBeInstanceOf(PermisosPorTipoSinRestriccionError);
    });
  });
});
