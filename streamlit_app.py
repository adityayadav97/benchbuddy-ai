"""BenchBuddy AI — Streamlit wrapper for Streamlit Cloud deployment.

Streamlit Cloud only runs Streamlit apps, so we wrap the same
BenchBuddyEngine and expose chat + KB browser + analytics + tickets
through Streamlit widgets.

Local run:
    streamlit run streamlit_app.py

Deploy:
    Push to GitHub → connect on share.streamlit.io → entry file is
    this file → done.
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import List

import streamlit as st

from backend.engine import BenchBuddyEngine

# ============================================================
# Page config + theme
# ============================================================
st.set_page_config(
    page_title="BenchBuddy AI · PMO Knowledge Assistant",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ============================================================
# Brand CSS
# ============================================================
st.markdown(
    """
    <style>
    /* Brand palette */
    :root {
      --accent: #7c5cff;
      --accent-2: #18d2c4;
      --accent-3: #ff7eb6;
      --good: #34d399;
      --bad:  #f87171;
      --warn: #fbbf24;
    }
    .stApp { background: linear-gradient(180deg, #0b0d17, #11142a); }
    h1, h2, h3, h4 { color: #e7eaf6 !important; }
    .stChatMessage { background: rgba(255,255,255,0.04); border-radius: 12px; }
    .badge {
      display:inline-block; padding:3px 10px; border-radius:999px;
      font-size:11px; font-weight:600; margin-right:6px; text-transform:uppercase;
      letter-spacing:0.05em;
    }
    .b-answered   { background: rgba(52,211,153,0.18); color:#6ee7b7;}
    .b-escalate   { background: rgba(248,113,113,0.18); color:#fca5a5;}
    .b-clarify    { background: rgba(251,191,36,0.18);  color:#fcd34d;}
    .b-oos        { background: rgba(148,163,184,0.18); color:#cbd5e1;}
    .b-cat        { background: rgba(124,92,255,0.18);  color:#c4b5fd;}
    .b-conf       { background: rgba(24,210,196,0.18);  color:#5eead4;
                    font-family:'JetBrains Mono', monospace;}
    .source-row {
      background: rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08);
      padding:10px 12px; margin:6px 0; border-radius:10px; font-size:13px;
    }
    .escalation-banner {
      background: rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.3);
      color:#fca5a5; padding:10px 14px; border-radius:10px; margin-top:10px;
      font-size:13px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# ============================================================
# Engine (cached) + session state
# ============================================================
@st.cache_resource
def get_engine() -> BenchBuddyEngine:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    return BenchBuddyEngine(data_dir)


engine = get_engine()

if "history" not in st.session_state:
    st.session_state.history = []   # list of {role, text, data?}
if "tickets" not in st.session_state:
    st.session_state.tickets = []
if "queries_asked" not in st.session_state:
    st.session_state.queries_asked = 0

# ============================================================
# Sidebar
# ============================================================
with st.sidebar:
    st.markdown("### 🤖 BenchBuddy AI")
    st.caption("PMO Knowledge Assistant")
    st.markdown("---")

    col1, col2, col3 = st.columns(3)
    col1.metric("FAQs",     len(engine.kb))
    col2.metric("Asked",    st.session_state.queries_asked)
    col3.metric("Tickets",  len(st.session_state.tickets))

    st.markdown("---")
    tab = st.radio(
        "Navigate",
        ["💬 Chat", "📚 Knowledge Base", "📊 Analytics",
         "🎫 Tickets", "⚙️ About"],
        label_visibility="collapsed",
    )

    st.markdown("---")
    if st.button("🧹 Clear chat", use_container_width=True):
        st.session_state.history = []
        st.rerun()
    st.caption("BenchBuddy AI · EngX Generative AI Kata · 19 Jun 2026")


# ============================================================
# Helpers
# ============================================================
STATUS_BADGE = {
    "Answered":   ("b-answered",  "✓ Answered"),
    "Escalate":   ("b-escalate",  "↗ Escalated"),
    "Clarify":    ("b-clarify",   "? Clarify"),
    "OutOfScope": ("b-oos",       "○ Out of scope"),
}


def render_bot_reply(data):
    status_class, status_label = STATUS_BADGE.get(
        data["status"], ("b-oos", data["status"])
    )
    badges = (
        f'<span class="badge b-cat">{data["category"]}</span>'
        f'<span class="badge {status_class}">{status_label}</span>'
        f'<span class="badge b-conf">{data["confidence_pct"]}%</span>'
        f'<span class="badge">{data["latency_ms"]} ms</span>'
    )
    st.markdown(badges, unsafe_allow_html=True)
    st.markdown(data["answer"].replace("\n", "  \n"))
    st.progress(data["confidence"], text=f"Confidence: {data['confidence_pct']}%")

    if data.get("sources"):
        with st.expander(f"📎 Sources ({len(data['sources'])})", expanded=False):
            for s in data["sources"]:
                st.markdown(
                    f'<div class="source-row"><b>#{s["rank"]} · '
                    f'{s["question"]}</b><br>'
                    f'<span style="color:#a4abce">{s["answer"]}</span><br>'
                    f'<span class="badge b-cat">{s["category"]}</span>'
                    f'<span style="float:right;color:#5eead4;font-family:monospace">'
                    f'{s["score"]*100:.1f}%</span></div>',
                    unsafe_allow_html=True,
                )

    if data["status"] == "Escalate":
        st.markdown(
            f'<div class="escalation-banner">📣 Will route to: '
            f'<b>{data.get("escalation_target", "PMO Team")}</b></div>',
            unsafe_allow_html=True,
        )
        with st.expander("🚨 Submit to PMO", expanded=False):
            with st.form(key=f"esc_{data['query_id']}", clear_on_submit=True):
                name = st.text_input("Your name", placeholder="Aditya Yadav")
                email = st.text_input("Email", placeholder="aditya@example.com")
                notes = st.text_area("Notes (optional)",
                                     placeholder="Any extra context for PMO…")
                if st.form_submit_button("Submit to PMO",
                                          use_container_width=True,
                                          type="primary"):
                    tid = "PMO-" + str(int(time.time() * 1000))[-6:]
                    target_map = {
                        "Staffing": ("PMO Staffing Team", 4),
                        "Bench Policy": ("PMO Staffing Team", 4),
                        "Interview": ("Hiring Coordinator", 8),
                        "Certification": ("PMO Certification Desk", 24),
                        "Onboarding": ("Project Onboarding Coordinator", 8),
                        "Resume": ("PMO Resume Desk", 8),
                        "Sentiment": ("PMO Lead", 4),
                    }
                    routed, eta = target_map.get(
                        data["category"], ("PMO Team", 12))
                    st.session_state.tickets.insert(0, {
                        "ticket_id": tid,
                        "query": data.get("query", data["answer"][:80]),
                        "category": data["category"],
                        "status": "OPEN",
                        "routed_to": routed,
                        "eta_hours": eta,
                        "submitted_at": datetime.now(
                            timezone.utc).isoformat(timespec="seconds"),
                        "associate_name": name, "associate_email": email,
                        "notes": notes,
                    })
                    st.success(
                        f"Ticket **{tid}** created · routed to **{routed}** · "
                        f"ETA {eta}h"
                    )


def ask(query: str):
    st.session_state.queries_asked += 1
    start = time.perf_counter()
    result = engine.answer(query)
    latency_ms = int((time.perf_counter() - start) * 1000)
    data = {
        "answer":           result.answer,
        "confidence":       result.confidence,
        "confidence_pct":   int(round(result.confidence * 100)),
        "category":         result.category,
        "status":           result.status,
        "escalation_target":result.escalation_target,
        "sources": [
            {"id": rid, "rank": r + 1, "question": row.question,
             "answer": row.answer, "category": row.category, "score": score}
            for r, (rid, row, score) in enumerate(result.sources)
        ],
        "sentiment":        result.sentiment,
        "latency_ms":       latency_ms,
        "query_id":         uuid.uuid4().hex[:8],
        "timestamp":        datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "query":            query,
    }
    st.session_state.history.append({"role": "user", "text": query})
    st.session_state.history.append({"role": "bot", "data": data})


# ============================================================
# Pages
# ============================================================

# ---- CHAT ----
if tab == "💬 Chat":
    st.title("Turning questions into instant answers")
    st.caption(
        "Ask anything about bench, staffing, certifications, learning, "
        "resume, interviews or onboarding.")

    if not st.session_state.history:
        st.markdown("### 👋 Try one of these sample questions")
        sample_cols = st.columns(2)
        samples = [
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
        for i, s in enumerate(samples):
            if sample_cols[i % 2].button(s, key=f"sample_{i}",
                                          use_container_width=True):
                ask(s)
                st.rerun()

    # render history
    for msg in st.session_state.history:
        with st.chat_message("user" if msg["role"] == "user" else "assistant"):
            if msg["role"] == "user":
                st.markdown(msg["text"])
            else:
                render_bot_reply(msg["data"])

    # composer
    if prompt := st.chat_input("Ask a question…"):
        ask(prompt)
        st.rerun()

# ---- KB ----
elif tab == "📚 Knowledge Base":
    st.title("Knowledge Base")
    st.caption(f"{len(engine.kb)} approved PMO FAQ rows that ground every answer.")

    # category filter
    cats = sorted({r.category for r in engine.kb})
    cat_counts = {c: sum(1 for r in engine.kb if r.category == c) for c in cats}
    selected = st.multiselect(
        "Filter by category",
        options=cats,
        format_func=lambda c: f"{c} ({cat_counts[c]})",
        default=[],
    )
    q = st.text_input("Search the KB", placeholder="e.g. reimbursement, skill, resume")

    rows = engine.kb
    if selected:
        rows = [r for r in rows if r.category in selected]
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in
                f"{r.category} {r.question} {r.answer}".lower()]

    st.markdown(f"**{len(rows)} matching FAQs**")
    for r in rows:
        with st.expander(f"**{r.question}**  ·  _{r.category}_"):
            st.markdown(r.answer)

# ---- ANALYTICS ----
elif tab == "📊 Analytics":
    st.title("Session Analytics")
    st.caption("Live metrics for this Streamlit session.")

    asked   = st.session_state.queries_asked
    bots    = [m for m in st.session_state.history if m["role"] == "bot"]
    answered = sum(1 for m in bots if m["data"]["status"] == "Answered")
    escalated = sum(1 for m in bots if m["data"]["status"] == "Escalate")
    clarified = sum(1 for m in bots if m["data"]["status"] == "Clarify")
    oos       = sum(1 for m in bots if m["data"]["status"] == "OutOfScope")
    avg_conf = (sum(m["data"]["confidence_pct"] for m in bots) / len(bots)) if bots else 0
    avg_lat  = (sum(m["data"]["latency_ms"] for m in bots) / len(bots)) if bots else 0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total queries", asked)
    c2.metric("Answered", answered)
    c3.metric("Escalated", escalated)
    c4.metric("OutOfScope", oos)

    c5, c6, c7 = st.columns(3)
    c5.metric("Clarified", clarified)
    c6.metric("Avg confidence", f"{avg_conf:.0f}%")
    c7.metric("Avg latency", f"{avg_lat:.0f} ms")

    if bots:
        st.subheader("By category")
        cat_counts = {}
        for m in bots:
            c = m["data"]["category"]
            cat_counts[c] = cat_counts.get(c, 0) + 1
        st.bar_chart(cat_counts)

        st.subheader("Recent queries")
        for m in reversed(bots[-10:]):
            d = m["data"]
            st.markdown(
                f"`{d['category'][:12]:<12}` · `{d['status']:<10}` · "
                f"`{d['confidence_pct']:>3}%` · "
                f"{d.get('query', '(direct)')[:90]}"
            )
    else:
        st.info("No queries yet — ask something in the Chat tab.")

# ---- TICKETS ----
elif tab == "🎫 Tickets":
    st.title("Escalation Tickets")
    st.caption("Queries you (or the bot) routed to PMO during this session.")
    if not st.session_state.tickets:
        st.info("No tickets yet. Trigger an escalation and click "
                "*Submit to PMO* in the Chat tab.")
    else:
        for t in st.session_state.tickets:
            with st.container(border=True):
                cols = st.columns([1, 3])
                cols[0].markdown(f"### `{t['ticket_id']}`")
                cols[0].markdown(f"**{t['routed_to']}**")
                cols[0].caption(f"ETA {t['eta_hours']}h · {t['status']}")
                cols[1].markdown(f"**Question**: {t['query']}")
                cols[1].markdown(
                    f"<span class='badge b-cat'>{t['category']}</span> "
                    f"<span style='color:#a4abce'>{t['submitted_at']}</span>",
                    unsafe_allow_html=True,
                )
                if t.get("notes"):
                    cols[1].markdown(f"📝 _{t['notes']}_")

# ---- ABOUT ----
elif tab == "⚙️ About":
    st.title("About BenchBuddy AI")
    st.caption("Built for the EngX Generative AI Kata · 19 June 2026")
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("What it does")
        st.markdown(
            "- Accepts free-text associate queries\n"
            "- Retrieves grounding rows from the approved PMO FAQ KB\n"
            "- Returns **answer · confidence · category · status**\n"
            "- Escalates time-sensitive / negative-sentiment queries\n"
            "- Never hallucinates — answers are verbatim KB quotes"
        )
        st.subheader("Tech stack")
        st.markdown(
            "- **Backend**: Python 3.13 + TF-IDF hybrid retrieval\n"
            "- **Frontend**: Streamlit (this demo) + Vanilla SPA (full app)\n"
            "- **Knowledge**: 54 FAQs from `data/PMO_FAQ_Knowledge_Base*.xlsx`\n"
            "- **Tests**: 11 pytest cases, all green in 0.7 s"
        )
    with c2:
        st.subheader("Guard-rails")
        st.markdown(
            "1. **Closed-world** — verbatim KB quoting only\n"
            "2. **OutOfScope** — polite refusal of weather/salary/gossip\n"
            "3. **Clarify** — vague inputs prompt for detail\n"
            "4. **Escalate** — urgent / blocked phrases route to PMO\n"
            "5. **Sentiment net** — negative emotion auto-escalates\n"
            "6. **Never blank** — every input returns a valid status"
        )
        st.subheader("Resources")
        st.markdown(
            "- 📂 [GitHub repo](https://github.com/adityayadav97/benchbuddy-ai)\n"
            "- 📐 [Architecture diagram](https://github.com/adityayadav97/benchbuddy-ai/blob/main/architecture/diagram.md)\n"
            "- ✅ [11 automated tests](https://github.com/adityayadav97/benchbuddy-ai/blob/main/tests/test_engine.py)"
        )
