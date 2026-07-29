/**
 * Small synthetic WebSocket load client. Example:
 * bun run load --url ws://127.0.0.1:3001/ws --clients 50 --duration 30
 */
const options = readOptions(process.argv.slice(2));
const clients = Number(options.clients ?? 50);
const durationSeconds = Number(options.duration ?? 30);
const actionIntervalMs = Number(options["action-interval"] ?? 100);
const url = String(options.url ?? "ws://127.0.0.1:3001/ws");

if (!Number.isSafeInteger(clients) || clients <= 0)
  throw new Error("--clients must be a positive integer");
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  throw new Error("--duration must be positive");

let opened = 0;
let closedCount = 0;
let snapshots = 0;
let errors = 0;
const sockets: WebSocket[] = [];
const directions = ["north", "east", "south", "west"];

for (let index = 0; index < clients; index++) {
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
    if (timer !== undefined) clearInterval(timer);
  });
}

const report = setInterval(() => {
  console.info(
    JSON.stringify({
      event: "load_progress",
      opened,
      closed: closedCount,
      snapshots,
      errors,
    }),
  );
}, 1_000);

setTimeout(() => {
  clearInterval(report);
  for (const socket of sockets) socket.close();
  console.info(
    JSON.stringify({
      event: "load_complete",
      opened,
      closed: closedCount,
      snapshots,
      errors,
    }),
  );
}, durationSeconds * 1_000);

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
