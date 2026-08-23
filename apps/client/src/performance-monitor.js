/**
 * Opt-in, client-side telemetry for separating render/main-thread stalls from
 * snapshot-delivery problems. Enable with `?perf=1`; it never sends telemetry
 * off-device and adds no sampling work in normal play.
 */
export function createPerformanceMonitor(element) {
  const enabled = new URLSearchParams(location.search).has("perf");
  if (!enabled) return NOOP_MONITOR;

  element.hidden = false;
  const frameGaps = new RollingSamples(180);
  const renderCosts = new RollingSamples(180);
  const snapshotGaps = new RollingSamples(60);
  const snapshotCosts = new RollingSamples(60);
  const deliveryJitter = new RollingSamples(60);
  let minimumDeliveryMs;
  let previousFrameAt;
  let previousSnapshotAt;
  let previousTick;
  let droppedTicks = 0;
  let longTaskTimes = [];
  let lastPaintAt = 0;
  let serverMetrics;

  const refreshServerMetrics = async () => {
    try {
      const response = await fetch("/metrics", { cache: "no-store" });
      if (response.ok) serverMetrics = await response.json();
    } catch {
      // The client can still identify rendering and delivery issues offline.
    }
  };
  refreshServerMetrics();
  window.setInterval(refreshServerMetrics, 2_000);

  if ("PerformanceObserver" in window) {
    try {
      new PerformanceObserver((entries) => {
        const now = performance.now();
        longTaskTimes.push(...entries.getEntries().map(() => now));
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Safari and some embedded browsers do not expose long-task entries.
    }
  }

  const paint = () => {
    const now = performance.now();
    if (now - lastPaintAt < 500) return;
    lastPaintAt = now;
    longTaskTimes = longTaskTimes.filter((at) => now - at < 10_000);
    const recentLongTasks = longTaskTimes.length;
    const frameP95 = frameGaps.percentile(95);
    const snapshotP95 = snapshotGaps.percentile(95);
    element.textContent = [
      "PERF (local only)",
      `frame ${frameGaps.average().toFixed(1)}ms avg · ${frameP95.toFixed(1)}ms p95 · render ${renderCosts.percentile(95).toFixed(1)}ms p95`,
      `snap ${snapshotGaps.average().toFixed(1)}ms avg · ${snapshotP95.toFixed(1)}ms p95 · wire jitter ${deliveryJitter.percentile(95).toFixed(1)}ms p95 · apply ${snapshotCosts.percentile(95).toFixed(1)}ms p95`,
      `tick gaps ${droppedTicks} · long tasks ${recentLongTasks}`,
      serverLine(serverMetrics),
      diagnosis(frameP95, snapshotP95, droppedTicks, recentLongTasks, serverMetrics),
    ].join("\n");
  };

  return {
    recordFrame(renderMs) {
      const now = performance.now();
      if (previousFrameAt !== undefined) frameGaps.add(now - previousFrameAt);
      previousFrameAt = now;
      renderCosts.add(renderMs);
      paint();
    },
    recordSnapshot(tick, applyMs, serverSentAtMs) {
      const now = performance.now();
      if (previousSnapshotAt !== undefined) snapshotGaps.add(now - previousSnapshotAt);
      previousSnapshotAt = now;
      if (typeof serverSentAtMs === "number") {
        const deliveryMs = Date.now() - serverSentAtMs;
        minimumDeliveryMs = Math.min(minimumDeliveryMs ?? deliveryMs, deliveryMs);
        // Device and server clocks need not agree; subtract the best observed
        // value so this measures variation in transit/queueing, not clock skew.
        deliveryJitter.add(Math.max(0, deliveryMs - minimumDeliveryMs));
      }
      if (previousTick !== undefined && tick > previousTick + 1)
        droppedTicks += tick - previousTick - 1;
      previousTick = tick;
      snapshotCosts.add(applyMs);
      paint();
    },
  };
}

const NOOP_MONITOR = { recordFrame() {}, recordSnapshot() {} };

class RollingSamples {
  constructor(limit) {
    this.limit = limit;
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    if (this.values.length > this.limit) this.values.shift();
  }

  average() {
    if (this.values.length === 0) return 0;
    return this.values.reduce((sum, value) => sum + value, 0) / this.values.length;
  }

  percentile(percentile) {
    if (this.values.length === 0) return 0;
    const ordered = [...this.values].sort((left, right) => left - right);
    return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentile / 100) - 1)];
  }
}

function serverLine(metrics) {
  if (metrics === undefined) return "server metrics unavailable";
  return `server tick ${metrics.lastTickIntervalMs.toFixed(1)}ms interval · ${metrics.lastTickDurationMs.toFixed(1)}ms work · ${metrics.lastBroadcastDurationMs.toFixed(1)}ms broadcast`;
}

function diagnosis(frameP95, snapshotP95, droppedTicks, longTasks, serverMetrics) {
  if (frameP95 > 34 || longTasks > 0) return "Likely client/main-thread or GPU pressure";
  if (serverMetrics?.lastTickIntervalMs > 125 || serverMetrics?.lastTickDurationMs > 50)
    return "Likely server tick pressure";
  if (snapshotP95 > 160 || droppedTicks > 0) return "Likely network/server delivery jitter";
  return "No sustained stall detected";
}
