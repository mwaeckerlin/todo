# `TODO — mwaeckerlin/todo`

Product backlog created on 2026-11-02. Requested additions cover task discussions, chat notifications, Gitea/GitLab/GitHub integration, release management, merge requests and reviews, automated development with OpenCode/Hermes/OpenClaw, wiki/documentation, release planning and release notes. Tool selections, additional product ideas and the plugin design are proposals for review. All additions remain open; complexity zero means not estimated. Priorities are recommendations. No delivery dates, owners or sprints have been assigned.

Completed capabilities remain under their product areas. Stable trailing feature IDs connect tasks, the feature specification and the test registry. Release verification remains part of Initial Release.

- ⏳H0 Initial Release - Initial public repository, CI/CD, complex sample, browser screenshots and README #todo-initial-release
- ✅M0 Projects - Project Access, Live Collaboration And Revision History
  - ✅M0 Authentication and Projects - OIDC sign-in, roles, project access and project management #F1
  - ✅M0 Live Collaboration - Live updates, reconnection, retained drafts and conflict detection #F6
  - ✅M0 History and Revert - Inspect complete revisions and restore selected task fields #F8
- ✅M0 Task Management - Hierarchical Tasks And Detailed Markdown Editing
  - ✅M0 Task Tree - Nested task editing, properties, stable identity and archiving #F2
  - ✅M0 Text Editor - Formatted Markdown editing, source mode and explicit saves #F7
- ✅M0 Interchange - Portable Task Data And Diagram Exports
  - ✅M0 Interchange and Exports - Markdown and JSON interchange plus SVG, PNG and standalone HTML #F3
- ✅M0 Deployment - Headless Service, SQL Persistence And Documented API
  - ✅M0 Container and API - Headless Docker delivery, SQL persistence and documented REST API #F9
- ⬜H0 Discussions and Chat - Discuss a task through existing open-source chat software #todo-discussions
  - ⬜H0 Task Discussion - Open the conversation belonging to the current task #todo-task-discussion
  - ⬜H0 Chat Provider - Connect an existing chat installation at project level #todo-chat-provider
  - ⬜H0 Zulip Integration - Evaluate a project channel with one topic per task #todo-chat-zulip
  - ⬜H0 Access and Identity - Keep discussion access consistent with project membership #todo-chat-access
  - ⬜M0 Matrix Integration - Evaluate Matrix as an additional provider #todo-chat-matrix
  - ⬜M0 Discussion Decisions - Record an agreed result on the task with a link to its discussion #todo-discussion-decisions
  - ⬜M0 Discussion Export - Preserve discussion references and document message export behavior #todo-discussion-export
- ⬜H0 Notifications - Find changes requiring attention without monitoring every project #todo-notifications
  - ⬜H0 Task Links - Open the exact task and discussion from a permanent URL #todo-task-links
  - ⬜H0 Subscriptions - Follow and unfollow individual tasks #todo-subscriptions
  - ⬜H0 Personal Inbox - Review unread mentions and subscribed task changes #todo-inbox
  - ⬜H0 Chat Notifications - Receive Task, Review And Release Notifications In Chat #todo-chat-notifications
  - ⬜M0 Delivery Preferences - Choose chat or email notifications and immediate or digest delivery #todo-notification-preferences
- ⬜H0 Development Integrations - Connect task progress to existing development services #todo-development-integrations
  - ⬜H0 GitHub Links - Link tasks to repositories, issues and pull requests #todo-github-links
  - ⬜H0 Gitea Integration - Link Repositories, Issues, Pull Requests And Actions #todo-gitea
  - ⬜H0 GitLab Integration - Link Repositories, Issues, Merge Requests And Pipelines #todo-gitlab
  - ⬜H0 Review Status - Track Review Requests, Decisions And Required Changes #todo-reviews
  - ⬜H0 CI/CD Status - Show Builds, Checks, Artifacts And Environment Deployments #todo-cicd
  - ⬜M0 GitHub Automation - Configure status changes triggered by pull request events #todo-github-automation
  - ⬜M0 Outgoing Webhooks - Deliver selected task changes to configured integrations #todo-webhooks
  - ⬜L0 GitHub Synchronization - Evaluate explicit field ownership and bidirectional issue synchronization #todo-github-sync
- ⬜H0 Release Management - Plan Deliveries And Produce Reviewed Release Notes #todo-releases
  - ⬜H0 Release Planning - Assign Tasks, Dependencies And Milestones To Versions #todo-release-planning
  - ⬜H0 Release Readiness - Inspect Open Work, Reviews, Checks And Blockers #todo-release-readiness
  - ⬜H0 Release Notes - Draft Release Notes From Tasks And Merged Changes #todo-release-notes
  - ⬜M0 Release Publication - Publish Approved Notes To Connected Development Services #todo-release-publication
  - ⬜M0 Deployment History - Distinguish Planned, Tagged, Released And Deployed Versions #todo-deployments
- ⬜H0 Automated Development - Delegate Tasks To Configured Development Agents #todo-automated-development
  - ⬜H0 Agent Runs - Start, Inspect, Cancel And Resume Task-Linked Development #todo-agent-runs
  - ⬜H0 Agent Permissions - Restrict Repositories, Tools, Credentials And External Actions #todo-agent-permissions
  - ⬜H0 Agent Reviews - Inspect Proposed Changes, Tests And Human Approval #todo-agent-reviews
  - ⬜M0 OpenCode Integration - Evaluate OpenCode For Task-Linked Development Runs #todo-opencode
  - ⬜M0 Hermes Integration - Evaluate Hermes For Task-Linked Development Runs #todo-hermes
  - ⬜M0 OpenClaw Integration - Evaluate OpenClaw For Task-Linked Development Runs #todo-openclaw
- ⬜H0 Wiki and Documentation - Connect Project Knowledge, Tasks And Release Documentation #todo-documentation
  - ⬜H0 Documentation Links - Link Tasks And Releases To Versioned Documentation #todo-documentation-links
  - ⬜M0 Wiki Integration - Evaluate BookStack, Wiki.js And Docmost Connectors #todo-wiki
  - ⬜M0 Git Documentation - Link Repository Markdown And Generated Documentation #todo-git-docs
  - ⬜M0 Documentation Search - Find Authorized Pages Alongside Related Tasks #todo-doc-search
- ⬜H0 Plugin System - Extend TODO Through Versioned, Permissioned Integrations #todo-plugins
  - ⬜H0 Plugin Contracts - Define Capabilities, Configuration And Compatible API Versions #todo-plugin-contracts
  - ⬜H0 Plugin Permissions - Grant Project-Scoped Access And Revoke Integrations #todo-plugin-permissions
  - ⬜H0 Event Delivery - Recover Failed Deliveries And Deduplicate Repeated Events #todo-plugin-events
  - ⬜M0 Plugin Administration - Install, Configure, Disable And Inspect Integration Health #todo-plugin-admin
  - ⬜M0 Plugin SDK - Provide Examples And Contract Tests For Connector Authors #todo-plugin-sdk
- ⬜M0 Personal Views - Reuse focused task selections across projects #todo-personal-views
  - ✅M0 Bubbles - Navigate and edit complexity-weighted task circles #F4
  - ✅M0 Boards - Status columns, card editing, drag and drop, search and filters #F5
  - ✅M0 Markdown List - Read, collapse and reorder the complete task hierarchy #F12
  - ⬜M0 Saved Filters - Save and reopen named filter combinations #todo-saved-filters
  - ⬜M0 My Tasks - Review assigned tasks across authorized projects #todo-my-tasks
  - ⬜M0 Labels - Categorize tasks independently of their parent #todo-labels
- ⬜M0 Planning Automation - Reduce repeated sprint and task setup #todo-planning
  - ✅M0 Sprints - Sprint goals, dates, status, task assignment and backlog filters #F10
  - ✅M0 Dependencies - Project prerequisites, cycle rejection and configurable enforcement #F11
  - ⬜M0 Sprint Recurrence - Configure a recurring sprint schedule #todo-sprint-recurrence
  - ⬜M0 Sprint Rollover - Choose how unfinished work moves between sprints #todo-sprint-rollover
  - ⬜M0 Task Templates - Reuse a task and its child structure as a template #todo-task-templates
  - ⬜L0 Recurring Tasks - Create repeated tasks while retaining previous occurrences #todo-recurring-tasks
- ⬜L0 Progress Overview - Review completion and delays across the task hierarchy #todo-progress
  - ⬜M0 Sprint Progress - Compare planned and completed work without treating complexity as time #todo-sprint-progress
  - ⬜L0 Project Milestones - Group delivery checkpoints and their related tasks #todo-milestones
  - ⬜L0 Project Timeline - Compare project dates, milestones and dependencies #todo-timeline
- ⬜M0 Mobile Usability - Complete Task Workflows Comfortably On Narrow Touch Screens #todo-mobile-usability
  - ⬜M0 Touch Workflows - Edit, Move, Discuss And Review Without Horizontal Scrolling #todo-mobile-workflows
  - ⬜M0 Mobile Acceptance - Verify Keyboard, Focus, Dialogs And Navigation On iPhone #todo-mobile-acceptance
- ⬜L0 Workflow Improvements - Evaluate Additional Planning Features From OSS Tools #todo-workflow-improvements
  - ⬜M0 WIP Limits - Configure Column Limits And Show Exceeded Capacity #todo-wip
  - ⬜L0 Intake Forms - Evaluate Structured Requests With Triage Before Project Admission #todo-intake
  - ⬜L0 Custom Fields - Evaluate Typed Project Properties With Portable Export #todo-custom-fields

# todo-initial-release Initial Release

## Existing Work

Initial public repository, CI/CD, complex sample, browser screenshots and README were already recorded as in progress. This backlog retains that work and its status.

## Release Acceptance

Publish only after the complete regression passes. Keep local release verification distinct from the CI/CD checks of the published commit.

# todo-discussions Discussions and Chat

## User Story

Open a task, select its discussion, read the conversation and reply in context. Open the same conversation in the connected chat application when its full interface is needed. Return to the task through a permanent link.

## Proposed Integration

The chat installation manages messages, replies, attachments and its notification delivery. TODO associates a task with its conversation. The task description and saved task history remain separate from the conversation.

Configure supported chat providers per project. Each linked conversation identifies its provider and installation. Additional providers can coexist without automatically copying messages between services.

Zulip is the preferred candidate for evaluation: a private channel can match a project's membership, and a topic can identify one task. Matrix is an alternative candidate. Neither provider has been selected for implementation.

## Acceptance

- Task renames and moves preserve the association with the conversation.
- Opening a discussion identifies the task, provider and current access state.
- An external conversation link and an embedded discussion are presented according to their actual capabilities; a link alone is not described as an embedded discussion.
- Read and write access is checked in the connected service as well as TODO. Shared sign-in alone does not grant project or conversation membership.
- Messages are attributed to the actual author. A shared bot is not presented as that user.
- A disconnected provider leaves tasks readable and explains how to reopen or retry the discussion.
- The task can retain a decision and its source-message link without copying the complete chat history into task revisions.
- JSON exports retain provider and conversation references. Message retention, independent chat backup and export behavior are documented.

## Candidates

- [Zulip topics](https://zulip.com/help/introduction-to-topics)
- [Zulip permanent links](https://zulip.com/help/link-to-a-message-or-conversation)
- [Zulip API](https://zulip.com/api/)
- [Zulip channel permissions](https://zulip.com/help/channel-permissions)
- [Matrix JavaScript SDK](https://github.com/matrix-org/matrix-js-sdk)

# todo-notifications Notifications

## Acceptance

- A task link restores its project and exact task after sign-in without granting new access.
- Users control subscriptions and can distinguish unread from read events.
- Mentions, assignments and selected status changes link to the relevant task or message.
- Reconnecting does not create duplicate inbox entries or duplicate notification delivery.
- Delivery preferences distinguish chat messages from task-change alerts and permit disabling optional channels.

# todo-development-integrations Development Integrations

## User Story

Open a task and inspect its repository, issue, merge request or pull request, reviews, CI/CD checks and deployed version. Open the exact record in Gitea, GitLab or GitHub to perform the development operation there. Receive the resulting status on the task and in its history.

## Acceptance

- A task retains explicit links to its external issue and pull requests.
- Status automation is configured deliberately and records the external event that caused a change.
- Repeated webhook delivery does not repeat the resulting task change.
- Failed deliveries are visible and retryable.
- Bidirectional synchronization defines which service controls each field and how conflicts are resolved before it is enabled.
- Gitea, GitLab and GitHub each support explicit repository/issue/change links, review status and CI/CD results. A GitHub connector alone does not fulfil the other providers.
- Checks identify their commit and pipeline run. A merge, a successful build, a release and a deployment retain separate states.
- Review requests, approvals and required changes retain the actual reviewer and source link. TODO does not replace the provider's code-review editor.
- Source events, task updates and notifications remain traceable without exposing credentials or private repositories to unauthorized users.

## Proposed Integration

Keep source hosting, runners, artifact storage, code diffs and merge enforcement in the existing provider. Build the task associations, status summaries, configured transitions and history in TODO. Evaluate Forgejo as an additional Gitea-compatible candidate; verify its API behavior independently before advertising support. Start with links and inbound events; bidirectional issue synchronization remains a separate optional proposal.

# todo-releases Release Management

## User Story

Select a project version, assign its tasks and inspect prerequisites, reviews and checks. Prepare release notes from the selected tasks and merged changes, edit the draft, approve publication and inspect the release's actual deployments.

## Acceptance

- A release has a version, optional explicitly entered target date, scope and linked milestones. Existing sprint assignments remain independent.
- Readiness shows unfinished tasks, unresolved dependencies, outstanding reviews and failing checks without equating complexity with calendar duration.
- Release notes group user-visible changes, fixes, breaking changes, migrations and configuration requirements. Every generated entry retains its task or change reference.
- Draft generation excludes private details according to publication permissions. A human reviews the text before external publication; agent-generated text remains a draft.
- Publishing records the approved revision, author, destination and external release identifier. Repeating a request reconciles the existing release before creating or updating anything.
- Planned, tagged, published and deployed versions are distinct. Deployment records identify environment, version, outcome and rollback where the provider supplies them.

## Proposed Integration

Own release scope, readiness and reviewed note drafts in TODO. Connect Gitea, GitLab and GitHub for tags, releases and deployment evidence. Evaluate release-please or semantic-release for repository version automation and git-cliff for commit-based changelog input; those are candidate integrations, not mandatory dependencies or replacements for task-based release notes.

# todo-automated-development Automated Development

## User Story

Choose a task and an authorized repository, select a configured agent and start a run. Inspect its progress, clarification requests, proposed changes and test evidence. Cancel or resume the run, review the resulting merge request and decide whether it may be merged or released.

## Acceptance

- OpenCode, Hermes and OpenClaw are explicit evaluation candidates. Each connector documents the exact supported project, version and available run controls before implementation.
- Runs retain task identity, repository, branch or isolated checkout, agent, initiating user, timestamps, outcome and external run references.
- Cancellation and restart reconcile the actual external run state. Lost responses and repeated events cannot start duplicate work.
- Repository access, network access, available tools, runtime and spending limits are configurable. Credentials are scoped to the connector and project.
- Repository content, task descriptions and external messages are treated as untrusted input. Agent output cannot grant itself permissions.
- Reviewable diffs and test results precede an explicit merge or release approval. Discussion messages and notification delivery confer no approval authority.
- Agent failure leaves task drafts, history and ordinary project work accessible. Run logs redact secrets and respect project permissions.

## Proposed Integration

Keep task dispatch, permissions, run status, audit history and approval decisions in TODO. Run the selected development agent in an isolated worker or external service. Evaluate MCP for exposing limited task and documentation actions to agents; MCP does not replace authorization. Agent frameworks and their execution engines remain external dependencies.

# todo-documentation Wiki and Documentation

## User Story

Open a task or release, follow its documentation, inspect the linked version and find related pages. Open the wiki or repository editor to update the source and return through a permanent task link.

## Acceptance

- Task details remain the existing Markdown content with history. Wiki pages and repository documentation retain their authoritative external source.
- Links identify the page and, where available, its revision. Renames and moves preserve resolvable references or expose a repairable broken link.
- Search includes only content the current user may read. Removing access invalidates cached search results and previews.
- Documentation changes can notify subscribers through the existing notifications capability without creating a second notification system.
- JSON retains documentation associations. External page contents, attachments, retention and backup remain explicitly documented per connector.

## Candidates

BookStack, Wiki.js and Docmost are proposed wiki candidates. Repository Markdown with MkDocs or Docusaurus is proposed for documentation maintained through merge requests. Evaluate licensing, authentication, page APIs, revisions, search permissions and mobile editing before choosing a default.

# todo-plugins Plugin System

## User Story

An administrator connects a service, sees the access it requests and enables it for selected projects. A project user sees the linked discussions, development runs, documentation or releases. An administrator inspects delivery failures and can revoke or disable the integration.

## Proposed Design

Use external connector services with a versioned HTTP API and event contracts. Keep the Rust core responsible for tasks, project permissions, history, conflicts and exports. A connector manifest declares identifier, version, compatible API versions, capabilities, configuration schema and requested scopes. Native shared interface components render integration data; no iframe is used.

Event delivery uses a transactional outbox, stable event IDs, idempotency keys, persisted delivery state, configurable retries and reconciliation after uncertain outcomes. Provider webhooks are authenticated and replay-protected. A connector receives only its granted project data; secrets remain server-side and can be rotated or revoked. Installing arbitrary server libraries or executing downloaded browser scripts is outside the proposed first implementation.

## Acceptance

- Administration exposes requested scopes, enabled projects, connection state, pending deliveries, errors and retry controls.
- Disabling a connector stops new dispatches and reconciles running operations according to a documented policy.
- Revoked membership or authorization immediately restricts data access in integrations and cached interface data.
- Contract tests cover duplicate events, lost responses, delayed delivery, rejected credentials, version incompatibility and partial outages.
- The SDK supplies example connectors and validates manifests against the same contracts the server accepts.

# todo-mobile-usability Mobile Usability

## Scope

Additional proposal based on the reported iPhone usability difference between Linear and Plane. That report is user experience, not a comparative benchmark performed for this project. Existing responsive behavior remains implemented; this work extends acceptance to complete touch workflows, discussion and integration screens.

## Acceptance

- Task creation, editing, child navigation, drag alternatives, search, discussions, notifications and review flows work on narrow screens without sideways page scrolling.
- The on-screen keyboard leaves focused inputs, save/cancel actions and validation messages reachable.
- Browser Back, deep links and returning from a connected service preserve the expected task and draft.
- Test real Safari/iPhone behavior as well as automated browser coverage; record the device and supported browser versions.

# todo-workflow-improvements Workflow Improvements

## Proposals

Evaluate WIP limits, structured intake with triage and typed custom fields against Plane, OpenProject, Taiga and Vikunja. These additions remain proposals. WIP behavior distinguishes warnings from enforced limits and preserves an explicit override history where overrides are permitted. Intake requests remain distinguishable from accepted project tasks. Custom fields require schema validation, filtering, history and lossless JSON export before becoming editable project properties.

## Ownership

Build task hierarchy, shared Bubbles/Board/List behavior, permissions, history, conflict handling, portable data, release scope and integration associations in TODO. Integrate chat servers, source hosting, CI/CD runners, agent execution and wiki storage through documented contracts. Inspect third-party licenses before copying or linking implementation code; a self-hosted edition alone does not establish compatibility with the project's MIT license.

# todo-personal-views Personal Views

## Acceptance

- Saved views retain their selected filters and can be reopened directly.
- Personal task selections include only projects the current user can access.
- Labels categorize tasks without changing their hierarchy, status or ownership.
- Existing Bubbles, Board and List views remain available for matching tasks.

# todo-planning Planning Automation

## Acceptance

- Recurring sprints preserve the existing manually managed sprint workflow.
- Rollover behavior is explicit and retains the history of prior assignments.
- Templates create new task identities and preserve their intended child structure.
- Repeated tasks retain completed occurrences and their history.

# todo-progress Progress Overview

## Acceptance

- Reports distinguish task counts from complexity and elapsed calendar time.
- Milestones refer to existing tasks without creating duplicate task records.
- Timeline dates and dependencies remain editable through the same task and planning data.
- Project-wide summaries respect the current user's access.

# F1 Authentication and Projects

## Behavior

Sign in through OIDC and retain user identity across account renames. Administrator, editor and reader roles combine with project membership. Administrators create, rename and delete projects and manage access; editors change assigned projects; readers inspect and export them. Task ownership grants no project membership. Sign-out and invalid sessions clear project data and drafts across tabs. Project names and Markdown document titles share one value. The sidebar and project controls fit desktop and narrow screens.

# F2 Task Tree

## Behavior

Create and edit title, description, Markdown details, parent, status, priority, complexity, due date, multiple owners, sprint, dependencies, next-week marker and archive state. Stable identifiers preserve task identity across renames and moves. Parent selection rejects cycles and excessive hierarchy depth. Archiving a parent hides its subtree without destroying its saved data. Explicit date clearing, searchable owner selection and conflict checks retain complete task properties.

# F3 Interchange and Exports

## Behavior

Load Markdown or JSON through the native file chooser. The document title selects the project, and stable references merge tasks while preserving absent entries. Validate the complete import before applying it, retain detailed Markdown chapters and refuse ambiguous owners. Markdown export preserves the task tree; JSON also preserves sprints, dependencies, archived tasks and complete history. Download SVG, PNG or standalone interactive HTML for the filtered project or current subtree. Standalone HTML navigation works without a server.

# F4 Bubbles

## Behavior

Display nested circles whose area represents complexity, with status fills, priority borders, due-date warnings and weekly markers. Navigate down through circles and back through the background or Escape. Open task editing by double-click, read a formatted hover popup and change properties through the context menu. Keyboard and touch controls provide alternative navigation. The view and picture exports use the same renderer, labels and fonts. Printing fits the diagram and legend to the selected page format.

# F5 Boards

## Behavior

Show immediate child tasks in Open, Planned, In Work, Merged, Done, Waiting and Dropped columns. Edit a card with one click and navigate through its child titles or a double-click. Drag a card between columns to change its status while preserving its children's statuses. Search and combine owner, status, priority, date, sprint and archive filters. Breadcrumbs retain the task hierarchy. Narrow screens stack status groups vertically.

# F6 Live Collaboration

## Behavior

Receive committed changes through authenticated live connections in other sessions and tabs. Reconnect and recover missed changes after a disconnection. Remote updates retain the active view, diagram level, editor drafts, focus, selection and scroll positions. Stale task and sprint saves report conflicts and preserve the draft until an explicit reload. Session invalidation clears data independently of ordinary project updates.

# F7 Text Editor

## Behavior

Edit task details with a formatted Markdown editor or its source view. The persistent toolbar supports headings, emphasis, links, lists, tables, code, undo and redo. Changing editor modes retains the latest text. Explicit saves persist the task and create a revision; closing a changed task requires keeping or discarding its draft. Readers can inspect formatted details and source. Executable HTML and unsafe URL schemes remain inactive.

# F8 History and Revert

## Behavior

Inspect project and task history with author, time, operation and changed fields. Read complete historical title, description, details and property values, including before/after data. Load older revisions and retain the current selection when new revisions arrive. Restore selected fields or the whole task as a new revision while preserving intervening history. Conflict and identity validation prevent invalid restores. Readers inspect history; authorized editors restore it.

# F9 Container and API

## Behavior

Run a non-root, headless application image containing the server, browser assets and shared task-tree renderer. The Compose example supplies an actual identity provider, SQL database, persistent volumes and one configurable application entry point. PostgreSQL, MySQL and MariaDB are supported. Standard commands build, start, stop and validate the application. An interactive API reference exposes generated OpenAPI documentation and authenticated requests. The populated local demo retains its own project and data. Database backups remain an operator task.

# F10 Sprints

## Behavior

Create and edit sprint title, goal, start date, end date and Planned, Active or Closed status. The configurable default duration is fourteen days. At most one sprint is active per project, and invalid date ranges are rejected. Assign tasks to a sprint or retain them in the backlog without changing their status. Filter task views by sprint and inspect completed task counts. Concurrent sprint changes preserve the original draft and require explicit conflict resolution.

# F11 Dependencies

## Behavior

Select prerequisites from tasks in the same project, show their names and indicate blocked work. Reject missing prerequisites and dependency cycles. By default, all immediate prerequisites must be Done before a task enters In Work or Done. Reopening a prerequisite blocks subsequent start/completion transitions while permitting text edits on existing work. Operators can disable transition enforcement while retaining recorded dependencies and cycle checks. History and JSON preserve prerequisite changes.

# F12 Markdown List

## Behavior

Display the complete task tree in document order with status, priority, complexity, title, description, owners and dates. Collapse and expand branches while retaining selection. Move a task and all its descendants before, after or into another task through pointer, touch or keyboard controls. Moves preserve identity, properties, details and descendant order and record changed parents and order in history. Readers inspect the hierarchy with disabled move handles. Other clients receive the saved move immediately.
