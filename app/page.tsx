"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import ControlPanel from "./components/ControlPanel";
import ResultsPanel from "./components/ResultsPanel";
import NodeList from "./components/NodeList";
import {
  DATACENTERS,
  ORIGIN,
  loadDatacenters,
  loadEvents,
  loadJob,
  routeWorkload,
  type Datacenter,
  type Decision,
  type JobEvent,
  type JobStatus,
  type Priority,
} from "./lib/datacenters";

// Globe is a heavy WebGL client component — load it browser-only.
const Globe = dynamic(() => import("./components/Globe"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-[color:var(--ink-mute)] text-xs">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-emerald-300 breath" />
        Bringing the globe online…
      </div>
    </div>
  ),
});

export default function Page() {
  const [nodes, setNodes] = useState<Datacenter[]>(DATACENTERS);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [isDeploying, setDeploying] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | "idle" | "scheduling">("idle");
  const [jobRuntimeS, setJobRuntimeS] = useState<number | null>(null);
  const [jobFailureReason, setJobFailureReason] = useState<string | null>(null);
  const [jobTimeline, setJobTimeline] = useState<JobEvent[]>([]);
  const [eventCursor, setEventCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const liveNodes = await loadDatacenters();
        if (!cancelled && liveNodes.length > 0) {
          setNodes(liveNodes);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Backend is unavailable. Showing fallback grid data.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }
    if (!["queued", "scheduled", "running"].includes(jobStatus)) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const job = await loadJob(activeJobId);
        if (cancelled) return;
        setJobStatus(job.status);
        setJobRuntimeS(job.runtimeS);
        setJobFailureReason(job.failureReason);
      } catch {
        // Quietly ignore transient polling failures.
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJobId, jobStatus]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const batch = await loadEvents(eventCursor);
        if (cancelled) return;

        if (batch.lastEventId !== eventCursor) {
          setEventCursor(batch.lastEventId);
        }

        const relevant = batch.events.filter((event) => event.jobId === activeJobId);
        if (relevant.length === 0) {
          return;
        }

        setJobTimeline((prev) => {
          const seen = new Set(prev.map((event) => event.eventId));
          const next = [...prev];
          for (const event of relevant) {
            if (!seen.has(event.eventId)) {
              next.push(event);
            }
          }
          return next.slice(-8);
        });
      } catch {
        // Quietly ignore transient polling failures.
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJobId, eventCursor]);

  const handleDeploy = async ({
    model,
    priority,
    latencyLimit,
  }: {
    model: string;
    priority: Priority;
    latencyLimit: number;
  }) => {
    setDeploying(true);
    setActiveModel(model);
    setActiveJobId(null);
    setJobStatus("scheduling");
    setJobRuntimeS(null);
    setJobFailureReason(null);
    setJobTimeline([]);
    setEventCursor(0);
    try {
      const routed = await routeWorkload({
        model,
        priority,
        latencyLimit,
        nodes,
      });
      setDecision(routed.decision);
      setActiveJobId(routed.jobId);
      setJobStatus(routed.status);
      setLoadError(null);
    } catch {
      setLoadError("Failed to route workload. Make sure backend is running on port 8000.");
      setJobStatus("failed");
    } finally {
      setDeploying(false);
    }
  };

  const optimalId = decision?.optimal.id ?? null;
  const baselineId = decision?.baseline.id ?? null;

  const totalNodes = nodes.length;
  const cleanestG = useMemo(
    () => Math.min(...nodes.map((d) => d.carbonIntensity)),
    [nodes]
  );
  const cleanestDc = useMemo(
    () => [...nodes].sort((a, b) => a.carbonIntensity - b.carbonIntensity)[0],
    [nodes]
  );

  return (
    <div className="relative min-h-screen w-full text-[color:var(--ink)]">
      <div className="aurora" />

      {/* ───────── Top bar ───────── */}
      <header className="relative z-10 px-8 pt-7 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight">EcoCloud</span>
            <span className="text-[10.5px] text-[color:var(--ink-mute)] tracking-wide">
              Carbon-aware AI workload routing
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 glass-soft px-1.5 py-1">
          {["Globe", "Workloads", "Regions", "Audit"].map((t, i) => (
            <button
              key={t}
              className={`px-3.5 h-8 rounded-lg text-[12.5px] tracking-tight transition ${
                i === 0
                  ? "bg-white/[0.06] text-[color:var(--ink)]"
                  : "text-[color:var(--ink-mute)] hover:text-[color:var(--ink)] hover:bg-white/[0.03]"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="pill">
            <span className="size-1.5 rounded-full bg-emerald-300 breath" />
            {loadError ? "Fallback data" : "Backend live"}
          </span>
          <button className="btn-ghost">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a7.97 7.97 0 0 0 0-6l2-1.2-2-3.4-2.3 1A8 8 0 0 0 12 4.1V2h-4v2.1a8 8 0 0 0-5.1 1.3l-2.3-1-2 3.4L.6 9a8 8 0 0 0 0 6l-2 1.2 2 3.4 2.3-1A8 8 0 0 0 8 19.9V22h4v-2.1a8 8 0 0 0 5.1-1.3l2.3 1 2-3.4L19.4 15z" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      {/* ───────── Stat strip ───────── */}
      <section className="relative z-10 px-8 pb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active regions" value={String(totalNodes)} sub="online · global" tone="leaf" />
        <Stat
          label="Cleanest grid"
          value={`${cleanestG} g`}
          sub={`CO₂ / kWh · ${cleanestDc?.city ?? "n/a"}`}
          tone="aqua"
        />
        <Stat
          label="Carbon avoided · 24h"
          value="412 kg"
          sub="vs naive routing"
          tone="leaf"
        />
        <Stat
          label="Workloads routed"
          value="18,402"
          sub="across 7 priorities"
          tone="aqua"
        />
      </section>

      {/* ───────── Main grid ───────── */}
      <main className="relative z-10 px-8 pb-10 grid grid-cols-12 gap-5">
        {/* Left column */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <EnvCard />
          <ControlPanel onDeploy={handleDeploy} isDeploying={isDeploying} />
          <JobStatusCard
            jobId={activeJobId}
            status={jobStatus}
            runtimeS={jobRuntimeS}
            failureReason={jobFailureReason}
          />
          <JobTimelineCard jobId={activeJobId} events={jobTimeline} />
          {loadError && (
            <div className="glass-soft px-3.5 py-2.5 text-[11px] text-amber-300">
              {loadError}
            </div>
          )}
          <NodeList
            nodes={nodes}
            optimalId={optimalId}
            baselineId={baselineId}
          />
        </div>

        {/* Center: Globe */}
        <div className="col-span-12 lg:col-span-6">
          <div className="glass relative overflow-hidden h-[640px] flex flex-col">
            {/* Header overlay */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-5 pointer-events-none">
              <div className="flex flex-col gap-1">
                <span className="eyebrow">Living grid</span>
                <h2 className="text-[17px] font-semibold tracking-tight">
                  Global carbon-aware routing
                </h2>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                <LegendChip color="leaf" label="Optimal flow" />
                <LegendChip color="rose" label="Naive baseline" />
              </div>
            </div>

            <div className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
              }}
            />

            <div className="absolute inset-0">
              <Globe
                origin={ORIGIN}
                nodes={nodes}
                optimalId={optimalId}
                baselineId={baselineId}
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-10 p-5 flex items-end justify-between pointer-events-none">
              <div className="glass-soft px-3.5 py-2.5 flex items-center gap-3 pointer-events-auto">
                <span className="size-2 rounded-full bg-white" style={{ boxShadow: "0 0 12px white" }} />
                <div className="flex flex-col leading-tight">
                  <span className="eyebrow">Origin</span>
                  <span className="text-[12.5px]">{ORIGIN.city}</span>
                </div>
              </div>
              <div className="glass-soft px-3.5 py-2.5 flex items-center gap-4 pointer-events-auto">
                <Mini label="Workload" value={activeModel || "—"} mono />
                <Divider />
                <Mini
                  label="Routed to"
                  value={decision ? decision.optimal.city : "awaiting"}
                  accent
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <ResultsPanel decision={decision} />
          <ControlPanel onDeploy={handleDeploy} isDeploying={isDeploying} />
        </div>
      </main>

      {/* footer */}
      <footer className="relative z-10 px-8 pb-8 flex items-center justify-between text-[11px] text-[color:var(--ink-mute)]">
        <span>
          Scoring · <span className="text-[color:var(--ink-soft)] numeric">(Power × Carbon) + Cost + Latency</span> · lower is better
        </span>
        <span>Designed in California · powered by clean grids ⌁</span>
      </footer>
    </div>
  );
}

/* ───────── Helpers ───────── */

function Stat({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "leaf" | "aqua";
}) {
  const accent =
    tone === "leaf"
      ? "from-emerald-300/30 to-cyan-300/0"
      : "from-cyan-300/30 to-emerald-300/0";
  return (
    <div className="glass relative overflow-hidden p-4">
      <div className={`absolute -inset-px rounded-[22px] pointer-events-none bg-gradient-to-br ${accent} opacity-40`} />
      <div className="relative flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{label}</span>
          <span className="text-[22px] font-semibold tracking-tight numeric">
            {value}
          </span>
          <span className="text-[11px] text-[color:var(--ink-mute)]">{sub}</span>
        </div>
        <div className="size-9 rounded-full grid place-items-center" style={{
          background:
            tone === "leaf"
              ? "radial-gradient(circle, rgba(134,239,172,0.18), transparent 70%)"
              : "radial-gradient(circle, rgba(90,215,255,0.18), transparent 70%)",
        }}>
          <span className="size-1.5 rounded-full bg-current opacity-80 breath"
            style={{ color: tone === "leaf" ? "#86efac" : "#5ad7ff" }}
          />
        </div>
      </div>
    </div>
  );
}

function LegendChip({ color, label }: { color: "leaf" | "rose"; label: string }) {
  return (
    <span className="pill text-[11px]">
      <span
        className="inline-block w-3 h-1.5 rounded-full"
        style={{
          background:
            color === "leaf"
              ? "linear-gradient(90deg,#86efac,#4be4c5)"
              : "linear-gradient(90deg,#f59ec0,#fbbf24)",
          boxShadow:
            color === "leaf"
              ? "0 0 10px rgba(75,228,197,0.5)"
              : "0 0 10px rgba(245,158,192,0.4)",
        }}
      />
      {label}
    </span>
  );
}

function Mini({
  label, value, mono, accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight min-w-[120px]">
      <span className="eyebrow">{label}</span>
      <span
        className={`text-[12.5px] truncate ${mono ? "font-mono" : ""} ${
          accent ? "text-emerald-300" : "text-[color:var(--ink)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="h-7 w-px bg-white/10" />;
}

function JobStatusCard({
  jobId,
  status,
  runtimeS,
  failureReason,
}: {
  jobId: string | null;
  status: JobStatus | "idle" | "scheduling";
  runtimeS: number | null;
  failureReason: string | null;
}) {
  const label =
    status === "idle"
      ? "No active job"
      : status === "scheduling"
      ? "Scheduling..."
      : status === "queued"
      ? "Queued"
      : status === "scheduled"
      ? "Scheduled"
      : status === "running"
      ? "Running"
      : status === "completed"
      ? "Completed"
      : "Failed";

  const toneClass =
    status === "completed"
      ? "text-emerald-300"
      : status === "failed"
      ? "text-rose-300"
      : "text-cyan-300";

  return (
    <section className="glass-soft px-3.5 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Job status</span>
        <span className={`text-[12px] numeric ${toneClass}`}>{label}</span>
      </div>
      <span className="text-[11px] text-[color:var(--ink-mute)] truncate">
        {jobId ? `ID: ${jobId}` : "Route a workload to start tracking."}
      </span>
      {status === "completed" && runtimeS !== null && (
        <span className="text-[11px] text-emerald-300">Runtime: {runtimeS}s</span>
      )}
      {status === "failed" && failureReason && (
        <span className="text-[11px] text-rose-300">Reason: {failureReason}</span>
      )}
    </section>
  );
}

function JobTimelineCard({
  jobId,
  events,
}: {
  jobId: string | null;
  events: JobEvent[];
}) {
  const eventLabel: Record<string, string> = {
    job_received: "Job received",
    job_scheduled: "Scheduled",
    job_running: "Running",
    job_completed: "Completed",
    job_rejected: "Rejected",
  };

  const toneFor = (type: string) => {
    if (type === "job_completed") return "text-emerald-300";
    if (type === "job_rejected") return "text-rose-300";
    if (type === "job_running") return "text-cyan-300";
    return "text-[color:var(--ink-soft)]";
  };
  const dotFor = (type: string) => {
    if (type === "job_completed") return "bg-emerald-300";
    if (type === "job_rejected") return "bg-rose-300";
    if (type === "job_running") return "bg-cyan-300";
    return "bg-[color:var(--ink-soft)]";
  };

  return (
    <section className="glass-soft px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Timeline</span>
        <span className="text-[10.5px] text-[color:var(--ink-mute)]">
          {events.length} events
        </span>
      </div>
      {!jobId && (
        <span className="text-[11px] text-[color:var(--ink-mute)]">
          Start a route to see live event flow.
        </span>
      )}
      {jobId && events.length === 0 && (
        <span className="text-[11px] text-cyan-300">Waiting for backend events…</span>
      )}
      {events.length > 0 && (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.eventId}
              className="flex items-start gap-2.5 text-[11px] leading-snug"
            >
              <span className={`mt-1 size-1.5 rounded-full ${dotFor(event.eventType)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={toneFor(event.eventType)}>
                    {eventLabel[event.eventType] ?? event.eventType}
                  </span>
                  <span className="text-[10px] text-[color:var(--ink-mute)] numeric">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {(event.assignedDc || event.reason || event.runtimeS !== null) && (
                  <span className="text-[10.5px] text-[color:var(--ink-mute)]">
                    {event.assignedDc
                      ? `dc: ${event.assignedDc}`
                      : event.reason
                      ? `reason: ${event.reason}`
                      : `runtime: ${event.runtimeS}s`}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EnvCard() {
  return (
    <section className="glass p-6 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Environmental signal</span>
          <h2 className="text-[15px] font-semibold tracking-tight">
            Why we picked this region
          </h2>
        </div>
        <span className="size-7 rounded-full grid place-items-center bg-emerald-300/10 text-emerald-300 drift">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c-4.5-3-7-7-7-11a7 7 0 0 1 14 0c0 4-2.5 8-7 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
        </span>
      </header>

      <ul className="flex flex-col gap-2.5">
        <Reason
          icon="leaf"
          label="Grid intensity"
          detail="Hydro / geothermal mix, < 100 gCO₂/kWh"
        />
        <Reason
          icon="bolt"
          label="Power efficiency"
          detail="PUE 1.12 — free cooling from cold-climate intake"
        />
        <Reason
          icon="latency"
          label="Latency budget"
          detail="Within your envelope — request would have spilt to nearer node otherwise"
        />
      </ul>

      <div className="glass-soft p-3 text-[11.5px] text-[color:var(--ink-soft)] leading-relaxed">
        Your workload was redirected away from a fossil-heavy region. The
        ecosystem on the globe pulses brighter when more requests follow the
        clean path.
      </div>
    </section>
  );
}

function Reason({
  icon, label, detail,
}: {
  icon: "leaf" | "bolt" | "latency";
  label: string;
  detail: string;
}) {
  const Svg =
    icon === "leaf" ? (
      <path d="M5 19c8 0 14-6 14-14-7 0-13 4-13 11 0 1 .3 2 1 3z M5 19c1-3 3-6 7-8" />
    ) : icon === "bolt" ? (
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    ) : (
      <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z M12 7v5l3 2" />
    );
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 size-7 rounded-full grid place-items-center bg-emerald-300/8 text-emerald-300 border border-emerald-300/20">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {Svg}
        </svg>
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12.5px]">{label}</span>
        <span className="text-[11px] text-[color:var(--ink-mute)] leading-snug">{detail}</span>
      </div>
    </li>
  );
}

function Logo() {
  return (
    <span
      className="relative size-9 rounded-2xl grid place-items-center"
      style={{
        background:
          "radial-gradient(60% 60% at 30% 30%, rgba(134,239,172,0.55), rgba(75,228,197,0.35) 60%, rgba(90,215,255,0.15) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 24px -8px rgba(75,228,197,0.6)",
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4 text-[#04140d]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12c4 1.5 14 1.5 18 0M12 3c2 4 2 14 0 18M12 3c-2 4-2 14 0 18" />
      </svg>
    </span>
  );
}
