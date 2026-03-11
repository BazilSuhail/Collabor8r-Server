# Collabora8r — Client App Guide

## Project Structure

```
src/
  api/              # Axios service files (one per resource)
  stores/           # Zustand stores
  components/       # Shared UI components
  pages/            # Page components (one per route)
  hooks/            # Custom hooks (useSocket, useAuth, etc.)
  utils/            # Helpers, constants, types
  App.jsx           # Router setup
  main.jsx          # Entry point
```

---

## Pages & Routes

### Auth (no auth required)

#### `/signin` — Sign In

| Element | Description |
|---------|-------------|
| UI | Email input + either password field OR code input. Toggle between password and code mode. "Send Code" button triggers code email. |
| APIs | `POST /auth/signin` — email + password |
| | `POST /auth/send-code` — email, purpose: "login" |
| | `POST /auth/signin-code` — email + code |
| | `POST /auth/check-email` — (optional) to pre-check before sending code |

#### `/signup` — Sign Up

| Element | Description |
|---------|-------------|
| UI | Registration form: name, email, gender, phone, DOB. Optional password OR code flow. If code flow, first send code then verify. |
| APIs | `POST /auth/signup` — name, gender, phone, email, dob, password |
| | `POST /auth/send-code` — email, purpose: "registration" |
| | `POST /auth/signup-code` — email, code, name, gender, phone, dob |

#### `/forgot-password` — Forgot Password

| Element | Description |
|---------|-------------|
| UI | Email input → shows success → links to reset. |
| APIs | `POST /auth/forgot-password` — email |

#### `/reset-password` — Reset Password

| Element | Description |
|---------|-------------|
| UI | Email, 6-digit code input, new password, confirm password. |
| APIs | `POST /auth/reset-password` — email, code, newPassword |

---

### Main App (auth required — redirect to /signin if no token)

#### `/` — Dashboard / Overview

| Element | Description |
|---------|-------------|
| UI | Stats cards (admin projects count, joined projects count, manager projects count). List of tasks assigned to current user with project name. Progress bar / pie chart for task status distribution. |
| APIs | `GET /overview/progress-overview` |
| | `GET /overview/assigned-tasks` |

#### `/projects` — Projects List

| Element | Description |
|---------|-------------|
| UI | Three tabbed sections: **My Projects** (admin), **Joined Projects** (member), **Managing** (manager). Each shows project cards with name, theme color, description, task count, team count. "Create Project" button. |
| APIs | `GET /admin-projects/` |
| | `GET /joinedprojects/` |
| | `GET /joinedprojects/as-manager` |
| | `POST /projects/create` |

---

### Project Pages

#### `/projects/:projectId` — Project Home / Backlog

| Element | Description |
|---------|-------------|
| UI | Project header (name, theme color, description). Task list grouped by status (To Do, In Progress, Done). Quick filters (priority, assignee, labels). Create task button. Sprint selector dropdown. Activity feed sidebar. |
| APIs | `GET /manageTasks/project/:projectId` |
| | `GET /admin-projects/:projectId` (admin view with team) |
| | `GET /joinedprojects/:projectId` (member view with team) |
| | `GET /sprints/:projectId` |
| | `GET /activity/project/:projectId` |
| | `GET /labels/project/:projectId` |
| | `POST /manageTasks/` |

#### `/projects/:projectId/board` — Kanban Board

| Element | Description |
|---------|-------------|
| UI | Drag-and-drop Kanban columns (configurable via BoardConfig). Each card shows title, priority badge, assignee avatar, labels. Swimlane support. Quick status update on drag (bulk update). |
| APIs | `GET /boards/project/:projectId` |
| | `GET /manageTasks/project/:projectId` |
| | `PATCH /projecttasks/tasks/update` — bulk status update |
| | `PUT /projecttasks/update-task-progress/:taskId` |

#### `/projects/:projectId/backlog` — Sprint Planning

| Element | Description |
|---------|-------------|
| UI | Left side: unsorted backlog tasks (no sprint). Right/top: sprint list with task counts. Create sprint modal. Drag tasks into/out of sprints. Sprint detail expand. |
| APIs | `GET /sprints/:projectId` |
| | `POST /sprints/:projectId` |
| | `GET /manageTasks/project/:projectId` |
| | `POST /sprints/sprint/:sprintId/add-tasks` |
| | `POST /sprints/sprint/:sprintId/remove-tasks` |
| | `POST /sprints/sprint/:sprintId/activate` |
| | `POST /sprints/sprint/:sprintId/complete` |

#### `/projects/:projectId/sprints/:sprintId` — Sprint Detail

| Element | Description |
|---------|-------------|
| UI | Sprint header (name, goal, dates, active/completed badge). Task list with progress bars. Sprint burndown (from time entries). Complete sprint button. |
| APIs | `GET /sprints/sprint/:sprintId` |
| | `GET /time/report/sprint/:sprintId` |
| | `POST /sprints/sprint/:sprintId/complete` |

#### `/projects/:projectId/team` — Team Management

| Element | Description |
|---------|-------------|
| UI | Team member list (name, email, avatar, role). Invite user via email search. Pending invitations list. Remove member option. |
| APIs | `GET /manageusers/:projectId/get-all-users` |
| | `POST /manageusers/get-project-details` |
| | `POST /admin-projects/get-searched-user` |
| | `POST /admin-projects/send-project-invitation` |
| | `POST /invitations` |
| | `GET /invitations/project/:projectId` |

#### `/projects/:projectId/settings` — Project Settings

| Element | Description |
|---------|-------------|
| UI | Edit project name, description, theme color. Change project manager (sends notification). Danger zone: delete project. |
| APIs | `PUT /projects/:projectId/update` |
| | `POST /projects/create` (if needed) |

#### `/projects/:projectId/activity` — Activity Log

| Element | Description |
|---------|-------------|
| UI | Timeline of all activity (task created, status changed, comment added, etc.). Filter by user or action type. |
| APIs | `GET /activity/project/:projectId` |

#### `/projects/:projectId/time` — Time Tracking

| Element | Description |
|---------|-------------|
| UI | Time entries list. Summary table (task → total hours). Project-level report with total hours and entry count. |
| APIs | `GET /time/report/project/:projectId` |
| | `GET /time/entries/task/:taskId` (for each task) |

#### `/projects/:projectId/labels` — Labels

| Element | Description |
|---------|-------------|
| UI | List of labels with name + color swatch. Create/edit/delete label. |
| APIs | `GET /labels/project/:projectId` |
| | `POST /labels` |
| | `PUT /labels/:labelId` |
| | `DELETE /labels/:labelId` |

#### `/projects/:projectId/webhooks` — Webhooks

| Element | Description |
|---------|-------------|
| UI | Webhook list. Add webhook form (URL, events checkboxes, optional secret). Test button. Toggle active/inactive. |
| APIs | `GET /webhooks/project/:projectId` |
| | `POST /webhooks` |
| | `PUT /webhooks/:webhookId` |
| | `DELETE /webhooks/:webhookId` |
| | `POST /webhooks/:webhookId/test` |

#### `/projects/:projectId/filters` — Saved Filters

| Element | Description |
|---------|-------------|
| UI | Saved filter list. Create filter form (name, query JSON, set as default). Apply filter to current task view. |
| APIs | `GET /filters/project/:projectId` |
| | `POST /filters` |
| | `PUT /filters/:filterId` |
| | `DELETE /filters/:filterId` |

---

### Task Pages

#### `/tasks/:taskId` — Task Detail (modal or full page)

| Element | Description |
|---------|-------------|
| UI | Full task details: title, description, status, priority, assignee, due date, sprint, parent task link, estimate/logged/remaining hours, labels, attachments. Comments thread. Activity feed for this task. Time entry log. Task links (blocks/blocked by/relates to). AI-suggested acceptance criteria and comment summary buttons. Subtask list (child tasks). |
| APIs | `GET /project-tasks/:id` |
| | `PATCH /manageTasks/:taskId` |
| | `POST /comments/tasks/:taskId/comments` |
| | `GET /comments/tasks/:taskId/comments` |
| | `PUT /comments/:commentId` |
| | `DELETE /comments/:commentId` |
| | `GET /activity/task/:taskId` |
| | `GET /time/entries/task/:taskId` |
| | `POST /time/entries` |
| | `GET /task-links/task/:taskId` |
| | `POST /task-links` |
| | `DELETE /task-links/:linkId` |
| | `GET /uploads/task/:taskId` |
| | `POST /uploads/task/:taskId` |
| | `DELETE /uploads/:fileId` |
| | `POST /ai/summarize-comments` |
| | `POST /ai/generate-acceptance-criteria` |

---

### User Pages

#### `/profile` — My Profile

| Element | Description |
|---------|-------------|
| UI | View/edit name, gender, phone, email, DOB, avatar. |
| APIs | `GET /profile/` |
| | `PUT /profile/` |

#### `/notifications` — Notifications

| Element | Description |
|---------|-------------|
| UI | Notification list with type icon, message, timestamp. Click to navigate. Mark as read (local + socket). |
| APIs | `GET /profile/get-notifications` |

---

### Organization Pages

#### `/organizations` — Organizations List

| Element | Description |
|---------|-------------|
| UI | List of orgs user belongs to. Create org button. |
| APIs | `GET /organizations` |
| | `POST /organizations` |

#### `/organizations/:orgId` — Organization Detail

| Element | Description |
|---------|-------------|
| UI | Org name, description. Member list with roles (owner/admin/member). Projects belonging to this org. Invite members. |
| APIs | `GET /organizations/:orgId` |
| | `PUT /organizations/:orgId` |
| | `POST /organizations/:orgId/members` |
| | `PUT /organizations/:orgId/members/:userId` |
| | `DELETE /organizations/:orgId/members/:userId` |

---

### Invitations

#### `/invitations` — Pending Invitations

| Element | Description |
|---------|-------------|
| UI | List of pending project/org invitations (matched by email). Accept / Decline buttons. |
| APIs | `GET /invitations/pending` |
| | `POST /invitations/:token/accept` |
| | `POST /invitations/:token/decline` |

---

### AI Features (embedded as modals/panels)

AI features are not separate pages — they appear as modals or side panels within relevant pages:

| Feature | Where it appears | API |
|---------|-----------------|-----|
| Natural language create task | Task creation modal (any project page) | `POST /ai/create-task` |
| Subtask breakdown | Task detail page | `POST /ai/breakdown-task` |
| Suggest assignee | Task creation/editing modal | `POST /ai/suggest-assignee` |
| Recommend metadata | Task creation modal (auto-fill priority, status, due date) | `POST /ai/recommend-metadata` |
| Project summary | Project home / settings header | `GET /ai/project-summary/:projectId` |
| Semantic search | Global search bar in navbar | `POST /ai/search-tasks` |
| Summarize comments | Task detail comment section | `POST /ai/summarize-comments` |
| Acceptance criteria | Task detail page (AI button) | `POST /ai/generate-acceptance-criteria` |
| Risk detection | Project home / dashboard | `POST /ai/detect-risks` |
| Sprint retrospective | Sprint detail page (after completion) | `POST /ai/retrospective` |

---

## Zustand Stores

### 1. `authStore`

```
State:
  user: User | null          // { _id, name, email, avatar, gender, phone, dob }
  token: string | null
  isAuthenticated: boolean

Actions:
  login(email, password)             → POST /auth/signin, stores token in localStorage
  loginWithCode(email, code)         → POST /auth/signin-code
  signup(data)                       → POST /auth/signup
  signupWithCode(email, code, data)  → POST /auth/signup-code
  sendCode(email, purpose)           → POST /auth/send-code
  logout()                           → clears token + user, disconnects socket
  loadUser()                         → GET /profile/ (if token exists in localStorage)
  updateProfile(data)                → PUT /profile/
  forgotPassword(email)              → POST /auth/forgot-password
  resetPassword(email, code, pwd)    → POST /auth/reset-password
```

### 2. `projectStore`

```
State:
  adminProjects: Project[]        // own projects
  joinedProjects: Project[]       // member projects
  managedProjects: Project[]      // manager projects
  currentProject: Project | null  // currently viewed project
  currentProjectTeam: User[]

Actions:
  fetchAdminProjects()           → GET /admin-projects/
  fetchJoinedProjects()          → GET /joinedprojects/
  fetchManagedProjects()         → GET /joinedprojects/as-manager
  fetchProjectDetail(id)         → GET /admin-projects/:id OR /joinedprojects/:id
  createProject(data)            → POST /projects/create
  updateProject(id, data)        → PUT /projects/:id/update
  respondManagerInvite(id, res)  → PUT /projects/manager-response/:id
  fetchProjectTeam(id)           → GET /manageusers/:id/get-all-users
  addToTeam(userId, projectId)   → POST /admin-projects/send-project-invitation
```

### 3. `taskStore`

```
State:
  tasks: Task[]                  // tasks for current view
  currentTask: Task | null       // currently viewed/edited task

Actions:
  fetchProjectTasks(projectId)   → GET /manageTasks/project/:projectId
  fetchUserTasks(userId)         → GET /manageTasks/user/:userId
  fetchAssignedTasks()           → GET /overview/assigned-tasks
  fetchTaskDetail(taskId)        → GET /project-tasks/:id
  createTask(data)               → POST /manageTasks/
  updateTask(taskId, data)       → PATCH /manageTasks/:taskId
  deleteTask(taskId)             → DELETE /manageTasks/:taskId
  bulkUpdateStatus(updates)      → PATCH /projecttasks/tasks/update
  updateTaskProgress(taskId, d)  → PUT /projecttasks/update-task-progress/:taskId
```

### 4. `sprintStore`

```
State:
  sprints: Sprint[]
  currentSprint: Sprint | null

Actions:
  fetchSprints(projectId)          → GET /sprints/:projectId
  fetchSprintDetail(sprintId)      → GET /sprints/sprint/:sprintId
  createSprint(projectId, data)    → POST /sprints/:projectId
  updateSprint(sprintId, data)     → PUT /sprints/sprint/:sprintId
  deleteSprint(sprintId)           → DELETE /sprints/sprint/:sprintId
  activateSprint(sprintId)         → POST /sprints/sprint/:sprintId/activate
  completeSprint(sprintId)         → POST /sprints/sprint/:sprintId/complete
  addTasksToSprint(sprintId, ids)  → POST /sprints/sprint/:sprintId/add-tasks
  removeTasksFromSprint(sId, ids)  → POST /sprints/sprint/:sprintId/remove-tasks
```

### 5. `notificationStore`

```
State:
  notifications: Notification[]
  unreadCount: number

Actions:
  fetchNotifications()          → GET /profile/get-notifications
  addNotification(notification) → called by socket listener on "notification" event
  markAsRead(id)                → local only (no API for mark-read yet)
  clearAll()                    → local only
```

### 6. `boardStore`

```
State:
  boardConfigs: BoardConfig[]
  activeBoardId: string | null

Actions:
  fetchBoardConfigs(projectId)  → GET /boards/project/:projectId
  createBoard(data)             → POST /boards
  updateBoard(boardId, data)    → PUT /boards/:boardId
  deleteBoard(boardId)          → DELETE /boards/:boardId
```

### 7. `labelStore`

```
State:
  labels: Label[]

Actions:
  fetchLabels(projectId)   → GET /labels/project/:projectId
  createLabel(data)        → POST /labels
  updateLabel(id, data)    → PUT /labels/:labelId
  deleteLabel(id)          → DELETE /labels/:labelId
```

### 8. `organizationStore`

```
State:
  organizations: Organization[]
  currentOrg: Organization | null

Actions:
  fetchOrganizations()              → GET /organizations
  fetchOrgDetail(orgId)             → GET /organizations/:orgId
  createOrganization(data)          → POST /organizations
  updateOrganization(orgId, data)   → PUT /organizations/:orgId
  deleteOrganization(orgId)         → DELETE /organizations/:orgId
  addOrgMember(orgId, userId, role) → POST /organizations/:orgId/members
  updateOrgMember(orgId, uid, r)    → PUT /organizations/:orgId/members/:userId
  removeOrgMember(orgId, userId)    → DELETE /organizations/:orgId/members/:userId
```

### 9. `uiStore`

```
State:
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  globalSearchQuery: string
  aiLoading: boolean                 // true when any AI call is in progress

Actions:
  toggleSidebar()
  setTheme(theme)
  setGlobalSearchQuery(query)
  setAiLoading(loading)
```

### 10. `socketStore`

```
State:
  socket: Socket | null
  isConnected: boolean

Actions:
  connect(token)               → creates socket with { auth: { userId } }
  disconnect()                 → disconnects socket
  joinProject(projectId)       → emit "join-project"
  leaveProject(projectId)      → emit "leave-project"
  onNotification(callback)     → listen for "notification" event
```

---

## API Service Layer (`src/api/`)

One file per resource. All use a shared Axios instance that injects the token header.

### `src/api/client.js` — Shared Axios Instance

```javascript
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/signin';
    }
    return Promise.reject(err);
  }
);

export default api;
```

### Service Files

| File | Exports | Uses Routes |
|------|---------|-------------|
| `api/auth.js` | `signup, signin, checkEmail, forgotPassword, resetPassword, sendCode, signupCode, signinCode` | `/auth/*` |
| `api/profile.js` | `getProfile, updateProfile, getNotifications` | `/profile/*` |
| `api/dashboard.js` | `getAssignedTasks, getProgressOverview` | `/overview/*` |
| `api/projects.js` | `createProject, updateProject, managerResponse` | `/projects/*` |
| `api/adminProjects.js` | `getAdminProjects, getAdminProjectDetail, searchUser, sendInvitation` | `/admin-projects/*` |
| `api/joinedProjects.js` | `getJoinedProjects, getManagedProjects, getJoinedProjectDetail` | `/joinedprojects/*` |
| `api/tasks.js` | `createTask, getProjectTasks, getUserTasks, updateTask, deleteTask` | `/manageTasks/*` |
| `api/projectTasks.js` | `getProjectTasksWithUser, getTaskDetail, bulkUpdateStatus, updateTaskProgress` | `/project-tasks/*`, `/projecttasks/*` |
| `api/comments.js` | `addComment, getComments, updateComment, deleteComment, getUserName` | `/comments/*` |
| `api/sprints.js` | `getSprints, createSprint, getSprintDetail, updateSprint, deleteSprint, activateSprint, completeSprint, addTasks, removeTasks` | `/sprints/*` |
| `api/activity.js` | `getProjectActivity, getTaskActivity, getUserActivity` | `/activity/*` |
| `api/time.js` | `logTime, getTaskTimeEntries, getUserTimeEntries, getProjectTimeReport, getSprintTimeReport, updateTimeEntry, deleteTimeEntry` | `/time/*` |
| `api/taskLinks.js` | `createLink, getTaskLinks, deleteLink` | `/task-links/*` |
| `api/filters.js` | `getProjectFilters, createFilter, updateFilter, deleteFilter` | `/filters/*` |
| `api/boards.js` | `getProjectBoards, createBoard, updateBoard, deleteBoard` | `/boards/*` |
| `api/labels.js` | `getProjectLabels, createLabel, updateLabel, deleteLabel` | `/labels/*` |
| `api/webhooks.js` | `getProjectWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook` | `/webhooks/*` |
| `api/organizations.js` | `getOrganizations, getOrgDetail, createOrg, updateOrg, deleteOrg, addMember, updateMember, removeMember` | `/organizations/*` |
| `api/invitations.js` | `sendInvitation, getPendingInvitations, acceptInvitation, declineInvitation, getProjectInvitations` | `/invitations/*` |
| `api/uploads.js` | `uploadTaskFiles, uploadCommentFiles, getTaskFiles, deleteFile` | `/uploads/*` |
| `api/ai.js` | `createTaskWithAI, breakdownTask, suggestAssignee, recommendMetadata, getProjectSummary, searchTasks, summarizeComments, generateAcceptanceCriteria, detectRisks, retrospective` | `/ai/*` |

---

## Socket Events

### Connecting

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { userId: user._id }
});
```

### Emit (Client → Server)

| Event | Payload | When to emit |
|-------|---------|-------------|
| `join-project` | `projectId` (string) | On mount of any project page |
| `leave-project` | `projectId` (string) | On unmount / navigation away from project page |

### Listen (Server → Client)

| Event | Payload | Handler |
|-------|---------|---------|
| `notification` | `{ type, data, read, createdAt }` | Push to `notificationStore`, increment `unreadCount` |

You can also listen for custom events emitted by the backend's `sendToProjectRoom(projectId, event, data)`. For example, if the backend emits `"task-updated"` to a project room:

```javascript
socket.on('task-updated', (data) => {
  // refresh task store
});
```

---

## State Flow Diagram

```
User opens app
    ↓
authStore.loadUser() — checks localStorage for token
    ↓
if token exists → GET /profile/ → set user
if no token    → redirect to /signin
    ↓
socketStore.connect(user._id)
    ↓
User navigates to project
    ↓
socketStore.joinProject(projectId)
projectStore.fetchProjectDetail(id)
taskStore.fetchProjectTasks(id)
sprintStore.fetchSprints(id)
boardStore.fetchBoardConfigs(id)
labelStore.fetchLabels(id)
    ↓
Real-time updates arrive via socket "notification"
    → notificationStore.addNotification()
```

---

## Response Shapes (Reference)

### Project (typical response)
```json
{
  "_id": "...",
  "name": "Sprint 1",
  "description": "...",
  "theme": "#ff6b6b",
  "projectManager": { "_id": "...", "name": "Alice", "email": "a@b.com" },
  "createdBy": { "_id": "...", "name": "You" },
  "organizationId": "...",
  "team": [{ "_id": "...", "name": "...", "email": "...", "avatar": "..." }],
  "taskCount": 12,
  "teamCount": 4
}
```

### Task (typical response)
```json
{
  "_id": "...",
  "title": "Fix login bug",
  "description": "...",
  "status": "In Progress",
  "priority": "High",
  "dueDate": "2026-07-15T00:00:00.000Z",
  "assignedTo": { "_id": "...", "name": "Bob" },
  "projectId": "...",
  "sprintId": "...",
  "parentId": "...",
  "estimateHours": 8,
  "loggedHours": 3,
  "remainingHours": 5,
  "resolution": null,
  "labels": ["bug", "frontend"],
  "attachments": [{ "name": "screenshot.png", "path": "/uploads/...", "size": 12345, "mimetype": "image/png" }]
}
```

### Notification (socket payload)
```json
{
  "type": "task_assigned",
  "data": { "taskId": "...", "taskTitle": "Fix login bug", "projectId": "..." },
  "read": false,
  "createdAt": "2026-07-01T12:00:00.000Z"
}
```
