import { DomainError } from '../../../shared/domain/result';
import {
  CredencialesInvalidasError,
  SinMembresiaActivaError,
  ClienteNoAutorizadoError,
  ClienteInactivoError,
  TokenInvalidoError,
  TokenExpiradoError,
  TokenRevocadoError,
  PermisoCodigoInvalidoError,
} from './auth.errors';

describe('CredencialesInvalidasError', () => {
  it('expone code AUTH_INVALID_CREDENTIALS', () => {
    const error = new CredencialesInvalidasError();
    expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('es instancia de DomainError y Error', () => {
    const error = new CredencialesInvalidasError();
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('el mensaje no revela la causa (usuario inexistente vs password incorrecto)', () => {
    const error = new CredencialesInvalidasError();
    expect(error.message.toLowerCase()).not.toContain('no existe');
    expect(error.message.toLowerCase()).not.toContain('password');
  });
});

describe('SinMembresiaActivaError', () => {
  it('expone code AUTH_SIN_MEMBRESIA_ACTIVA', () => {
    const error = new SinMembresiaActivaError();
    expect(error.code).toBe('AUTH_SIN_MEMBRESIA_ACTIVA');
  });

  it('es instancia de DomainError', () => {
    expect(new SinMembresiaActivaError()).toBeInstanceOf(DomainError);
  });
});

describe('ClienteNoAutorizadoError', () => {
  it('expone code AUTH_CLIENTE_NO_AUTORIZADO', () => {
    const error = new ClienteNoAutorizadoError();
    expect(error.code).toBe('AUTH_CLIENTE_NO_AUTORIZADO');
  });

  it('es instancia de DomainError', () => {
    expect(new ClienteNoAutorizadoError()).toBeInstanceOf(DomainError);
  });
});

describe('ClienteInactivoError', () => {
  it('expone code AUTH_CLIENTE_INACTIVO', () => {
    const error = new ClienteInactivoError();
    expect(error.code).toBe('AUTH_CLIENTE_INACTIVO');
  });

  it('es instancia de DomainError', () => {
    expect(new ClienteInactivoError()).toBeInstanceOf(DomainError);
  });
});

describe('TokenInvalidoError', () => {
  it('expone code AUTH_TOKEN_INVALIDO', () => {
    const error = new TokenInvalidoError();
    expect(error.code).toBe('AUTH_TOKEN_INVALIDO');
  });

  it('es instancia de DomainError', () => {
    expect(new TokenInvalidoError()).toBeInstanceOf(DomainError);
  });
});

describe('TokenExpiradoError', () => {
  it('expone code AUTH_TOKEN_EXPIRADO', () => {
    const error = new TokenExpiradoError();
    expect(error.code).toBe('AUTH_TOKEN_EXPIRADO');
  });

  it('es instancia de DomainError', () => {
    expect(new TokenExpiradoError()).toBeInstanceOf(DomainError);
  });
});

describe('TokenRevocadoError', () => {
  it('expone code AUTH_TOKEN_REVOCADO', () => {
    const error = new TokenRevocadoError();
    expect(error.code).toBe('AUTH_TOKEN_REVOCADO');
  });

  it('es instancia de DomainError', () => {
    expect(new TokenRevocadoError()).toBeInstanceOf(DomainError);
  });
});

describe('PermisoCodigoInvalidoError', () => {
  it('expone code AUTH_PERMISO_CODIGO_INVALIDO', () => {
    const error = new PermisoCodigoInvalidoError('ticket');
    expect(error.code).toBe('AUTH_PERMISO_CODIGO_INVALIDO');
  });

  it('incluye el código inválido en el mensaje', () => {
    const error = new PermisoCodigoInvalidoError('ticket');
    expect(error.message).toContain('ticket');
  });

  it('es instancia de DomainError', () => {
    expect(new PermisoCodigoInvalidoError('x')).toBeInstanceOf(DomainError);
  });
});

describe('todos los errores auth — nombre de clase', () => {
  it('el name coincide con el nombre del constructor (stack traces legibles)', () => {
    expect(new CredencialesInvalidasError().name).toBe('CredencialesInvalidasError');
    expect(new SinMembresiaActivaError().name).toBe('SinMembresiaActivaError');
    expect(new ClienteNoAutorizadoError().name).toBe('ClienteNoAutorizadoError');
    expect(new ClienteInactivoError().name).toBe('ClienteInactivoError');
    expect(new TokenInvalidoError().name).toBe('TokenInvalidoError');
    expect(new TokenExpiradoError().name).toBe('TokenExpiradoError');
    expect(new TokenRevocadoError().name).toBe('TokenRevocadoError');
  });
});
