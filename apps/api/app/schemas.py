from datetime import date
from typing import Literal
from pydantic import BaseModel, Field


class DataRange(BaseModel):
    start: str
    end: str
    status: str


class DataAvailability(BaseModel):
    nightlights: DataRange
    forest: DataRange
    integrated: DataRange


class ReportRequest(BaseModel):
    admin_code: str
    period_start: date
    period_end: date
    facility_ids: list[str] = Field(default_factory=list)
    metrics: list[Literal["nightlight", "forest", "combined"]] = Field(
        default_factory=lambda: ["nightlight", "forest"]
    )


class ReportJob(BaseModel):
    id: str
    status: Literal["queued", "collecting_evidence", "generating", "rendering_pdf", "completed", "failed"]
