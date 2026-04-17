export type Priority = "low_cost" | "low_carbon" | "balanced";

export type Datacenter = {
  id: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  power: number;
  carbonIntensity: number;
  cost: number;
  latency: number;
  source: "Hydro" | "Solar" | "Wind" | "Geothermal" | "Mixed" | "Coal-heavy" | "Gas";
};

export type Decision = {
  optimal: Datacenter;
  baseline: Datacenter;
  carbonSavingsPct: number;
  costSavingsPct: number;
  latencyDeltaMs: number;
  emissionsOptimalG: number;
  emissionsBaselineG: number;
  costOptimal: number;
  costBaseline: number;
};

export type JobStatus = "queued" | "scheduled" | "running" | "completed" | "failed";

export type JobSnapshot = {
  jobId: string;
  status: JobStatus;
  assignedDc: string | null;
  runtimeS: number | null;
  energyKwh: number | null;
  carbonKg: number | null;
  failureReason: string | null;
};

export type JobEvent = {
  eventId: number;
  eventType: string;
  timestamp: string;
  jobId: string | null;
  status: string | null;
  assignedDc: string | null;
  reason: string | null;
  runtimeS: number | null;
};

export const ORIGIN = { city: "San Francisco", lat: 37.77, lon: -122.42 };

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type BackendDatacenter = {
  dc_id: string;
  region: string;
  latency_ms: number;
  energy_cost_per_kwh: number;
  carbon_intensity_gco2_per_kwh: number;
  total_cpu: number;
  total_gpu: number;
  total_ram: number;
};

type ScheduleResponse = {
  job_id: string;
  status: JobStatus;
  assigned_dc: string;
  score: number;
};

type JobResponse = {
  job: {
    job_id: string;
    status: JobStatus;
    assigned_dc: string | null;
    runtime_s: number | null;
    energy_kwh: number | null;
    carbon_kg: number | null;
    failure_reason: string | null;
  };
};

type EventsResponse = {
  events: Array<{
    event_id: number;
    event_type: string;
    timestamp: string;
    payload: {
      job_id?: string;
      status?: string;
      assigned_dc?: string;
      reason?: string;
      runtime_s?: number;
    };
  }>;
  last_event_id: number;
};

const BACKEND_NODE_META: Record<
  string,
  Omit<Datacenter, "carbonIntensity" | "cost" | "latency" | "power">
> = {
  "dc-us-east": {
    id: "dc-us-east",
    city: "Virginia",
    region: "us-east",
    country: "United States",
    lat: 38.95,
    lon: -77.45,
    source: "Mixed",
  },
  "dc-us-west": {
    id: "dc-us-west",
    city: "Oregon",
    region: "us-west",
    country: "United States",
    lat: 45.84,
    lon: -119.7,
    source: "Hydro",
  },
  "dc-eu-central": {
    id: "dc-eu-central",
    city: "Frankfurt",
    region: "eu-central",
    country: "Germany",
    lat: 50.11,
    lon: 8.68,
    source: "Mixed",
  },
};

const FALLBACK_DATACENTERS: Datacenter[] = [
  {
    id: "dc-us-east",
    city: "Virginia",
    region: "us-east",
    country: "United States",
    lat: 38.95,
    lon: -77.45,
    power: 330,
    carbonIntensity: 410,
    cost: 0.12,
    latency: 35,
    source: "Mixed",
  },
  {
    id: "dc-us-west",
    city: "Oregon",
    region: "us-west",
    country: "United States",
    lat: 45.84,
    lon: -119.7,
    power: 285,
    carbonIntensity: 290,
    cost: 0.09,
    latency: 55,
    source: "Hydro",
  },
  {
    id: "dc-eu-central",
    city: "Frankfurt",
    region: "eu-central",
    country: "Germany",
    lat: 50.11,
    lon: 8.68,
    power: 305,
    carbonIntensity: 140,
    cost: 0.15,
    latency: 80,
    source: "Mixed",
  },
];

function inferWorkload(model: string) {
  const m = model.toLowerCase();
  if (m.includes("opus") || m.includes("gpt-5") || m.includes("70b")) {
    return { cpu: 8, gpu: 2, ram: 32 };
  }
  if (m.includes("sonnet") || m.includes("mini") || m.includes("small")) {
    return { cpu: 3, gpu: 0, ram: 10 };
  }
  return { cpu: 4, gpu: 1, ram: 16 };
}

function estimateRuntimeS(spec: { cpu: number; gpu: number; ram: number }) {
  return Math.max(4, Math.min(25, Math.trunc(2 + spec.cpu * 1.4 + spec.gpu * 4 + spec.ram * 0.06)));
}

function estimateEnergyKwh(spec: { cpu: number; gpu: number; ram: number }, runtimeS: number) {
  const runtimeH = runtimeS / 3600;
  const powerFactorKw = 0.25 + 0.08 * spec.cpu + 0.35 * spec.gpu + 0.01 * Math.sqrt(spec.ram);
  return runtimeH * powerFactorKw;
}

function buildDecision(nodes: Datacenter[], assignedDcId: string, spec: { cpu: number; gpu: number; ram: number }): Decision {
  const optimal = nodes.find((n) => n.id === assignedDcId);
  if (!optimal) {
    throw new Error("Assigned datacenter was not found in the latest datacenter list.");
  }

  const baseline = [...nodes].sort((a, b) => a.latency - b.latency)[0];
  const runtimeS = estimateRuntimeS(spec);
  const energyKwh = estimateEnergyKwh(spec, runtimeS);

  const emissionsOptimalG = energyKwh * optimal.carbonIntensity;
  const emissionsBaselineG = energyKwh * baseline.carbonIntensity;
  const costOptimal = energyKwh * optimal.cost;
  const costBaseline = energyKwh * baseline.cost;

  return {
    optimal,
    baseline,
    carbonSavingsPct: ((emissionsBaselineG - emissionsOptimalG) / Math.max(emissionsBaselineG, 1)) * 100,
    costSavingsPct: ((costBaseline - costOptimal) / Math.max(costBaseline, 1e-6)) * 100,
    latencyDeltaMs: optimal.latency - baseline.latency,
    emissionsOptimalG,
    emissionsBaselineG,
    costOptimal,
    costBaseline,
  };
}

function mapBackendDatacenter(dc: BackendDatacenter): Datacenter {
  const meta = BACKEND_NODE_META[dc.dc_id] ?? {
    id: dc.dc_id,
    city: dc.region.toUpperCase(),
    region: dc.region,
    country: "Unknown",
    lat: 0,
    lon: 0,
    source: "Mixed" as const,
  };

  return {
    ...meta,
    power: Math.round(240 + dc.carbon_intensity_gco2_per_kwh / 3),
    carbonIntensity: dc.carbon_intensity_gco2_per_kwh,
    cost: dc.energy_cost_per_kwh,
    latency: dc.latency_ms,
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${message}`);
  }

  return (await res.json()) as T;
}

export async function loadDatacenters(): Promise<Datacenter[]> {
  const data = await apiGet<{ datacenters: BackendDatacenter[] }>("/datacenters");
  return data.datacenters.map(mapBackendDatacenter);
}

export async function routeWorkload(params: {
  model: string;
  priority: Priority;
  latencyLimit: number;
  nodes: Datacenter[];
}): Promise<{ decision: Decision; jobId: string; status: JobStatus }> {
  const spec = inferWorkload(params.model);
  const payload = {
    job_id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cpu: spec.cpu,
    gpu: spec.gpu,
    ram: spec.ram,
    deadline: params.latencyLimit,
    priority: params.priority,
  };

  const scheduled = await apiPost<ScheduleResponse>("/schedule", payload);
  return {
    jobId: scheduled.job_id,
    status: scheduled.status,
    decision: buildDecision(params.nodes, scheduled.assigned_dc, spec),
  };
}

export async function loadJob(jobId: string): Promise<JobSnapshot> {
  const data = await apiGet<JobResponse>(`/jobs/${jobId}`);
  return {
    jobId: data.job.job_id,
    status: data.job.status,
    assignedDc: data.job.assigned_dc,
    runtimeS: data.job.runtime_s,
    energyKwh: data.job.energy_kwh,
    carbonKg: data.job.carbon_kg,
    failureReason: data.job.failure_reason,
  };
}

export async function loadEvents(
  since: number
): Promise<{ events: JobEvent[]; lastEventId: number }> {
  const data = await apiGet<EventsResponse>(`/events?since=${since}`);
  return {
    events: data.events.map((event) => ({
      eventId: event.event_id,
      eventType: event.event_type,
      timestamp: event.timestamp,
      jobId: event.payload.job_id ?? null,
      status: event.payload.status ?? null,
      assignedDc: event.payload.assigned_dc ?? null,
      reason: event.payload.reason ?? null,
      runtimeS: event.payload.runtime_s ?? null,
    })),
    lastEventId: data.last_event_id,
  };
}

export const DATACENTERS = FALLBACK_DATACENTERS;
