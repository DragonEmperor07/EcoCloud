from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


Priority = Literal["low", "medium", "high", "low_cost", "low_carbon", "balanced"]
JobStatus = Literal["queued", "scheduled", "running", "completed", "failed"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=100)
    cpu: int = Field(..., ge=1)
    gpu: int = Field(default=0, ge=0)
    ram: int = Field(..., ge=1, description="RAM in GB")
    deadline: int = Field(..., ge=1, description="Max acceptable latency in ms")
    priority: Priority = "medium"
    region_preference: Optional[str] = None


class DataCenter(BaseModel):
    dc_id: str
    region: str
    latency_ms: int = Field(..., ge=1)
    energy_cost_per_kwh: float = Field(..., ge=0)
    carbon_intensity_gco2_per_kwh: float = Field(..., ge=0)
    total_cpu: int = Field(..., ge=1)
    total_gpu: int = Field(..., ge=0)
    total_ram: int = Field(..., ge=1)
    free_cpu: int = Field(..., ge=0)
    free_gpu: int = Field(..., ge=0)
    free_ram: int = Field(..., ge=0)


class JobRecord(BaseModel):
    job_id: str
    cpu: int
    gpu: int
    ram: int
    deadline: int
    priority: Priority
    region_preference: Optional[str]
    status: JobStatus
    assigned_dc: Optional[str] = None
    assignment_score: Optional[float] = None
    created_at: datetime = Field(default_factory=utc_now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    runtime_s: Optional[int] = None
    energy_kwh: Optional[float] = None
    carbon_kg: Optional[float] = None
    failure_reason: Optional[str] = None


class Event(BaseModel):
    event_id: int
    event_type: str
    timestamp: datetime = Field(default_factory=utc_now)
    payload: dict
