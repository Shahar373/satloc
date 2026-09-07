import { SESSION_SCHEMA_VERSION, validateSessionRecords, type SessionFile } from '../../contracts/envelope';
import type { KeyValueStore } from '../../platform/kv';

/** Migrates a stored object one schema version forward (fromVersion -> fromVersion + 1). */
type Migration = (old: unknown) => unknown;

/**
 * No migrations exist yet — `SESSION_SCHEMA_VERSION` has never changed since it was introduced
 * (src/contracts/envelope.ts, PR #24). Add a `fromVersion: migrate` entry here the day it does;
 * until then this is intentionally empty, and `SessionStore.load()`'s migration loop is a no-op
 * skeleton for exactly that reason (see docs/DESIGN.md's plan: session persistence needs
 * "schemaVersion, migrations" as a mechanism, not because a second version exists yet).
 */
const MIGRATIONS: Record<number, Migration> = {};

export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A hand-rolled shape check rather than a schema-validation library — the plan's zod decision is
 * still open (Proposed, not Approved), and this top-level shape check is enough to catch garbage
 * before `validateSessionRecords` checks the records' internal invariants. A future PR can swap
 * this out without changing SessionStore's public surface if per-event-type validation is ever
 * needed.
 */
function isSessionFileShape(value: unknown): value is {
  schemaVersion: number;
  sessionId: string;
  scenarioId: string;
  scenarioHash: string;
  seed: string;
  createdAt: string;
  records: unknown;
} {
  return (
    isPlainObject(value) &&
    typeof value.schemaVersion === 'number' &&
    typeof value.sessionId === 'string' &&
    typeof value.scenarioId === 'string' &&
    typeof value.scenarioHash === 'string' &&
    typeof value.seed === 'string' &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.records)
  );
}

/**
 * Persists `SessionFile`s (docs/DESIGN.md's plan, §3) through an injected `KeyValueStore` — the
 * caller supplies one already scoped to its own namespace (see `platform/kv.ts`'s
 * `getKeyValueStore(namespace)`), so a session save can never collide with, or be wiped by,
 * unrelated data sharing the same underlying database.
 */
export class SessionStore {
  constructor(private readonly kv: KeyValueStore) {}

  async save(session: SessionFile): Promise<void> {
    await this.kv.set(session.sessionId, session);
  }

  /**
   * Returns `null` if nothing is stored under this id. Throws `SessionLoadError` for anything
   * stored but unusable (unrecognisable shape, an unmigratable schema version, or a record set
   * that fails `validateSessionRecords`) — this never silently hands back corrupted data.
   */
  async load(sessionId: string): Promise<SessionFile | null> {
    const raw = await this.kv.get<unknown>(sessionId);
    if (raw === undefined) return null;
    if (!isSessionFileShape(raw)) {
      throw new SessionLoadError(`Session "${sessionId}" is not a recognisable SessionFile`);
    }

    let migrated: unknown = raw;
    let version = raw.schemaVersion;
    while (version < SESSION_SCHEMA_VERSION) {
      const migrate = MIGRATIONS[version];
      if (!migrate) {
        throw new SessionLoadError(
          `Session "${sessionId}" is schemaVersion ${version}, but no migration to ${version + 1} is registered`,
        );
      }
      migrated = migrate(migrated);
      version += 1;
    }
    if (!isSessionFileShape(migrated) || migrated.schemaVersion !== SESSION_SCHEMA_VERSION) {
      throw new SessionLoadError(`Session "${sessionId}" did not migrate to a valid current-schema SessionFile`);
    }

    const session = migrated as SessionFile;
    const violations = validateSessionRecords(session.records);
    if (violations.length > 0) {
      throw new SessionLoadError(`Session "${sessionId}" failed invariant checks: ${violations.join('; ')}`);
    }
    return session;
  }

  async delete(sessionId: string): Promise<void> {
    await this.kv.delete(sessionId);
  }

  list(): Promise<string[]> {
    return this.kv.keys();
  }
}
