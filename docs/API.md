# Collabora8r — Full API Reference

Base URL: `http://localhost:3001`  
Content-Type: `application/json` (except file uploads: `multipart/form-data`)  
Auth header: `Authorization: Bearer <jwt>` — required unless marked **Public**.  
Token TTL: **24 hours**.

**Public endpoints:** `GET /health`, all `POST /auth/*`, `POST /git/webhook`.

Rate limits (auth): general 30/min per IP+path; sensitive (`send-code`, `signup-code`, `reset-password`) 5/min.

Error shape (typical): `{ "error": "message" }` or `{ "errors": ["field is required", ...] }`.

---

## Health

### `GET /health` — **Public**
**Expect:** nothing  
**Returns:**
```json
{
  "status": "ok",
  "message": "Collabor8r API is running",
  "port": 3001,
  "memory": { "rss": "… MB", "heapTotal": "…", "heapUsed": "…", "external": "…" }
}
```

---

## Auth (`/auth`) — all **Public**, rate-limited

### `POST /auth/signup`
**Body:** `{ name, gender: "Male"|"Female"|"Other", phone, email, dob, password }` (password ≥ 6)  
**Returns 201:** `{ token, message: "Account created successfully" }`  
**Errors:** 400 validation / email exists; 429 rate limit.

### `POST /auth/signin`
**Body:** `{ email, password }`  
**Returns:** `{ token }`  
**Errors:** 400 no account / wrong password; 429.

### `POST /auth/check-email`
**Body:** `{ email }`  
**Returns 200:** `{ exists: false, message: "Email is available" }`  
**Returns 400:** `{ exists: true, message: "Email already registered" }`

### `POST /auth/send-code`
**Body:** `{ email, purpose: "registration"|"login"|"password-reset" }`  
**Returns:** `{ success: true, message: "Verification code sent" }`  
**Errors:** 400 wrong purpose / email taken (registration) / no account (login, password-reset); 429.

### `POST /auth/signup-code`
**Body:** `{ email, code, name, gender, phone, dob }`  
**Returns 201:** `{ token, message }`  
**Errors:** 400 invalid/expired code or user exists; 429.

### `POST /auth/signin-code`
**Body:** `{ email, code }`  
**Returns:** `{ token }`  
**Errors:** 400 invalid code / no account; 429.

### `POST /auth/reset-password`
**Body:** `{ email, code, newPassword }`  
**Returns:** `{ message: "Password updated successfully" }`  
**Errors:** 400 invalid code / user does not exist; 429.

---

## Profile (`/profile`)

Extended profile fields are **not collected at signup** — they start empty (defaults) and are filled later via `PUT /profile`. Legacy accounts read back the same defaults automatically.

**Extended fields (all optional):**
`headline: ''`, `bio: ''`, `location: ''`, `jobTitle: ''`, `skills: []`, `languages: []`, `socialLinks: { github: '', linkedin: '', website: '' }`, `availability: 'available' | 'busy' | 'away'` (default `'available'`), `statusEmoji: ''`, `pronouns: ''`

### `GET /profile` 🔒
**Expect:** Bearer token  
**Returns:** Profile document `{ _id, name, gender, phone, email, dob, avatar, headline, bio, location, jobTitle, skills, languages, socialLinks, availability, statusEmoji, pronouns, ... }` — password excluded  
**Errors:** 401 no/invalid token; 404 not found.

### `PUT /profile` 🔒
**Body (partial):** `{ name?, gender?, phone?, email?, dob?, avatar?, headline?, bio?, location?, jobTitle?, skills?, languages?, socialLinks?, availability?, statusEmoji?, pronouns? }`  
`skills`/`languages` must be arrays; `socialLinks` must be an object; `availability` must be one of the three enum values.  
**Returns:** Updated profile  
**Errors:** 400 invalid `availability` / `skills` / `languages` / `socialLinks`; 401; 404; 500.

---

## Notifications (`/notifications`) 🔒

### `GET /notifications`
**Returns:** Array of notification docs for current user.

### `PUT /notifications/read`
**Body:** `{ index }` (number)  
**Returns:** `{ message: "Notifications marked as read", result }`

### `GET /notifications/unread-count`
**Returns:** `{ unreadCount: number }`

---

## Projects (`/projects`) 🔒

### `GET /projects`
**Query:** `role=admin|manager|joined` (aliases: `created` | `lead` | `member`; omit = all memberships), `include=stats`  

Role buckets are **mutually exclusive** and reflect **accepted** membership only (pending invitations never appear in any list — they live in `GET /invitations/pending`):

| `role` | Returns |
|--------|---------|
| `admin` / `created` | `Membership.admin` — projects you created |
| `manager` / `lead` | `Membership.asLead` — projects where you accepted the lead role |
| `joined` / `member` | `Membership.joined` — team projects where you are not a lead or creator |
| *(omit)* | Union of all three (`admin ∪ asLead ∪ joined`) |

**Returns:** Array:
```json
[{
  "_id", "name", "description", "theme", "status",
  "leads": [{ "_id", name, email, avatar }],
  "createdBy": { name, avatar } | null,
  "taskCount", "teamCount",
  "stats": { "Not Started": 3, "In Progress": 2, "avgProgress": 40 }
}]
```
`stats` only when `include=stats`.

### `POST /projects`
**Body:** `{ name, description, leadEmail, ...optional fields }`  
**Optional fields:** `theme` (string path/URL, e.g. `"/themes/3.jpg"`, or numeric id), `methodology` (`"sprint"` | `"kanban"`; aliases like `"Scrum"`/`"Agile"` → `sprint`, `"Kanban"` → `kanban`)  
**`leadEmail`** (required, matched case-insensitively):
- **Your own email** → you become lead **immediately** (added to `leads` + `team`, no invitation flow).
- **Another user** → invitation only; they enter `leads` **only when they accept** (pending invites grant no privileges and appear in no list).

**Returns 201:** `{ message, project }`  
**Errors:** 400 validation; 404 lead email not registered.

### `GET /projects/:projectId`
**Returns:**
```json
{
  "...project fields",
  "team": [{ _id, name, email, avatar, isOnline }],
  "leads": [{ ..., isOnline }],
  "taskCount": 12,
  "onlineMembers": ["userId", ...]
}
```

### `PUT /projects/:projectId`
**Body (partial):** `{ name?, description?, about?, theme?, objectives?, tags?, category?, methodology?, startDate?, targetDate?, version?, links?, leadEmail? }`  
`theme` string path/id (normalized server-side); `methodology` same aliases as create.  
**Returns:** Updated project.  
**Errors:** **403 not creator/accepted lead**; 404 project not found / lead email not registered (`leadEmail` is validated **before** any mutation, so a 404 leaves the project untouched); 409 user already has a pending invitation.  
Side effects: activity log, socket `project:updated`, optional lead handling if `leadEmail` — **self → immediate lead** (team + leads, no invite); **other → invitation only** (they enter `leads` and `?role=manager` only after accepting via `lead-response` or token).

### `PUT /projects/:projectId/lead-response`
**Body:** `{ response: "Accept" }`  
**Returns:** Updated project. Only `"Accept"` grants the role; any other value is a no-op (project unchanged). Accepting adds you to the team, writes `leads` + `Membership.asLead` (moving you from `Membership.joined`), making the project appear under `?role=manager`.  
**Errors:** 404 project not found; **403 no lead invitation** for your email (pending or accepted) — you cannot self-promote.

### `GET /projects/:projectId/summary`
**Returns:** `{ summary: string, stats: { totalTasks, ...statusCounts } }` (LLM)

### `POST /projects/:projectId/join`
**Body:** none (uses token user)  
**Returns:** `{ message: "Project invitation accepted successfully." }`  
**Errors:** 404 project not found; **403 no invitation** — requires a pending/accepted invitation for your email, or already being on the team (idempotent).

### `GET /projects/:projectId/members`
**Query:** `q=email` (search mode)  
- **No q →** Array `[{ _id, email, avatar, name }]` (team list)  
- **With q →** `{ userId, name, email, avatar }` or 404 / 400 already in team.

### `GET /projects/:projectId/workflow`
**Returns:**
```json
{
  "statuses": [{ name, ... }],
  "workflowRules": { enabled, transitions: [{ from, to }] },
  "wipLimits": { enabled, limits: [{ status, max }] },
  "currentCounts": { "In Progress": 4 }
}
```

### `PUT /projects/:projectId/workflow`
**Body:** `{ enabled?: boolean, transitions?: [{ from, to }] }`  
**Returns:** `{ workflowRules }`  
**Errors:** 403 not lead/creator; 400 invalid status in transition.

### `PUT /projects/:projectId/wip-limits`
**Body:** `{ enabled?: boolean, limits?: [{ status, max }] }`  
**Returns:** `{ wipLimits }`  
**Errors:** 403 not lead/creator; 400 invalid status or max < 1.

---

## Project invitations — nested (`/projects/:projectId/invitations`) 🔒

### `POST /projects/:projectId/invitations`
**Body:** `{ email, userId?, role?: "member"|"joined"|"lead", type?: "teamMember"|"projectLead", message? }`  
**`role`:** only `"lead"` or `"member"` ever grant a privilege (`"joined"` is accepted as an alias of `"member"`). `"admin"` and anything else → 400. `type` is derived from `role` when omitted (`lead` → `projectLead`).  
**Returns 201:** Invitation document (pending — grants nothing until accepted)  
**Errors:** 400 bad email / invalid role / invalid type; 404 project/user; 409 duplicate.

### `GET /projects/:projectId/invitations`
**Returns:** Array of invitations (populated `invitedBy`), newest first.

---

## Invitations — global (`/invitations`) 🔒

### `GET /invitations/pending`
**Returns:** Array of pending invites for current user's email  
(populated `invitedBy`, `projectId`).

### `POST /invitations/:token/accept`
**Body:** none  
**Returns:** `{ message, invitation }`  
**Errors:** 404 not found; 400 expired; **403 wrong user** — only the invited email may respond.

### `POST /invitations/:token/decline`
**Body:** none  
**Returns:** `{ message, invitation }`  
**Errors:** 404; **403 wrong user.**

---

## Project AI (`/projects/:projectId/ai`) 🔒

### `POST /projects/:projectId/ai/assist`
**Body:** `{ prompt }`  
**Returns:**
```json
{
  "project": {
    "name", "description", "about", "objectives": [], "tags": [],
    "category", "methodology", "startDate", "targetDate", "version", "links": []
  }
}
```

### `POST /projects/:projectId/ai/roadmap`
**Body:** `{ goal? }`  
**Returns:** `{ roadmap: { summary, phases: [{ name, description, tasks: [{ title, description, priority, estimateHours, acceptanceCriteria }] }] } }`

### `POST /projects/:projectId/ai/risks`
**Body:** none  
**Returns:**
```json
{
  "risks": [{ "severity": "high|medium|low", "description", "suggestion" }],
  "stats": { totalTasks, overdue, stalled, unassigned }
}
```

### `POST /projects/:projectId/ai/suggest-tasks`
**Body:** `{ prompt? , roadmap? }` (at least one)  
**Returns:**
```json
{
  "tasks": [{
    "title", "description", "priority", "status", "issueType",
    "dueDate", "estimateHours", "acceptanceCriteria": [], "suggestedAssignee"
  }]
}
```

---

## Tasks (`/tasks`) 🔒

### `GET /tasks`
**Query:**  
`projectId, status, priority, issueType, assignedTo, sprintId, label, epicId, parentId, search, page, limit, sort`  
`include=userTasks|project|names` (comma-combined; `assignees` accepted but hydration is always on)  
`status`, `priority`, `issueType`, `label` accept comma-separated lists. `limit` default 50, max 100; `sort` default `-createdAt`.

**Returns:**
```json
{
  "tasks": [ { ...task, "assignedTo": { _id, email, name, avatar } | null, "projectName"?: "..." } ],
  "pagination": { "page": 1, "limit": 50, "total": 120, "pages": 3 },
  "userTaskDetails"?: [...],
  "project"?: { "_id", "name", "team": ["userId", ...] },
  "projectTeam"?: number
}
```
`assignedTo` is always hydrated to a profile (`null` if unassigned). `projectName` requires `include=names`; `userTaskDetails` requires `include=userTasks`; `project` + `projectTeam` require `include=project` **and** `projectId`.

### `POST /tasks`
**Body:** `{ title, description, dueDate, projectId, ...optional, ai?: true }`  
**Returns 201:** `{ task, aiExtracted: { priority, dueDate, estimateHours } | null }`  
**Errors:** 400 validation / invalid status; 500.

### `POST /tasks/bulk`
**Body:** `{ projectId, tasks: [{ title, description?, priority?, status?, issueType?, dueDate?, estimateHours?, acceptanceCriteria?, suggestedAssignee? }] }`  
**Returns 201:** `{ tasks: [...], count }`

### `PATCH /tasks/bulk-status`
**Body:** `{ updates: [ { id | taskId, status, progress? , ...} ] }` (shape per service)  
**Returns:** `{ success: true, updatedTasks }`

### `GET /tasks/blocked`
**Query:** `projectId` (required)  
**Returns:** `{ blockedTasks: [{ _id, title, status, priority, assignedTo }] }`

### `GET /tasks/assigned`
**Query:** `projectId?`, `include=names|doc`  
**Returns:** `{ tasks: [...], count }` or `{ tasks }` if `include=doc`.

### `GET /tasks/:taskId`
**Returns:** Task document with `assignedTo` populated `{ name, email, avatar }`.

### `PATCH /tasks/:taskId`
**Body:** partial task fields  
**Returns:** `{ message, task }`  
**Errors:** 404; 400 invalid status / workflow violation (`workflowViolation: true`); 409 WIP exceeded (`wipExceeded: true`) or blocked (`blocked: true, blockers`).

### `PUT /tasks/:taskId/status`
**Body:** only allowed fields, typically `{ status, progress }`  
**Returns:** `{ success, message, updatedTask }`  
**Errors:** same as PATCH (404 / 400 / 409).

### `DELETE /tasks/:taskId`
**Returns:** `{ message: "Task deleted successfully." }`

### `GET /tasks/:taskId/subtasks`
**Returns:** `{ subtasks: [...] }`

### `GET /tasks/:taskId/parent`
**Returns:** `{ parent: {...} }` or **404** `{ error: "No parent task" }`

### `POST /tasks/links`
**Body:** `{ sourceTaskId, targetTaskId, linkType, projectId }`  
**Returns 201:** Link document  
**Errors:** 400 validation; 409 link already exists.

### `GET /tasks/:taskId/links`
**Returns:** Array of links with `sourceTaskId`/`targetTaskId` populated to `{ title }`.

### `DELETE /tasks/links/:linkId`
**Returns:** `{ message: "Link deleted" }` or 404.

---

## Task AI (`/tasks/ai`) 🔒

### `POST /tasks/ai/draft`
**Body:** `{ prompt, projectId? }`  
**Returns:**
```json
{
  "task": {
    "title", "description", "priority", "status", "dueDate",
    "estimateHours", "acceptanceCriteria": [], "suggestedAssignee", "issueType"
  }
}
```

### `POST /tasks/ai/create`
**Body:** `{ prompt, projectId }` (both required)  
**Returns 201:** `{ task, aiExtracted }`

### `POST /tasks/ai/breakdown`
**Body:** `{ taskDescription }`  
**Returns:** `{ subtasks: [{ title, description, estimateHours }] }`

### `POST /tasks/ai/suggest-assignee`
**Body:** `{ projectId, taskDescription }`  
**Returns:** `{ suggestedEmail, reason, suggestedUser } | { suggestedUser: null }`

### `POST /tasks/ai/recommend-metadata`
**Body:** `{ title, description?, projectId? }`  
**Returns:** `{ priority, status, suggestedDueDate }`

### `POST /tasks/ai/acceptance-criteria`
**Body:** `{ title, description? }`  
**Returns:** `{ criteria: [string] }`

### `POST /tasks/ai/search`
**Body:** `{ query, projectId? }`  
**Returns:** `{ tasks: [...] }` (up to ~10 matches)

---

## Task views — boards / filters / labels (`/tasks/...`) 🔒

### Boards
| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| GET | `/tasks/boards` | `?projectId=` | Array of boards |
| POST | `/tasks/boards` | `{ projectId, name?, columns: [...], swimlane? }` | Board 201 |
| PUT | `/tasks/boards/:boardId` | partial board | Board |
| DELETE | `/tasks/boards/:boardId` | — | `{ message: "Board deleted" }` |

Column shape: `{ name, statuses: [], wipLimit }`. Swimlane: `assignee|epic|priority|null`.

### Saved filters
| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| GET | `/tasks/filters` | `?projectId=` | Own filters |
| POST | `/tasks/filters` | `{ name, query, projectId }` | Filter 201 |
| PUT | `/tasks/filters/:filterId` | partial | Filter (own only) |
| DELETE | `/tasks/filters/:filterId` | — | `{ message: "Filter deleted" }` |

### Labels
| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| GET | `/tasks/labels` | `?projectId=` | Array |
| POST | `/tasks/labels` | `{ name, projectId }` | Label 201 |
| PUT | `/tasks/labels/:labelId` | partial | Label |
| DELETE | `/tasks/labels/:labelId` | — | `{ message: "Label deleted" }` |

---

## Task comments (`/tasks/...`) 🔒

### `POST /tasks/:taskId/comments`
**Body:** `{ content, userId? }`  
**Returns 201:** `{ message, comment }`

### `GET /tasks/:taskId/comments`
**Returns:** `{ comments: [...] }` or 404 task not found.

### `GET /tasks/:taskId/comments/summary`
**Returns:** LLM summary object (e.g. `{ summary / keyPoints ... }`) or 404.

### `PUT /tasks/comments/:commentId`
**Body:** `{ content }`  
**Returns:** `{ message, comment }` or 404.

### `DELETE /tasks/comments/:commentId`
**Returns:** `{ message: "Comment deleted successfully." }` or 404.

---

## Task attachments (`/tasks/...`) 🔒 — multipart, field name `files`, max 10

### `POST /tasks/:taskId/attachments`
**Form:** `files` (1–10 files)  
**Returns 201:** `{ files: [{ name, path, size, mimetype }], task }`

### `GET /tasks/:taskId/attachments`
**Returns:** Array of attachment docs.

### `POST /tasks/comments/:commentId/attachments`
**Form:** `files`  
**Returns 201:** `{ files, comment }`

### `DELETE /tasks/attachments/:fileId`
**Returns:** `{ message: "File deleted" }` (also removes disk file)

Static file access: `GET /uploads/<filename>` (static, no auth on static middleware).

---

## Sprints (`/sprints`) 🔒

### `POST /sprints/ai/create`
**Body:** `{ prompt, projectId }`  
**Returns 201:** `{ sprint, aiExtracted: { name, goal, startDate, endDate } }`

### `GET /sprints`
**Query:** `projectId` (required)  
**Returns:** Array sorted by `startDate` desc.

### `POST /sprints`
**Body:** `{ name, startDate, endDate, projectId, goal? }`  
**Returns 201:** Sprint document.

### `GET /sprints/:sprintId`
**Returns:** `{ ...sprint, tasks: [...] }`

### `PUT /sprints/:sprintId`
**Body:** `{ name?, goal?, startDate?, endDate? }`  
**Returns:** Updated sprint.

### `DELETE /sprints/:sprintId`
**Returns:** `{ message: "Sprint deleted" }` (unsets `sprintId` on tasks)

### `POST /sprints/:sprintId/activate`
**Returns:** Sprint with `isActive: true` (others in project deactivated).

### `POST /sprints/:sprintId/complete`
**Returns:** Completion result from service.

### `POST /sprints/:sprintId/tasks/add`
**Body:** `{ taskIds: [id, ...] }`  
**Returns:** Service result.

### `POST /sprints/:sprintId/tasks/remove`
**Body:** `{ taskIds: [id, ...] }`  
**Returns:** Service result.

### `GET /sprints/:sprintId/retrospective`
**Returns:**
```json
{
  "whatWentWell": ["..."],
  "whatCouldImprove": ["..."],
  "actionItems": ["..."],
  "stats": { "totalTasks": 12, "completed": 8, "incomplete": 4 }
}
```

---

## Time (`/time`) 🔒

### `POST /time/entries`
**Body:** `{ taskId, hours, description?, date? }`  
**Returns 201:** TimeEntry document (recalculates task hours).

### `GET /time/entries`
**Query:** `taskId` OR `userId` (defaults to current user)  
**Returns:** Array sorted by `date` desc; populates user or task title accordingly.

### `GET /time/report`
**Query:** `projectId` **or** `sprintId` (at least one required)  
**Returns:** Report object from `time/service.report()` (totals, by user/task breakdown).

### `PUT /time/entries/:entryId`
**Body:** `{ hours?, description?, date? }`  
**Returns:** Updated entry.  
**Errors:** 404; 403 not owner.

### `DELETE /time/entries/:entryId`
**Returns:** `{ message: "Time entry deleted" }`  
**Errors:** 404; 403 not owner.

---

## Activity (`/activity`) 🔒

### `GET /activity`
**Query:** `projectId?`, `taskId?`, `limit?`, `userId?`  
- No `projectId`/`taskId` → defaults to current user activity.  
**Returns:** Array of activity log documents.

---

## Reports (`/reports/:projectId`) 🔒

### `GET /reports/:projectId/budget`
**Returns:**
```json
{
  "project": { "name", "budget" },
  "hours": { "totalEstimate", "totalLogged", "totalRemaining" },
  "costs": { "estimatedCost", "loggedCost", "remainingCost" },
  "utilization": 72,
  "statusBreakdown": { "In Progress": { "count", "estimatedHours", "loggedHours" } },
  "taskCount": 20
}
```

### `GET /reports/:projectId/burndown`
**Query:** `sprintId?` (omit → project date range)  
**Returns:**
```json
{
  "project": "Name",
  "sprintId": "..." | null,
  "totalTasks": 25,
  "points": [{ "date", "ideal", "remaining", "completed", "added" }]
}
```

### `GET /reports/:projectId/velocity`
**Query:** `sprintCount?` (1–50, default 5)  
**Returns:**
```json
{
  "project": "Name",
  "sprints": [{ "sprintId", "name", "startDate", "endDate", "totalTasks", "completedTasks", "totalPoints", "completedPoints", "velocity" }],
  "avgVelocity": 18,
  "trend": [15, 20, 18]
}
```

### `GET /reports/:projectId/health`
**Returns:**
```json
{
  "project": { "name", "status" },
  "stats": { "totalTasks", "completed", "inProgress", "overdue", "avgProgress", "totalEstimate", "totalLogged", "commits" },
  "healthScore": 85,
  "healthStatus": "healthy | at-risk | critical",
  "issues": ["2 overdue task(s)"],
  "highPriorityOpen": [{ "id", "title", "dueDate", "progress" }],
  "overdueTasks": [{ "id", "title", "dueDate", "progress" }]
}
```

---

## Overview (`/overview`) 🔒

### `GET /overview`
**Query:** `include=assigned|progress` (default `assigned,progress`)  
**Returns (combined):**
```json
{
  "tasks": [{ "...task", "projectName": "..." }],
  "projectCounts": {
    "adminProjectsCount": 2,
    "joinedProjectsCount": 5,
    "leadProjectCount": 1
  },
  "progressTasks": [{ "title", "progress", "status" }]
}
```
Keys present only if included. `projectCounts` are **mutually exclusive** and are exactly the lengths of `Membership.admin` / `Membership.asLead` / `Membership.joined` — i.e. they always equal the list lengths of `GET /projects?role=admin|manager|joined`. Pending invitations are excluded.

---

## Chat (`/chat`) 🔒

### `GET /chat/:projectId/messages`
**Query:** `before?` (cursor), `limit?` (default 50)  
**Returns:** `{ messages: [...] }`

### `POST /chat/:projectId/messages`
**Body:** `{ content, type? }`  
**Returns 201:** `{ message: payload }`

Real-time: join Socket.IO room for the project to receive live messages.

---

## Git (`/git`)

### `POST /git/commits` 🔒
**Body:** `{ taskId, commitHash, message, ...optional (branch, url, author) }`  
**Returns 201:** Commit document  
**Errors:** 400 validation; 404 task; 409 duplicate.

### `GET /git/commits` 🔒
**Query:** `taskId` **or** `projectId` (+ `page`, `limit`, `branch` for project)  
- taskId → `{ commits: [...] }`  
- projectId → paginated project result from service  
**Errors:** 400 neither provided.

### `DELETE /git/commits/:commitId` 🔒
**Returns:** `{ message: "Commit unlinked" }` or 404.

### `POST /git/webhook` — **Public** (HMAC)
**Headers:** GitHub signature headers (verified when `GIT_WEBHOOK_SECRET` set; uses raw body).  
**Body:** GitHub webhook payload.  
**Returns:** `{ message: "Webhook processed", linked: n }`  
**Errors:** 401 invalid signature; 500 processing failed.

---

## Quick counts

| Scope | Endpoints |
|-------|----------:|
| Health | 1 |
| Auth | 7 |
| Profile | 2 |
| Notifications | 3 |
| Projects (core + nested inv + AI) | 17 |
| Invitations (global) | 3 |
| Tasks (core + views + AI + comments + attachments) | 43 |
| Sprints | 11 |
| Time | 5 |
| Activity | 1 |
| Reports + Overview | 5 |
| Chat | 2 |
| Git | 4 |
| **Total** | **104** |

Related: see `docs/PAGES.md` for which front-end page calls which endpoint.
