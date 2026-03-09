# Collabora8r — Features & User Flow

---

## 1. Authentication & User Management

### Registration
**Password flow:**
1. User submits `POST /auth/signup` with `{ name, gender, phone, email, dob, password }`
2. Server hashes password, creates `Profile`, creates 4 supporting docs (`AssignedTask`, `AdminProject`, `JoinProject`, `Notification`) all sharing the same `_id`
3. Returns JWT token (expires 8h)

**Passwordless (code) flow:**
1. User submits `POST /auth/send-code` with `{ email, purpose: "registration" }`
2. Server generates 6-digit code, stores in `VerificationCode` with 5-min expiry, sends via nodemailer
3. User submits `POST /auth/signup-code` with `{ email, code, name, gender, phone, dob }`
4. Server verifies code, marks used, creates profile + 4 supporting docs, returns JWT

### Login
**Password flow:** `POST /auth/signin` → verifies email+password → returns JWT (22h expiry)

**Passwordless flow:**
1. `POST /auth/send-code` with `{ email, purpose: "login" }` → sends 6-digit code
2. `POST /auth/signin-code` with `{ email, code }` → verifies → returns JWT

### Password Reset
1. `POST /auth/forgot-password` → sends code to email
2. `POST /auth/reset-password` with `{ email, code, newPassword }` → verifies + updates

---

## 2. Profile

- **View:** `GET /profile/` returns full profile object (name, gender, phone, email, dob, avatar)
- **Update:** `PUT /profile/` with any subset of fields
- **Notifications:** `GET /profile/get-notifications` returns array of notification objects with type, data, read status

---

## 3. Projects — Core Workspace

### Creation
1. Admin submits `POST /projects/create` with name, description, optional project manager email + theme
2. Server creates `Project` doc, pushes project ID to `AdminProject[userId].projects`
3. If project manager email provided, sends notification via socket + DB
4. Returns created project

### Update
`PUT /projects/:projectId/update` — change name, description, manager, theme. If manager email changes, sends notification to new manager.

### Manager Invitation Flow
1. Project creator sets a project manager email at creation
2. Manager receives notification (socket + DB) with projectId and invitation type
3. Manager responds via `PUT /projects/manager-response/:projectId` with `"Accept"` or `"Decline"`
4. On accept: project's `projectManager.status` → `"Approved"`, project ID added to `JoinProject[userId].asManager`

---

## 4. Admin Projects View (`/admin-projects`)

- **List created projects:** `GET /admin-projects/` — queries `AdminProject[userId].projects` → fetches each project
- **Project details:** `GET /admin-projects/:projectId` — returns project with populated team (name/email/avatar) + first 5 tasks (title/priority/dueDate) + task count
- **Search users:** `POST /admin-projects/get-searched-user` — search by email, validates not already in team, returns user info for invitation
- **Send invitation:** `POST /admin-projects/send-project-invitation` — sends socket + DB notification to user

---

## 5. User Management (`/manageusers`)

- **Team list:** `GET /manageusers/:projectId/get-all-users` — returns all members of a project's team with email/avatar/name
- **Project details for invite:** `POST /manageusers/get-project-details` — returns project + creator profile (used for invitation preview)
- **Accept invite:** `POST /manageusers/accept-invite` — adds user to `project.team` + adds project ID to `JoinProject[userId].projects`

---

## 6. Joined Projects (`/joinedprojects`)

- **As member:** `GET /joinedprojects/` — fetches projects from `JoinProject[userId].projects`, returns with creator info, task count, team count
- **As manager:** `GET /joinedprojects/as-manager` — same but from `JoinProject[userId].asManager`
- **Project detail:** `GET /joinedprojects/:projectId` — returns project with fully populated team (name, email, avatar, handles missing profiles gracefully)

---

## 7. Tasks — Full Lifecycle

### Task States
- Statuses: `Not Started` → `In Progress` → `Paused` → `Completed`
- Priority: `Low`, `Medium`, `High`
- Resolution (on completion): `Done`, `Won't Fix`, `Duplicate`, `Cannot Reproduce`
- Progress: 0–100%

### Create (`POST /manageTasks/`)
1. Validates title, description, dueDate, projectId
2. Creates Task document
3. Pushes task ID to `Project.tasks[]`
4. If assignedTo provided: upserts `AssignedTask[userId].assignTasks[]`
5. Logs activity (type: "created")
6. Dispatches webhook event `task.created`

### Edit (`PATCH /manageTasks/:taskId`)
1. Updates fields on Task doc
2. If assignedTo changed: removes from old user's `AssignedTask`, adds to new user's
3. Logs activity with field-level change tracking
4. Dispatches webhook event `task.updated`

### Delete (`DELETE /manageTasks/:taskId`)
1. Removes from `AssignedTask[userId].assignTasks`
2. Removes from `Project.tasks`
3. Deletes Task doc
4. Logs activity
5. Dispatches webhook event `task.deleted`

### User-Specific View (`/projecttasks`)
- `GET /projecttasks/:projectId` — returns all project tasks + the current user's assigned tasks within that project
- `PATCH /projecttasks/tasks/update` — bulk status update (array of `{ id, status }`)
- `PUT /projecttasks/update-task-progress/:taskId` — update progress + status with activity logging

### Public Task View (`/project-tasks`)
- `GET /project-tasks/:projectId/tasks` — all tasks with assigned user details
- `GET /project-tasks/:id` — single task details

---

## 8. Comments

1. **Add:** `POST /comments/tasks/:taskId/comments` — creates Comment doc, pushes ID to Task.comments, logs activity
2. **List:** `GET /comments/tasks/:taskId/comments` — all comments with user profile populated
3. **Edit:** `PUT /comments/:commentId` — updates content, logs activity
4. **Delete:** `DELETE /comments/:commentId` — removes comment + pulls from Task.comments, logs activity

---

## 9. Dashboard (`/overview`)

- **Assigned tasks:** Returns all tasks assigned to user, enriched with project name
- **Progress overview:** Returns count of admin projects / joined projects / managed projects + all assigned tasks (with title, progress, status)

---

## 10. Sprints — Time-boxed iterations

**Lifecycle:** Created → Active → Completed

1. **Create:** `POST /sprints/:projectId` — creates sprint, deactivates any other active sprint in project
2. **Add tasks:** `POST /sprints/sprint/:sprintId/add-tasks` — adds task IDs to sprint.tasks, sets `task.sprintId`
3. **Activate:** `POST /sprints/sprint/:sprintId/activate` — deactivates others, sets this as active
4. **Complete:** `POST /sprints/sprint/:sprintId/complete` — marks completed (isActive=false, isCompleted=true), logs activity
5. **Remove tasks:** `POST /sprints/sprint/:sprintId/remove-tasks` — removes from sprint, unsets `task.sprintId`

---

## 11. Time Tracking

1. **Log:** `POST /time/entries` — creates TimeEntry with taskId, userId, hours; increments `task.loggedHours`
2. **View per task:** `GET /time/entries/task/:taskId` — all entries for a task
3. **View own:** `GET /time/entries/user` — current user's entries
4. **Reports:** `GET /time/report/project/:projectId` and `GET /time/report/sprint/:sprintId` — aggregate total hours + entry count
5. **Edit/delete:** only entry owner can modify

---

## 12. Task Dependencies

- **Create link:** `POST /task-links` — creates directional link between two tasks (types: blocks, blocked-by, relates-to, duplicates, depends-on)
- **View:** `GET /task-links/task/:taskId` — all links involving a task (either as source or target)
- **Delete:** removes link

---

## 13. Labels

- **CRUD per project:** create, update, delete labels with name + hex color
- **Cleanup:** deleting a label automatically removes it from all tasks' `labels[]` arrays
- **Usage:** task create/update can include `labels: [ObjectId]` to tag tasks

---

## 14. Saved Filters & Boards

### Filters
- Users save search criteria (`query: { status, assignee, priority, etc. }`) per project
- Filters are scoped to user — each user has their own saved filters within a project

### Boards
- Kanban board configs with custom columns (each column = name + allowed statuses + WIP limit)
- Optional swimlane grouping (by assignee, epic, or priority)
- Multiple boards per project

---

## 15. Organizations — Multi-tenant Workspaces

1. **Create:** user becomes owner with `member.role: "owner"`
2. **Add members:** `POST /organizations/:orgId/members` with role (owner/admin/member)
3. **Manage roles:** update or remove members
4. **Projects:** projects can be associated with an organization via `project.organizationId`
5. **Delete:** unlinks all associated projects

---

## 16. Invitations

- **Send:** `POST /invitations` with email, project/organization reference, role
- **Auto-generates** a unique token + 7-day expiry
- **Accept:** `POST /invitations/:token/accept` — adds user to project team via projectService
- **Decline:** marks status as declined
- **View pending:** invites are matched to current user by email (from Profile)

---

## 17. File Uploads

- **Supported types:** jpg, jpeg, png, gif, pdf, doc, docx, xlsx, zip, csv, txt
- **Limits:** max 10 files per upload, 10MB each
- **Storage:** saved to `uploads/` directory with timestamp-prefixed filenames
- **Attachments stored** as subdocuments in Task model (`attachments: [{ name, path, size, mimetype }]`)
- **Static serve:** `/uploads/filename` serves files directly

---

## 18. Activity Log (Audit Trail)

- **Auto-logged** on task create/update/delete, comment add/edit/delete, sprint complete, progress update
- **Stores:** actorId, action, entityType, entityId, projectId, changes (field-level with old+new values), description, timestamp
- **Queries:** by project (last 50), by task, by user (last 30)

---

## 19. Webhook Integrations

- Users register webhook URLs with event subscriptions (task.created, task.updated, task.deleted, comment.created)
- On matching events, `webhookDispatcher` POSTs the event payload to all matching active webhooks
- **Test:** `POST /webhooks/:webhookId/test` sends a test payload
- Results are logged (failed dispatches don't throw)

---

## 20. Real-time (Socket.IO)

### Connection
- Client connects with `auth: { userId }`
- Server maps userId → socketId in `connectedUsers` Map

### Rooms
- Client emits `join-project(projectId)` → joins `project:<projectId>` room
- Client emits `leave-project(projectId)` → leaves room

### Notifications
- `sendMessageToUser(userId, payload)` — emits `notification` event to specific user
- `sendToProjectRoom(projectId, event, data)` — broadcasts to all members of a project room

---

## 21. AI Features

All AI endpoints use the `utils/ai.js` adapter which supports Groq (default) or OpenAI.

| Feature | Input | Output |
|---------|-------|--------|
| Create Task | `"fix login bug high priority due friday"` | Parsed task + created via taskService |
| Breakdown | Task description | 3-7 subtasks with estimates |
| Suggest Assignee | Task + project team list | Best-suited team member email |
| Recommend Metadata | Title + description | Priority, status, due date |
| Project Summary | Project ID | 2-3 sentence status + stats |
| Search Tasks | Natural language query | Matching task IDs |
| Summarize Comments | Task ID | 2-3 bullet summary |
| Acceptance Criteria | Title + description | 3-5 criteria items |
| Risk Detection | Project ID | Risks with severity + suggestions |
| Retrospective | Sprint ID | What went well, improve, action items |

---

## Data Model Relationships

```
Profile (1) ──→ AdminProject (1)     // projects user created
Profile (1) ──→ JoinProject (1)      // projects joined + managed
Profile (1) ──→ AssignedTask (1)     // tasks assigned to user
Profile (1) ──→ Notification (1)     // notifications for user
Profile (1) ──→ Organization (many)  // via members array

Project (1) ──→ Task (many)
Project (1) ──→ Sprint (many)
Project (1) ──→ Label (many)
Project (1) ──→ BoardConfig (many)
Project (1) ──→ Webhook (many)

Task (1) ──→ Comment (many)
Task (1) ──→ TimeEntry (many)
Task (1) ──→ TaskLink (many)         // bidirectional links
Task (1) ──→ Sprint (1)             // via sprintId

ActivityLog ──→ any entity           // polymorphic entityType + entityId
Invitation ──→ Project or Org        // via projectId or organizationId
```
