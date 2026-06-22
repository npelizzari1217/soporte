import { Result, DomainError } from './result';

// ─── Sample error types for testing ──────────────────────────────────────────
class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
  }
}

class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

// ─── Result.ok() tests ────────────────────────────────────────────────────────
describe('Result.ok()', () => {
  it('should have isOk() === true', () => {
    const result = Result.ok<number, DomainError>(42);

    expect(result.isOk()).toBe(true);
  });

  it('should have isFail() === false', () => {
    const result = Result.ok<number, DomainError>(42);

    expect(result.isFail()).toBe(false);
  });

  it('should return the value via getValue()', () => {
    const result = Result.ok<string, DomainError>('hello');

    expect(result.getValue()).toBe('hello');
  });

  it('should work with complex object values', () => {
    const obj = { id: '123', name: 'ticket' };
    const result = Result.ok<typeof obj, DomainError>(obj);

    expect(result.getValue()).toEqual(obj);
  });

  it('should work with undefined/void value', () => {
    const result = Result.ok<void, DomainError>(undefined);

    expect(result.isOk()).toBe(true);
  });

  it('should throw when getError() is called on an ok result', () => {
    const result = Result.ok<number, DomainError>(42);

    expect(() => result.getError()).toThrow();
  });

  it('should throw when getOrThrow() is called on an ok result (returns value)', () => {
    const result = Result.ok<number, DomainError>(100);

    // getOrThrow() on ok result returns the value without throwing
    expect(result.getOrThrow()).toBe(100);
  });
});

// ─── Result.fail() tests ──────────────────────────────────────────────────────
describe('Result.fail()', () => {
  it('should have isFail() === true', () => {
    const error = new NotFoundError('Ticket not found');
    const result = Result.fail<number, NotFoundError>(error);

    expect(result.isFail()).toBe(true);
  });

  it('should have isOk() === false', () => {
    const error = new NotFoundError('Ticket not found');
    const result = Result.fail<number, NotFoundError>(error);

    expect(result.isOk()).toBe(false);
  });

  it('should return the error via getError()', () => {
    const error = new NotFoundError('Ticket not found');
    const result = Result.fail<number, NotFoundError>(error);

    expect(result.getError()).toBe(error);
    expect(result.getError().message).toBe('Ticket not found');
  });

  it('should throw when getValue() is called on a fail result', () => {
    const result = Result.fail<number, NotFoundError>(new NotFoundError('Not found'));

    expect(() => result.getValue()).toThrow();
  });

  it('should throw the original error when getOrThrow() is called on a fail result', () => {
    const error = new ValidationError('Invalid input');
    const result = Result.fail<string, ValidationError>(error);

    expect(() => result.getOrThrow()).toThrow(error);
  });

  it('should NOT throw during construction (no side effects on creation)', () => {
    expect(() => {
      Result.fail<number, NotFoundError>(new NotFoundError('some error'));
    }).not.toThrow();
  });
});

// ─── map() tests ──────────────────────────────────────────────────────────────
describe('Result.map()', () => {
  it('should transform the value when result is ok', () => {
    const result = Result.ok<number, DomainError>(5);
    const mapped = result.map((n) => n * 2);

    expect(mapped.isOk()).toBe(true);
    expect(mapped.getValue()).toBe(10);
  });

  it('should not call the transform function when result is fail', () => {
    const transform = jest.fn((n: number) => n * 2);
    const error = new NotFoundError('Not found');
    const result = Result.fail<number, NotFoundError>(error);

    const mapped = result.map(transform);

    expect(transform).not.toHaveBeenCalled();
    expect(mapped.isFail()).toBe(true);
    expect(mapped.getError()).toBe(error);
  });

  it('should chain multiple map() calls', () => {
    const result = Result.ok<number, DomainError>(3)
      .map((n) => n + 1)
      .map((n) => n.toString())
      .map((s) => `value: ${s}`);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe('value: 4');
  });

  it('should short-circuit on first failure when chaining', () => {
    const error = new ValidationError('bad');
    const transform = jest.fn((n: number) => n * 2);

    const result = Result.fail<number, ValidationError>(error).map(transform).map(transform);

    expect(transform).not.toHaveBeenCalled();
    expect(result.isFail()).toBe(true);
  });
});

// ─── DomainError tests ────────────────────────────────────────────────────────
describe('DomainError', () => {
  it('should preserve the error message', () => {
    const error = new NotFoundError('Entity not found by id 123');

    expect(error.message).toBe('Entity not found by id 123');
  });

  it('should expose the typed code', () => {
    const error = new ValidationError('Invalid field');

    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should be an instance of Error', () => {
    const error = new NotFoundError('not found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
  });
});
