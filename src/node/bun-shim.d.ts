// Minimal ambient shim so node/*.ts typechecks without @types/bun.
declare const Bun: {
  serve(opts: {
    port?: number;
    fetch: (req: Request, server: BunServer) => Response | Promise<Response> | undefined;
    websocket?: {
      open?: (ws: BunWebSocket) => void;
      message?: (ws: BunWebSocket, message: string | Uint8Array) => void;
      close?: (ws: BunWebSocket) => void;
    };
  }): BunServer;
};

interface BunServer {
  port: number;
  hostname: string;
  stop(closeActive?: boolean): void;
  upgrade(req: Request, opts?: { data?: unknown }): boolean;
  /**
   * Socket address of the peer. Behind a proxy this is the proxy, so the rate
   * limiter prefers `x-forwarded-for` and falls back to this — see
   * `lib/pixel/rate-limit.ts`. Returns null for a closed or upgraded connection.
   */
  requestIP(req: Request): { address: string; family: string; port: number } | null;
}

interface BunWebSocket {
  data: unknown;
  send(msg: string | Uint8Array): number;
  close(code?: number, reason?: string): void;
}
