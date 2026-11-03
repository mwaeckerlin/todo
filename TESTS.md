# Tests

Feature IDs F1 through F12 match the trailing #F1 through #F12 references in TODO.md and the specification in FEATURES.md. Documentation contracts check that every completed feature retains its unique reference, detailed chapter and product-area placement.

The complex public sample in `tests/fixtures/opensource.md` is covered by the Rust Markdown round-trip test, complete original SVG/HTML parity and a browser journey through Load, Bubbles, child-board navigation, List and reload (F3, F4, F5, F12). `npm run screenshots` captures those three live views through real Authentik login and validates the imported task count before writing the README pictures. Canonical renderer provenance uses the recorded SHA-256 and optionally an external source, so tests run in a standalone clone.

The complete runner builds and checks the frontend workspace and audits the project's own lockfile, including when the checkout is registered as a workspace of another project (F9). Browser cleanup retains the print and persistence fixture projects so subsequent service/database restarts, exports and visual checks read the saved records. Subtree-move fixtures use a unique document title in each browser run so a previous cleanup failure cannot collide with the next browser's project. The live-update fixture fills every Board status before measuring horizontal and vertical scroll retention and creates sixty actual paragraphs through Markdown source before measuring formatted-editor scrolling in both browsers (F6). The table command check inspects the visible editable table's three rows, three header cells and six body cells; paragraph conversion selects the formatting menu option separately from its identically named toggle (F7).

Browser journeys wait for an opened editor before inspecting its fields, scope assignment options to the visible listbox and select ancestors through the desktop breadcrumb. Authentication submits the provider's native forms in each browser locale. Logout checks immediate view removal before awaiting server revocation; the expiry clock is installed before the application schedules its session timer. API contracts distinguish unprefixed operation paths from the configured server base path. The complete sidebar matrix waits for responsive layout changes, measures every control and text range together in the browser and retains every viewport, text-size and scroll-position capture. Selection fixtures use independently searchable titles; formatting checks read the editor's rendered task-list markers. Live-update checks retain the opened parent's visible fill while checking unchanged navigation and draft state.

## Loading and Session Regressions

- **F1** `src/service.rs` › logout after role removal retains Origin and CSRF validation, revokes the stored session and expires its cookie; browser callback errors retain their HTTP status and the application entry while API requests retain JSON errors. `tests/service.spec.ts` › unmapped sign-in retains recovery controls at phone, tablet and desktop widths, signs out through real Authentik, permits administrator sign-in and renders a declined callback through the same entry.
- **F1, F3** `tests/service.spec.ts` › compact workspace sidebar retains complete controls across screen and font sizes — Checks every sidebar control and its text against its actual clipping ancestors, scrolls each into view, opens all filter and image fields and captures the top and bottom across desktop, partial-width, phone, tablet and breakpoint sizes at 100%, 125%, 150% and 200% root font sizes in Chromium and Firefox. Project-action dialogs and view navigation remain operable. `--sidebar-proof` repeats failure against the reported image and success against the correction twice before the full regression.

- **F7, F11** `tests/service.spec.ts` › searchable selections retain complete task titles and saved assignments — Checks the modal option list and complete titles within desktop and phone bounds, searches and selects several prerequisites by pointer and keyboard, removes individual selections, exercises empty search results, saves and reloads owners and dependencies, then removes and reloads all selections.
- **F12** `tests/service.spec.ts` › list dates follow the browser locale at the right edge and text truncates — Compares US and Swiss German short dates, right alignment across root and nested rows at desktop and phone widths, retained complete text and visible ellipsis behaviour.
- **F2, F7, F8** `tests/service.spec.ts` › due date clearing supports cancellation, saved history and restoration — Operates Clear with empty and set dates, discards a cleared draft without a write, saves and reloads a removal, checks the exact before/after revision, restores the former date and checks that a reader cannot clear it.
- **F4** `tests/service.spec.ts` › opened parents retain overdue and status fills through navigation and live updates — Open overdue and active parents, inspect their original fills behind children, update a child remotely and return through the background; check the same standalone HTML element.
- **F1, F3, F8** `tests/service.spec.ts` › Load selects document titles, merges existing projects and restricts deletion — Native file selection creates or merges the titled project, preserves absent tasks, rejects stale or invalid input and tests administrator-only confirmed deletion.
- **F1, F6** `tests/service.spec.ts` › logout, revocation, invalid cookies and expiry remove every open draft and project view — Real sign-in, a second-tab draft, server revocation, invalid cookies and browser expiry each remove all sensitive views.
- **F3, F7, F8** `tests/service.spec.ts` › selected TODO files open directly and round-trip complete source — The actual source includes Team Success description and its complete Markdown chapter, persisted through the API, editor and export.
- **F4** `tests/service.spec.ts` › a single formatted hover popup follows the cursor inside the drawing — Hover shows all labelled fields in one popup bounded by the chart, refreshes a changed description while the pointer stays still and clears it on leave.
- **F5** `tests/service.spec.ts` › cards edit on one click, show child titles and navigate on double-click or child-list click — Pointer and keyboard actions edit or navigate through the same card without redundant actions.
- **F5** `tests/service.spec.ts` › empty columns retain half width and status drops preserve priority colours — Width ratios, both status-move directions and mobile widths are measured while priorities and border colours persist.
- **F1, F3, F8** `src/service.rs` › f1_f3_f8_load_and_delete_are_atomic_title_based_and_administrator_controlled — SQL state and history verify title selection, detail retention, merge, rejected writes and complete deletion.
- **F1** `src/service.rs` › f1_expired_and_revoked_sessions_refuse_all_authenticated_reads — Stored expiry and revocation reject authenticated reads and expose server-derived browser expiry.

## Browser and API

- **F4, F6** `tests/service.spec.ts` › direct original renderer: repeatedly switches Bubbles, List and Board, navigates a branch and returns to the root while preserving the same element lifecycle and denying embedded pages.
- **F5** `tests/service.spec.ts` › selected leaf: selects a leaf in List, switches to Board, reads and edits its own card, then uses ancestor navigation to verify child cards at each branch.
- **F12** `tests/service.spec.ts` › collapsible rows: operates disclosure buttons, retains collapse state across view switches, measures equal metadata cells, bold titles, compact line spacing and persistent selection, hides internal references and checks the 320-wide list.
- **F4** `tests/service.spec.ts` and `tests/renderer.py`: operate the standalone HTML custom element, verify its shared SVG labels and compare complete SVG and HTML output with the canonical build entry point. Browser enlargement improves projected text size without separate zoom controls.

- **F1, F2, F5** `tests/service.spec.ts` › parent and identifier controls: verifies the sidebar contains no redundant current-task edit action after descending, opens the selected parent through its breadcrumb, checks initially locked identifiers and explicit unlocking, persists reference changes and rejects duplicate references atomically.

- **F12** `tests/service.spec.ts` › nested Markdown list: compares row order and visible fields with the Markdown export while retaining references only in stored/exported data, operates keyboard outdent and cancellation, pointer nesting and touch nesting, reloads the persisted hierarchy, verifies retained descendants, title editing, right-click menu, recorded moves and narrow-screen bounds in both browser engines.
- **F12** `src/service.rs` › stored subtree moves: exercises the actual SQL transaction, parent/order persistence, unchanged descendant snapshots, author and before/after history, stale project sequences, cyclic and foreign-level destinations, CSRF and revoked membership with no partial write.

- **F4, F5, F7** `tests/service.spec.ts` › narrow screens: sweeps 320, 360, 390, 480, 667 and 768 CSS-pixel widths, inspects every rendered HTML region for horizontal overflow, operates legend and hierarchy controls, checks vertical board order and every project view, and exercises formatted/source/history/link editor states with long identifiers and a six-column table. A wide-screen check retains the seven-column board.

- **F3** `tests/service.spec.ts` › selected task files: opens a complete file through the native chooser, rejects an invalid-date file without changing data, merges the same file again, reloads and compares every exported task entry and the preamble.
- **F1, F4, F5, F8** `tests/service.spec.ts` › compact workspace: measures viewport use, sidebar collapse and expansion, Markdown-title navigation, recorded project rename, stale sequence denial and board bounds.
- **F1, F8** `tests/service.spec.ts` › project title editing: operates empty and oversized names, retains the input focus and selection during another user's rename, rejects a stale save, reloads explicitly and denies reader mutation without new history.
- **F3, F8** `tests/service.spec.ts` › direct file interchange: operates Load, compares merged properties and history snapshots, rejects invalid input without writes, detects JSON under a Markdown filename, downloads both data formats and checks retained missing tasks and preamble history.
- **F1, F3, F8** `tests/service.spec.ts` › shared project and document title: verifies creation, Markdown and JSON imports, name precedence, missing headings, metadata preservation, remote title updates, exported titles, History and reload through the real interface.
- **F6** `tests/service.spec.ts` › stable live updates: uses two authenticated pages to verify the same diagram element and circle identity, unchanged viewBox and diagram level when a remote change removes the selected task from a filter result, focused circle during identifier changes, retained textarea and ProseMirror draft/selection/scroll, reachable editor mode controls and retained text while a conflict is visible, a selected draft parent archived by another user, board scroll/search focus and History selection/scroll while revisions arrive.
- **F7** `tests/service.spec.ts` › viewport editor: measures dialog/footer bounds and primary-first actions, operates every formatting command, undo/redo, source switching, accepted/rejected links and saved text persistence.
- **F4** `tests/service.spec.ts` › original renderer: imports the complete task file, compares every fitted label with the SVG export, including complete text, font size, weight and colour, in the shared original custom element, compares every circle's reference/title/status/priority with persisted tasks, inspects its font family and captures the rendered result.
- **F2, F3, F7** `tests/service.spec.ts` › property controls: checks the create-field inventory, moves a task through Parent, excludes cyclic parent choices, changes Identifier, refuses a duplicate without a write, clears date/week flags and verifies the saved values after reload and Markdown export.
- **F3, F5, F10** `tests/service.spec.ts` › sprint dates and scope: refuses an end before the start, persists edited dates and status after reload, assigns a sprint, operates Has due date and compares the exact task references in current-subtree and whole-project SVG downloads.
- **F1, F9** `tests/service.spec.ts` › API reference controls: downloads and compares the complete generated contract, expands an operation, submits a real POST using Method and JSON body, opens the persisted project, rejects foreign paths and checks authenticated foreign-Origin REST/WebSocket requests cannot change projects.

- **F1** `tests/service.spec.ts` › OIDC and project access: authenticates through real Authentik and operates project membership with positive and denied paths.
- **F1, F7** `tests/service.spec.ts` › reader details: opens a shared task, reads its rendered Markdown and verifies property editing and saving are disabled.
- **F1** `tests/service.spec.ts` › newly signed-in users: signs in another user after the administrator's page has loaded and finds that user in Members without a page reload.
- **F4, F5, F10** `tests/service.spec.ts` › local dates: checks the seven-day warning across the daylight-saving transition, then runs in Europe/Zurich just after local midnight while UTC remains on the previous day, verifies the due filter and checks default sprint dates.
- **F2** `tests/service.spec.ts` › task lifecycle: creates, updates, moves, archives and restores tasks and rejects cycles and stale edits.
- **F3** `tests/service.spec.ts` › interchange and exports: imports through the native chooser, edits, exports and reimports, with invalid input and every export format.
- **F4** `tests/service.spec.ts` › bubbles: operates circle navigation, title editing, hover, context menu and properties in real browsers.
- **F5** `tests/service.spec.ts` › boards: navigates cards, edits them, drags status and operates every filter.
- **F6** `tests/service.spec.ts` › live collaboration: two tabs observe writes and retain conflicting drafts, verify the browser actually reports offline and displays Reconnecting, commit another update through an independent API client, then return online and verify both the missed change and Live state.
- **F7** `tests/service.spec.ts` › editor: operates every field and WYSIWYG/source editing, persistence, unsafe input and discard handling.
- **F8** `tests/service.spec.ts` › history: saves multiple versions of each text, checks property changes and restores selected old fields without erasing later revisions.
- **F8** `tests/service.spec.ts` › initial revision: opens project History and reads the newest saved title without an extra selection.
- **F9** `tests/service.spec.ts` and `tests/persistence.mjs` › API and persistence: validates generated OpenAPI and compares the complete snapshot, sequence and every exported history record before and after application/database restarts.
- **F10, F11** `tests/service.spec.ts` › sprint planning, dependencies and JSON history round trip: assigns a sprint, rejects starting blocked work, completes the prerequisite, starts the dependent task and reimports both tasks and their history.
- **F2, F8, F11** `tests/service.spec.ts` › retries and cycles: repeats a create request with the same UUID, rejects different content under that UUID, rejects hierarchy and dependency cycles, and records an unchanged save.
- **F4, F5** `tests/service.spec.ts` › context properties and filters: persists status, priority and date changes, assigns/removes the current user and another user through the context menu, filters the persisted owners and archives/restores a task.
- **F4** `tests/service.spec.ts` › narrow context menu: opens the real task menu at mobile width and verifies every edge remains within the viewport.
- **F7** `tests/service.spec.ts` › immediate formatted save: opens the editor from Board, pauses browser timers while typing, saves the final editor state, and confirms discard protection and source switching retain text.
- **F7** `tests/service.spec.ts` › unsafe Markdown: checks formatted editing and saved-history rendering for active HTML and JavaScript links.

- **F1** `tests/service.spec.ts` › editor and denial paths: provisions an editor project through an administrator, refuses editor creation and membership administration, unmapped users and anonymous WebSockets, and verifies logout revokes the session.
- **F3, F8, F10** `tests/service.spec.ts` › complete JSON history: preserves project and sprint events, rejects invalid previews and multiple active sprints, and deduplicates reimported source revisions.
- **F11** `tests/service.spec.ts` › reopened prerequisite: permits text edits of current work and blocks its completion until the prerequisite is done again.
- **F6, F10** `tests/service.spec.ts` › concurrent sprint goals: preserves a pristine focused field and selection during an incoming change, keeps the original edit sequence, retains a conflicting draft and requires reload before a reconciled save.
- **F1, F6, F10** `tests/service.spec.ts` › project boundaries: switches projects while viewing membership, editing a sprint and inspecting a historical revision, and checks each view contains only its selected project's state.
- **F3** `tests/service.spec.ts` › PNG export: decodes the delivered image, checks its size and verifies the diagram fills its lower region as well as its centre; saves every export for inspection.
- **F3** `tests/service.spec.ts` › incomplete Markdown blocks: reports the source error at export, preserves unfinished source in JSON and restores Markdown export once the block is completed.
- **F3** `tests/service.spec.ts` › entries without identifiers: compares API dry-run IDs with the native file import's stored IDs and reimports edited descriptions without duplicating same-title siblings.
- **F3** `tests/service.spec.ts` › numeric title: creates a title beginning with a date-like number, downloads Markdown and reimports it while retaining its ID and empty due date.
- **F7** `tests/service.spec.ts` › save in progress: submits the real form and checks its properties, details and close controls remain disabled until the response arrives.
- **F4** `tests/service.spec.ts` › title bounds: rasterises each visible label separately with the original embedded fonts after the diagram settles, measures every painted glyph pixel inside its circle and outside child circles at every responsive viewport, and enlarges the browser to reveal smaller labels. Curved labels are measured from painted glyphs because axis-aligned character cells contain unpainted corners. Isolation retains label identity even for low-alpha antialias pixels. Measurements and the first failing label's SVG/PNG remain with the phase diagnostics.

- **F1, F3** `tests/service.spec.ts` › reused username: renames an account through real Authentik, creates a new account under the old name, selects the distinct visible identity, checks project denial, exports stable JSON ownership and signs in under the renamed account without losing identity or access.
- **F8** `tests/service.spec.ts` › historical unknown owners: imports a saved revision through the native chooser, rejects ownership restoration without changing persisted state/history and restores the title separately.

## Parser and Storage

- **F1, F3, F8** `src/service.rs` › shared document title: uses SQLite-backed handlers to verify existing metadata, imported heading text outside code fences, JSON precedence, setext-heading rename, literal Markdown punctuation, stored names and History, and oversized-title rejection without writes.

- **F11** `src/service.rs` › advisory dependencies: uses real SQLite storage to verify enforced creation denial without writes, advisory-mode creation/completion with complete saved history, cycle rejection in both policies and denial after enforcement is restored.

- **F4** `src/service.rs` › calendar weeks: inserts actual stored history on either side of the browser's Monday boundary, renders the original SVG through the diagram handler and verifies the task's blue border and rejection of invalid week ranges.

- **F8** `src/service.rs` › restoration validation: uses actual SQLite storage and a server session to reject unknown historical owners and subsequently persist a title-only restore.
- **F3** `src/service.rs` › ambiguous usernames: uses actual SQLite storage to reject ambiguous Markdown import/export while retaining stable IDs through JSON export and import.

- **F1** `src/service.rs` › configured roles: verifies group precedence, explicit immutable-subject assignments, editor access and refusal of unmapped first logins.
- **F3** `tests/markdown.rs` › owners, details, nested lists and code round trip: preserves all supported fields through parse and render.
- **F3** `tests/markdown.rs` › generated identifiers: keeps preview/reimport identities, distinguishes same-title siblings and retains identity after description edits.
- **F3** `tests/markdown.rs` › date-like titles: preserves valid and invalid date-like title prefixes with and without an actual due date.
- **F3** `tests/markdown.rs` › invalid dates, duplicates and indentation: rejects malformed input without accepting a partial tree.
- **F3** `tests/markdown.rs` › literal brackets and title separators round trip: preserves punctuation that could otherwise be interpreted as owner or field syntax.
- **F3** `tests/markdown.rs` › archived subtree export: excludes archived descendants and their detail chapters from Markdown while retaining their stored data.

- **F7** `tests/markdown.rs` › heading levels and code fences: rejects level-one headings while preserving indented code and fenced heading examples.
- **F3** `tests/markdown.rs` › code, HTML and hard breaks: distinguishes actual chapters from literal examples and preserves significant indentation and trailing spaces.
- **F3** `tests/markdown.rs` › unfinished blocks: refuses a Markdown export that would join separate detail chapters and accepts it after the fence is closed.

- **F1, F9** `tests/service.spec.ts` › deployed Authentik groups: verifies the public OIDC endpoint paths, pre-existing TODO groups without Authentik administration privileges, grants a new user TODO administration through `todo-admin`, checks stable identity digests and refuses a fresh login after group removal. All application journeys use the `/todo/` API, assets, callbacks and WebSockets behind the single Traefik port.

## Contracts

- **F1, F5, F7, F12** `tests/styles.mjs`: checks the owned stylesheet's shared measurements, semantic colours, font definitions and spacing rhythm. The main test runner executes this contract alongside rendered browser verification.
- **F7** `tests/service.spec.ts` › viewport editor: applies a larger browser root font and a replacement palette, measures actual control and formatted-text sizes and heading spacing, then widens the viewport while retaining those sizes.

- **F9** `tests/lifecycle.mjs`: starts the actual read-only image, waits for database readiness, stops it with Docker's default termination signal and checks clean exit without OOM termination; retains image identity, signal, exit and elapsed time.
- **F4, F9** `tests/scanner.mjs`: captures each view independently, retains failed output and diagnostics, and checks that each bubble print format contains one complete page.
- **F1, F3, F7** `tests/scanner.mjs`: captures expanded/collapsed sidebar, filters, rename dialog, persistent editor toolbar, searchable dependencies, link controls, source, revisions and an invalid-date file error in every viewport and print format. The complete-file browser journey retains the imported result.
- **F1** `tests/scanner.mjs`: captures the signed-out entry and declined-sign-in error in every viewport and print format using fresh unauthenticated browser contexts. The declined callback retains its HTTP error status while the scanner checks its recovery controls. The authenticated fixture remains available for subsequent print checks.
- **F6** `tests/scanner.mjs`: opens a second authenticated tab through the API-reference link, retains a draft in the first tab, changes and saves the task's weekly marker in the second tab and captures the resulting conflict notice in every viewport and print format.
- **F4, F5, F8** `tests/print.mjs`: opens a real populated board and edit history and verifies that task titles and saved revision entries remain visible under the browser's print media rules.
- **F3, F4, F5** `tests/service.spec.ts` › export scope: loads the actual print SVG for both scopes and compares every task reference; an empty filtered subtree prints an explanation without requesting an invalid diagram.

- **F4, F9** `tests/renderer.py`: verifies renderer identity against its canonical build source and the generated shared custom-element module and compares complete SVG and HTML output byte for byte against its original build entry point, including an operator-supplied task file.
- **F4, F9** `tests/image.mjs`: executes the renderer inside the actual headless image, verifies its source digest, packaged fonts and Raqm engine, compares complete SVG with the native original and compares SVG/HTML with the original build entry point in the same image, including the supplied complete task file.
- **F9** `test:audit:python`: audits the Pillow package used by the image in a separate build target; audit and build tools remain outside the runtime.

- **F1, F2, F3, F4, F5, F6, F7, F8, F9** `tests/contracts.mjs`: reconciles feature and test registries, prevents disabled tests and validates delivery structure.
- **F9** `tests/image.mjs`: inspects the actual image filesystem and runtime user and executes the headless binary to validate its generated OpenAPI document.
- **F9** `tests/contracts.mjs`: resolves the real Compose configuration with conflicting inherited deployment settings and verifies that validation targets its own database and publishes exactly one loopback port through Traefik, with `/todo/` for TODO and `/auth/` for Authentik.
- **F9** `tests/contracts.mjs`: checks every delivery and test-runner JavaScript module with Node's parser before expensive verification.
- **F9** `tests/run.mjs`: stops dependent journeys when the isolated Compose environment fails to start, retains that failure in the current result file and cleans its own test environment.
- **F9** `scripts/demo.mjs`: builds and starts the local example, authenticates through real Authentik, opens the sample through the native file chooser, saves planning/history examples through the actual API and captures the populated browser view.
- **F4, F5, F8** `tests/service.spec.ts` › runtime print fixture: authenticates and writes the same populated task tree, text revisions, active sprint and assignment through real API operations supported by both preserved and current images before comparing runtime print behaviour.
- **F1, F3, F4, F5, F6, F7, F8** `test:workspace-proof`: alternates the preserved image and current image twice for the new workspace journeys in both browsers, then performs runtime proof, full database regression and visual checks.
- **F10** `tests/service.spec.ts` › persistence fixture: creates an active sprint and assigns the delivery task through the actual forms before retaining the complete snapshot. Database restart checks therefore compare populated sprint data and assignment as well as task and revision data; the scanner's sprint view contains saved planning data.
- **F9** `scripts/image.mjs` and `scripts/demo.mjs`: verify the archived image digest and restored image identity; archive-mode demonstration startup checks and records the actual running container image before browser verification.
- **F9** `tests/archive.mjs`: invokes the actual loader with an incomplete archive and valid recorded metadata, verifies checksum rejection before Docker import and checks that the installed image is retained.
