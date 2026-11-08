# Usability review

Reviewed on November 8, 2026. The review followed first launch, model setup, starting and watching a match, leaving the page, and archive management.

| Area | Observed issue | Implemented improvement |
| --- | --- | --- |
| First visit | New users had to understand configuration modules first | A one-click demo is available without an API key |
| Call expectations | Speech counts and additional calls were unclear | Setup shows regulation speech count, character limits, preparation, and judging costs |
| Endpoint input | Full endpoints could produce duplicated paths | Client and server normalize endpoint tails while retaining provider prefixes |
| Unsaved settings | Switching providers or closing could discard work | The settings dialog tracks changes and offers explicit continue or discard actions |
| Settings during requests | Forms remained editable while saving | Saving locks the form and close action until completion |
| Endpoint checks | The former test action only fetched model IDs | The button now describes its actual Save & load models operation |
| Local models | Keyless local endpoints looked disconnected | Configured local providers receive a local connection status |
| Local service errors | Startup-only checks provided little recovery | Requests time out after 20 seconds, with periodic and focus/network reconnection checks |
| Accidental refresh | Partial matches had no durable record | The current tab saves snapshots approximately every two seconds and at page lifecycle events |
| Long transcripts | Output updates repeatedly redrew old speeches | Memoized messages and an ID reference index reduce unnecessary work |
| Reading earlier speech | New output pulled viewers back down | Upward navigation pauses following and offers a return-to-latest action |
| Archives | Deletion, failed searches, and malformed entries were difficult to handle | Undo, empty-search states, and per-entry recovery preserve readable records |
| Windows source launch | Runtime and dependency assumptions were unchecked | The launcher checks Node 22.12+ and installs locked dependencies |
| Language selection | English audiences needed a complete interface and output language | The saved language switch covers the interface and newly launched matches |

## Data and recovery

Refresh checkpoints use the current tab's `sessionStorage`. Archives and standings use `localStorage` for the current browser origin. Browser, hostname, and port each define separate storage contexts.

Recovery retains generated speeches in a readable interrupted archive. Leaving an active page ends its page-owned requests. On return, users can view the recovered record or start a new match. Completed results retain their original outcome.

Checkpoints contain match configuration and text. Provider credentials remain in the local provider store and its existing Windows encryption mechanism. Model-list discovery verifies the list endpoint. Live generation, permissions, compatibility, and usage charges are evaluated through the actual provider.

The Windows x64 portable beta includes its runtime, start/stop scripts, diagnostics, and package integrity checks. See the [Windows guide](windows-release.md). The service runs on the local loopback interface and stores user configuration and archives on the user's device.

## Further product work

1. **First-user feedback.** Continue checking download, extraction, first launch, and updates on other Windows devices through the repository feedback forms.
2. **Provider compatibility.** Build a verified matrix covering model lists, streaming, extended reasoning, interrupted connections, cancellation, and decision repair.
3. **Sharing and portability.** Extend the existing Markdown export with audience-oriented sharing, full archive backup/import, and portable rule versions.
4. **Hosted deployment.** A public hosted service requires an account model, credential ownership, quotas, cost controls, and request isolation appropriate to that deployment.

## Verification

Automated coverage includes scheduling, adjudication, appeals, cancellation, interrupted streams, credentials, endpoint normalization, malformed archives, snapshot recovery, completed results, unavailable browser storage, and actionable errors.

Browser checks use isolated data and mock endpoints for demos, pause/resume, transcript following, model discovery, endpoint normalization, unsaved settings, local connections, archive deletion undo, and search. Recovery conversion is automated. The embedded browser's navigation guard limited direct refresh testing during an active match, so full refresh behavior should also be exercised in a regular browser.
