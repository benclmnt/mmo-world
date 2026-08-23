export {};

/**
 * Synthetic WebSocket load check with explicit M5 acceptance criteria.
 * Example:
 * bun run load --url ws://127.0.0.1:3001/ws --clients 50 --duration 300
 */
const options = readOptions(process.argv.slice(2));
const clients = positiveInteger(options.clients ?? "50", "--clients");
const durationSeconds = positiveNumber(options.duration ?? "30", "--duration");
const actionIntervalMs = positiveNumber(
  options["action-interval"] ?? "100",
  "--action-interval",
);
const url = String(options.url ?? "ws://127.0.0.1:3001/ws");
const minimumSnapshots = positiveInteger(
  options["min-snapshots"] ?? String(clients * Math.max(1, Math.floor(durationSeconds * 8))),
  "--min-snapshots",
);

let opened = 0;
let closedCount = 0;
let snapshots = 0;
let errors = 0;
let stopping = false;
let unexpectedCloses = 0;
const sockets: WebSocket[] = [];
const directions = ["north", "east", "south", "west"];
let resolveClosed: (() => void) | undefined;
const allClientsClosed = new Promise<void>((resolve) => {
  resolveClosed = resolve;
});

const metricsBefore = await fetchMetrics(url);
for (let index = 0; index < clients; index++) connectClient();

const report = setInterval(() => {
  console.info(JSON.stringify({ event: "load_progress", opened, closed: closedCount, snapshots, errors }));
}, 1_000);
await sleep(durationSeconds * 1_000);
stopping = true;
clearInterval(report);
for (const socket of sockets) socket.close();
await Promise.race([allClientsClosed, sleep(5_000)]);

const metricsAfter = await fetchMetrics(url);
const result = {
  event: "load_complete",
  opened,
  closed: closedCount,
  snapshots,
  snapshotsPerClient: round(snapshots / clients),
  minimumSnapshots,
  errors,
  unexpectedCloses,
  server: summarizeMetrics(metricsBefore, metricsAfter),
};
console.info(JSON.stringify(result));

const failures = [
  opened !== clients && `opened ${opened}/${clients} clients`,
  closedCount !== clients && `closed ${closedCount}/${clients} clients`,
  errors > 0 && `${errors} socket errors`,
  unexpectedCloses > 0 && `${unexpectedCloses} sockets closed before teardown`,
  snapshots < minimumSnapshots && `received ${snapshots}/${minimumSnapshots} snapshots`,
].filter(Boolean);
if (failures.length > 0) {
  console.error(JSON.stringify({ event: "load_failed", failures }));
  process.exitCode = 1;
}

function connectClient(): void {
  const socket = new WebSocket(url);
  sockets.push(socket);
  let sequence = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  socket.addEventListener("open", () => {
    opened++;
    timer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "action",
          sequence: sequence++,
          action: {
            type: "move",
            direction: directions[sequence % directions.length],
          },
        }),
      );
    }, actionIntervalMs);
  });
  socket.addEventListener("message", (event) => {
    if (JSON.parse(String(event.data)).type === "snapshot") snapshots++;
  });
  socket.addEventListener("error", () => errors++);
  socket.addEventListener("close", () => {
    closedCount++;
    if (!stopping) unexpectedCloses++;
    if (timer !== undefined) clearInterval(timer);
    if (closedCount === clients) resolveClosed?.();
  });
}

async function fetchMetrics(webSocketUrl: string): Promise<Record<string, number> | undefined> {
  try {
    const httpUrl = new URL(webSocketUrl);
    httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
    httpUrl.pathname = "/metrics";
    httpUrl.search = "";
    const response = await fetch(httpUrl);
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function summarizeMetrics(
  before: Record<string, number> | undefined,
  after: Record<string, number> | undefined,
): Record<string, number | undefined> | undefined {
  if (after === undefined) return undefined;
  return {
    tick: after.tick,
    players: after.players,
    connections: after.connections,
    tickOverrunsDuringRun: delta(before, after, "tickOverruns"),
    backpressureEventsDuringRun: delta(before, after, "backpressureEvents"),
    snapshotsSkippedDuringRun: delta(before, after, "snapshotsSkipped"),
    snapshotsSentDuringRun: delta(before, after, "snapshotsSent"),
    maxTickIntervalMsSinceStart: after.maxTickIntervalMs,
    maxTickDurationMsSinceStart: after.maxTickDurationMs,
  };
}

function delta(
  before: Record<string, number> | undefined,
  after: Record<string, number>,
  key: string,
): number | undefined {
  return before === undefined ? undefined : after[key] - before[key];
}
function readOptions(args: readonly string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error(`Expected --name value pairs; received '${key ?? ""}'`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${option} must be a positive integer`);
  return parsed;
}

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${option} must be positive`);
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
