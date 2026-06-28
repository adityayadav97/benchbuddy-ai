"""Pydantic schemas for BenchBuddy AI API contract."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """Inbound associate question."""

    query: str = Field(..., min_length=1, max_length=2000, description="Associate question text")
    associate_id: Optional[str] = Field(None, description="Optional associate identifier for analytics")


class KBMatch(BaseModel):
    """A retrieved FAQ source row used to compose the answer."""

    id: int
    rank: int
    question: str
    answer: str
    category: str
    score: float = Field(..., ge=0.0, le=1.0)


class QueryResponse(BaseModel):
    """The structured response returned to the client.

    The four required fields (answer, confidence, category, status) are exactly
    what the kata problem statement asked for; the additional fields make the
    UI richer without breaking the JSON contract.
    """

    answer: str
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the answer, 0-1")
    confidence_pct: int = Field(..., ge=0, le=100)
    category: str
    status: str = Field(..., description="Answered | Escalate | Clarify | OutOfScope")
    escalation_target: Optional[str] = Field(None, description="Where the query would be routed if escalated")
    sources: List[KBMatch] = Field(default_factory=list)
    intents_detected: List[str] = Field(default_factory=list)
    sentiment: str = Field("neutral", description="positive | neutral | negative")
    latency_ms: int = 0
    query_id: str
    timestamp: str


class FAQEntry(BaseModel):
    id: int
    category: str
    question: str
    answer: str


class EscalationRequest(BaseModel):
    query_id: str
    query: str
    category: str
    associate_name: Optional[str] = None
    associate_email: Optional[str] = None
    notes: Optional[str] = None


class EscalationResponse(BaseModel):
    ticket_id: str
    status: str
    routed_to: str
    submitted_at: str
    eta_hours: int


class HealthResponse(BaseModel):
    status: str
    kb_size: int
    version: str


class AnalyticsResponse(BaseModel):
    total_queries: int
    answered: int
    escalated: int
    clarified: int
    out_of_scope: int
    by_category: dict
    average_confidence: float
    average_latency_ms: float
    recent: list
