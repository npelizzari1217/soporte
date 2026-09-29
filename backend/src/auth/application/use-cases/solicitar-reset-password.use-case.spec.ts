/**
 * WU-5 TEST — Unit tests de SolicitarResetPasswordUseCase.
 *
 * Tabla de ramas (Requirements "La solicitud de reset devuelve una respuesta
 * uniforme", "El token es opaco y solo su hash se persiste", "Emitir un
 * token nuevo revoca los vigentes del usuario", "El link de reset se
 * construye solo desde APP_BASE_URL", "Ningún log contiene el plaintext ni
 * el token crudo"): inexistente, inactivo, 0 membresías, 2+ membresías,
 * `SIN_CORREO`, `CLIENTE_NO_DISPONIBLE`, `LISTO`. En toda rama sin mail, ni
 * `tokenRepo.save` ni `correoDeCliente.enviar` se llaman.
 */
import type { Mocked } from 'vitest';
import * as crypto from 'crypto';
import { SolicitarResetPasswordUseCase } from './solicitar-reset-password.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IPasswordResetTokenRepository } from '../../domain/ports/i-password-reset-token.repository';
import { ICorreoDeCliente } from '../../domain/ports/i-correo-de-cliente.port';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { unstubbed } from '../../../testing/mocks';

const EMAIL = 'usuario@test.com';
const CLIENTE_ID = 'cliente-uuid';
const APP_BASE_URL = 'https://soporte.sesitec.net';

const makeUsuario = (activo = true): UsuarioEntity =>
  UsuarioEntity.create({
    email: EMAIL,
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'hash-existente',
    activo,
  });

/**
 * [S1] `activo=true` pero soft-deleted (`deletedAt` seteado): `suspend()`
 * siempre pone los dos juntos, así que hace falta `reconstitute()` para
 * armar la combinación que el guard `isDeleted()` cubre de forma defensiva.
 */
const makeUsuarioSoftDeletedActivo = (): UsuarioEntity =>
  UsuarioEntity.reconstitute(
    {
      email: EMAIL,
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash-existente',
      activo: true,
    },
    'usuario-soft-deleted-uuid',
    new Date(),
    new Date(),
    new Date(),
  );

const makeMembresia = (clienteId = CLIENTE_ID): MembresiaResuelta => ({
  clienteId,
  clienteNombre: 'Cliente Test',
  rolCodigo: 'ADMINISTRADOR',
});

const makeUsuarioRepo = (): Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: unstubbed('findById'),
  save: unstubbed('save'),
  create: unstubbed('create'),
});

const makeMembresiaRepo = (): Mocked<IMembresiaRepository> => ({
  findActivasByUsuario: vi.fn(),
  findActivaByUsuarioYCliente: unstubbed('findActivaByUsuarioYCliente'),
  findActivasByCliente: unstubbed('findActivasByCliente'),
  findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
  create: unstubbed('create'),
  save: unstubbed('save'),
});

const makeTokenRepo = (): Mocked<IPasswordResetTokenRepository> => ({
  revocarVigentesDeUsuario: vi.fn().mockResolvedValue(0),
  save: vi.fn().mockResolvedValue(undefined),
  findByHash: unstubbed('findByHash'),
  consumirSiVigente: unstubbed('consumirSiVigente'),
});

const makeCorreoDeCliente = (): Mocked<ICorreoDeCliente> => ({
  estado: vi.fn(),
  enviar: vi.fn().mockResolvedValue(undefined),
});

const makeLogger = (): Mocked<ILogger> => ({ log: vi.fn(), error: vi.fn() });

describe('SolicitarResetPasswordUseCase', () => {
  let usuarioRepo: Mocked<IUsuarioRepository>;
  let membresiaRepo: Mocked<IMembresiaRepository>;
  let tokenRepo: Mocked<IPasswordResetTokenRepository>;
  let correoDeCliente: Mocked<ICorreoDeCliente>;
  let logger: Mocked<ILogger>;
  let useCase: SolicitarResetPasswordUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    membresiaRepo = makeMembresiaRepo();
    tokenRepo = makeTokenRepo();
    correoDeCliente = makeCorreoDeCliente();
    logger = makeLogger();
    useCase = new SolicitarResetPasswordUseCase(
      usuarioRepo,
      membresiaRepo,
      tokenRepo,
      correoDeCliente,
      logger,
      APP_BASE_URL,
    );
  });

  it('cuenta inexistente: loguea CUENTA_INEXISTENTE, no consulta membresías ni correo', async () => {
    usuarioRepo.findByEmail.mockResolvedValue(null);

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      'RESET_PASSWORD_SOLICITUD | resultado=CUENTA_INEXISTENTE',
    );
    expect(membresiaRepo.findActivasByUsuario).not.toHaveBeenCalled();
    expect(correoDeCliente.estado).not.toHaveBeenCalled();
    expect(correoDeCliente.enviar).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('cuenta inactiva: loguea CUENTA_NO_DISPONIBLE con usuarioId, no consulta membresías', async () => {
    const usuario = makeUsuario(false);
    usuarioRepo.findByEmail.mockResolvedValue(usuario);

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=CUENTA_NO_DISPONIBLE | usuarioId=${usuario.id}`,
    );
    expect(membresiaRepo.findActivasByUsuario).not.toHaveBeenCalled();
    expect(correoDeCliente.enviar).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('[S1: abuso: activo=true con deletedAt] cuenta activa pero soft-deleted: loguea CUENTA_NO_DISPONIBLE, no consulta membresías', async () => {
    const usuario = makeUsuarioSoftDeletedActivo();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=CUENTA_NO_DISPONIBLE | usuarioId=${usuario.id}`,
    );
    expect(membresiaRepo.findActivasByUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('0 membresías: loguea MEMBRESIAS_0 con usuarioId, no consulta el correo', async () => {
    const usuario = makeUsuario();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);
    membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=MEMBRESIAS_0 | usuarioId=${usuario.id}`,
    );
    expect(correoDeCliente.estado).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('2+ membresías: loguea MEMBRESIAS_N con usuarioId, no consulta el correo', async () => {
    const usuario = makeUsuario();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);
    membresiaRepo.findActivasByUsuario.mockResolvedValue([
      makeMembresia('cliente-1'),
      makeMembresia('cliente-2'),
    ]);

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=MEMBRESIAS_N | usuarioId=${usuario.id}`,
    );
    expect(correoDeCliente.estado).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('cliente sin correo: loguea CLIENTE_SIN_CORREO, no revoca ni emite token', async () => {
    const usuario = makeUsuario();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);
    membresiaRepo.findActivasByUsuario.mockResolvedValue([makeMembresia()]);
    correoDeCliente.estado.mockResolvedValue('SIN_CORREO');

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=CLIENTE_SIN_CORREO | usuarioId=${usuario.id} | clienteId=${CLIENTE_ID}`,
    );
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(correoDeCliente.enviar).not.toHaveBeenCalled();
  });

  it('cliente no disponible al resolver el correo: loguea CLIENTE_NO_DISPONIBLE, no emite token', async () => {
    const usuario = makeUsuario();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);
    membresiaRepo.findActivasByUsuario.mockResolvedValue([makeMembresia()]);
    correoDeCliente.estado.mockResolvedValue('CLIENTE_NO_DISPONIBLE');

    await useCase.ejecutar(EMAIL);

    expect(logger.log).toHaveBeenCalledWith(
      `RESET_PASSWORD_SOLICITUD | resultado=CLIENTE_NO_DISPONIBLE | usuarioId=${usuario.id} | clienteId=${CLIENTE_ID}`,
    );
    expect(correoDeCliente.enviar).not.toHaveBeenCalled();
    expect(tokenRepo.revocarVigentesDeUsuario).not.toHaveBeenCalled();
    expect(tokenRepo.save).not.toHaveBeenCalled();
  });

  it('cliente LISTO: revoca vigentes, persiste solo el hash, envía el mail y loguea MAIL_DESPACHADO — sin token/email en ningún log', async () => {
    const usuario = makeUsuario();
    usuarioRepo.findByEmail.mockResolvedValue(usuario);
    membresiaRepo.findActivasByUsuario.mockResolvedValue([makeMembresia()]);
    correoDeCliente.estado.mockResolvedValue('LISTO');

    await useCase.ejecutar(EMAIL);

    expect(tokenRepo.revocarVigentesDeUsuario).toHaveBeenCalledWith(usuario.id);
    expect(tokenRepo.save).toHaveBeenCalledTimes(1);
    const tokenGuardado = tokenRepo.save.mock.calls[0][0];
    expect(tokenGuardado.usuarioId).toBe(usuario.id);
    expect(tokenGuardado.clienteId).toBe(CLIENTE_ID);
    expect(tokenGuardado.usedAt).toBeNull();
    expect(tokenGuardado.revokedAt).toBeNull();

    expect(correoDeCliente.enviar).toHaveBeenCalledTimes(1);
    const [clienteIdEnviado, msg] = correoDeCliente.enviar.mock.calls[0] as [string, EmailMessage];
    expect(clienteIdEnviado).toBe(CLIENTE_ID);
    expect(msg.to).toBe(EMAIL);
    expect(msg.html).toContain(APP_BASE_URL);

    // El hash persistido corresponde al token crudo que viajó en el link.
    const tokenCrudo = /token=([0-9a-f]+)/.exec(msg.html ?? '')?.[1] as string;
    expect(tokenCrudo).toBeDefined();
    expect(tokenGuardado.tokenHash).toBe(
      crypto.createHash('sha256').update(tokenCrudo).digest('hex'),
    );

    // Abuso: ninguna llamada a logger.log/logger.error contiene el token crudo ni el email.
    const lineasLogueadas = [...logger.log.mock.calls, ...logger.error.mock.calls].map((args) =>
      String(args[0]),
    );
    expect(lineasLogueadas.some((l) => l.includes('MAIL_DESPACHADO'))).toBe(true);
    for (const linea of lineasLogueadas) {
      expect(linea).not.toContain(tokenCrudo);
      expect(linea).not.toContain(EMAIL);
    }
  });

  it('si un repositorio lanza, no propaga y el log de error no lleva el mensaje (puede traer el email)', async () => {
    usuarioRepo.findByEmail.mockRejectedValue(new Error(`fallo buscando ${EMAIL}`));

    await expect(useCase.ejecutar(EMAIL)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('RESET_PASSWORD_SOLICITUD_ERROR | error=Error');
    for (const [linea] of logger.error.mock.calls) {
      expect(linea).not.toContain(EMAIL);
    }
    expect(correoDeCliente.enviar).not.toHaveBeenCalled();
  });
});
