# Project Manager Suite API

Express 5 and MongoDB (Mongoose 9) REST API behind a project management suite: organizations, projects, boards and sprints, issues, wiki, dashboards, automation, service desk, test management, an AI assistant and more. ESM, plain JavaScript.

## Setup

Requires Node 20 or newer and a running MongoDB.

```bash
cp .env.example .env     # then edit JWT_SECRET and UPLOAD_SIGNING_SECRET
npm install
npm run dev              # node --watch src/server.js
npm run db:indexes       # sync indexes (needed once per deploy in production)
npm start                # node src/server.js
```

The server connects to `MONGO_URI`, registers the automation runner, webhook dispatcher and SLA ticker, then listens on `PORT`. `GET /api/health` returns `{ "success": true, "data": { "status": "ok" } }`; `GET /api/ready` returns 503 until Mongo is connected.

Every response uses the envelope `{ success, data, meta? }` on success and `{ success: false, message, errors? }` on failure. Lists use cursor pagination: pass `limit` and `cursor`, read the next cursor from `meta`.

## Stack

| Piece | Choice |
|---|---|
| Runtime | Node 20+, ES modules |
| HTTP | Express 5.3.0, cors, morgan |
| Database | MongoDB via Mongoose 9.12.0 (64 collections: the 63 in `docs/02-mongodb-schema.md` plus `rollups` for daily report counters) |
| Auth | JWT access tokens (jsonwebtoken), rotating refresh tokens stored as sessions, bcryptjs passwords, personal API tokens (`pmk_` prefix) |
| Validation | zod 4 |
| AI | @anthropic-ai/sdk 1.6.0 (optional, returns 503 without a key) |
| Layout | `src/models/<domain>/*.model.js` (indexed by `src/models/index.js`), `src/modules/<feature>/{routes,controller,service,schemas}`, shared code in `src/utils`, `src/middleware`, `src/services` |

## Conventions used below

- `P` stands for `/api/projects/:projectId`.
- Auth: `none` is public, `JWT` is a bearer access token, `JWT|PAT` also accepts a personal API token with the needed scope.
- Roles: `org:<role>` or `proj:<role>` means that role or higher. Order, low to high. Org: viewer, guest, member, admin, owner. Project: guest, viewer, reporter, developer, lead, admin.

## Permissions

| Action | Org roles allowed | Project roles allowed |
|---|---|---|
| View an org | guest and up | n/a |
| List org members | member and up | n/a |
| Create a project in an org | member and up | n/a |
| Edit org settings, invite or remove members, decide join requests, read org audit | admin and up | n/a |
| Delete an org, promote to owner | owner | n/a |
| Create a personal project | any signed-in user | creator becomes admin |
| View project, issues, wiki, boards, reports, activity | guest or viewer and up to see the project | viewer and up (guest sees the project record only) |
| Create issues, comments, dashboards, labels, saved filters | n/a | reporter and up |
| Edit issues (own reported issues as reporter, any as developer), transition, bulk update, worklogs, links, attachments, wiki pages, goal progress, rank, test cases, risks, budget, CAT | n/a | developer and up |
| Delete issues, manage boards, sprints, releases, issue types and other config, goals, forms, wiki spaces, delete wiki pages | n/a | lead and up |
| Roles, workflows, members, invites, join requests, automation, webhooks, integrations, project audit, archive project, delete labels and config entries | n/a | admin |
| Decide an approval | n/a | the named approver (guest and up) |

Org members who are not project members cannot see a project. Cross-project reads exist only in My Work and notifications, and they are scoped to the caller.

## Environment variables

All variables are validated with zod at boot; the process exits with a list of problems if any are invalid. Defaults apply in development only. Empty values count as unset.

| Variable | Default | Notes |
|---|---|---|
| NODE_ENV | development | `development`, `test` or `production` |
| PORT | 4000 | |
| MONGO_URI | local dev URI | Required in production |
| JWT_SECRET | dev value | Required in production, at least 32 characters |
| JWT_ACCESS_TTL | 15m | Access token lifetime |
| REFRESH_TTL_DAYS | 30 | Refresh token and session lifetime |
| BCRYPT_ROUNDS | 12 | 4 to 15 |
| CLIENT_ORIGIN | http://localhost:5173 (dev) | Required in production. Comma separated CORS allowlist; `*` is rejected |
| PUBLIC_BASE_URL | http://localhost:4000 | Used in invite and upload URLs |
| UPLOAD_SIGNING_SECRET | dev value | HMAC key for signed upload and download URLs; required in production, at least 32 characters |
| UPLOAD_URL_TTL_SEC | 900 | Signed URL lifetime |
| UPLOAD_DIR | ./uploads | Directory where the local `/uploads` route stores files |
| UPLOAD_MAX_BYTES | 26214400 | Maximum bytes accepted per upload (25 MB); larger bodies get 413 |
| ANTHROPIC_API_KEY | empty | Empty means AI routes return 503 |
| AI_MODEL | claude-haiku-5-5 | |
| AI_DAILY_CALL_LIMIT | 100 | Per user per day, then 429 |
| WEBHOOK_TIMEOUT_MS | 5000 | |
| ACTIVITY_RETENTION_DAYS | 365 | |
| AUDIT_RETENTION_DAYS | 365 | |
| AUTH_RATE_LIMIT | 10 | Login and register attempts per IP per 15 minutes (other /api/auth routes get 10x) |
| API_RATE_LIMIT | 600 | Requests per IP per minute on /api |
| LOGIN_MAX_FAILURES | 10 | Failed logins before the account locks |
| LOGIN_LOCK_MINUTES | 15 | Lock duration |
| TRUST_PROXY | false | `true`, a hop count such as `1`, or a subnet name; set it behind a reverse proxy so rate limits see real client IPs |
| BACKGROUND_JOBS | true | `false` disables the automation runner, webhook dispatcher and SLA ticker in this process |
| SHUTDOWN_TIMEOUT_MS | 10000 | Hard exit deadline after SIGINT or SIGTERM |

Removed: `LOGIN_RATE_LIMIT` (replaced by `AUTH_RATE_LIMIT` and database-backed lockout).

## Operations

- `GET /api/health` is liveness (no database). `GET /api/ready` returns 503 until Mongo is connected.
- Every response carries `x-request-id` (the incoming header when safe, else a UUID); error bodies include `requestId` and log lines include it.
- Error mapping: zod validation 422; Mongoose validation 400; cast errors 400 with the path; duplicate keys 409 with the field; JWT errors 401; body over 100kb 413; unknown errors 500 with a generic message in production.
- Indexes: `autoIndex` is on in development and off in production. Run `npm run db:indexes` once per deploy. `projectActivity` is a time-series collection created at boot; if a plain collection with that name exists the server refuses to start with a clear message.
- Background jobs are in-process. The event bus is in-process too, so automation and webhooks fire only for requests handled by a process with `BACKGROUND_JOBS=true`. Keep it enabled on every replica that serves writes, or run a single instance. The SLA ticker (every 60 s, no overlapping runs, atomic breach updates) is safe to run on several replicas.

## Schema additions in the hardening pass

| Collection | Field | Why |
|---|---|---|
| users | failedLogins, lockedUntil (both select:false) | Account lockout |
| users | passwordHash, totp now select:false | Never returned by default queries |
| sessions | retiredHashes (indexed) | Reuse detection for any previously rotated refresh token, not only the last one |
| slaTimers | unique index on issueId and metric | Idempotent timer creation |
| issues | version key renamed from `__v` to `version` | Clients see and send `version` for optimistic locking |
| testCases | folderId optional (default null) | Schema allowed no folder, the model demanded one |

## Deploy

1. Copy `.env.example` to `.env` and set `JWT_SECRET` (32+ chars), `UPLOAD_SIGNING_SECRET`, `CLIENT_ORIGIN` (your web origin) and `PUBLIC_BASE_URL`.
2. `docker compose up -d --build` starts the server (port 4000) and `mongo:7` (named volume, port not published).
3. Once per deploy, build indexes: `docker compose exec server npm run db:indexes`.
4. Put a TLS reverse proxy (nginx, Caddy) in front of port 4000 and set `TRUST_PROXY=1` so rate limiting uses the client IP.
5. Probes: liveness `/api/health`, readiness `/api/ready`. The image runs as the non-root `node` user and has a built-in HEALTHCHECK.

---

## Authentication

**What the user can do:** create an account, sign in, stay signed in through refresh tokens, sign out of one or all devices, and change their password.

**On screen:** sign-up and sign-in forms, a session that silently renews, a "sign out everywhere" button in security settings.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | none | Create an account and return tokens |
| POST | /api/auth/login | none | Sign in (rate limited; 10 failures lock the account for 15 minutes) |
| POST | /api/auth/refresh | none | Exchange a refresh token for new tokens (rotation, reuse detection) |
| POST | /api/auth/logout | JWT | End the current session |
| POST | /api/auth/logout-all | JWT | End all sessions |
| GET | /api/auth/me | JWT | Current user |
| POST | /api/auth/change-password | JWT | Change password and revoke other sessions |

## Users and profile

**What the user can do:** edit their profile, find colleagues, and set notification preferences.

**On screen:** a profile page with avatar, display name, headline and preferences, a people picker, a notification settings grid.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/users/me | JWT | Own profile |
| PATCH | /api/users/me | JWT | Update profile |
| GET | /api/users/search?q= | JWT | Search users who share an org with the caller |
| GET | /api/users/me/notification-prefs | JWT | Read notification preferences |
| PUT | /api/users/me/notification-prefs | JWT | Replace notification preferences |

## Organizations

**What the user can do:** create an organization (becoming its owner), view and rename it, manage groups, and archive it.

**On screen:** an org switcher, an org settings page, a groups list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/orgs | JWT | Orgs the caller belongs to |
| POST | /api/orgs | JWT | Create an org |
| GET | /api/orgs/:orgId | JWT, org:guest | Read an org |
| PATCH | /api/orgs/:orgId | JWT, org:admin | Update an org |
| DELETE | /api/orgs/:orgId | JWT, org:owner | Archive an org |
| GET | /api/orgs/:orgId/groups | JWT, org:member | List groups |
| POST | /api/orgs/:orgId/groups | JWT, org:admin | Create a group |
| GET | /api/orgs/:orgId/groups/:id | JWT, org:member | Read a group |
| PATCH | /api/orgs/:orgId/groups/:id | JWT, org:admin | Update a group |
| DELETE | /api/orgs/:orgId/groups/:id | JWT, org:admin | Delete a group |

## Org members and invites

**What the user can do:** list members, change roles, remove members (or leave), invite people by email with an org role and optional starting projects, and accept an invite. Accepting an invite also creates active project memberships for every project listed on the invite (developer for member and above, viewer for guest and viewer).

**On screen:** a members table with role dropdowns, a pending invites list with revoke, an accept-invite landing page.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/orgs/:orgId/members | JWT, org:member | List members |
| PATCH | /api/orgs/:orgId/members/:userId | JWT, org:admin | Change a member role (last owner is protected) |
| DELETE | /api/orgs/:orgId/members/:userId | JWT, org:viewer, admin for others | Remove a member, or leave |
| GET | /api/orgs/:orgId/invites | JWT, org:admin | List invites |
| POST | /api/orgs/:orgId/invites | JWT, org:admin | Create an invite; the token is returned once |
| DELETE | /api/orgs/:orgId/invites/:inviteId | JWT, org:admin | Revoke an invite |
| POST | /api/orgs/invites/accept | JWT | Accept an invite by token |

## Join requests

**What the user can do:** ask to join an org or a project; admins approve or decline.

**On screen:** a "request to join" button, an admin queue with approve and decline.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/orgs/:orgId/join-requests | JWT, org:admin | List org join requests |
| POST | /api/orgs/:orgId/join-requests | JWT | Request to join an org (id or slug) |
| POST | /api/orgs/:orgId/join-requests/:requestId/decide | JWT, org:admin | Approve or decline |
| GET | P/join-requests | JWT, proj:admin | List project join requests |
| POST | P/join-requests | JWT | Request to join a project |
| POST | P/join-requests/:requestId/decide | JWT, proj:admin | Approve or decline |

## Projects

**What the user can do:** create org projects (seeded with default roles, issue types, priorities, resolutions, a workflow, a board and an issue counter) or private personal projects, edit them and archive them.

**On screen:** a project list per org, a "my personal projects" list, a project settings page.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/orgs/:orgId/projects | JWT, org:guest | Projects in the org that the caller can access |
| POST | /api/orgs/:orgId/projects | JWT, org:member | Create an org project |
| GET | /api/projects/personal | JWT | Own personal projects |
| POST | /api/projects/personal | JWT | Create a personal project |
| GET | P | JWT, proj:guest | Read a project |
| PATCH | P | JWT, proj:admin | Update a project |
| DELETE | P | JWT, proj:admin | Archive a project |

## Project members and invites

**What the user can do:** add org members to a project, change roles, remove members (or leave), invite outsiders as project guests, and accept project invites.

**On screen:** a project people page with roles, an invite dialog, an accept-invite page.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/members | JWT, proj:viewer | List members |
| POST | P/members | JWT, proj:admin | Add a member |
| PATCH | P/members/:userId | JWT, proj:admin | Change role |
| DELETE | P/members/:userId | JWT, proj:admin, or self | Remove or leave |
| GET | P/invites | JWT, proj:admin | List invites |
| POST | P/invites | JWT, proj:admin | Create an invite |
| DELETE | P/invites/:inviteId | JWT, proj:admin | Revoke an invite |
| POST | /api/projects/invites/accept | JWT | Accept a project invite |

## Roles

**What the user can do:** view and customize project roles and their permissions. System roles cannot be deleted and a role in use cannot be deleted.

**On screen:** a roles and permissions matrix.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/roles | JWT, proj:viewer | List roles |
| POST | P/roles | JWT, proj:admin | Create a role |
| GET | P/roles/:id | JWT, proj:viewer | Read a role |
| PATCH | P/roles/:id | JWT, proj:admin | Update a role |
| DELETE | P/roles/:id | JWT, proj:admin | Delete a role |

## Workflows and statuses

**What the user can do:** design a workflow with statuses and transitions, publish it, and remove unused ones.

**On screen:** a workflow editor with a status graph and transition rules.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/workflows | JWT, proj:viewer | List workflows |
| POST | P/workflows | JWT, proj:admin | Create a draft |
| GET | P/workflows/:workflowId | JWT, proj:viewer | Read a workflow |
| PATCH | P/workflows/:workflowId | JWT, proj:admin | Edit |
| POST | P/workflows/:workflowId/publish | JWT, proj:admin | Validate and publish |
| DELETE | P/workflows/:workflowId | JWT, proj:admin | Delete (not while in use) |

## Issue types, priorities, resolutions and custom fields

**What the user can do:** configure the vocabulary of the project: types (with icons and colors), priorities, resolutions and typed custom fields.

**On screen:** settings tables with drag handles and color pickers.

Each segment below has the same five routes: `GET P/<seg>` and `GET P/<seg>/:id` (proj:viewer), `POST P/<seg>` and `PATCH P/<seg>/:id` (proj:lead), `DELETE P/<seg>/:id` (proj:admin).

| Segment | Description |
|---|---|
| issue-types | Issue types |
| priorities | Priorities |
| resolutions | Resolutions |
| custom-fields | Custom field definitions |

## Boards

**What the user can do:** create boards, see issues in columns per status with swimlanes and quick filters, view the backlog, and drag issues to re-rank them.

**On screen:** a kanban board, a backlog list with sprint panels.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/boards | JWT, proj:viewer | List boards |
| POST | P/boards | JWT, proj:lead | Create a board |
| GET | P/boards/:boardId | JWT, proj:viewer | Read a board |
| PATCH | P/boards/:boardId | JWT, proj:lead | Update a board |
| DELETE | P/boards/:boardId | JWT, proj:lead | Delete a board |
| GET | P/boards/:boardId/issues | JWT, proj:viewer | Issues grouped by column |
| GET | P/backlog | JWT, proj:viewer | Backlog in rank order |
| PATCH | P/issues/:issueId/rank | JWT, proj:developer | Move an issue before or after another, or into a sprint |

## Sprints

**What the user can do:** plan sprints, start one (one active per board), complete it with carry-over, and see velocity.

**On screen:** sprint panels in the backlog, a start dialog, a completion dialog.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/sprints | JWT, proj:viewer | List sprints |
| POST | P/sprints | JWT, proj:lead | Create |
| GET | P/sprints/:sprintId | JWT, proj:viewer | Read |
| PATCH | P/sprints/:sprintId | JWT, proj:lead | Update |
| POST | P/sprints/:sprintId/start | JWT, proj:lead | Start |
| POST | P/sprints/:sprintId/complete | JWT, proj:lead | Complete, carry unresolved issues over |
| DELETE | P/sprints/:sprintId | JWT, proj:lead | Delete a future sprint |

## Releases

**What the user can do:** plan releases and ship them. Shipping stamps `releaseDate` (the schema has no separate shipped field).

**On screen:** a releases page with progress bars and a "ship" button.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/releases | JWT, proj:viewer | List |
| POST | P/releases | JWT, proj:lead | Create |
| GET | P/releases/:releaseId | JWT, proj:viewer | Read |
| PATCH | P/releases/:releaseId | JWT, proj:lead | Update |
| POST | P/releases/:releaseId/ship | JWT, proj:lead | Ship |
| DELETE | P/releases/:releaseId | JWT, proj:lead | Delete |

## Labels and components

**What the user can do:** manage labels (reporters may create) and components.

**On screen:** label chips and a components table.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/labels, P/labels/:id | JWT, proj:viewer | List, read |
| POST | P/labels | JWT, proj:reporter | Create |
| PATCH | P/labels/:id | JWT, proj:lead | Update |
| DELETE | P/labels/:id | JWT, proj:admin | Delete |
| GET | P/components, P/components/:id | JWT, proj:viewer | List, read |
| POST | P/components | JWT, proj:lead | Create |
| PATCH | P/components/:id | JWT, proj:lead | Update |
| DELETE | P/components/:id | JWT, proj:admin | Delete |

## Saved filters

**What the user can do:** save issue searches and reuse them. Reporters can create; owners (or leads) can edit and delete.

**On screen:** a "saved filters" sidebar.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/saved-filters, P/saved-filters/:id | JWT, proj:viewer | List, read |
| POST | P/saved-filters | JWT, proj:reporter | Create |
| PATCH | P/saved-filters/:id | JWT, proj:lead or owner | Update |
| DELETE | P/saved-filters/:id | JWT, proj:lead or owner | Delete |

## Issues

**What the user can do:** create, search and filter, open by key (for example PAY-12), edit with optimistic version checks, move through the workflow, bulk update up to 100, see sub-issues and delete. Every issue carries a numeric `version`; send it back as `version` on PATCH and a stale value returns 409. `GET P/issues?status=` accepts a status id, a category (`todo`, `inprogress`, `done`) or a status name. Personal API tokens work on the issue routes with `issues:read` or `issues:write` scope.

**On screen:** an issue list, an issue detail view, a create dialog, inline editing.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues | JWT\|PAT, proj:viewer | List and filter |
| POST | P/issues | JWT\|PAT, proj:reporter | Create |
| GET | P/issues/by-key/:key | JWT\|PAT, proj:viewer | Read by key |
| POST | P/issues/bulk | JWT, proj:developer | Bulk update |
| GET | P/issues/:issueId | JWT\|PAT, proj:viewer | Read |
| GET | P/issues/:issueId/children | JWT, proj:viewer | Child issues |
| PATCH | P/issues/:issueId | JWT\|PAT, proj:reporter (own) or developer | Update with field diff and version check |
| POST | P/issues/:issueId/transition | JWT\|PAT, proj:developer | Move through the workflow |
| DELETE | P/issues/:issueId | JWT, proj:lead | Delete |

## Comments

**What the user can do:** comment with mentions, reply, edit or delete their own comments (leads can moderate), and mark comments internal so only developers and up see them.

**On screen:** a threaded comment stream under the issue.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues/:issueId/comments | JWT, proj:viewer | List (internal ones hidden below developer) |
| POST | P/issues/:issueId/comments | JWT, proj:reporter | Add |
| PATCH | P/issues/:issueId/comments/:commentId | JWT, proj:reporter, author or lead | Edit |
| DELETE | P/issues/:issueId/comments/:commentId | JWT, proj:reporter, author or lead | Delete |

## Attachments

**What the user can do:** attach files through signed upload URLs and download through signed download URLs. The URLs are HMAC-signed and point at the built-in local `/uploads` route, which stores files in `UPLOAD_DIR`.

**On screen:** a drag-and-drop attachment strip.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues/:issueId/attachments | JWT, proj:viewer | List |
| POST | P/issues/:issueId/attachments/upload-url | JWT, proj:developer | Get a signed upload URL |
| POST | P/issues/:issueId/attachments | JWT, proj:developer | Register attachment metadata |
| GET | P/issues/:issueId/attachments/:attachmentId/download-url | JWT, proj:viewer | Signed download URL |
| DELETE | P/issues/:issueId/attachments/:attachmentId | JWT, proj:reporter, uploader or lead | Delete |
| PUT | /uploads/*key?exp&sig | Signature | Stream the request body to storage (204; 413 over `UPLOAD_MAX_BYTES`) |
| GET | /uploads/*key?exp&sig | Signature | Stream the stored file as an attachment (404 if missing) |

The `/uploads` route sits outside `/api` and takes no auth header: the `exp` and `sig` query parameters are the credential. Invalid or expired signatures get 403.

## Issue links

**What the user can do:** link issues in the same project (blocks, relates to, duplicates) and see both directions.

**On screen:** a "linked issues" list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues/:issueId/links | JWT, proj:viewer | List |
| POST | P/issues/:issueId/links | JWT, proj:developer | Create (target must be in the same project) |
| DELETE | P/issues/:issueId/links/:linkId | JWT, proj:developer | Delete |

## Worklogs and time tracking

**What the user can do:** log time on an issue, edit or delete worklogs, and see a timesheet by user and date range.

**On screen:** a "log work" dialog, a timesheet page.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues/:issueId/worklogs | JWT, proj:viewer | List |
| POST | P/issues/:issueId/worklogs | JWT, proj:developer | Add |
| PATCH | P/issues/:issueId/worklogs/:worklogId | JWT, proj:developer, author or lead | Edit |
| DELETE | P/issues/:issueId/worklogs/:worklogId | JWT, proj:developer, author or lead | Delete |
| GET | P/worklogs | JWT, proj:viewer | Timesheet |

## Issue history

**What the user can do:** see who changed what and when.

**On screen:** an activity tab on the issue.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/issues/:issueId/history | JWT, proj:viewer | Field-level change history |

## My Work

**What the user can do:** see their assigned and reported issues and their own worklogs across all projects they can access.

**On screen:** a personal home list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/my-work/issues | JWT | Assigned or reported issues |
| GET | /api/my-work/worklogs | JWT | Own worklogs |

## Wiki

**What the user can do:** keep spaces and nested pages, edit with version history, and restore old versions. Updates carry a version and conflict with 409.

**On screen:** a page tree, a rich-text editor, a history drawer.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/wiki/spaces | JWT, proj:viewer | List spaces |
| POST | P/wiki/spaces | JWT, proj:lead | Create space |
| PATCH | P/wiki/spaces/:spaceId | JWT, proj:lead | Update space |
| DELETE | P/wiki/spaces/:spaceId | JWT, proj:lead | Delete space |
| GET | P/wiki/pages | JWT, proj:viewer | List pages (tree) |
| GET | P/wiki/pages/:pageId | JWT, proj:viewer | Read page |
| POST | P/wiki/pages | JWT, proj:developer | Create page |
| PATCH | P/wiki/pages/:pageId | JWT, proj:developer | Update page (writes a version) |
| DELETE | P/wiki/pages/:pageId | JWT, proj:lead | Delete page |
| GET | P/wiki/pages/:pageId/versions | JWT, proj:viewer | List versions |
| GET | P/wiki/pages/:pageId/versions/:versionId | JWT, proj:viewer | Read a version |
| POST | P/wiki/pages/:pageId/versions/:versionId/restore | JWT, proj:developer | Restore |

## Dashboards and reports

**What the user can do:** build dashboards of widgets and read project reports built from daily rollups: summary, created versus resolved, burndown, velocity, time spent and workload.

**On screen:** configurable dashboards, charts for each report.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/dashboards | JWT, proj:viewer | List |
| POST | P/dashboards | JWT, proj:reporter | Create |
| GET | P/dashboards/:dashboardId | JWT, proj:viewer | Read |
| PATCH | P/dashboards/:dashboardId | JWT, proj:reporter (owner) or lead | Update |
| DELETE | P/dashboards/:dashboardId | JWT, proj:reporter (owner) or lead | Delete |
| GET | P/reports/summary | JWT, proj:viewer | Counts by status and type |
| GET | P/reports/created-vs-resolved | JWT, proj:viewer | Daily created and resolved |
| GET | P/reports/burndown | JWT, proj:viewer | Sprint burndown (`sprintId`) |
| GET | P/reports/velocity | JWT, proj:viewer | Velocity per sprint |
| GET | P/reports/time-spent | JWT, proj:viewer | Time spent |
| GET | P/reports/workload | JWT, proj:viewer | Open work per assignee |

## Goals

**What the user can do:** set goals and record progress.

**On screen:** goal cards with progress gauges.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/goals | JWT, proj:viewer | List |
| POST | P/goals | JWT, proj:lead | Create |
| GET | P/goals/:goalId | JWT, proj:viewer | Read |
| PATCH | P/goals/:goalId | JWT, proj:lead | Update |
| DELETE | P/goals/:goalId | JWT, proj:lead | Delete |
| POST | P/goals/:goalId/progress | JWT, proj:developer | Record progress |

## Automation rules and runs

**What the user can do:** define trigger, condition and action rules, toggle them, test-run on an issue, and inspect run logs.

**On screen:** a rule builder and a run history table.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/automation/rules | JWT, proj:viewer | List rules |
| POST | P/automation/rules | JWT, proj:admin | Create |
| GET | P/automation/rules/:ruleId | JWT, proj:viewer | Read |
| PATCH | P/automation/rules/:ruleId | JWT, proj:admin | Update |
| DELETE | P/automation/rules/:ruleId | JWT, proj:admin | Delete |
| POST | P/automation/rules/:ruleId/toggle | JWT, proj:admin | Enable or disable |
| POST | P/automation/rules/:ruleId/run | JWT, proj:admin | Manual run on an issue |
| GET | P/automation/rules/:ruleId/runs | JWT, proj:viewer | Runs of one rule |
| GET | P/automation/runs | JWT, proj:viewer | All runs |

## Webhooks

**What the user can do:** send signed events to external URLs, test them, inspect deliveries and redeliver. The secret is shown once.

**On screen:** a webhook list and delivery log.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/webhooks | JWT, proj:admin | List |
| POST | P/webhooks | JWT, proj:admin | Create |
| GET | P/webhooks/:webhookId | JWT, proj:admin | Read |
| PATCH | P/webhooks/:webhookId | JWT, proj:admin | Update |
| DELETE | P/webhooks/:webhookId | JWT, proj:admin | Delete |
| POST | P/webhooks/:webhookId/test | JWT, proj:admin | Send a ping |
| GET | P/webhooks/:webhookId/deliveries | JWT, proj:admin | Delivery log |
| POST | P/webhooks/:webhookId/deliveries/:deliveryId/redeliver | JWT, proj:admin | Redeliver |

## Integrations

**What the user can do:** record integration configuration (no OAuth), mark it connected or disconnected, and link issues to external references.

**On screen:** an integrations gallery and a linked-items panel.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/integrations | JWT, proj:admin | List |
| POST | P/integrations | JWT, proj:admin | Create |
| GET | P/integrations/:integrationId | JWT, proj:admin | Read |
| PATCH | P/integrations/:integrationId | JWT, proj:admin | Update |
| DELETE | P/integrations/:integrationId | JWT, proj:admin | Delete |
| POST | P/integrations/:integrationId/connect | JWT, proj:admin | Mark connected |
| POST | P/integrations/:integrationId/disconnect | JWT, proj:admin | Mark disconnected |
| GET | P/integrations/:integrationId/links | JWT, proj:viewer | List external links |
| POST | P/integrations/:integrationId/links | JWT, proj:developer | Link an issue |
| DELETE | P/integrations/:integrationId/links/:linkId | JWT, proj:developer | Remove a link |

## Service desk

**What the user can do:** manage customers, request types and SLA policies, watch SLA timers (pause and resume), and request and decide approvals on issues.

**On screen:** a queue with SLA countdowns, an approvals card on the issue.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/servicedesk/customers, /:id | JWT, proj:viewer | List, read |
| POST | P/servicedesk/customers | JWT, proj:developer | Create |
| PATCH | P/servicedesk/customers/:id | JWT, proj:developer | Update |
| DELETE | P/servicedesk/customers/:id | JWT, proj:developer | Delete |
| GET | P/servicedesk/request-types, /:id | JWT, proj:viewer | List, read |
| POST | P/servicedesk/request-types | JWT, proj:lead | Create |
| PATCH | P/servicedesk/request-types/:id | JWT, proj:lead | Update |
| DELETE | P/servicedesk/request-types/:id | JWT, proj:lead | Delete |
| GET | P/servicedesk/sla-policies, /:id | JWT, proj:viewer | List, read |
| POST | P/servicedesk/sla-policies | JWT, proj:lead | Create |
| PATCH | P/servicedesk/sla-policies/:id | JWT, proj:lead | Update |
| DELETE | P/servicedesk/sla-policies/:id | JWT, proj:lead | Delete |
| GET | P/servicedesk/sla-timers | JWT, proj:viewer | List timers |
| POST | P/servicedesk/sla-timers/:timerId/pause | JWT, proj:developer | Pause |
| POST | P/servicedesk/sla-timers/:timerId/resume | JWT, proj:developer | Resume |
| GET | P/servicedesk/issues/:issueId/approvals | JWT, proj:viewer | List approvals |
| POST | P/servicedesk/issues/:issueId/approvals | JWT, proj:developer | Request approval |
| POST | P/servicedesk/approvals/:approvalId/decide | JWT, named approver | Approve or decline |

## Forms

**What the user can do:** build intake forms, share a public link, and let anyone submit; each submission creates an issue. Public submit is rate limited to 10 per minute per IP.

**On screen:** a form builder, a public submission page, a submissions table.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/forms | JWT, proj:viewer | List |
| POST | P/forms | JWT, proj:lead | Create |
| GET | P/forms/:formId | JWT, proj:viewer | Read |
| PATCH | P/forms/:formId | JWT, proj:lead | Update |
| DELETE | P/forms/:formId | JWT, proj:lead | Delete |
| GET | P/forms/:formId/submissions | JWT, proj:developer | Submissions |
| GET | /api/public/forms/:publicKey | none | Public form definition |
| POST | /api/public/forms/:publicKey/submit | none | Submit a form |

## Test management

**What the user can do:** maintain test cases, create runs, record results per case and complete a run to compute totals.

**On screen:** a test library, a run execution view with pass or fail buttons.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/test-cases, /:id | JWT, proj:viewer | List, read |
| POST | P/test-cases | JWT, proj:developer | Create |
| PATCH | P/test-cases/:id | JWT, proj:developer | Update |
| DELETE | P/test-cases/:id | JWT, proj:lead | Delete |
| GET | P/test-runs, /:id | JWT, proj:viewer | List, read |
| POST | P/test-runs | JWT, proj:developer | Create a run |
| PATCH | P/test-runs/:id | JWT, proj:developer | Update |
| DELETE | P/test-runs/:id | JWT, proj:lead | Delete |
| POST | P/test-runs/:runId/complete | JWT, proj:developer | Complete the run |
| GET | P/test-runs/:runId/results | JWT, proj:viewer | List results |
| GET | P/test-runs/:runId/results/:resultId | JWT, proj:viewer | Read a result |
| POST | P/test-runs/:runId/results | JWT, proj:developer | Record a result (upsert per case) |
| DELETE | P/test-runs/:runId/results/:resultId | JWT, proj:lead | Delete a result |

## Risks

**What the user can do:** keep a risk register with probability, impact and mitigation.

**On screen:** a risk matrix and list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/risks, P/risks/:id | JWT, proj:viewer | List, read |
| POST | P/risks | JWT, proj:developer | Create |
| PATCH | P/risks/:id | JWT, proj:developer | Update |
| DELETE | P/risks/:id | JWT, proj:lead | Delete |

## Budget

**What the user can do:** plan budget lines, record actual spend and compare planned to actual.

**On screen:** a budget table with variance bars.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/budget-lines/summary | JWT, proj:viewer | Planned vs actual |
| GET | P/budget-lines, /:id | JWT, proj:viewer | List, read |
| POST | P/budget-lines | JWT, proj:developer | Create |
| PATCH | P/budget-lines/:id | JWT, proj:developer | Update |
| DELETE | P/budget-lines/:id | JWT, proj:lead | Delete |
| GET | P/budget-actuals, /:id | JWT, proj:viewer | List, read |
| POST | P/budget-actuals | JWT, proj:developer | Record actual |
| PATCH | P/budget-actuals/:id | JWT, proj:developer | Update |
| DELETE | P/budget-actuals/:id | JWT, proj:lead | Delete |

## CAT module

**What the user can do:** keep translation memory entries and a glossary for computer-assisted translation work.

**On screen:** a segment table and a glossary list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/cat-entries, /:id | JWT, proj:viewer | List, read |
| POST | P/cat-entries | JWT, proj:developer | Create |
| PATCH | P/cat-entries/:id | JWT, proj:developer | Update |
| DELETE | P/cat-entries/:id | JWT, proj:lead | Delete |
| GET | P/cat-glossary, /:id | JWT, proj:viewer | List, read |
| POST | P/cat-glossary | JWT, proj:developer | Create term |
| PATCH | P/cat-glossary/:id | JWT, proj:developer | Update term |
| DELETE | P/cat-glossary/:id | JWT, proj:lead | Delete term |

## Notifications

**What the user can do:** read their notifications, see the unread count, and mark one or all as read.

**On screen:** a bell with a badge and a notification drawer.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/notifications | JWT | List (filter unread, project) |
| GET | /api/notifications/unread-count | JWT | Unread count |
| POST | /api/notifications/:notificationId/read | JWT | Mark read |
| POST | /api/notifications/read-all | JWT | Mark all read |

## Activity feed

**What the user can do:** see a project timeline of what happened.

**On screen:** a feed of "X moved PAY-1 to Done" entries.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | P/activity | JWT, proj:viewer | Feed, cursor paginated, filter by kind |

## Audit log

**What the user can do:** admins review security and configuration changes with filters.

**On screen:** an audit table with actor, action, time and before and after values.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/orgs/:orgId/audit | JWT, org:admin | Org audit log |
| GET | /api/projects/:projectId/audit | JWT, proj:admin | Project audit log |

## AI assistant

**What the user can do:** turn text into an issue, summarize, suggest subtasks or draft a wiki outline, then accept (which creates the item) or discard the draft. Prompts are not stored. Without `ANTHROPIC_API_KEY`, `POST /api/ai/drafts` returns 503 `AI not configured`. A daily cap per user returns 429.

**On screen:** an "AI" button in the editor, a draft preview with accept and discard, a usage meter.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/ai/drafts | JWT, proj:reporter (checked in service) | Create a draft |
| GET | /api/ai/drafts | JWT | Own drafts |
| GET | /api/ai/drafts/:draftId | JWT, owner | Read a draft |
| POST | /api/ai/drafts/:draftId/accept | JWT, owner, proj:reporter | Apply the draft |
| POST | /api/ai/drafts/:draftId/discard | JWT, owner | Discard |
| GET | /api/ai/usage | JWT | Usage today and this month |

## API tokens and sessions

**What the user can do:** create personal API tokens with scopes (the raw token is shown once), revoke them, and review or revoke signed-in sessions.

**On screen:** security settings with a token list and a device list.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/users/me/api-tokens | JWT | List tokens |
| POST | /api/users/me/api-tokens | JWT | Create a token |
| DELETE | /api/users/me/api-tokens/:tokenId | JWT | Revoke a token |
| GET | /api/users/me/sessions | JWT | List sessions |
| DELETE | /api/users/me/sessions/:sessionId | JWT | Revoke a session |
