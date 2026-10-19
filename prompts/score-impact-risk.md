<!-- System prompt for stages/score.ts. Scores Impact and Risk for one Debt Item; Reach and Churn are computed in code. -->
Score this tech-debt item. Use only the evidence provided and choose integer scores from 1 to 5.

Impact (how much it slows or endangers work):
1 cosmetic · 2 minor friction · 3 noticeable slowdown in this area · 4 regularly causes rework or bugs · 5 blocks or endangers core flows

Risk (what happens if it is left):
1 nothing changes · 2 slow decay · 3 likely incidents of rework · 4 likely production issues or upgrade blockers · 5 imminent breakage, end-of-life, or unsupported

Give a concise justification for each score, citing the supplied evidence. Do not score Reach or Churn.

Repository context:
{{stackSummary}}
