import { BaseEntity } from './base-entity';

// ─── Concrete subclass for testing (BaseEntity is abstract) ──────────────────
interface TestProps {
  name: string;
}

class TestEntity extends BaseEntity<TestProps> {
  constructor(props: TestProps, id?: string) {
    super(props, id);
  }

  get name(): string {
    return this.props.name;
  }
}

// ─── Test suite ──────────────────────────────────────────────────────────────
describe('BaseEntity', () => {
  describe('construction', () => {
    it('should generate a UUIDv7 id when no id is provided', () => {
      const entity = new TestEntity({ name: 'test' });

      expect(entity.id).toBeDefined();
      expect(typeof entity.id).toBe('string');
      // UUIDv7 is a valid UUID (8-4-4-4-12 format)
      expect(entity.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should accept a provided id instead of generating one', () => {
      const customId = '01970000-0000-7000-8000-000000000001';
      const entity = new TestEntity({ name: 'test' }, customId);

      expect(entity.id).toBe(customId);
    });

    it('should set createdAt to a Date on construction', () => {
      const before = new Date();
      const entity = new TestEntity({ name: 'test' });
      const after = new Date();

      expect(entity.createdAt).toBeInstanceOf(Date);
      expect(entity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to a Date on construction', () => {
      const before = new Date();
      const entity = new TestEntity({ name: 'test' });
      const after = new Date();

      expect(entity.updatedAt).toBeInstanceOf(Date);
      expect(entity.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entity.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set deletedAt to null on construction', () => {
      const entity = new TestEntity({ name: 'test' });

      expect(entity.deletedAt).toBeNull();
    });

    it('should expose props via protected field accessible to subclass', () => {
      const entity = new TestEntity({ name: 'hello' });

      expect(entity.name).toBe('hello');
    });
  });

  describe('id uniqueness', () => {
    it('should generate different ids for entities created in the same millisecond', () => {
      const entities = Array.from({ length: 10 }, () => new TestEntity({ name: 'test' }));
      const ids = entities.map((e) => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(10);
    });

    it('should generate ids that are monotonically increasing (temporal ordering)', () => {
      const e1 = new TestEntity({ name: 'first' });
      const e2 = new TestEntity({ name: 'second' });

      // UUIDv7 is timestamp-prefixed: later UUIDs sort lexicographically after earlier ones
      expect(e1.id <= e2.id).toBe(true);
    });
  });

  describe('softDelete()', () => {
    it('should set deletedAt to a non-null Date when softDelete() is called', () => {
      const entity = new TestEntity({ name: 'test' });
      const before = new Date();

      entity.softDelete();

      const after = new Date();

      expect(entity.deletedAt).toBeInstanceOf(Date);
      expect(entity.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entity.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt when softDelete() is called', () => {
      const entity = new TestEntity({ name: 'test' });
      const createdUpdatedAt = entity.updatedAt;

      // Small delay to ensure updatedAt changes
      const laterDate = new Date(createdUpdatedAt.getTime() + 1);
      entity.softDelete(laterDate);

      expect(entity.updatedAt.getTime()).toBe(laterDate.getTime());
    });

    it('should not throw when softDelete() is called multiple times', () => {
      const entity = new TestEntity({ name: 'test' });

      expect(() => {
        entity.softDelete();
        entity.softDelete();
      }).not.toThrow();
    });
  });

  describe('isDeleted()', () => {
    it('should return false for a newly created entity', () => {
      const entity = new TestEntity({ name: 'test' });

      expect(entity.isDeleted()).toBe(false);
    });

    it('should return true after softDelete() is called', () => {
      const entity = new TestEntity({ name: 'test' });

      entity.softDelete();

      expect(entity.isDeleted()).toBe(true);
    });
  });

  describe('reconstitution from persistence', () => {
    it('should restore a soft-deleted entity correctly when id and deletedAt are provided', () => {
      const deletedAt = new Date('2024-01-15T10:00:00Z');
      const entity = new TestEntity({ name: 'archived' }, '01970000-0000-7000-8000-000000000002');
      // Simulate mapper setting the field directly via the reconstitute helper
      entity['_deletedAt'] = deletedAt;

      expect(entity.isDeleted()).toBe(true);
      expect(entity.deletedAt).toEqual(deletedAt);
    });
  });
});
