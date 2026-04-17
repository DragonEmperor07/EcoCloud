from __future__ import annotations

import math
import time
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from models import JobRecord, JobRequest
from scheduler import select_datacenter
from state import InMemoryState

app = FastAPI(title="EcoCloud Scheduler MVP", version="0.1.0")
state = InMemoryState()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def estimate_runtime_s(job: JobRequest) -> int:
    # Keep demo snappy while still reflecting job size.
    return max(4, min(25, int(2 + job.cpu * 1.4 + job.gpu * 4 + job.ram * 0.06)))


def estimate_energy_kwh(job: JobRequest, runtime_s: int) -> float:
    runtime_h = runtime_s / 3600
    power_factor_kw = 0.25 + 0.08 * job.cpu + 0.35 * job.gpu + 0.01 * math.sqrt(job.ram)
    return runtime_h * power_factor_kw


def run_simulation(job_id: str) -> None:
    job = state.get_job(job_id)
    if not job:
        return
    running_ok = state.mark_running(job_id)
    if not running_ok:
        return
    state.add_event(
        "job_running",
        {
            "job_id": job_id,
            "assigned_dc": job.assigned_dc,
            "status": "running",
            "timestamp": utc_now_iso(),
        },
    )

    runtime_s = estimate_runtime_s(
        JobRequest(
            job_id=job.job_id,
            cpu=job.cpu,
            gpu=job.gpu,
            ram=job.ram,
            deadline=job.deadline,
            priority=job.priority,
            region_preference=job.region_preference,
        )
    )
    time.sleep(runtime_s)

    current_job = state.get_job(job_id)
    if not current_job or not current_job.assigned_dc:
        return
    dc = state.get_datacenter(current_job.assigned_dc)
    if not dc:
        state.fail_job(job_id, "assigned_datacenter_missing", release_capacity=True)
        return

    energy_kwh = estimate_energy_kwh(
        JobRequest(
            job_id=current_job.job_id,
            cpu=current_job.cpu,
            gpu=current_job.gpu,
            ram=current_job.ram,
            deadline=current_job.deadline,
            priority=current_job.priority,
            region_preference=current_job.region_preference,
        ),
        runtime_s=runtime_s,
    )
    carbon_kg = energy_kwh * (dc.carbon_intensity_gco2_per_kwh / 1000.0)
    state.complete_job(job_id, runtime_s=runtime_s, energy_kwh=energy_kwh, carbon_kg=carbon_kg)
    state.add_event(
        "job_completed",
        {
            "job_id": job_id,
            "assigned_dc": current_job.assigned_dc,
            "status": "completed",
            "runtime_s": runtime_s,
            "energy_kwh": round(energy_kwh, 5),
            "carbon_kg": round(carbon_kg, 5),
            "timestamp": utc_now_iso(),
        },
    )


@app.get("/health")
def health() -> dict:
    return {"ok": True, "timestamp": utc_now_iso()}


@app.get("/datacenters")
def datacenters() -> dict:
    return {"datacenters": [dc.model_dump() for dc in state.list_datacenters()]}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = state.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return {"job": job.model_dump()}


@app.get("/events")
def events(since: int = Query(default=0, ge=0)) -> dict:
    all_events = state.list_events(since)
    last_event_id = all_events[-1].event_id if all_events else since
    return {
        "events": [event.model_dump() for event in all_events],
        "last_event_id": last_event_id,
    }


@app.post("/schedule")
def schedule(job: JobRequest, background_tasks: BackgroundTasks) -> dict:
    created = state.create_job(
        JobRecord(
            job_id=job.job_id,
            cpu=job.cpu,
            gpu=job.gpu,
            ram=job.ram,
            deadline=job.deadline,
            priority=job.priority,
            region_preference=job.region_preference,
            status="queued",
        )
    )
    if not created:
        raise HTTPException(status_code=409, detail="job_id_already_exists")

    state.add_event(
        "job_received",
        {
            "job_id": job.job_id,
            "status": "queued",
            "timestamp": utc_now_iso(),
        },
    )

    decision = select_datacenter(job, state.list_datacenters())
    if not decision:
        state.fail_job(job.job_id, reason="no_datacenter_matches_constraints")
        state.add_event(
            "job_rejected",
            {
                "job_id": job.job_id,
                "status": "failed",
                "reason": "no_datacenter_matches_constraints",
                "timestamp": utc_now_iso(),
            },
        )
        raise HTTPException(status_code=422, detail="no_datacenter_matches_constraints")

    assigned = state.assign_job(job.job_id, decision.dc_id, decision.score)
    if not assigned:
        state.fail_job(job.job_id, reason="capacity_changed_during_assignment")
        state.add_event(
            "job_rejected",
            {
                "job_id": job.job_id,
                "status": "failed",
                "reason": "capacity_changed_during_assignment",
                "timestamp": utc_now_iso(),
            },
        )
        raise HTTPException(status_code=409, detail="capacity_changed_during_assignment")

    state.add_event(
        "job_scheduled",
        {
            "job_id": job.job_id,
            "assigned_dc": decision.dc_id,
            "status": "scheduled",
            "score": decision.score,
            "metric_breakdown": decision.metric_breakdown,
            "timestamp": utc_now_iso(),
        },
    )
    background_tasks.add_task(run_simulation, job.job_id)
    return {
        "job_id": job.job_id,
        "status": "scheduled",
        "assigned_dc": decision.dc_id,
        "score": decision.score,
        "metric_breakdown": decision.metric_breakdown,
    }
