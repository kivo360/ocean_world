// (#70) Per-tick profiler sparkline. Reads world.tickProfile.samples and
// renders three stacked colored bars (T1 perceive / T2 decide / T3 resolve)
// per tick across the configured window.

import type { TickProfile } from "../simulation/world";

type ProfilerSparklineProps = {
  profile: TickProfile | undefined;
  /** Force re-render when sim ticks; UI doesn't subscribe to profile changes. */
  renderTick: number;
};

const WIDTH = 120;
const HEIGHT = 24;
const COLOR_PERCEIVE = "#22d3ee";
const COLOR_DECIDE = "#fbbf24";
const COLOR_RESOLVE = "#a855f7";

export function ProfilerSparkline({ profile, renderTick: _t }: ProfilerSparklineProps) {
  const samples = profile?.samples ?? [];
  if (samples.length === 0) {
    return (
      <span style={{ fontSize: 11, opacity: 0.5 }}>
        profiler idle
      </span>
    );
  }

  // Find the worst tick to use as the y-axis upper bound; clamp so a single
  // outlier doesn't compress the rest of the chart.
  const maxObserved = Math.max(...samples.map((s) => s.total));
  const yMax = Math.max(1, Math.min(maxObserved, 50));

  const barW = WIDTH / samples.length;
  const last = samples[samples.length - 1];

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      title={`T1 perceive · T2 decide · T3 resolve\nlast tick ${last.tick}: ${last.total.toFixed(1)}ms total`}
    >
      <svg
        width={WIDTH}
        height={HEIGHT}
        style={{ display: "block", background: "#0b1220", borderRadius: 3 }}
      >
        {samples.map((s, i) => {
          const x = i * barW;
          const pH = (s.perceive / yMax) * HEIGHT;
          const dH = (s.decide / yMax) * HEIGHT;
          const rH = (s.resolve / yMax) * HEIGHT;
          let y = HEIGHT - pH;
          return (
            <g key={`${s.tick}-${i}`}>
              <rect x={x} y={y} width={Math.max(1, barW - 0.5)} height={pH} fill={COLOR_PERCEIVE} />
              <rect x={x} y={(y -= dH)} width={Math.max(1, barW - 0.5)} height={dH} fill={COLOR_DECIDE} />
              <rect x={x} y={(y -= rH)} width={Math.max(1, barW - 0.5)} height={rH} fill={COLOR_RESOLVE} />
            </g>
          );
        })}
      </svg>
      <span style={{ fontSize: 10, color: "#cfe3ff", letterSpacing: 0.3 }}>
        {last.total.toFixed(1)}ms
      </span>
    </span>
  );
}
