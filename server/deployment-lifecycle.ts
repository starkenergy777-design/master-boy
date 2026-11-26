import type { RequestHandler } from 'express';
import { isDeploymentHandoff } from './deployment-safety.js';

interface PersistenceLifecycle {
  assertWriter(): Promise<void>;
  persist(): Promise<void>;
  isDraining(): boolean;
  onPersistenceFailure(error: unknown): void;
}

export const needsRuntimeSnapshot = (path: string) =>
  !/^\/api\/v1\/(?:admin\/providers\/payment\/prov-bog\/verify|payments\/bog\/(?:callback\/(?:live|sandbox)|[a-f0-9-]{36}\/status))\/?$/i.test(path);

// Delay the actual HTTP completion until the mutation is durable. This replaces
// res.finish background saves; it does not change endpoint payloads or design.
export function durableApiResponses(lifecycle: PersistenceLifecycle): RequestHandler {
  return (req, res, next) => {
    const requestPath = req.path;
    if (!requestPath.startsWith('/api/v1/')) return next();
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const bankStatus = /^\/api\/v1\/payments\/bog\/[a-f0-9-]{36}\/status\/?$/i.test(requestPath);
    if (!mutating && !bankStatus) return next();
    const end = res.end;
    const unavailable = (error?: unknown) => {
      if (res.headersSent || res.destroyed) return;
      res.statusCode = 503;
      res.removeHeader('Content-Length');
      res.removeHeader('ETag');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Retry-After', '3');
      end.apply(res, [JSON.stringify({
        code: isDeploymentHandoff(error) || (!error && lifecycle.isDraining()) ? 'DEPLOYMENT_IN_PROGRESS' : 'PERSISTENCE_UNAVAILABLE',
        message: 'Your change was not confirmed. Please retry shortly.',
      })] as any);
    };
    if (lifecycle.isDraining()) { unavailable(); return; }
    void lifecycle.assertWriter().then(() => {
      let ending = false;
      res.end = function (...args: any[]) {
        if (ending) return res;
        ending = true;
        if (!mutating || !needsRuntimeSnapshot(requestPath) || res.statusCode >= 500) return end.apply(res, args as any);
        void lifecycle.persist().then(() => { end.apply(res, args as any); }).catch(error => {
          lifecycle.onPersistenceFailure(error);
          unavailable(error);
        });
        return res;
      } as typeof res.end;
      next();
    }).catch(error => { unavailable(error); });
  };
}

export function installGracefulShutdown(input: {
  stopAdmission(): void;
  stopWorkers(): void;
  closeServer(): Promise<void>;
  closeStorage(): Promise<void>;
}) {
  let shutdown: Promise<void> | undefined;
  return () => {
    shutdown ??= (async () => {
      input.stopAdmission();
      input.stopWorkers();
      await input.closeServer();
      await input.closeStorage();
    })();
    return shutdown;
  };
}
