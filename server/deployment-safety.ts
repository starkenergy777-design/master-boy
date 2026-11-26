import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';

export class DeploymentHandoffError extends Error {
  readonly code = 'DEPLOYMENT_IN_PROGRESS';
  constructor() { super('This server no longer owns the database writer. Retry on the active deployment.'); }
}

export function isDeploymentHandoff(error: unknown): boolean {
  return error instanceof DeploymentHandoffError ||
    !!error && typeof error === 'object' && 'code' in error && error.code === '55000' &&
    'message' in error && error.message === 'DEPLOYMENT_WRITER_RETIRED';
}

// A process has a fixed token. Reconnecting must never let a retired process
// silently adopt the new process's token. SQL triggers validate every write.
export class DeploymentWriter {
  private readonly token = randomUUID();
  private claimed = false;
  private admissionClosed = false;
  private readonly startup = new AsyncLocalStorage<PoolClient>();
  private savepointSequence = 0;

  async claim(pool: Pool): Promise<void> {
    await this.initialize(pool, async () => {});
  }

  async initialize<T>(pool: Pool, hydrate: () => Promise<T>, beforeCommit?: () => Promise<void>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE masterboy_app');
      await client.query("SET LOCAL lock_timeout = '15s'");
      // A new owner waits for all prior guarded transactions to commit. Only
      // then can it hydrate fresh state. A missing migration fails startup.
      await client.query('SELECT singleton FROM masterboy_deploy.writer_control WHERE singleton = true FOR UPDATE');
      const result = await client.query(
        'UPDATE masterboy_deploy.writer_control SET writer_token=$1, enforced=true, generation=generation+1, claimed_at=clock_timestamp() WHERE singleton=true RETURNING generation',
        [this.token],
      );
      if (result.rowCount !== 1) throw new Error('Deployment writer control is not initialized.');
      await this.context(client);
      // Ownership and hydration commit together. If configuration, hydration or
      // startup persistence fails, the old owner's token and all rows survive.
      const initialized = await this.startup.run(client, hydrate);
      // Bind HTTP outside the transaction's AsyncLocalStorage context. Live
      // requests must never inherit or reuse the released startup connection.
      await beforeCommit?.();
      await client.query('COMMIT');
      this.claimed = true;
      return initialized;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async assertActive(pool: Pool): Promise<void> {
    if (!this.claimed || this.admissionClosed) throw new DeploymentHandoffError();
    const result = await this.wrap(pool).query('SELECT writer_token=$1 AS active FROM masterboy_deploy.writer_control WHERE singleton=true', [this.token]);
    if (result.rows[0]?.active !== true) throw new DeploymentHandoffError();
  }

  stopAdmission() { this.admissionClosed = true; }
  isClaimed() { return this.claimed; }

  // SET LOCAL is repeated in every transaction, including single-statement
  // writes. This works with direct, session-pooled and transaction-pooled PG.
  private async context(client: PoolClient) {
    await client.query('SET LOCAL ROLE masterboy_app');
    await client.query("SELECT set_config('masterboy.writer_token',$1,true)", [this.token]);
  }

  private needsWriter(sql: any) {
    const text = typeof sql === 'string' ? sql : sql?.text || '';
    return /^(?:\s*--[^\n]*\n)*\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b|\bFOR\s+(?:NO\s+KEY\s+)?UPDATE\b/i.test(text);
  }

  private async lockWriter(client: PoolClient) {
    const result = await client.query('SELECT writer_token=$1 AS active FROM masterboy_deploy.writer_control WHERE singleton=true FOR SHARE', [this.token]);
    if (result.rows[0]?.active !== true) throw new DeploymentHandoffError();
  }

  wrap(pool: Pool): Pool {
    const writer = this;
    return new Proxy(pool, {
      get(target, property) {
        if (property === 'query') return async (sql: any, args?: any[]) => {
          const startupClient = writer.startup.getStore();
          if (startupClient) return startupClient.query(sql, args);
          const client = await target.connect();
          try {
            await client.query('BEGIN');
            await writer.context(client);
            if (writer.needsWriter(sql)) await writer.lockWriter(client);
            const result = await client.query(sql, args);
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
          } finally { client.release(); }
        };
        if (property === 'connect') return async () => {
          const startupClient = writer.startup.getStore();
          if (startupClient) {
            const savepoint = `masterboy_startup_${++writer.savepointSequence}`;
            return new Proxy(startupClient, {
              get(connection, key) {
                if (key === 'release') return () => {};
                if (key === 'query') return async (sql: any, args?: any[]) => {
                  if (typeof sql === 'string') {
                    const statement = sql.trim().replace(/;$/, '').toUpperCase();
                    if (statement === 'BEGIN') return connection.query(`SAVEPOINT ${savepoint}`);
                    if (statement === 'COMMIT') return connection.query(`RELEASE SAVEPOINT ${savepoint}`);
                    if (statement === 'ROLLBACK') {
                      await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                      return connection.query(`RELEASE SAVEPOINT ${savepoint}`);
                    }
                  }
                  return connection.query(sql, args);
                };
                const value = Reflect.get(connection, key);
                return typeof value === 'function' ? value.bind(connection) : value;
              },
            });
          }
          const client = await target.connect();
          let writerLocked = false;
          return new Proxy(client, {
            get(connection, key) {
              if (key === 'query') return async (sql: any, args?: any[]) => {
                if (!writerLocked && writer.needsWriter(sql)) {
                  await writer.lockWriter(connection);
                  writerLocked = true;
                }
                const result = await connection.query(sql, args);
                if (typeof sql === 'string' && /^BEGIN\s*;?$/i.test(sql.trim())) await writer.context(connection);
                if (typeof sql === 'string' && /^(?:COMMIT|ROLLBACK)\s*;?$/i.test(sql.trim())) writerLocked = false;
                return result;
              };
              const value = Reflect.get(connection, key);
              return typeof value === 'function' ? value.bind(connection) : value;
            },
          });
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
}
