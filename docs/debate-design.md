# Debate schedule and argument design

Structured debates follow Zhengming's published application schedule. Stages, shared materials, assigned questions, and citations are represented as traceable data.

## Research record

Public documentation and selected implementation files were reviewed on November 7, 2026. Local reference snapshots are stored under the Git-ignored `.local/references` directory. The application implementation uses independently written TypeScript and React code.

| Reference | Material reviewed | Application in Zhengming |
| --- | --- | --- |
| [AOSSIE DebateAI](https://github.com/AOSSIE-Org/DebateAI) | Formal stages and team services | One configuration connects preparation, scheduling, and spectating |
| [Agent-Debate](https://github.com/starshine-f/Agent-Debate/blob/main/app/graph.py) | State transitions for openings, rebuttals, and summaries | The scheduler assigns explicit stage responsibilities |
| [brainstorm-mcp](https://github.com/spranab/brainstorm-mcp/blob/main/src/debate.ts) | Independent openings, history, and strong objections | Blind first-round openings followed by whole-match engagement |
| [AI Colosseum](https://github.com/danielnepo1/ai-colosseum-debate/blob/main/src/colosseum/services/debate.py) | Frozen context, evidence constraints, and traces | Equal opening context and equal shared materials |
| [RoundTable](https://github.com/entropyvortex/roundtable/blob/main/lib/engine-rules.ts) | Minimum rounds and shared rules | Shared schedule functions serve setup, orchestration, and the timeline |
| [AI Debate Council](https://github.com/Evan1108-Coder/AI-Debate-Council/blob/master-app-interface/docs/DEBATE_INTELLIGENCE.md) | Questions, response records, and evidence ledgers | Assigned cross-examination and the clash index |
| [Agentic Coliseum](https://github.com/hseghetti/agentic-coliseum/blob/main/apps/debate-engine/app/graph/graph.py) | Stage ordering and final adjudication | Complete closings before rulings, with equal appeals and overtime |
| [Quorum Debate](https://github.com/gkaragioul/quorum-debate/blob/main/src/lib/council/claims.ts) | Event-based claim status and support records | Citations record relationships while argument quality remains subject to review |

Several project names have multiple similarly named repositories. The links identify the specific implementations reviewed.

## Structured matches

Regulation has at least four rounds and supports 1v1, 2v2, and 3v3. Open debate remains selectable, and existing configurations and archives retain their recorded format.

1. **Independent openings.** Every speaker receives the same shared materials, an empty formal transcript, and their own team's preparation. Spectators see all openings. Speakers receive the combined openings from the second round onward.
2. **Paired cross-examination.** Corresponding seats each ask one core question and receive an assigned answer. Message IDs bind each response to its question. Every team member has an opportunity to ask and answer.
3. **Rebuttals.** At least one round gives every member a speech to address unresolved issues across the match. Additional regulation rounds extend this stage.
4. **Closing statements.** Every member weighs the main exchanges and conclusions. Closing prompts require a fair opportunity for the opponent to address independent arguments and materials.

The starting side alternates each round. Regulation speech count is `2 × team size × (regulation rounds + 1)`. Structured turns receive independent waiting budgets, preserving the assigned respondent's opportunity to answer.

Judging can occur after regulation or in coached rounds. Unresolved results enter complete overtime rounds. Scoring after three overtime rounds, equal appeals after changed rulings, and a full extra round after two successful appeals remain part of the schedule.

## Motion terms and shared materials

The optional motion brief includes its type, definitions, scope, comparison criterion, and both teams' burdens of proof. Supplied terms enter preparation, speeches, appeals, and adjudication. Unspecified terms remain open for public argument.

Up to 12 shared cards contain stable `E` references, a title, content, a type, and a source. Types distinguish source materials, everyday examples, and hypothetical situations. Users provide the material text. Source cards are presented as supplied materials awaiting verification.

Validation checks content, length, and unique IDs. The complete motion brief and materials are archived and exported with the match.

## Traceable exchanges

Formal messages receive sequential `[M1]`, `[M2]`, and subsequent references. Speakers and judges can cite earlier rounds, and viewers can jump to the original speech. Materials use `[E1]` and subsequent references.

The clash index lists assigned questions and answers, the latest 40 explicit speech citations, material citations, and invalid references. A complete response indicates a normally completed speech containing visible text. Its relevance and persuasive quality are evaluated against the actual exchange.

Reference counts describe recorded relationships. Whole-match scoring follows the judge's published rubric, and adjudication prompts request decisive speech and material references.

## Verification scope

Automated checks cover all team sizes, stage fairness, starting-side rotation, assigned responses, independent openings, complete history, material validation, invalid references, interrupted answers, concession, overtime, appeals, and endpoint regressions.

Browser checks use scripted demos to exercise setup, material editing, stage progression, reference navigation, and archive replay. Actual providers are evaluated separately for stage compliance, citation quality, long-context response behavior, and adjudication on particular motions. The index retains the generated record for human review.
