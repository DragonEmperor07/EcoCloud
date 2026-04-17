from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from models import DataCenter, JobRequest


@dataclass
class SchedulingDecision:
    dc_id: str
    score: float
    metric_breakdown: dict[str, float]


def _normalize(values: list[float]) -> list[float]:
    if not values:
        return []
    low = min(values)
    high = max(values)
    if high == low:
        return [0.0 for _ in values]
    return [(value - low) / (high - low) for value in values]


def _priority_weights(priority: str) -> dict[str, float]:
    if priority == "low_carbon":
        return {"latency": 0.2, "cost": 0.25, "carbon": 0.45, "load": 0.1}
    if priority == "low_cost":
        return {"latency": 0.2, "cost": 0.45, "carbon": 0.25, "load": 0.1}
    if priority == "balanced":
        return {"latency": 0.35, "cost": 0.25, "carbon": 0.25, "load": 0.15}
    if priority == "high":
        return {"latency": 0.5, "cost": 0.2, "carbon": 0.2, "load": 0.1}
    if priority == "low":
        return {"latency": 0.2, "cost": 0.3, "carbon": 0.4, "load": 0.1}
    return {"latency": 0.35, "cost": 0.25, "carbon": 0.25, "load": 0.15}


def _utilization(dc: DataCenter) -> float:
    cpu_used = dc.total_cpu - dc.free_cpu
    gpu_used = dc.total_gpu - dc.free_gpu
    ram_used = dc.total_ram - dc.free_ram
    cpu_u = cpu_used / dc.total_cpu if dc.total_cpu else 0
    gpu_u = gpu_used / dc.total_gpu if dc.total_gpu else 0
    ram_u = ram_used / dc.total_ram if dc.total_ram else 0
    return max(cpu_u, gpu_u, ram_u)


def select_datacenter(job: JobRequest, datacenters: list[DataCenter]) -> Optional[SchedulingDecision]:
    candidates: list[DataCenter] = []
    for dc in datacenters:
        if dc.free_cpu < job.cpu or dc.free_gpu < job.gpu or dc.free_ram < job.ram:
            continue
        if job.region_preference and dc.region != job.region_preference:
            continue
        if dc.latency_ms > job.deadline:
            continue
        candidates.append(dc)

    if not candidates:
        return None

    latencies = [float(dc.latency_ms) for dc in candidates]
    costs = [dc.energy_cost_per_kwh for dc in candidates]
    carbons = [dc.carbon_intensity_gco2_per_kwh for dc in candidates]
    loads = [_utilization(dc) for dc in candidates]

    norm_latencies = _normalize(latencies)
    norm_costs = _normalize(costs)
    norm_carbons = _normalize(carbons)
    norm_loads = _normalize(loads)
    weights = _priority_weights(job.priority)

    best_idx = 0
    best_score = float("inf")
    best_breakdown = {}

    for idx, dc in enumerate(candidates):
        breakdown = {
            "latency": norm_latencies[idx],
            "cost": norm_costs[idx],
            "carbon": norm_carbons[idx],
            "load": norm_loads[idx],
        }
        score = (
            weights["latency"] * breakdown["latency"]
            + weights["cost"] * breakdown["cost"]
            + weights["carbon"] * breakdown["carbon"]
            + weights["load"] * breakdown["load"]
        )

        # Stable tie-breakers: lower load then lower latency.
        if score < best_score:
            best_idx = idx
            best_score = score
            best_breakdown = breakdown
        elif score == best_score:
            if loads[idx] < loads[best_idx] or (
                loads[idx] == loads[best_idx] and latencies[idx] < latencies[best_idx]
            ):
                best_idx = idx
                best_breakdown = breakdown

    chosen = candidates[best_idx]
    return SchedulingDecision(dc_id=chosen.dc_id, score=round(best_score, 5), metric_breakdown=best_breakdown)
