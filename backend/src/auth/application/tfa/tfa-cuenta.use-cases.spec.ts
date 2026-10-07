import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher.port';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import {
  CodigoRecuperacionDisponible,
  EstadoTfa,
  ITfaRepository,
} from '../../domain/ports/tfa-repository.port';
import { ITotpService } from '../../domain/ports/totp-service.port';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { ConfirmadorSecretoPendiente } from './confirmador-secreto-pendiente';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';
import {
  ConfirmarSecretoTfa,
  IniciarSecretoTfa,
  ObtenerEstadoTfa,
  RegenerarCodigosTfa,
} from './tfa-cuenta.use-cases';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const U = 'u1';
/** Cada secreto S{n} acepta el codigo de 6 digitos {n}{n}{n}{n}{n}{n}. */
const codigoDe = (secreto: string): string => secreto.slice(1).repeat(6);

class RepoEnMemoria implements ITfaRepository {
  estado: EstadoTfa | null = null;
  codigos: CodigoRecuperacionDisponible[] = [];
  async obtener(): Promise<EstadoTfa | null> {
    return this.estado;
  }
  async guardarPendiente(_u: string, pendiente: string): Promise<void> {
    this.estado = { ...(this.estado ?? VACIO), secretoPendienteCifrado: pendiente };
  }
  async promoverPendiente(_u: string, leido: string, paso: number): Promise<boolean> {
    if (this.estado?.secretoPendienteCifrado !== leido) return false;
    this.estado = { ...VACIO, secretoCifrado: leido, confirmadoAt: new Date(), ultimoPaso: paso };
    return true;
  }
  async registrarPaso(): Promise<boolean> {
    return true;
  }
  async reemplazarCodigos(_u: string, hashes: string[]): Promise<void> {
    this.codigos = hashes.map((codigoHash, i) => ({ id: `c${i}`, codigoHash }));
  }
  async obtenerCodigosDisponibles(): Promise<CodigoRecuperacionDisponible[]> {
    return this.codigos;
  }
  async consumirCodigo(id: string): Promise<boolean> {
    this.codigos = this.codigos.filter((c) => c.id !== id);
    return true;
  }
  async contarCodigosRestantes(): Promise<number> {
    return this.codigos.length;
  }
  async eliminarTodo(): Promise<void> {}
}
const VACIO: EstadoTfa = {
  secretoCifrado: null,
  confirmadoAt: null,
  ultimoPaso: 0,
  secretoPendienteCifrado: null,
  pendienteCreadoAt: null,
};

describe('use cases de autogestion de 2FA', () => {
  let repo: RepoEnMemoria;
  let disponible: boolean;
  let secretoNuevo: string;
  let ROOT: boolean;
  let obtener: ObtenerEstadoTfa;
  let iniciar: IniciarSecretoTfa;
  let confirmar: ConfirmarSecretoTfa;
  let confirmador: ConfirmadorSecretoPendiente;
  let regenerar: RegenerarCodigosTfa;

  const cipher: ISecretCipher = {
    encrypt: (plano, aad) => `${aad}|${plano}`,
    decrypt: (payload) => payload.split('|')[1] ?? '',
    isAvailable: () => disponible,
  };
  const totp: ITotpService = {
    generarSecreto: () => secretoNuevo,
    uri: (secreto, email) => `otpauth://${email}?secret=${secreto}`,
    verificar: (secreto, codigo) => (codigo === codigoDe(secreto) ? 7 : null),
  };
  const hash: IHashProvider = {
    hash: async (p) => `h:${p}`,
    verify: async (p, h) => h === `h:${p}`,
  };
  const limitador: ILimitadorIntentos = {
    reservar: async () => ({ clave: `cod:${U}`, ventanaInicio: new Date(0) }),
    liberar: async () => undefined,
    devolver: async () => undefined,
  };
  const usuarios: Pick<IUsuarioRepository, 'findById'> = {
    findById: async () =>
      UsuarioEntity.create({
        email: 'ana@test.local',
        nombre: 'Ana',
        apellido: 'T',
        passwordHash: 'x',
        activo: true,
        isGlobalAdmin: ROOT,
      }),
  };

  const activar = async (secreto: string): Promise<void> => {
    secretoNuevo = secreto;
    await iniciar.execute(U);
    await confirmar.execute(U, codigoDe(secreto));
  };

  beforeEach(() => {
    repo = new RepoEnMemoria();
    disponible = true;
    ROOT = false;
    secretoNuevo = 'S1';
    const secretos = new SecretoTotpCifrado(cipher);
    const verificador = new VerificadorCodigoTfa(repo, totp, limitador, hash, secretos);
    confirmador = new ConfirmadorSecretoPendiente(repo, totp, limitador, secretos);
    // El stub de usuarios solo implementa `findById`, lo unico que los use cases consultan.
    const usuarioRepo = Object.assign(Object.create(null), usuarios);
    obtener = new ObtenerEstadoTfa(repo, usuarioRepo);
    iniciar = new IniciarSecretoTfa(repo, totp, cipher, usuarioRepo, secretos, verificador);
    confirmar = new ConfirmarSecretoTfa(repo, hash, confirmador);
    regenerar = new RegenerarCodigosTfa(repo, hash, verificador);
  });

  it('estado: obligado por esObligado2fa y sin secreto en la respuesta (T3)', async () => {
    expect(await obtener.execute(U)).toEqual({
      activo: false,
      obligado: false,
      codigosRestantes: 0,
      pendiente: false,
    });
    ROOT = true;
    await activar('S1');
    const estado = await obtener.execute(U);
    expect(estado).toEqual({
      activo: true,
      obligado: true,
      codigosRestantes: 10,
      pendiente: false,
    });
    expect(JSON.stringify(estado)).not.toContain('S1');
  });

  it('iniciar guarda un pendiente cifrado y devuelve uri y clave manual (T4, T7)', async () => {
    const r = await iniciar.execute(U);

    expect(r.getValue()).toEqual({
      otpauthUri: 'otpauth://ana@test.local?secret=S1',
      claveManual: 'S1',
    });
    expect(repo.estado?.secretoPendienteCifrado).toBe(`tfa:${U}|S1`);
    expect(repo.estado?.secretoCifrado).toBeNull();
  });

  it('confirmar activa y entrega 10 codigos solo la primera vez; uno erroneo no activa (T4)', async () => {
    await iniciar.execute(U);
    expect((await confirmar.execute(U, '000000')).isFail()).toBe(true);
    expect(repo.estado?.secretoCifrado).toBeNull();

    const primera = (await confirmar.execute(U, codigoDe('S1'))).getValue();
    expect(primera.codigosRecuperacion).toHaveLength(10);
    expect(repo.estado?.secretoCifrado).toBe(`tfa:${U}|S1`);

    secretoNuevo = 'S2';
    await iniciar.execute(U, codigoDe('S1'));
    expect((await confirmar.execute(U, codigoDe('S2'))).getValue()).toEqual({});
    expect(repo.codigos).toHaveLength(10);
  });

  it('si hashear los codigos falla, el 2FA no queda activo sin codigos', async () => {
    await iniciar.execute(U);
    const hashRoto: IHashProvider = {
      ...hash,
      hash: async () => {
        throw new Error('argon2 caido');
      },
    };
    const confirmarRoto = new ConfirmarSecretoTfa(repo, hashRoto, confirmador);

    await expect(confirmarRoto.execute(U, codigoDe('S1'))).rejects.toThrow('argon2 caido');
    expect(repo.estado?.secretoCifrado).toBeNull();
    expect(repo.estado?.secretoPendienteCifrado).toBe(`tfa:${U}|S1`);
  });

  it('con 2FA activo, cambiar de celular exige codigo y el activo rige hasta confirmar (T10)', async () => {
    await activar('S1');
    secretoNuevo = 'S2';

    expect((await iniciar.execute(U)).isFail()).toBe(true);
    expect((await iniciar.execute(U, '999999')).isFail()).toBe(true);
    expect((await iniciar.execute(U, codigoDe('S1'))).isOk()).toBe(true);
    expect(repo.estado?.secretoCifrado).toBe(`tfa:${U}|S1`);
    // El secreto pendiente no sirve para confirmar con un codigo del activo.
    expect((await confirmar.execute(U, codigoDe('S1'))).isFail()).toBe(true);
  });

  it('regenerar con codigo valido invalida el juego anterior; sin codigo valido no cambia nada (T9)', async () => {
    await activar('S1');
    const anterior = repo.codigos.map((c) => c.codigoHash);

    expect((await regenerar.execute(U, '999999')).isFail()).toBe(true);
    expect(repo.codigos.map((c) => c.codigoHash)).toEqual(anterior);

    const nuevo = (await regenerar.execute(U, codigoDe('S1'))).getValue().codigosRecuperacion;
    expect(nuevo).toHaveLength(10);
    expect(repo.codigos.map((c) => c.codigoHash).filter((h) => anterior.includes(h))).toEqual([]);
  });

  it('sin la clave maestra, iniciar responde TfaNoDisponible y no guarda nada', async () => {
    disponible = false;

    const r = await iniciar.execute(U);

    expect(r.getError().code).toBe('AUTH_TFA_NO_DISPONIBLE');
    expect(repo.estado).toBeNull();
  });

  it('ninguna accion de autogestion envia mail ni ofrece otro canal (T11)', () => {
    const fuentes = [
      'tfa-cuenta.use-cases.ts',
      '../../interface/controllers/tfa-cuenta.controller.ts',
    ]
      .map((f) => readFileSync(join(__dirname, f), 'utf8'))
      .join('\n');
    const imports = fuentes.split('\n').filter((l) => l.includes(' from '));

    expect(imports.filter((l) => /correo|mailer|smtp|sms/i.test(l))).toEqual([]);
  });
});
