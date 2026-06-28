# BenchBuddy AI — Architecture

## System diagram

```mermaid
flowchart LR
    subgraph Client["Browser (single-page app)"]
        UI[Chat UI · Chips · Confidence bar<br/>Sources · Analytics · KB browser]
    end

    subgraph API["FastAPI service · uvicorn :8765"]
        H[/GET /api/health/]
        Q[/POST /api/query/]
        F[/GET /api/faqs/]
        A[/GET /api/analytics/]
        S[/GET /api/samples/]
    end

    subgraph Engine["BenchBuddyEngine"]
        G1[1 · Guard clauses<br/>Clarify · OutOfScope]
        SP[2 · Multi-intent splitter]
        RT[3 · TF-IDF retrieval<br/>word 1-2 gram + char 3-5 gram]
        PR[3a · Category lexical prior<br/>+0.08 boost on keyword hits]
        CP[4 · KB-grounded composer<br/>dedupe categories + min-score]
        DS[5 · Status decider<br/>Escalation triggers · Sentiment · Thresholds]
        CC[6 · Confidence calibrator<br/>logistic squash + keyword boost]
    end

    subgraph KB["Knowledge Base"]
        X1[PMO_FAQ_Knowledge_Base_50_FAQs.xlsx]
        X2[PMO_FAQ_Knowledge_Base.xlsx]
        L[kb_loader.py · merge + dedupe]
        M[(In-memory FAQRow list<br/>54 rows)]
    end

    UI -- "JSON {query}" --> Q
    UI --> H
    UI --> F
    UI --> A
    UI --> S

    Q --> G1 --> SP --> RT --> PR --> CP --> DS --> CC --> Q
    RT -. cosine .-> M
    X1 --> L --> M
    X2 --> L

    DS -. "Escalate · escalation_target" .-> Q
```

## Request lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant U as Associate (browser)
    participant API as FastAPI /api/query
    participant E as BenchBuddyEngine
    participant KB as TF-IDF KB index

    U->>API: POST { "query": "I was rolled off ... interview tomorrow" }
    API->>E: engine.answer(query)
    E->>E: guard clauses (Clarify / OutOfScope)
    E->>E: split into sub-intents
    loop per sub-intent
        E->>KB: cosine(word + char) + category prior
        KB-->>E: top-3 FAQRows + scores
    end
    E->>E: compose answer (KB-grounded only)
    E->>E: decide status (Answered · Escalate · Clarify · OutOfScope)
    E->>E: calibrate confidence
    E-->>API: EngineResponse
    API-->>U: JSON { answer, confidence, category, status, sources, ... }
```

## UML Class diagram (data model + engine)

```mermaid
classDiagram
    class BenchBuddyEngine {
      <<service>>
      -List~FAQRow~ kb
      -TfidfVectorizer _word_vec
      -TfidfVectorizer _char_vec
      +answer(query) EngineResponse
      -_retrieve(text) List
      -_compose_answer(per_intent) tuple
      -_decide_status(...) tuple
      -_calibrate_confidence(...) float
      -_split_intents(q) List~str~
      -_sentiment(q) str
    }

    class FAQRow {
      <<entity>>
      +str category
      +str question
      +str answer
      +text() str
    }

    class QueryRequest {
      <<DTO>>
      +str query
      +Optional~str~ associate_id
    }

    class KBMatch {
      <<value>>
      +int id
      +int rank
      +str question
      +str answer
      +str category
      +float score
    }

    class QueryResponse {
      <<DTO>>
      +str answer
      +float confidence
      +int confidence_pct
      +str category
      +str status
      +Optional~str~ escalation_target
      +List~KBMatch~ sources
      +List~str~ intents_detected
      +str sentiment
      +int latency_ms
      +str query_id
      +str timestamp
    }

    QueryRequest --> BenchBuddyEngine : POST /api/query
    BenchBuddyEngine --> QueryResponse : produces
    BenchBuddyEngine "1" o-- "*" FAQRow : loads
    QueryResponse "1" *-- "*" KBMatch : has sources
    FAQRow ..> KBMatch : derives from
```

## Status decision matrix

| Signal                                    | Status         | Notes                                      |
| ----------------------------------------- | -------------- | ------------------------------------------ |
| Greeting / single word / `?`              | `Clarify`      | guard clause                               |
| Weather / cricket / salary / promotion    | `OutOfScope`   | guard clause                               |
| Escalation phrase (urgent · still cannot · nobody · frustrated · rolled off · RM on leave · interview tomorrow) | `Escalate`     | routed to `PMO Staffing` / `Hiring Coordinator` / `PMO Cert Desk` / `Onboarding Coord` / `PMO Team` |
| Negative sentiment + low retrieval        | `Escalate`     | category becomes `Sentiment`               |
| Cosine similarity ≥ 0.15                  | `Answered`     | KB row quoted verbatim                     |
| Cosine 0.07 – 0.15                        | `Clarify`      | bot asks for more detail                   |
| Cosine < 0.07 and no domain keyword       | `OutOfScope`   | polite refusal                             |
