# Collabora8r — Front-end Pages & API Usage

Page map for the client app. Every page lists the exact REST endpoints it calls.
Base URL: `http://localhost:3001` (or your `PORT`).

Auth: send `Authorization: Bearer <token>` on all endpoints except `/health`, `/auth/*`, and `POST /git/webhook`.

---

## Sidebar (3 role pages + rest)

```
Sidebar
├── 📊 Overview        → /
├── 👔 Manager         → /manager
├── 🛡️ Admin           → /admin
├── 🤝 Joined          → /joined
├── 📁 Projects        → /projects
├── ☑️ My Tasks         → /tasks/assigned
├── ⏱️ Time            → /time
├── 📣 Notifications   → /notifications   (badge)
├── 🕒 Activity        → /activity
└── ⚙️ Profile         → /profile
```

---

## 1. Role pages (sidebar — 3)

### `/manager` — Manager dashboard
Leads / owns projects. Workflow, WIP, reports, AI planning.

| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects?role=manager&include=stats` | Projects you lead (not ones you created) + stats |
| GET | `/projects/:projectId/workflow` | Statuses, rules, WIP, live counts |
| PUT | `/projects/:projectId/workflow` | Edit transitions (lead/creator only) |
| PUT | `/projects/:projectId/wip-limits` | Edit WIP limits (lead/creator only) |
| GET | `/projects/:projectId/members?q=` | Team list / user search |
| GET | `/tasks?projectId=&status=` | Task board data |
| PATCH | `/tasks/bulk-status` | Batch status moves |
| GET | `/reports/:projectId/health` | Health score |
| GET | `/reports/:projectId/velocity` | Sprint velocity |
| GET | `/reports/:projectId/budget` | Hours / cost |
| POST | `/projects/:projectId/ai/roadmap` | AI roadmap |
| POST | `/projects/:projectId/ai/risks` | AI risk scan |

### `/admin` — Admin dashboard
Creator of projects. Invitations, members, activity, project settings.

| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects?role=admin&include=stats` | Projects you created + stats |
| POST | `/projects` | Create project |
| PUT | `/projects/:projectId` | Update project |
| GET | `/projects/:projectId` | Project details |
| POST | `/projects/:projectId/invitations` | Send invite |
| GET | `/projects/:projectId/invitations` | Project invite list |
| GET | `/invitations/pending` | Your pending invites |
| POST | `/invitations/:token/accept` | Accept invite |
| POST | `/invitations/:token/decline` | Decline invite |
| GET | `/projects/:projectId/members` | Members |
| GET | `/activity?projectId=` | Project activity feed |
| GET | `/reports/:projectId/health` | Health |

### `/joined` — Joined projects
Projects you are a member of. Your tasks, chat, time.

| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects?role=joined` | Joined only (not lead, not creator) |
| GET | `/projects/:projectId` | Project details |
| GET | `/tasks?projectId=&assignedTo=` | Project tasks |
| GET | `/tasks/assigned` | My assigned tasks |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:taskId/status` | Update status/progress |
| GET | `/chat/:projectId/messages` | Project chat |
| POST | `/chat/:projectId/messages` | Send message |
| GET | `/time/entries?userId=` | My time entries |
| GET | `/activity?projectId=` | Activity |
| POST | `/projects/:projectId/join` | Accept direct join |

---

## 2. Auth pages

### `/signup`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/auth/check-email` | Availability |
| POST | `/auth/send-code` | Send code (`purpose: "registration"`) |
| POST | `/auth/signup` | Register with password |
| POST | `/auth/signup-code` | Register with code |

### `/login`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/auth/signin` | Password login |
| POST | `/auth/send-code` | Send code (`purpose: "login"`) |
| POST | `/auth/signin-code` | Code login |

### `/forgot-password`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/auth/send-code` | Send code (`purpose: "password-reset"`) |
| POST | `/auth/reset-password` | Set new password |

### `/profile`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/profile` | Load profile |
| PUT | `/profile` | Update name/gender/phone/email/dob/avatar |

---

## 3. Project pages

### `/projects`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects?role=&include=stats` | List (`admin`/`manager`/`joined` or omit = all) |

### `/projects/new`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/projects` | Create |
| POST | `/projects/:projectId/ai/assist` | AI draft from prompt |

### `/projects/:projectId`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects/:projectId` | Details + online members |
| GET | `/projects/:projectId/summary` | AI summary |
| GET | `/projects/:projectId/workflow` | Workflow config |

### `/projects/:projectId/settings`
| Method | API | Purpose |
|--------|-----|---------|
| PUT | `/projects/:projectId` | Update fields |
| PUT | `/projects/:projectId/workflow` | Workflow rules |
| PUT | `/projects/:projectId/wip-limits` | WIP limits |
| POST | `/projects/:projectId/ai/assist` | AI re-draft |

### `/projects/:projectId/members`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/projects/:projectId/members` | List |
| GET | `/projects/:projectId/members?q=email` | Search user |
| POST | `/projects/:projectId/invitations` | Invite |
| GET | `/projects/:projectId/invitations` | Invite list |
| POST | `/projects/:projectId/join` | Direct join |

### `/projects/:projectId/reports`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/reports/:projectId/budget` | Budget |
| GET | `/reports/:projectId/burndown?sprintId=` | Burndown |
| GET | `/reports/:projectId/velocity?sprintCount=` | Velocity |
| GET | `/reports/:projectId/health` | Health |

### `/projects/:projectId/ai`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/projects/:projectId/ai/assist` | Project draft |
| POST | `/projects/:projectId/ai/roadmap` | Roadmap |
| POST | `/projects/:projectId/ai/risks` | Risks |
| POST | `/projects/:projectId/ai/suggest-tasks` | Suggest tasks |

---

## 4. Task pages

### `/projects/:projectId/tasks`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks?projectId=&status=&priority=&page=&limit=&include=assignees,names` | Filtered list |
| GET | `/tasks/blocked?projectId=` | Blocked tasks |

### `/projects/:projectId/tasks/new`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/tasks` | Create (optional `ai: true`) |
| POST | `/tasks/ai/draft` | AI draft |
| POST | `/tasks/ai/create` | NL create |
| POST | `/tasks/ai/recommend-metadata` | Suggest priority/status/due |
| POST | `/tasks/ai/acceptance-criteria` | Suggest criteria |

### `/projects/:projectId/tasks/bulk`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/projects/:projectId/ai/suggest-tasks` | AI suggestions |
| POST | `/tasks/bulk` | Create many |

### `/tasks/:taskId`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/:taskId` | Load task |
| PATCH | `/tasks/:taskId` | Edit |
| PUT | `/tasks/:taskId/status` | Status + progress |
| DELETE | `/tasks/:taskId` | Delete |
| GET | `/tasks/:taskId/subtasks` | Subtasks |
| GET | `/tasks/:taskId/parent` | Parent |
| GET | `/tasks/:taskId/links` | Links |

### `/tasks/:taskId/edit`
| Method | API | Purpose |
|--------|-----|---------|
| PATCH | `/tasks/:taskId` | Save |
| POST | `/tasks/ai/breakdown` | Break into subtasks |
| POST | `/tasks/ai/suggest-assignee` | Suggest assignee |
| POST | `/tasks/links` | Create dependency link |

### `/tasks/:taskId/comments`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/:taskId/comments` | List |
| POST | `/tasks/:taskId/comments` | Add |
| PUT | `/tasks/comments/:commentId` | Edit |
| DELETE | `/tasks/comments/:commentId` | Delete |
| GET | `/tasks/:taskId/comments/summary` | AI summary |

### `/tasks/:taskId/attachments`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/:taskId/attachments` | List files |
| POST | `/tasks/:taskId/attachments` | Upload (`multipart`, field `files[]`) |
| DELETE | `/tasks/attachments/:fileId` | Delete file |

### `/projects/:projectId/board`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/boards?projectId=` | Board configs |
| POST | `/tasks/boards` | Create board |
| PUT | `/tasks/boards/:boardId` | Update board |
| DELETE | `/tasks/boards/:boardId` | Delete board |
| GET | `/tasks?projectId=` | Cards |
| PATCH | `/tasks/bulk-status` | Drag-drop column move |
| PUT | `/tasks/:taskId/status` | Single move |

### `/projects/:projectId/filters`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/filters?projectId=` | Saved filters |
| POST | `/tasks/filters` | Save |
| PUT | `/tasks/filters/:filterId` | Update |
| DELETE | `/tasks/filters/:filterId` | Delete |

### `/projects/:projectId/labels`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/labels?projectId=` | Labels |
| POST | `/tasks/labels` | Create |
| PUT | `/tasks/labels/:labelId` | Update |
| DELETE | `/tasks/labels/:labelId` | Delete |

### `/tasks/assigned` (sidebar My Tasks)
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/assigned?projectId=&include=names` | My tasks |

### `/tasks/blocked`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/tasks/blocked?projectId=` | Blocked tasks |

### `/tasks/links`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/tasks/links` | Create link |
| DELETE | `/tasks/links/:linkId` | Remove link |

---

## 5. Sprint pages

### `/projects/:projectId/sprints`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/sprints?projectId=` | List |
| POST | `/sprints` | Create |

### `/projects/:projectId/sprints/new`
| Method | API | Purpose |
|--------|-----|---------|
| POST | `/sprints` | Manual create |
| POST | `/sprints/ai/create` | AI create from prompt |

### `/sprints/:sprintId`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/sprints/:sprintId` | Sprint + tasks |
| PUT | `/sprints/:sprintId` | Edit |
| DELETE | `/sprints/:sprintId` | Delete |
| POST | `/sprints/:sprintId/activate` | Activate |
| POST | `/sprints/:sprintId/complete` | Complete |
| POST | `/sprints/:sprintId/tasks/add` | Add tasks |
| POST | `/sprints/:sprintId/tasks/remove` | Remove tasks |

### `/sprints/:sprintId/retrospective`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/sprints/:sprintId/retrospective` | AI retrospective |

---

## 6. Dashboard / personal

### `/` (Overview)
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/overview?include=assigned,progress` | Dashboard payload |
| GET | `/tasks/assigned` | My tasks |
| GET | `/notifications/unread-count` | Badge |

### `/notifications` (sidebar)
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/notifications` | List |
| PUT | `/notifications/read` | Mark read |
| GET | `/notifications/unread-count` | Unread count |

### `/activity` (sidebar)
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/activity?projectId=&taskId=&limit=` | Feed (defaults to self) |

### `/time` (sidebar)
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/time/entries?userId=\|taskId=` | Entries |
| POST | `/time/entries` | Log time |
| PUT | `/time/entries/:entryId` | Edit |
| DELETE | `/time/entries/:entryId` | Delete |

### `/time/report`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/time/report?projectId=\|sprintId=` | Time report |

---

## 7. Chat / Git

### `/projects/:projectId/chat`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/chat/:projectId/messages?before=&limit=` | History (paginated) |
| POST | `/chat/:projectId/messages` | Send |

Also uses Socket.IO (`ws://localhost:3001`) for real-time messages and presence.

### `/projects/:projectId/git`
| Method | API | Purpose |
|--------|-----|---------|
| GET | `/git/commits?projectId=&page=&branch=` | Commit list |
| POST | `/git/commits` | Link commit to task |
| DELETE | `/git/commits/:commitId` | Unlink |

---

## Page count summary

| Category | Pages |
|----------|------:|
| Sidebar role pages (Manager / Admin / Joined) | 3 |
| Auth | 4 (`/login`, `/signup`, `/forgot-password`, `/profile`) |
| Projects | 6 |
| Tasks | 9 |
| Sprints | 4 |
| Dashboard / personal | 5 |
| Chat / Git | 2 |
| **Total** | **~33** |

All 104 API endpoints are reachable from these pages.
