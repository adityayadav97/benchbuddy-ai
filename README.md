# BenchBuddy AI

> **EngX Generative AI Kata — 19 Jun 2026**
> _Turning bench-associate questions into instant, grounded, escalatable answers._

[![Live Demo](https://img.shields.io/badge/▶%20Live%20Demo-benchbuddy.streamlit.app-7C5CFF?logo=streamlit&logoColor=white)](https://benchbuddy.streamlit.app/)
[![Python](https://img.shields.io/badge/Python-3.11+-18D2C4?logo=python&logoColor=white)](https://www.python.org/)
[![Tests](https://img.shields.io/badge/tests-11%2F11%20passing-34D399)](./tests/test_engine.py)
[![License](https://img.shields.io/badge/license-MIT-D65AA3)]()

🌐  **Live demo** → **<https://benchbuddy.streamlit.app/>**
📂  **Code** → this repo
📐  **Architecture** → [`architecture/diagram.md`](./architecture/diagram.md)

---

## What it does

BenchBuddy AI is a lightweight RAG-style assistant that answers PMO questions
for bench associates using **only** the approved PMO FAQ knowledge base.
Every reply ships with the four fields the kata requires:

| field         | example                                              |
| ------------- | ---------------------------------------------------- |
| `answer`      | "Update it in the Employee Profile Portal under Skills." |
| `confidence`  | `0.95` (also `confidence_pct: 95`)                   |
| `category`    | `Skills`                                             |
| `status`      | `Answered \| Escalate \| Clarify \| OutOfScope`      |

A live **modern dark-mode UI** sits on top of the same JSON API, with
quick-start chips, animated confidence bars, color-coded category badges,
source citations, an analytics dashboard, an escalation-ticket flow and a
browsable knowledge-base view.

---

## 1. Quickstart

### Option A — full FastAPI app (rich vanilla-JS UI)

```bash
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Open **<http://127.0.0.1:8765/>**.

### Option B — Streamlit version (one command, deployable to Streamlit Cloud)

```bash
streamlit run streamlit_app.py
```

Opens at **<http://localhost:8501>**. This is the version deployed on
**Streamlit Cloud** — see the badge at the top of this README.

### Run the test suite

```bash
source .venv/bin/activate
pip install pytest
python -m pytest tests/ -v
```

Expected: **11 passed**.

### Hit the API directly

```bash
curl -s http://127.0.0.1:8765/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Can I claim AWS certification reimbursement?"}' | python3 -m json.tool
```

---

## 2. Project structure

```
benchbuddy/
├── backend/                # FastAPI + retrieval engine
│   ├── main.py             #   REST endpoints
│   ├── engine.py           #   TF-IDF retrieval + reasoning + escalation
│   ├── kb_loader.py        #   merges PMO_FAQ_Knowledge_Base*.xlsx
│   └── models.py           #   Pydantic request/response schemas
├── frontend/               # Vanilla HTML / CSS / JS SPA
│   ├── index.html          #   5 tabs · chat · KB · analytics · tickets · about
│   ├── styles.css          #   dark + light themes, animated confidence bar
│   └── app.js              #   chat, modal, voice, shortcuts, toasts, export
├── data/                   # PMO FAQ knowledge base (xlsx) + jury queries
├── tests/                  # 11 pytest cases — all green in 0.7s
├── architecture/           # mermaid system + sequence + class diagrams
├── streamlit_app.py        # Streamlit Cloud entry point
├── requirements.txt
├── run.sh                  # one-command bootstrap
└── README.md
```

---

## 3. How it works (anti-hallucination by design)

```
                ┌──────────────────────────────┐
 user query ──▶ │ 1. fast guards               │── Clarify / OutOfScope
                ├──────────────────────────────┤
                │ 2. multi-intent splitter     │  ("rolled off ... and ... interview tomorrow")
                ├──────────────────────────────┤
                │ 3. TF-IDF retrieval          │  word n-grams (1,2) + char n-grams (3,5)
                │    + category lexical prior  │
                ├──────────────────────────────┤
                │ 4. KB-grounded composer      │  ONLY quotes verbatim FAQ answers
                ├──────────────────────────────┤
                │ 5. status decision           │
                │    · escalation triggers     │  ── Escalate (+ target team)
                │    · sentiment               │
                │    · confidence thresholds   │  ── Answered / Clarify / OutOfScope
                ├──────────────────────────────┤
                │ 6. confidence calibration    │  logistic squash + keyword boost
                └──────────────┬───────────────┘
                               ▼
                JSON { answer, confidence, confidence_pct,
                       category, status, escalation_target,
                       sources[], intents_detected[], sentiment,
                       latency_ms, query_id, timestamp }
```

See [`architecture/diagram.md`](./architecture/diagram.md) for full mermaid
flowchart + sequence diagram + UML class diagram.

### Why no LLM by default?

The kata explicitly says: avoid hallucination, no external knowledge, must
run fast. A pure retrieval engine satisfies all three and gives reproducible,
auditable answers. We still expose a clean integration point in
`engine.py::_compose_answer` so EPAM DIAL or a HuggingFace model can be
plugged in later without rewiring the API.

---

## 4. Jury / QA verification

### QA expected results

| Query              | Expected Category | Expected Action | BenchBuddy AI |
| ------------------ | ----------------- | --------------- | ------------- |
| Update my skill    | Skills            | Answer          | ✅ Skills · Answered (95%) |
| Reimbursement      | Certification     | Answer          | ✅ Certification · Answered (79%) |
| Nobody contacted me| Staffing          | Escalate        | ✅ Staffing · Escalate (64%) |
| Very frustrated    | Sentiment         | Escalate        | ✅ Sentiment · Escalate |
| Help me            | Unknown           | Clarify         | ✅ Unknown · Clarify |

### Jury challenge queries

1. _"I was rolled off from Project Falcon yesterday. My RM is on leave and I have an interview tomorrow."_
   ▶ **Escalate** · multi-intent (`Bench Policy + Interview + Onboarding`) · routed to **PMO Staffing Team / RM** · 80% conf · 3 ms.
2. _"I updated my resume but staffing still cannot see it."_
   ▶ **Escalate** · `Resume` · "still cannot" trigger → routed to PMO · 67% conf.
3. _"Can I claim reimbursement for a certification completed before joining EPAM?"_
   ▶ **Answered** · `Certification` · KB row "Eligible certifications may qualify after approval." · 79% conf.

All three are covered by automated pytest cases in [`tests/test_engine.py`](./tests/test_engine.py).

### Guard-rail tests

- **Out-of-scope** (`"What's the weather like?"`) → returns `OutOfScope` politely.
- **Never blank** — for `"xyzzy"`, `"asdfghjkl"`, `" "` the API always returns a non-empty answer + valid status.

---

## 5. Tech stack

| Layer    | Choice                                                       |
| -------- | ------------------------------------------------------------ |
| Backend  | **Python 3.13 + FastAPI** (rich UI) · **Streamlit** (cloud)  |
| Retrieval| **scikit-learn TF-IDF** (word + char n-grams) + cosine sim   |
| KB load  | **openpyxl**                                                 |
| Frontend | **Vanilla HTML / CSS / JS** — no build step                  |
| Tests    | **pytest**                                                   |

No internet, no model download — runs offline on a fresh laptop in ~5 s.

---

## 6. Extending (optional / bonus)

- **EPAM DIAL / HuggingFace LLM** — drop a call into
  `engine.py::_compose_answer` with the retrieved KB rows as context.
  The Pydantic contract stays the same.
- **Persistent analytics** — swap the in-memory deque in `main.py` for a
  SQLite table to track FAQ-coverage gaps over time.
- **MS Teams bot** — out of scope per the kata, but the JSON API is already
  in Teams adaptive-card-friendly shape.

---

## 7. Authors

Team — Aditya Yadav · EngX Generative AI Kata · 19 Jun 2026.
