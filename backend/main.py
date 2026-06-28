"""FastAPI entrypoint for BenchBuddy AI.

Endpoints:
  GET  /              -> serves the SPA
  GET  /api/health    -> liveness probe + KB size
  POST /api/query     -> the main Q&A endpoint
  GET  /api/faqs      -> dump of the loaded KB (for the FAQ analytics panel)
  GET  /api/analytics -> per-session analytics (in-memory)
  GET  /api/samples   -> a few suggested prompts (powers the quick-start chips)
"""

from __future__ import annotations

import os
import time
from collections import deque
from typing import Deque, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .engine import BenchBuddyEngine, new_query_id, now_iso
from .models import (
    AnalyticsResponse,
    EscalationRequest,
    EscalationResponse,
    FAQEntry,
    HealthResponse,
    KBMatch,
    QueryRequest,
    QueryResponse,
)

VERSION = "1.0.0"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")
FRONTEND_DIR = os.path.join(ROOT, "frontend")

app = FastAPI(
    title="BenchBuddy AI",
    description="PMO knowledge-base assistant for bench associates",
    version=VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = BenchBuddyEngine(DATA_DIR)

# in-memory analytics (per-process; OK for a kata demo)
_ANALYTICS: Deque[Dict] = deque(maxlen=200)


# ----- API ------------------------------------------------------------- #


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", kb_size=len(engine.kb), version=VERSION)


@app.post("/api/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    start = time.perf_counter()
    try:
        result = engine.answer(req.query)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"engine error: {exc}") from exc

    latency_ms = int((time.perf_counter() - start) * 1000)
    qid = new_query_id()
    ts = now_iso()

    sources = [
        KBMatch(
            id=rid,
            rank=rank + 1,
            question=row.question,
            answer=row.answer,
            category=row.category,
            score=round(score, 4),
        )
        for rank, (rid, row, score) in enumerate(result.sources)
    ]

    resp = QueryResponse(
        answer=result.answer,
        confidence=round(result.confidence, 4),
        confidence_pct=int(round(result.confidence * 100)),
        category=result.category,
        status=result.status,
        escalation_target=result.escalation_target,
        sources=sources,
        intents_detected=result.intents_detected,
        sentiment=result.sentiment,
        latency_ms=latency_ms,
        query_id=qid,
        timestamp=ts,
    )

    _ANALYTICS.append(
        {
            "query_id": qid,
            "query": req.query,
            "category": resp.category,
            "status": resp.status,
            "confidence_pct": resp.confidence_pct,
            "latency_ms": latency_ms,
            "timestamp": ts,
        }
    )
    return resp


@app.get("/api/faqs", response_model=List[FAQEntry])
def faqs() -> List[FAQEntry]:
    return [
        FAQEntry(id=i, category=r.category, question=r.question, answer=r.answer)
        for i, r in enumerate(engine.kb)
    ]


@app.get("/api/kb/{kb_id}", response_model=FAQEntry)
def kb_entry(kb_id: int) -> FAQEntry:
    """Single FAQ row by stable id (used by the source detail modal)."""
    if kb_id < 0 or kb_id >= len(engine.kb):
        raise HTTPException(status_code=404, detail="FAQ not found")
    r = engine.kb[kb_id]
    return FAQEntry(id=kb_id, category=r.category, question=r.question, answer=r.answer)


@app.get("/api/related/{kb_id}", response_model=List[FAQEntry])
def related(kb_id: int, limit: int = 5) -> List[FAQEntry]:
    """Return up to *limit* related FAQs (same category) excluding the row itself."""
    if kb_id < 0 or kb_id >= len(engine.kb):
        raise HTTPException(status_code=404, detail="FAQ not found")
    target = engine.kb[kb_id]
    out: List[FAQEntry] = []
    for i, r in enumerate(engine.kb):
        if i == kb_id or r.category != target.category:
            continue
        out.append(FAQEntry(id=i, category=r.category, question=r.question, answer=r.answer))
        if len(out) >= limit:
            break
    return out


@app.get("/api/categories")
def categories():
    """KB category catalogue with row counts (used by the KB filter chips)."""
    counts: Dict[str, int] = {}
    for r in engine.kb:
        counts[r.category] = counts.get(r.category, 0) + 1
    return {
        "categories": sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: -x["count"],
        ),
        "total": len(engine.kb),
    }


# ----- Escalation ticket store ---------------------------------------- #

_ESCALATIONS: List[Dict] = []


@app.post("/api/escalations", response_model=EscalationResponse)
def submit_escalation(req: EscalationRequest) -> EscalationResponse:
    """Simulated 'submit to PMO' flow. Mints a ticket id and stores in memory."""
    import random
    import string

    ticket_id = "PMO-" + "".join(random.choices(string.digits, k=6))
    target_map = {
        "Staffing": ("PMO Staffing Team", 4),
        "Bench Policy": ("PMO Staffing Team", 4),
        "Interview": ("Hiring Coordinator", 8),
        "Certification": ("PMO Certification Desk", 24),
        "Onboarding": ("Project Onboarding Coordinator", 8),
        "Resume": ("PMO Resume Desk", 8),
        "Sentiment": ("PMO Lead", 4),
    }
    routed, eta = target_map.get(req.category, ("PMO Team", 12))
    record = {
        "ticket_id": ticket_id,
        "query_id": req.query_id,
        "query": req.query,
        "category": req.category,
        "associate_name": req.associate_name,
        "associate_email": req.associate_email,
        "notes": req.notes,
        "status": "OPEN",
        "routed_to": routed,
        "submitted_at": now_iso(),
        "eta_hours": eta,
    }
    _ESCALATIONS.insert(0, record)
    return EscalationResponse(
        ticket_id=ticket_id,
        status="OPEN",
        routed_to=routed,
        submitted_at=record["submitted_at"],
        eta_hours=eta,
    )


@app.get("/api/escalations")
def list_escalations():
    return {"tickets": _ESCALATIONS[:50], "total": len(_ESCALATIONS)}


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics() -> AnalyticsResponse:
    if not _ANALYTICS:
        return AnalyticsResponse(
            total_queries=0,
            answered=0,
            escalated=0,
            clarified=0,
            out_of_scope=0,
            by_category={},
            average_confidence=0.0,
            average_latency_ms=0.0,
            recent=[],
        )

    by_cat: Dict[str, int] = {}
    answered = escalated = clarified = oos = 0
    conf_sum = 0
    lat_sum = 0
    for e in _ANALYTICS:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
        s = e["status"]
        if s == "Answered":
            answered += 1
        elif s == "Escalate":
            escalated += 1
        elif s == "Clarify":
            clarified += 1
        else:
            oos += 1
        conf_sum += e["confidence_pct"]
        lat_sum += e["latency_ms"]

    n = len(_ANALYTICS)
    return AnalyticsResponse(
        total_queries=n,
        answered=answered,
        escalated=escalated,
        clarified=clarified,
        out_of_scope=oos,
        by_category=by_cat,
        average_confidence=round(conf_sum / n, 1),
        average_latency_ms=round(lat_sum / n, 1),
        recent=list(_ANALYTICS)[-20:][::-1],
    )


@app.get("/api/samples")
def samples():
    return {
        "samples": [
            "How can I apply for a project?",
            "Can I claim AWS certification reimbursement?",
            "What should I do after 30 days on bench?",
            "How do I update my primary skill?",
            "I was rolled off from Project Falcon yesterday. My RM is on leave and I have an interview tomorrow. What should I do?",
            "I updated my resume but staffing still cannot see it.",
            "Can I claim reimbursement for a certification completed before joining EPAM?",
            "Nobody contacted me about staffing for 2 weeks",
            "Very frustrated with the bench process",
            "Help me",
        ]
    }


# ----- Frontend (single-page app) ------------------------------------- #

if os.path.isdir(FRONTEND_DIR):
    app.mount(
        "/static",
        StaticFiles(directory=FRONTEND_DIR),
        name="static",
    )

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
else:  # pragma: no cover
    @app.get("/")
    def index_missing() -> JSONResponse:
        return JSONResponse({"detail": "frontend not built"}, status_code=404)
