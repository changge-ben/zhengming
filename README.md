# Zhengming · AI Debate Arena

Choose a question, assemble competing AI teams, and watch the arguments unfold live. Models prepare together, challenge each other across rounds, and can appeal a judge's ruling.

[English repository on GitHub](https://github.com/changge-ben/zhengming) · [中文仓库与使用说明 · Gitee](https://gitee.com/shi-blca/zhengming)

## Start with a demo

[Download the Windows portable beta](https://github.com/changge-ben/zhengming/releases/download/v1.1.0-beta.2/zhengming-1.1.0-beta.2-windows-x64.zip)

1. Extract the complete ZIP into a folder.
2. Double-click **启动争鸣.cmd** to start the app. The portable package includes its own runtime.
3. Select **EN** in the top bar, then **Watch a demo**. Scripted demos work without an API key.
4. Open **Model connections** to configure your own provider for live debates.

The companion scripts **停止争鸣.cmd** and **环境诊断.cmd** stop the local service and generate a diagnostic report. See the [Windows guide](docs/windows-release.md) for updates, data locations, and troubleshooting.

The app runs locally on your computer. Live model usage is billed by your selected provider.

## What you can do

- **Assemble a lineup.** Choose 1v1, 2v2, or 3v3. Every speaker and the judge can use a separately selected provider and model ID.
- **Let teams prepare.** Both teams plan in separate rooms. Each member gets two preparation turns. Spectators can view both teams' preparation speeches, and each model receives its own team's discussion.
- **Choose an open or structured debate.** Structured matches progress through independent openings, paired cross-examination, rebuttals, and closing statements. The starting side alternates across rounds.
- **Set the terms.** Define the motion, scope, comparison criterion, and burdens of proof. Supply shared source cards, everyday examples, or clearly labeled hypotheticals.
- **Follow the whole match.** Speeches and shared materials have clickable `[M1]` and `[E1]` references. The clash index tracks assigned questions, responses, and citations.
- **Combine expression styles.** Conversational, sharp, humorous, literary, rigorous, and concise delivery can be selected together. Models decide their own reasoning, tactics, and roles.
- **Join the questioning.** Submit audience questions, pause after a turn, resume, or end the match.
- **Invite a judge.** Use final-only adjudication or coached rounds. Each side receives an equal appeal opportunity, including after the winner changes. Two successful appeals send both teams into a full overtime round.
- **Keep the record.** Browse the latest 20 complete archives, search, replay, export Markdown, and undo the latest archive deletion. Cumulative model results are stored separately. Scripted demos are excluded from standings by default.

## English and Chinese

The top-bar switch changes the interface language and saves the preference in your browser. First visits follow the browser's language. New matches use the language selected at launch, including preparation, rulings, and appeals. Existing topics, speeches, and actual model IDs are displayed in their original form.

The default visible-text budget is **400 characters per speech**, with **180 seconds** for connection, reasoning, and output. English spaces count toward the character budget. Available presets include 200, 400, 600, or 1,000 characters and waits of 60, 120, 180, 300, or 600 seconds. Judge rulings and reviews allow 800 characters.

Unresolved matches enter overtime. After three complete overtime rounds, an enabled judge uses the published whole-match scoring rubric. Matches without a judge continue until concession, explicit forfeiture, or manual stop.

## Run from source

Install Node.js **22.12 or later**, then clone the English repository.

```bash
git clone https://github.com/changge-ben/zhengming.git
cd zhengming
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173/). The development frontend forwards `/api` to port 8787. Windows users can also double-click **启动争鸣.cmd** inside the source folder.

For the Chinese distribution, use the [Gitee repository](https://gitee.com/shi-blca/zhengming) and its domestic download instructions.

### Production build

```bash
npm run build
npm start
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787/). The service listens on the local loopback interface.

## Connect your models

1. Open **Model connections** and choose or add a provider.
2. Enter the provider's **Base URL**, **API key**, and **model IDs**. Put one model ID on each line.
3. Use **Save & load models** to discover IDs supported by the endpoint. Save again after adding discovered models.
4. In **Lineup**, choose **Live models** and assign models to each speaker.
5. If judging is enabled, assign a judge model your provider account can access.

| Protocol | Example Base URL | Appended endpoint |
| --- | --- | --- |
| OpenAI-compatible Chat Completions | `https://api.example.com/v1` | `/chat/completions` |
| Anthropic Messages | `https://api.anthropic.com/v1` | `/messages` |
| Ollama or another local compatible service | `http://localhost:11434/v1` | `/chat/completions` |

Providers must support streaming text output. Advanced settings control the length parameter, including `max_tokens`, `max_completion_tokens`, or omitting that parameter for compatible services. Custom providers can be added as needed. Model IDs are supplied by your provider.

### Saving credentials

API keys are session-only by default. On Windows, **Remember API key** encrypts the saved copy with Windows DPAPI for the current account and machine. Remembered keys are restored when the service starts. Unchecking the option and saving removes the saved copy while retaining the active session key. **Clear current key** clears both copies.

Provider metadata and remembered encrypted keys are stored in `.local/providers.json` for source installations, or `%LOCALAPPDATA%\Zhengming` for the portable package. Provider APIs expose connection status to the browser. Keys stay on the local server.

Match archives and model results are stored in the current browser. In-progress snapshots use the current tab's session storage. Refresh recovery retains generated content as an interrupted archive. Export important matches before clearing browser data or changing devices.

## Fair adjudication

The judge evaluates both teams' core arguments, rebuttals, and the full match record. The published 100-point rubric allocates 30 points to answers to the judge, 20 to rigor, 20 to coherence, 15 to rebuttal, 10 to evidence, and 5 to expression. Equal totals compare the published dimensions in order. Both teams receive equal response points until each has had a fair opportunity to answer.

Read the [debate design notes](docs/debate-design.md) for the schedule, reference system, and evaluation scope.

## Development checks

```bash
npm run check
npm test
```

On Windows, build and test the portable package with the following commands.

```powershell
npm run package:windows
npm run test:portable
```

The latest application checks include 105 automated tests and eight portable-package checks. The [usability review](docs/usability-review.md) records completed improvements and current behavior.

## Feedback

Use the [issue and feature request forms](https://github.com/changge-ben/zhengming/issues/new/choose). Include the app version, operating system, steps to reproduce, and relevant errors. For API issues, include the provider name, model ID, and protocol. Remove credentials and private conversation content before posting public feedback.
