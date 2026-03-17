# Collabora8r — API Reference

**Base URL:** `http://localhost:3001`  
**Auth:** All protected endpoints require `Authorization: Bearer <token>` header  
**Response format:** All endpoints return JSON

---

## Auth — `/auth`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/auth/signup` | No | `{ name, gender, phone, email, dob, password }` | `{ token }` | Create account with email + password |
| POST | `/auth/signin` | No | `{ email, password }` | `{ token }` | Login with email + password |
| POST | `/auth/check-email` | No | `{ email }` | `{ exists: bool, message }` | Check if email is already registered |
| POST | `/auth/forgot-password` | No | `{ email }` | `{ success: bool, message }` | Send 6-digit code to email for password reset |
| POST | `/auth/reset-password` | No | `{ email, code, newPassword }` | `{ message }` | Verify code + reset password |
| POST | `/auth/send-code` | No | `{ email, purpose: "registration" \| "login" }` | `{ success: bool }` | Send 6-digit verification code to email |
| POST | `/auth/signup-code` | No | `{ email, code, name, gender, phone, dob }` | `{ token }` | Verify code + create account (passwordless) |
| POST | `/auth/signin-code` | No | `{ email, code }` | `{ token }` | Verify code + login (passwordless) |

---

## Profile — `/profile`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/profile/` | Yes | — | Profile object | Get current user's profile |
| PUT | `/profile/` | Yes | `{ name?, gender?, phone?, email?, dob?, avatar? }` | Updated profile | Update profile fields |
| GET | `/profile/get-notifications` | Yes | — | `[{ _id, type, data, read, createdAt }]` | Get user's notifications |
| PUT | `/profile/notifications/mark-read` | Yes | `{ notificationIds: [String] }` | `{ message }` | Mark specific notifications as read |
| GET | `/profile/notifications/unread-count` | Yes | — | `{ count: Number }` | Get count of unread notifications |

---

## Dashboard — `/overview`

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| GET | `/overview/assigned-tasks` | Yes | `{ tasks: [{ ...task, projectName }] }` | All tasks assigned to current user with project name |
| GET | `/overview/progress-overview` | Yes | `{ projectCounts: { adminProjectsCount, joinedProjectsCount, managerProjectCount }, tasks }` | Dashboard stats + task progress |

---

## Projects — `/projects`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/projects/create` | Yes | `{ name, description, projectManagerEmail?, theme?, organizationId? }` | `{ message, project }` | Create new project |
| PUT | `/projects/:projectId/update` | Yes | `{ name?, description?, projectManagerEmail?, theme? }` | Updated project | Update project; if manager changes, sends notification to new manager |
| PUT | `/projects/manager-response/:projectId` | Yes | `{ response: "Accept" \| "Decline" }` | Updated project | Accept or decline project manager invitation |

---

## Admin Projects — `/admin-projects`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/admin-projects/` | Yes | — | `[Project]` | All projects created by current user |
| GET | `/admin-projects/:projectId` | Yes | — | Project with team + first 5 tasks | Detailed project view |
| POST | `/admin-projects/get-searched-user` | Yes | `{ email, projectId }` | `{ userId, name, email, avatar }` | Search user by email, checks they're not already in team |
| POST | `/admin-projects/send-project-invitation` | Yes | `{ userId, projectId }` | `{ message }` | Send team invitation via notification |

---

## Manage Users — `/manageusers`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/manageusers/:projectId/get-all-users` | Yes | — | `[{ name, email, avatar }]` | All team members of a project |
| POST | `/manageusers/get-project-details` | Yes | `{ projectId }` | `{ project, createdBy }` | Project details with creator info |
| POST | `/manageusers/accept-invite` | Yes | `{ projectId }` | `{ message }` | Accept project invitation (adds to team + joinProject) |

---

## Joined Projects — `/joinedprojects`

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| GET | `/joinedprojects/` | Yes | `[{ _id, name, projectManager, theme, description, createdBy, taskCount, teamCount }]` | Projects user is a member of |
| GET | `/joinedprojects/as-manager` | Yes | Same structure | Projects user manages |
| GET | `/joinedprojects/:projectId` | Yes | `{ project: { ...project, team: [{ _id, name, email, avatar }] } }` | Project detail with populated team |

---

## Tasks (CRUD) — `/manageTasks`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/manageTasks/` | Yes | `{ title, description, dueDate, priority?, assignedTo?, projectId, sprintId?, parentId?, estimateHours?, labels? }` | Created task | Create task (uses taskService with activity log + webhook) |
| GET | `/manageTasks/project/:projectId` | Yes | — | `{ projectName, validTasks, projectTeam }` | All tasks in project with assignee info |
| GET | `/manageTasks/user/:userId` | Yes | — | AssignedTask doc with populated tasks | All tasks assigned to a user |
| PATCH | `/manageTasks/:taskId` | Yes | `{ title?, description?, dueDate?, status?, priority?, assignedTo? }` | `{ message }` | Edit task (handles reassignment, activity log) |
| DELETE | `/manageTasks/:taskId` | Yes | — | `{ message }` | Delete task (removes from project + user, logs activity) |

---

## User Project Tasks — `/projecttasks`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/projecttasks/:projectId` | Yes | — | `{ projectTasks, userTaskDetails }` | All project tasks + current user's assigned tasks within project |
| PATCH | `/projecttasks/tasks/update` | Yes | `{ updates: [{ id, status }] }` | `{ updatedTasks }` | Bulk update task statuses |
| PUT | `/projecttasks/update-task-progress/:taskId` | Yes | `{ progress?, status? }` | `{ updatedTask }` | Update task progress and/or status (logs activity) |

---

## Comments — `/comments`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/comments/tasks/:taskId/comments` | Yes | `{ content, userId? }` | `{ message, comment }` | Add comment to task (logs activity) |
| GET | `/comments/tasks/:taskId/comments` | Yes | — | `{ comments: [{ ...comment, user }] }` | All comments on a task with user details |
| PUT | `/comments/:commentId` | Yes | `{ content }` | `{ message, comment }` | Edit comment (logs activity) |
| DELETE | `/comments/:commentId` | Yes | — | `{ message }` | Delete comment, removes from task array (logs activity) |
| GET | `/comments/:id/name` | Yes | — | `{ name }` | Get user's name by ID |

---

## Project Tasks (public) — `/project-tasks`

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| GET | `/project-tasks/:projectId/tasks` | Yes | `{ project, tasks: [{ task, user }] }` | All tasks in project with assigned user details |
| GET | `/project-tasks/:id` | Yes | Task object | Single task details |

---

## Sprints — `/sprints`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/sprints/:projectId` | Yes | — | `[Sprint]` | All sprints for project (sorted by startDate desc) |
| POST | `/sprints/:projectId` | Yes | `{ name, goal?, startDate, endDate }` | Created sprint | Create sprint (deactivates any active sprint) |
| GET | `/sprints/sprint/:sprintId` | Yes | — | Sprint with populated tasks | Single sprint details |
| PUT | `/sprints/sprint/:sprintId` | Yes | `{ name?, goal?, startDate?, endDate? }` | Updated sprint | Update sprint |
| DELETE | `/sprints/sprint/:sprintId` | Yes | — | `{ message }` | Delete sprint, unlinks tasks |
| POST | `/sprints/sprint/:sprintId/activate` | Yes | — | Updated sprint | Set sprint active (deactivates others in project) |
| POST | `/sprints/sprint/:sprintId/complete` | Yes | — | Updated sprint | Mark sprint completed |
| POST | `/sprints/sprint/:sprintId/add-tasks` | Yes | `{ taskIds: [] }` | Updated sprint | Add tasks to sprint |
| POST | `/sprints/sprint/:sprintId/remove-tasks` | Yes | `{ taskIds: [] }` | Updated sprint | Remove tasks from sprint |

---

## Activity — `/activity`

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| GET | `/activity/project/:projectId` | Yes | `[ActivityLog]` | Last 50 activity entries for a project |
| GET | `/activity/task/:taskId` | Yes | `[ActivityLog]` | Activity entries for a specific task |
| GET | `/activity/user` | Yes | `[ActivityLog]` | Last 30 activity entries by current user |

---

## Time Tracking — `/time`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/time/entries` | Yes | `{ taskId, hours, description?, date? }` | Created entry | Log time (updates task.loggedHours) |
| GET | `/time/entries/task/:taskId` | Yes | — | `[TimeEntry]` | All time entries for a task |
| GET | `/time/entries/user` | Yes | — | `[TimeEntry]` | Current user's time entries |
| GET | `/time/report/project/:projectId` | Yes | — | `{ tasks, entries, totalHours, entryCount }` | Time report aggregated by project |
| GET | `/time/report/sprint/:sprintId` | Yes | — | `{ tasks, entries, totalHours, entryCount }` | Time report aggregated by sprint |
| PUT | `/time/entries/:entryId` | Yes | `{ hours?, description?, date? }` | Updated entry | Edit time entry (owner only) |
| DELETE | `/time/entries/:entryId` | Yes | — | `{ message }` | Delete time entry (owner only) |

---

## Task Links — `/task-links`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/task-links` | Yes | `{ sourceTaskId, targetTaskId, linkType, projectId }` | Created link | Create task dependency (prevents duplicate) |
| GET | `/task-links/task/:taskId` | Yes | — | `[TaskLink]` | All links involving a task |
| DELETE | `/task-links/:linkId` | Yes | — | `{ message }` | Remove link |

---

## Filters — `/filters`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/filters/project/:projectId` | Yes | — | `[SavedFilter]` | Saved filters for project (scoped to user) |
| POST | `/filters` | Yes | `{ name, projectId, query, isDefault? }` | Created filter | Save a filter |
| PUT | `/filters/:filterId` | Yes | `{ name?, query?, isDefault? }` | Updated filter | Update filter (owner only) |
| DELETE | `/filters/:filterId` | Yes | — | `{ message }` | Delete filter (owner only) |

---

## Boards — `/boards`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/boards/project/:projectId` | Yes | — | `[BoardConfig]` | Board configs for project |
| POST | `/boards` | Yes | `{ name?, projectId, columns, swimlane?, filters? }` | Created board | Create board config |
| PUT | `/boards/:boardId` | Yes | `{ name?, columns?, swimlane?, filters? }` | Updated board | Update board config |
| DELETE | `/boards/:boardId` | Yes | — | `{ message }` | Delete board config |

---

## Labels — `/labels`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/labels/project/:projectId` | Yes | — | `[Label]` | All labels for project |
| POST | `/labels` | Yes | `{ name, color?, projectId }` | Created label | Create label |
| PUT | `/labels/:labelId` | Yes | `{ name?, color? }` | Updated label | Update label |
| DELETE | `/labels/:labelId` | Yes | — | `{ message }` | Delete label (removes from all tasks) |

---

## Webhooks — `/webhooks`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| GET | `/webhooks/project/:projectId` | Yes | — | `[Webhook]` | List webhooks for project |
| POST | `/webhooks` | Yes | `{ name?, url, projectId, events, secret? }` | Created webhook | Create webhook |
| PUT | `/webhooks/:webhookId` | Yes | `{ name?, url?, events?, secret?, isActive? }` | Updated webhook | Update webhook |
| DELETE | `/webhooks/:webhookId` | Yes | — | `{ message }` | Delete webhook |
| POST | `/webhooks/:webhookId/test` | Yes | — | `{ status, statusCode }` | Test webhook by sending test payload |

---

## Organizations — `/organizations`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/organizations` | Yes | `{ name, description? }` | Created org | Create organization (user becomes owner) |
| GET | `/organizations` | Yes | — | `[Organization]` | List user's organizations |
| GET | `/organizations/:orgId` | Yes | — | Org with populated members + projects | Organization details |
| PUT | `/organizations/:orgId` | Yes | `{ name?, description? }` | Updated org | Update org (owner only) |
| DELETE | `/organizations/:orgId` | Yes | — | `{ message }` | Delete org (owner only), unlinks projects |
| POST | `/organizations/:orgId/members` | Yes | `{ userId, role? }` | Updated org | Add member to org |
| PUT | `/organizations/:orgId/members/:userId` | Yes | `{ role }` | Updated org | Change member role |
| DELETE | `/organizations/:orgId/members/:userId` | Yes | — | Updated org | Remove member from org |

---

## Invitations — `/invitations`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/invitations` | Yes | `{ email, projectId?, organizationId?, role? }` | Created invitation | Send invitation |
| GET | `/invitations/pending` | Yes | — | `[Invitation]` | Pending invitations for current user (matched by email) |
| POST | `/invitations/:token/accept` | Yes | — | `{ message }` | Accept invitation (adds to project team) |
| POST | `/invitations/:token/decline` | Yes | — | `{ message }` | Decline invitation |
| GET | `/invitations/project/:projectId` | Yes | — | `[Invitation]` | All invitations sent for a project |

---

## Uploads — `/uploads`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/uploads/task/:taskId` | Yes | `files` (multipart, max 10 files, 10MB each) | `{ files, task }` | Upload files to task (jpg, png, gif, pdf, doc, xlsx, zip, csv, txt) |
| POST | `/uploads/comment/:commentId` | Yes | `files` (multipart) | `{ files }` | Upload files to comment |
| GET | `/uploads/task/:taskId` | Yes | — | `[{ name, path, size, mimetype }]` | List files attached to a task |
| DELETE | `/uploads/:fileId` | Yes | — | `{ message }` | Delete file from task |

---

## AI — `/ai`

| Method | Endpoint | Auth | Body | Response | Description |
|--------|----------|------|------|----------|-------------|
| POST | `/ai/create-task` | Yes | `{ prompt, projectId }` | `{ task, aiExtracted }` | Natural language → create task |
| POST | `/ai/breakdown-task` | Yes | `{ taskDescription }` | `{ subtasks: [{ title, description, estimateHours }] }` | Generate subtask breakdown |
| POST | `/ai/suggest-assignee` | Yes | `{ projectId, taskDescription }` | `{ suggestedEmail, suggestedUser }` | Suggest best team member for task |
| POST | `/ai/recommend-metadata` | Yes | `{ title, description? }` | `{ priority, status, suggestedDueDate }` | Recommend priority, status, due date |
| GET | `/ai/project-summary/:projectId` | Yes | — | `{ summary, stats }` | AI-generated project status summary |
| POST | `/ai/search-tasks` | Yes | `{ query, projectId? }` | `{ tasks }` | Semantic task search via LLM |
| POST | `/ai/summarize-comments` | Yes | `{ taskId }` | `{ summary, commentCount }` | Summarize task discussion thread |
| POST | `/ai/generate-acceptance-criteria` | Yes | `{ title, description? }` | `{ criteria: [string] }` | Generate 3-5 acceptance criteria |
| POST | `/ai/detect-risks` | Yes | `{ projectId }` | `{ risks: [{ severity, description, suggestion }], stats }` | Scan project for overdue/stalled/unassigned risks |
| POST | `/ai/retrospective` | Yes | `{ sprintId }` | `{ whatWentWell, whatCouldImprove, actionItems, stats }` | Sprint retrospective analysis |

---

## Email Templates

Emails are generated by `getEmailContent(code, purpose)` in `utils/email.js` with purpose-specific content:

### Purpose-Specific UX

| Purpose | Heading | Body | Security Note |
|---------|---------|------|---------------|
| `registration` | Welcome to Collabora8r! | Explains account activation, asks user to enter code | "Someone may have entered your email by mistake" |
| `login` | Sign In to Collabora8r | Confirms sign-in request, asks user to enter code to continue | "Your account may be at risk — reset password or contact support" |
| `password-reset` | Reset Your Collabora8r Password | Confirms reset request, asks user to enter code to create new password | "Your account may be compromised — contact support immediately" |

### Design

- **Header:** Orange gradient banner (`#f97316` → `#ea580c`) with white "Collabora8r" + "Project Management Suite" tagline
- **Body:** White card on warm orange border (`#fed7aa`) with dark orange typography (`#431407`, `#c2410c`, `#9a3412`)
- **Code box:** Large centered code on light orange background (`#fff7ed`), orange border (`#fdba74`)
- **Expiry alert:** Highlighted info box: "⏱ This code expires in 5 minutes. For your security, do not share this code."
- **Footer:** Branded separator with team signature + "Collabora8r — Project Management Suite"
- **Responsive:** max-width 520px, inline styles work on mobile & desktop clients
- **Console fallback:** Every code is logged to server console before sending:
  ```
  [Verification] Code for user@example.com (registration): 482915
  ```

---

## Socket.IO Events

### Connection
- Client connects with `auth: { userId }` in handshake
- Server maps `userId → socketId` in `connectedUsers` Map
- Server emits `"online-count"` to all clients when count changes

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join-project` | `projectId` (string) | Subscribe to `project:<projectId>` room for real-time updates |
| `leave-project` | `projectId` (string) | Unsubscribe from project room |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `notification` | `{ type, data, read, createdAt }` | In-app notification (sent to specific user via `sendMessageToUser`) |
| `invitation` | invitation object | Project/organization invitation (via `sendInvitationEvent`) |
| `online-count` | `{ count: Number }` | Broadcast when any user connects/disconnects |
| (any custom) | — | Emitted via `sendToProjectRoom(projectId, event, data)` to all members in a project room |

### Server Socket API
| Function | Arguments | Description |
|----------|-----------|-------------|
| `sendMessageToUser(userId, message)` | `(string, object)` | Emits `"notification"` event to a specific online user |
| `sendToProjectRoom(projectId, event, data)` | `(string, string, object)` | Broadcasts any event to all sockets in `project:<projectId>` room |
| `sendInvitationEvent(userId, invitation)` | `(string, object)` | Emits `"invitation"` event to a specific user |
| `getOnlineUsers()` | — | Returns array of online user IDs |
| `isUserOnline(userId)` | `(string)` | Returns boolean |
