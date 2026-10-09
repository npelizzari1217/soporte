/**
 * EvaluarSegundoPasoService — ramas del paso 3b del login (sdd/login-sso ADR-6; L1, D3, SL11).
 * Todos los puertos son mocks completos: un metodo que la rama no debe usar falla si se llama.
 */
import type { Mocked } from 'vitest';
import { EvaluarSegundoPasoService } from './evaluar-segundo-paso.service';
import { UsuarioEntity } from '../domain/entities/usuario.entity';
import { EstadoTfa, ITfaRepository } from '../domain/ports/tfa-repository.port';
import { IDesafioLoginRepository } from '../domain/ports/desafio-login-repository.port';
import { IDispositivoConfiableRepository } from '../domain/ports/dispositivo-confiable-repository.port';
import { MembresiaResuelta } from '../domain/ports/i-membresia.repository';
import { DISPOSITIVO_CONFIABLE_DURACION_MS } from '../domain/tfa/tfa.constants';
import { hashTokenDispositivo } from './tfa/token-dispositivo';
import { unstubbed } from '../../testing/mocks';

const makeUsuario = (isGlobalAdmin = false): UsuarioEntity =>
  UsuarioEntity.create({
    email: 'user@test.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'stored_hash',
    activo: true,
    isGlobalAdmin,
  });

const makeMembresia = (clienteRequiere2fa = false): MembresiaResuelta => ({
  clienteId: 'cliente-1',
  clienteNombre: 'Acme SA',
  rolCodigo: 'TECNICO',
  clienteRequiere2fa,
});

const estadoActivo: EstadoTfa = {
  secretoCifrado: 'secreto-cifrado',
  confirmadoAt: new Date('2026-01-01T00:00:00Z'),
  ultimoPaso: 0,
  secretoPendienteCifrado: null,
  pendienteCreadoAt: null,
};

const makeTfaRepo = (): Mocked<ITfaRepository> => ({
  obtener: vi.fn().mockResolvedValue(null),
  guardarPendiente: unstubbed('guardarPendiente'),
  promoverPendiente: unstubbed('promoverPendiente'),
  registrarPaso: unstubbed('registrarPaso'),
  reemplazarCodigos: unstubbed('reemplazarCodigos'),
  obtenerCodigosDisponibles: unstubbed('obtenerCodigosDisponibles'),
  consumirCodigo: unstubbed('consumirCodigo'),
  contarCodigosRestantes: unstubbed('contarCodigosRestantes'),
  eliminarTodo: unstubbed('eliminarTodo'),
});

const makeDesafios = (): Mocked<IDesafioLoginRepository> => ({
  crear: vi.fn((_u: string, proposito: string) => Promise.resolve(`desafio-${proposito}`)),
  buscarSinVerificar: unstubbed('buscarSinVerificar'),
  verificar: unstubbed('verificar'),
  buscarTicket: unstubbed('buscarTicket'),
  consumir: unstubbed('consumir'),
});

const makeDispositivos = (): Mocked<IDispositivoConfiableRepository> => ({
  crear: unstubbed('crear'),
  esValido: unstubbed('esValido'),
  renovar: vi.fn().mockResolvedValue(false),
  revocarTodosDe: unstubbed('revocarTodosDe'),
});

describe('EvaluarSegundoPasoService', () => {
  let tfaRepo: Mocked<ITfaRepository>;
  let desafios: Mocked<IDesafioLoginRepository>;
  let dispositivos: Mocked<IDispositivoConfiableRepository>;
  let service: EvaluarSegundoPasoService;

  beforeEach(() => {
    tfaRepo = makeTfaRepo();
    desafios = makeDesafios();
    dispositivos = makeDispositivos();
    service = new EvaluarSegundoPasoService(tfaRepo, desafios, dispositivos);
  });

  it('obligado sin 2FA activo -> needsEnrolamiento2fa con desafio ENROLAR (L3)', async () => {
    const usuario = makeUsuario(true);

    const r = await service.evaluar(usuario, []);

    expect(r).toEqual({ kind: 'needsEnrolamiento2fa', desafio: 'desafio-ENROLAR' });
    expect(desafios.crear).toHaveBeenCalledWith(usuario.id, 'ENROLAR');
  });

  it('cliente que exige 2FA y usuario sin 2FA -> needsEnrolamiento2fa', async () => {
    const r = await service.evaluar(makeUsuario(), [makeMembresia(true)]);

    expect(r.kind).toBe('needsEnrolamiento2fa');
  });

  it('con 2FA y sin dispositivo -> needs2fa con desafio VERIFICAR (L4)', async () => {
    tfaRepo.obtener.mockResolvedValue(estadoActivo);
    const usuario = makeUsuario();

    const r = await service.evaluar(usuario, [makeMembresia()]);

    expect(r).toEqual({ kind: 'needs2fa', desafio: 'desafio-VERIFICAR' });
    expect(desafios.crear).toHaveBeenCalledWith(usuario.id, 'VERIFICAR');
    expect(dispositivos.renovar).not.toHaveBeenCalled();
  });

  it('con 2FA y dispositivo no renovable -> needs2fa', async () => {
    tfaRepo.obtener.mockResolvedValue(estadoActivo);

    const r = await service.evaluar(makeUsuario(), [makeMembresia()], 'td-vencido');

    expect(r).toEqual({ kind: 'needs2fa', desafio: 'desafio-VERIFICAR' });
  });

  it('con 2FA y dispositivo valido -> continuar renovado por la duracion configurada (D3)', async () => {
    tfaRepo.obtener.mockResolvedValue(estadoActivo);
    dispositivos.renovar.mockResolvedValue(true);
    const usuario = makeUsuario();

    const r = await service.evaluar(usuario, [makeMembresia()], 'td-valido');

    expect(r).toEqual({ kind: 'continuar', dispositivoRenovado: 'td-valido' });
    expect(desafios.crear).not.toHaveBeenCalled();
    const [usuarioId, hash, nuevaExpiraAt, ahora] = dispositivos.renovar.mock.calls[0];
    expect(usuarioId).toBe(usuario.id);
    expect(hash).toBe(hashTokenDispositivo('td-valido'));
    expect(nuevaExpiraAt.getTime() - ahora.getTime()).toBe(DISPOSITIVO_CONFIABLE_DURACION_MS);
  });

  it('ROOT con 2FA: el dispositivo se ignora y ni siquiera se consulta (D4)', async () => {
    tfaRepo.obtener.mockResolvedValue(estadoActivo);

    const r = await service.evaluar(makeUsuario(true), [], 'td-valido');

    expect(r).toEqual({ kind: 'needs2fa', desafio: 'desafio-VERIFICAR' });
    expect(dispositivos.renovar).not.toHaveBeenCalled();
  });

  it('no obligado y sin 2FA -> continuar sin dispositivoRenovado', async () => {
    const r = await service.evaluar(makeUsuario(), [makeMembresia()], 'td-ignorado');

    expect(r).toEqual({ kind: 'continuar' });
    expect(r).not.toHaveProperty('dispositivoRenovado');
    expect(desafios.crear).not.toHaveBeenCalled();
    expect(dispositivos.renovar).not.toHaveBeenCalled();
  });
});
