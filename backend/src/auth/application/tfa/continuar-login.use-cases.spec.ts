import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { SinMembresiaActivaError } from '../../domain/errors/auth.errors';
import { SegundoPasoRechazadoError } from '../../domain/errors/tfa.errors';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { EmitirSesionService } from '../emitir-sesion.service';
import { ContinuarLoginUseCase, SeleccionarClienteLoginUseCase } from './continuar-login.use-cases';

const membresia = (clienteId: string) => ({
  clienteId,
  clienteNombre: `Cliente ${clienteId}`,
  rolCodigo: 'TECNICO',
});
const usuario = (isGlobalAdmin = false) =>
  UsuarioEntity.create({
    email: 'u@test.local',
    nombre: 'U',
    apellido: 'T',
    passwordHash: 'x',
    activo: true,
    isGlobalAdmin,
  });

describe('continuar y seleccionar el cliente del login', () => {
  const desafios = { buscarTicket: vi.fn(), consumir: vi.fn() };
  const usuarioRepo = { findById: vi.fn() };
  const membresiaRepo = { findActivasByUsuario: vi.fn(), findActivaByUsuarioYCliente: vi.fn() };
  const emitir = { emitir: vi.fn() };
  const args = [
    desafios as unknown as IDesafioLoginRepository,
    usuarioRepo as unknown as IUsuarioRepository,
    membresiaRepo as unknown as IMembresiaRepository,
    emitir as unknown as EmitirSesionService,
  ] as const;
  const sesion = { accessToken: 'a', refreshToken: 'r' };
  let u: UsuarioEntity;

  beforeEach(() => {
    vi.resetAllMocks();
    u = usuario();
    desafios.buscarTicket.mockResolvedValue({ usuarioId: u.id });
    desafios.consumir.mockResolvedValue(true);
    usuarioRepo.findById.mockResolvedValue(u);
    emitir.emitir.mockResolvedValue(Result.ok(sesion));
  });

  describe('ContinuarLoginUseCase', () => {
    const uc = () => new ContinuarLoginUseCase(...args);

    it('un ticket desconocido o un ENROLAR sin verificar se rechaza sin consumir ni emitir (L5)', async () => {
      desafios.buscarTicket.mockResolvedValue(null);
      const r = await uc().execute('t');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(desafios.consumir).not.toHaveBeenCalled();
      expect(emitir.emitir).not.toHaveBeenCalled();
    });

    it('con una membresia consume el ticket y emite la sesion de ese cliente (L2)', async () => {
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia('c1')]);
      const r = await uc().execute('t');
      expect(r.getValue()).toEqual({ kind: 'tokens', ...sesion });
      expect(desafios.consumir).toHaveBeenCalledWith('t', u.id);
      expect(emitir.emitir).toHaveBeenCalledWith(u, [membresia('c1')], 'c1');
    });

    it('un ROOT recibe sesion MASTER (cliente null)', async () => {
      const root = usuario(true);
      desafios.buscarTicket.mockResolvedValue({ usuarioId: root.id });
      usuarioRepo.findById.mockResolvedValue(root);
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);
      await uc().execute('t');
      expect(emitir.emitir).toHaveBeenCalledWith(root, [], null);
    });

    it('con mas de una membresia devuelve el selector y el mismo ticket sin consumirlo (L7)', async () => {
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia('c1'), membresia('c2')]);
      const r = await uc().execute('t');
      expect(r.getValue()).toEqual({
        kind: 'selection',
        ticket: 't',
        membresias: [
          { cliente_id: 'c1', nombre: 'Cliente c1', rol: 'TECNICO' },
          { cliente_id: 'c2', nombre: 'Cliente c2', rol: 'TECNICO' },
        ],
      });
      expect(desafios.consumir).not.toHaveBeenCalled();
      expect(emitir.emitir).not.toHaveBeenCalled();
    });

    it('sin membresias activas falla sin consumir', async () => {
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);
      const r = await uc().execute('t');
      expect(r.getError()).toBeInstanceOf(SinMembresiaActivaError);
      expect(desafios.consumir).not.toHaveBeenCalled();
    });

    it('si pierde la carrera del consumo no emite sesion', async () => {
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia('c1')]);
      desafios.consumir.mockResolvedValue(false);
      const r = await uc().execute('t');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(emitir.emitir).not.toHaveBeenCalled();
    });

    it('un usuario inactivo se rechaza', async () => {
      usuarioRepo.findById.mockResolvedValue(null);
      expect((await uc().execute('t')).getError()).toBeInstanceOf(SegundoPasoRechazadoError);
    });
  });

  describe('SeleccionarClienteLoginUseCase', () => {
    const uc = () => new SeleccionarClienteLoginUseCase(...args);

    it('con membresia activa consume el ticket y emite; no recibe contrasena ni codigo (L7)', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia('c2'));
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia('c1'), membresia('c2')]);
      const r = await uc().execute('t', 'c2');
      expect(r.getValue()).toEqual(sesion);
      expect(emitir.emitir).toHaveBeenCalledWith(u, [membresia('c1'), membresia('c2')], 'c2');
      expect(uc().execute.length).toBe(2);
    });

    it('membresia inexistente o inactiva rechaza igual que un ticket invalido y no consume', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);
      const r = await uc().execute('t', 'ajeno');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(desafios.consumir).not.toHaveBeenCalled();
      desafios.buscarTicket.mockResolvedValue(null);
      const invalido = await uc().execute('t', 'c2');
      expect(invalido.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(invalido.getError().message).toBe(r.getError().message);
    });

    it('un ticket ya consumido no emite', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia('c2'));
      desafios.consumir.mockResolvedValue(false);
      const r = await uc().execute('t', 'c2');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(emitir.emitir).not.toHaveBeenCalled();
    });
  });
});
