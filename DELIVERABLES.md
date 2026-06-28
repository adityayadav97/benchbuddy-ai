# BenchBuddy AI · Deliverables Map

Maps every kata-required deliverable to the exact file in this repo. Each
"Must Have" and "Nice to Have" item from the official slide is present.

---

## ✅ Must Have

| # | Deliverable          | Location                                                              | Notes                                                              |
| - | -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 | **Prompt samples**   | `prompts/prompt_samples.md`                                           | 8 concrete prompts (RAG, intent, category, sentiment, etc.)        |
| 2 | **Knowledge base**   | `data/PMO_FAQ_Knowledge_Base.xlsx` + `data/PMO_FAQ_Knowledge_Base_50_FAQs.xlsx` | Merged and de-duped into 54 FAQs by `backend/kb_loader.py`        |
| 3 | **Working application** | Run `./run.sh` → opens at <http://127.0.0.1:8765/>                  | 5 tabs · 10 REST endpoints · 17 UX features                        |
| 4 | **Source code**      | `backend/` (Python/FastAPI) + `frontend/` (vanilla HTML/CSS/JS)       | ~300 LOC backend + ~1500 LOC frontend, zero build step             |
| 5 | **Test cases**       | `tests/test_engine.py` (11 pytest cases) + `artifacts/test_cases.csv` (28 documented cases) | All 11 pytest cases pass in 0.7s                                 |

---

## ✅ Nice to Have

| # | Deliverable                | Location                                                  | Notes                                                                          |
| - | -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1 | **UML diagrams**           | `architecture/diagram.md`                                 | Mermaid: system flowchart + sequence diagram + class diagram + decision matrix |
| 2 | **Analytics dashboard**    | App → Analytics tab (also `/api/analytics`)               | Donut chart of status mix, per-category bars, recent log, 7 KPI tiles          |
| 3 | **Confidence scoring engine** | `backend/engine.py::_calibrate_confidence`             | Logistic squash + category keyword boost · explained in `prompts/prompt_techniques.md` §6 |

---

## 📁 Quick file-by-file legend

```
benchbuddy/
├── README.md                         ← project overview + run guide
├── DELIVERABLES.md                   ← THIS FILE — kata deliverables map
├── run.sh                            ← one-command bootstrap
├── requirements.txt
│
├── backend/                          ← Source code (Python/FastAPI)
│   ├── main.py                       ← REST endpoints (10 of them)
│   ├── engine.py                     ← Retrieval + reasoning + confidence engine
│   ├── kb_loader.py                  ← Knowledge-base loader
│   └── models.py                     ← Pydantic schemas (output contract)
│
├── frontend/                         ← Source code (vanilla HTML/CSS/JS)
│   ├── index.html                    ← SPA shell (5 tabs)
│   ├── styles.css                    ← Dark + light theme
│   └── app.js                        ← Chat, modal, voice, shortcuts, etc.
│
├── data/                             ← Knowledge base + jury input
│   ├── PMO_FAQ_Knowledge_Base.xlsx
│   ├── PMO_FAQ_Knowledge_Base_50_FAQs.xlsx
│   ├── QA_Expected_Results.xlsx
│   └── Jury_Challenge_Queries.txt
│
├── tests/                            ← Test cases
│   └── test_engine.py                ← 11 automated pytest cases
│
├── prompts/                          ← Prompt samples + jury Q&A material
│   ├── prompt_samples.md             ← 8 ready-to-use prompt templates
│   ├── prompt_techniques.md          ← Why each technique + design patterns
│   ├── presentation_script.md        ← Read-aloud script (15-min demo)
│   └── topic_checklist.md            ← Every talking point you can use
│
├── architecture/                     ← UML / system diagrams
│   └── diagram.md                    ← Mermaid: flow, sequence, class, matrix
│
└── artifacts/                        ← Extra artefacts the jury can review
    └── test_cases.csv                ← 28 documented test scenarios
```

---

## 🏁 How the jury will verify each deliverable

1. **Prompt samples** — open `prompts/prompt_samples.md`, browse 8 sections.
2. **Knowledge base** — open `data/PMO_FAQ_Knowledge_Base_50_FAQs.xlsx`, see 50 rows; or visit the **Knowledge Base** tab in the running app.
3. **Working application** — run `./run.sh`, open the URL, click any chip; observe sub-millisecond responses with status / category / confidence / sources.
4. **Source code** — open `backend/engine.py` (the core ~280 LOC) and `frontend/app.js` (the UI logic).
5. **Test cases** — run `./run.sh test` (or `python -m pytest tests/ -v`); see 11 passed in <1 second.
6. **UML diagrams** — open `architecture/diagram.md` (renders inline on GitHub or any mermaid viewer).
7. **Analytics dashboard** — click the Analytics nav item in the app; or hit `GET /api/analytics`.
8. **Confidence scoring engine** — `backend/engine.py::_calibrate_confidence` (5 lines, fully documented).

---

## 📌 Beyond the slide — extras we shipped

These weren't on the deliverables list but make the demo and submission
stronger:

- **One-command run script** (`run.sh`) — boots venv + installs + serves.
- **Escalation ticket flow** — `POST /api/escalations` mints `PMO-XXXXXX` ids.
- **Tickets dashboard** — dedicated tab showing all session escalations.
- **Source detail modal** — click any cited FAQ to see full row + related 5.
- **Follow-up panel** — bot suggests related questions.
- **Voice input** (Web Speech API, Chrome/Edge).
- **Dark / Light theme toggle** with persistence.
- **Keyboard shortcuts** (`/`, `?`, `t`, `v`, `e`, `p`, `Cmd+K`, `Cmd+L`, `Cmd+Shift+C`, `g k`, etc.).
- **Export chat** as JSON.
- **Print-friendly stylesheet** for handing over.
- **Toast notifications** for every action.
- **Live in-sidebar stats** (FAQs / asked / tickets).
- **Onboarding hint banner** (dismissable, persisted).
- **KB filter pills + search highlighting**.
- **Responsive layout** down to mobile width.

---

## ✅ Final acceptance check (run this before uploading)

```bash
cd benchbuddy
./run.sh test          # → 11 passed in 0.7s
./run.sh               # → open http://127.0.0.1:8765/ and click any chip
```

Both must pass green. If they do, all five Must-Have and all three
Nice-to-Have boxes on the slide are ticked.
