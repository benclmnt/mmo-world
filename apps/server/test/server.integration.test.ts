import { afterAll, describe, expect, test } from "bun:test";

const SERVER_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 25;

let serverProcess: ReturnType<typeof Bun.spawn> | undefined;
let port: number | undefined;
const sockets: WebSocket[] = [];

afterAll(async () => {
  for (const socket of sockets) socket.close();
  if (serverProcess === undefined) return;
  serverProcess.kill("SIGTERM");
  await Promise.race([
    serverProcess.exited,
    sleep(1_000).then(() => serverProcess?.kill("SIGKILL")),
  ]);
});

describe("game server transport boundary", () => {
  test(
    "serves health and metrics, limits bad input, and cleans up disconnected players",
    async () => {
      port = await startServer();
      const httpUrl = `http://127.0.0.1:${port}`;
      const wsUrl = `ws://127.0.0.1:${port}/ws`;

      const health = await fetchJson(`${httpUrl}/health`);
      expect(health).toMatchObject({ status: "ok" });
      expect(health.tick).toBeNumber();
      expect(health.uptimeMs).toBeNumber();

      const initialMetrics = await fetchJson(`${httpUrl}/metrics`);
      expect(initialMetrics).toMatchObject({
        players: 0,
        connections: 0,
        bots: 20,
        acceptedMessages: 0,
        invalidMessages: 0,
        rateLimitedMessages: 0,
      });

      const first = await connect(wsUrl);
      const second = await connect(wsUrl);
      const firstWorld = await first.next((message) => message.type === "world");
      const secondWorld = await second.next((message) => message.type === "world");
      expect(firstWorld.playerId).not.toBe(secondWorld.playerId);

      await first.next(
        (message) =>
          message.type === "snapshot" &&
          message.entities.some((entity: { id: number }) => entity.id === firstWorld.playerId) &&
          message.entities.some((entity: { id: number }) => entity.id === secondWorld.playerId),
      );
      await eventually(async () => {
        const metrics = await fetchJson(`${httpUrl}/metrics`);
        return metrics.players === 2 && metrics.connections === 2;
      });

      const beforeFlood = await fetchJson(`${httpUrl}/metrics`);
      first.socket.send("{");
      for (let sequence = 0; sequence < 100; sequence++) {
        first.socket.send(
          JSON.stringify({ type: "action", sequence, action: { type: "idle" } }),
        );
      }
      const afterFlood = await eventually(async () => {
        const metrics = await fetchJson(`${httpUrl}/metrics`);
        const processed =
          metrics.acceptedMessages - beforeFlood.acceptedMessages +
          metrics.invalidMessages - beforeFlood.invalidMessages +
          metrics.rateLimitedMessages - beforeFlood.rateLimitedMessages;
        return processed >= 101 ? metrics : undefined;
      });
      expect(afterFlood.invalidMessages).toBeGreaterThan(beforeFlood.invalidMessages);
      expect(afterFlood.acceptedMessages).toBeGreaterThan(beforeFlood.acceptedMessages);
      expect(afterFlood.rateLimitedMessages).toBeGreaterThan(
        beforeFlood.rateLimitedMessages,
      );

      const oversized = await connect(wsUrl);
      await oversized.next((message) => message.type === "world");
      oversized.socket.send("x".repeat(4 * 1024 + 1));
      await oversized.closed;
      await eventually(async () => {
        const metrics = await fetchJson(`${httpUrl}/metrics`);
        return metrics.players === 2 && metrics.connections === 2;
      });

      second.socket.close();
      await first.next(
        (message) =>
          message.type === "snapshot" &&
          !message.entities.some((entity: { id: number }) => entity.id === secondWorld.playerId) &&
          !message.actors.some((actor: { entityId: number }) => actor.entityId === secondWorld.playerId),
      );
      await eventually(async () => {
        const metrics = await fetchJson(`${httpUrl}/metrics`);
        return metrics.players === 1 && metrics.connections === 1;
      });

      first.socket.close();
      await eventually(async () => {
        const metrics = await fetchJson(`${httpUrl}/metrics`);
        return metrics.players === 0 && metrics.connections === 0;
      });
      expect((await fetchJson(`${httpUrl}/health`)).status).toBe("ok");
    },
    10_000,
  );
});

async function startServer(): Promise<number> {
  serverProcess = Bun.spawn([Bun.which("bun") ?? "bun", "run", "apps/server/src/server.ts"], {
    cwd: import.meta.dir + "/../../..",
    env: { ...Bun.env, PORT: "0", WORLD_SEED: "12345" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = serverProcess.stderr;
  if (stderr !== undefined && typeof stderr !== "number") void drain(stderr);

  const decoder = new TextDecoder();
  let buffered = "";
  const started = new Promise<number>((resolve, reject) => {
    const stdout = serverProcess!.stdout;
    if (stdout === undefined || typeof stdout === "number") {
      reject(new Error("Server stdout was not piped"));
      return;
    }
    void (async () => {
      for await (const chunk of stdout) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.event === "server_started" && Number.isInteger(event.port)) {
              resolve(event.port);
              return;
            }
          } catch {
            // Server logs are structured, but retain unrelated output for Bun.
          }
        }
      }
      reject(new Error("Server exited before reporting its listening port"));
    })();
  });
  return await Promise.race([
    started,
    serverProcess.exited.then((code) => Promise.reject(new Error(`Server exited with ${code}`))),
    sleep(SERVER_TIMEOUT_MS).then(() => Promise.reject(new Error("Timed out starting server"))),
  ]);
}

async function connect(url: string): Promise<MessageQueue> {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const queue = new MessageQueue(socket);
  await queue.opened;
  return queue;
}

class MessageQueue {
  readonly opened: Promise<void>;
  readonly closed: Promise<void>;
  private readonly messages: unknown[] = [];
  private readonly waiters: Array<{
    predicate: (message: any) => boolean;
    resolve: (message: any) => void;
  }> = [];

  constructor(readonly socket: WebSocket) {
    this.opened = new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), {
        once: true,
      });
    });
    socket.addEventListener("message", (event) => this.push(JSON.parse(String(event.data))));
    this.closed = new Promise((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true });
    });
  }

  async next(predicate: (message: any) => boolean): Promise<any> {
    const existing = this.messages.findIndex(predicate);
    if (existing >= 0) return this.messages.splice(existing, 1)[0];
    return await new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }

  private push(message: unknown): void {
    const waiting = this.waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiting >= 0) return this.waiters.splice(waiting, 1)[0]!.resolve(message);
    this.messages.push(message);
  }
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return await response.json();
}

async function eventually<T>(predicate: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value !== undefined && value !== false) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for server state");
}

async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (stream === null) return;
  for await (const _ of stream) {
    // Keep child-process output from filling its pipe during a failed test.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
