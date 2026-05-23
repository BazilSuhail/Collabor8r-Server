# Collabora8r — Socket.IO Guide (Frontend)

Server: `ws://localhost:3001` (same origin/port as the REST API — `PORT` env, default `3001`).  
CORS origins: `CORS_ORIGIN` env (comma-separated); default `*`.  
Companion docs: [API.md](./API.md) (REST), [STORES.md](./STORES.md) (stores + toast rules), [PAGES.md](./PAGES.md).

---

## 1. Connecting

Auth is a **handshake** — pass the JWT from sign-in as `auth.token`. No query-string tokens, no separate login event.

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: localStorage.getItem('token') }, // same JWT as REST Bearer header
  autoConnect: true,
});
```

| Failure | Behavior |
|---------|----------|
| No `auth.token` | Server logs a warning and **disconnects immediately** (reason: `io server disconnect`) |
| Invalid/expired JWT | Same — immediate disconnect |
| Valid token | Connection kept; server records `userId` from `decoded.id` |

- Token TTL is **24 h** (same as REST). On 401 from REST → refresh token → `socket.auth.token = newToken; socket.connect()`.
- Socket.IO **does not auto-reconnect after a server-forced disconnect** (auth failure). After a normal network drop it reconnects automatically — but see [§3 Rooms & reconnect](#3--rooms-joinleave--reconnect) because **room membership is lost on every reconnect**.

---

## 2. Event model — three scopes

Every server event arrives on one of three scopes. Knowing which scope an event is on tells you whether you must do anything to receive it.

| Scope | How you receive it | Events |
|-------|--------------------|--------|
| **Global** | Automatic, always | `online-count` |
| **Direct** (your socket only) | Automatic — server looks up your `userId` | `notification`, `invitation`, `join:error`, `chat:error` |
| **Room** (`project:<id>`) | **Only after you emit `join-project` for that id** | everything else: `chat:message`, `task:*`, `comment:*`, `sprint:*`, `project:*`, `member:*`, `commit:*` |

> **You get no room events for a project you haven't joined.** Joining is done per active project from the route (see `socketStore.joinProject(id)` in STORES.md) — not for every project you belong to.

Client → server you only ever emit **three** events (everything else is REST):

```ts
socket.emit('join-project', projectId);   // join room
socket.emit('leave-project', projectId);  // leave room
socket.emit('chat:message', { projectId, content, type }); // send chat (server persists)
```

No event uses Socket.IO **acks/callbacks** — all emits are fire-and-forget. For confirmation of your own mutations, use the REST response; room events are echoes for *other* clients (and a dedupe check for you).

---

## 3 · Rooms: join/leave + reconnect

```ts
// On entering a project route:
socket.emit('join-project', projectId);
// On leaving (route change to another project / logout):
socket.emit('leave-project', projectId);
```

**`join-project`** (`projectId: string`)

- Server verifies you are in the project's `Membership` buckets (`admin` / `asLead` / `joined`) **before** joining the room — pending invitations are rejected (`join:error`), so room access always equals your sidebar lists.
- ✅ Success: you're in the room; everyone else in the room gets `member:online`.
- ❌ Not a member → you get `join:error { error: "Not a member of this project" }` (you are **not** in the room).
- ❌ Project lookup failed → `join:error { error: "Failed to join project" }`.

**`leave-project`** (`projectId: string`) — leaves silently; room gets `member:offline`. No error path.

**Reconnect rule (important):** rooms are a property of the *socket*, not the user. After any reconnect:

```ts
socket.on('connect', () => {
  if (activeProjectId) socket.emit('join-project', activeProjectId); // re-join!
});
```

**Multi-tab caveat:** the server keeps one `userId → socket.id` entry (last connection wins), so **direct events (`notification`, `invitation`) are delivered to only one tab** — the most recently connected. Sync other tabs via `BroadcastChannel`/storage events if you support multi-tab.

---

## 4 · Client → Server

### `join-project`
| | |
|---|---|
| **Payload** | `projectId: string` (Mongo ObjectId) |
| **Ack** | none |
| **Server verifies** | membership before joining |
| **You may receive** | `join:error` on failure; room events afterwards |

### `leave-project`
| | |
|---|---|
| **Payload** | `projectId: string` |
| **Ack** | none |
| **Side effect** | room members get `member:offline` |

### `chat:message`
| | |
|---|---|
| **Payload** | `{ projectId: string, content: string, type?: 'text' \| 'image' \| 'file' }` |
| **Limits** | `content` required, string, **≤ 5000 chars** — invalid payloads are **silently dropped** (no error event) |
| **Ack** | none |
| **Server** | persists to DB, then broadcasts `chat:message` **to the room — including back to you** |
| **Failure** | `chat:error { error: "Failed to send message" }` (DB error) |

**Dedupe:** you receive your own message back. Append only from the `chat:message` handler, keyed by `_id` — never append optimistically *and* from the handler (STORES.md: page owns `messages[]`, live fan-out via `chatBus`).

```ts
socket.emit('chat:message', { projectId, content: text, type: 'text' });
// server → everyone in room (incl. you):
// { _id, projectId, userId, content, type, createdAt, user: { name, avatar } }
```

REST fallback: `POST /chat/:projectId/messages` (returns the same payload; also broadcasts).

---

## 5 · Server → Client

Common fields used by most room events:

```ts
actor:    { userId: string }  // who caused it — if === my id, it's my own echo → never toast
timestamp: number             // Date.now() ms
```

### 5.1 Global

| Event | Payload | When | Suggested handler |
|-------|---------|------|-------------------|
| `online-count` | `{ count: number }` | every connect/disconnect (unique online users) | `socketStore.setOnlineCount(count)` — no toast |

### 5.2 Direct (your socket only)

| Event | Payload | When | Suggested handler |
|-------|---------|------|-------------------|
| `notification` | `{ type, data, read: false }` (see [§6](#6-notification-types)) | a `sendNotification` targeted you | `notificationStore.push(...)` + unread++; toast only useful types |
| `invitation` | full Invitation doc (see below) | someone invited you to a project | `invitationStore.addPending(inv)` + `toast('New invite…')` |
| `join:error` | `{ error: string }` | `join-project` rejected | `toast.error(error)` |
| `chat:error` | `{ error: string }` | chat save failed | `toast.error(error)` |

**`invitation` payload** (full document as saved):

```json
{
  "_id": "…", "token": "…", "email": "invitee@…",
  "projectId": "…", "projectName": "…", "projectDescription": "…",
  "invitedBy": "userId", "senderName": "…", "senderEmail": "…", "senderAvatar": "…",
  "type": "teamMember" | "projectLead", "role": "member" | "lead",
  "description": "…", "status": "pending",
  "expiresAt": "ISO", "createdAt": "ISO"
}
```

Live push is ephemeral — the pending list is also persisted: reload from `GET /invitations/pending`.

### 5.3 Room events (require `join-project`)

All payloads include `actor: { userId }` + `timestamp: number` unless noted.

#### Presence

| Event | Payload (beyond actor/timestamp) | When |
|-------|----------------------------------|------|
| `member:online` | `{ userId, socketId }` | a member joined the room (incl. your own join) |
| `member:offline` | `{ userId, socketId }` | a member left the room |
| `member:added` | `{ projectId, memberId, projectName }` | someone was added to the team (REST `addTeamMember`) |

→ presence dots / members list only — never toasts.

#### Chat

| Event | Payload | When |
|-------|---------|------|
| `chat:message` | `{ _id, projectId, userId, content, type, createdAt, user: { name, avatar } }` | any message sent via socket **or** REST |

→ chat bus (`emitChatMessage`); append with `_id` dedupe; toast only if chat UI not open for that project **and** not self.

#### Tasks

| Event | Payload | When |
|-------|---------|------|
| `task:created` | `{ task, actor, timestamp }` | task created (REST or AI) |
| `task:updated` | `{ task, changes: [{ field, oldValue, newValue }], actor, timestamp }` | task edited, status unchanged |
| `task:status-changed` | `{ task, changes, oldStatus?, newStatus?, actor, timestamp }` | status moved (single or bulk) |
| `task:deleted` | `{ taskId, subtaskIds: string[], actor, timestamp }` | task deleted (cascades subtasks) |
| `task:unblocked` | `{ unblockedTaskIds: string[], unblockedBy: string /* task title */, actor, timestamp }` | marking a task done unblocked dependents |

→ bump `taskEpoch` for the active project → page refetches; no toast unless you opt in.

#### Comments

| Event | Payload | When |
|-------|---------|------|
| `comment:created` | `{ comment, taskId, taskTitle, actor, timestamp }` | comment added to a task |
| `comment:edited` | `{ comment /* userId populated {name} */, taskId, taskTitle, actor, timestamp }` | comment edited |
| `comment:deleted` | `{ commentId, taskId, taskTitle, actor, timestamp }` | comment deleted |

→ if that task's comment thread is open, update it live; else bump epoch. Toast via `notification` → `commentAdded` instead (direct).

#### Sprints

| Event | Payload | When |
|-------|---------|------|
| `sprint:created` | `{ sprint, actor, timestamp }` | sprint created (also auto-deactivates prior active — refetch list) |
| `sprint:updated` | `{ sprint, changes, actor, timestamp }` | name/goal/dates edited |
| `sprint:deleted` | `{ sprintId, actor, timestamp }` | sprint deleted (tasks un-set) |
| `sprint:activated` | `{ sprint, actor, timestamp }` | activated (others deactivated) |
| `sprint:completed` | `{ sprint, actor, timestamp }` | completed |
| `sprint:tasks-updated` | `{ sprint, taskIds: string[], action: 'added' \| 'removed', actor, timestamp }` | tasks attached/detached |

→ bump `sprintEpoch`; `sprint:completed` may toast.

#### Project config

| Event | Payload | When |
|-------|---------|------|
| `project:updated` | `{ project /* full updated doc */, changes: [{ field, oldValue, newValue }], actor, timestamp }` | `PUT /projects/:id` |
| `project:workflow-updated` | `{ workflowRules: { enabled, transitions }, actor, timestamp }` | `PUT /projects/:id/workflow` |
| `project:wip-updated` | `{ wipLimits: { enabled, limits }, actor, timestamp }` | `PUT /projects/:id/wip-limits` |

→ bump project epoch / patch cached project; no toast.

#### Git

| Event | Payload | When |
|-------|---------|------|
| `commit:linked` | `{ commit, taskTitle, actor, timestamp }` | commit linked to a task (REST or webhook) |
| `commit:unlinked` | `{ commitId, commitHash, actor, timestamp }` | commit unlinked |

---

## 6 · `notification` types

`notification` payload shape (same as one inbox entry from `GET /notifications`):

```json
{ "type": "<type>", "data": { "...type-specific", "createdAt": 1690000000000 }, "read": false }
```

| `type` | `data` fields | Emitted when |
|--------|---------------|--------------|
| `taskAssigned` | `taskId, taskTitle, projectId, actorName, message` | task assigned to you (create or reassign) |
| `taskStatusChanged` | `taskId, taskTitle, projectId, oldStatus, newStatus, actorName, message` | your task moved column |
| `dueDateApproaching` | `taskId, taskTitle, projectId, dueDate, message` | task assigned to you due within 24 h |
| `commentAdded` | `taskId, taskTitle, projectId, actorName, commentPreview, message` | someone commented on your task |
| `teamMember` | `projectId, projectName, from, senderName, senderEmail, title, description` | you were invited as member |
| `projectLead` | *(same shape as `teamMember`)* | you were invited as lead (at creation) |
| `invitationResponse` | `invitationId, projectId, projectName, email, response: 'accepted' \| 'declined', message` | someone answered **your** invite |

All types are safe to badge; toast the ones listed as "worth toasting" in [STORES.md § Realtime toasts](./STORES.md#realtime-toasts-catalog). Inbox state loads via `GET /notifications` — the socket event is only the live tail.

---

## 7 · Delivery semantics & gotchas

1. **Own echo:** your REST mutation comes back to you as a room event with `actor.userId === yourId`. Refetch/epoch is fine; **never toast your own action**.
2. **Rooms are per-socket:** reconnect → re-`join-project`; route away → `leave-project`. No room = no events.
3. **Offline = REST catches up.** Nothing is lost permanently: notifications/invitations/chat are persisted; entity events (task/sprint/project) are *signals* — on load or on reconnect, refetch. Epoch pattern from STORES.md covers this.
4. **`notification`/`invitation` go to one tab only** (last-connected wins). Multi-tab sync is your responsibility.
5. **Silent drops:** `chat:message` with missing/oversized content produces **no** error event — validate client-side. Only DB failures yield `chat:error`.
6. **Redis optional.** With `REDIS_URL`, a Socket.IO Redis adapter + presence keys make rooms/counts correct across server instances; without it, single-instance in-memory. No frontend difference.
7. **`online-count`** counts *unique users*, not sockets. Cosmetic only.
8. **No acks** — don't write `socket.emit(..., cb)`. Await REST responses instead.
9. **Ordering:** per-room events are ordered by emission; don't assume ordering across direct vs room events.

---

## 8 · `bindSocket` router (single owner of `socket.on`)

Attach every listener **once** (HMR-safe guard included). Mirrors STORES.md:

```ts
// realtime/bindSocket.ts
let bound = false;

export function bindSocket(socket: Socket) {
  if (bound) return;
  bound = true;

  // global
  socket.on('online-count', ({ count }) => socketStore.setOnlineCount(count));

  // direct
  socket.on('notification', (n) => { notificationStore.push(n); toastNotification(n); });
  socket.on('invitation', (inv) => { invitationStore.addPending(inv); toast(`New invite: ${inv.projectName}`); });
  socket.on('join:error', ({ error }) => toast.error(error));
  socket.on('chat:error', ({ error }) => toast.error(error));

  // rooms — entity events bump epochs (page refetches), not toasts
  socket.on('task:created', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('task:updated', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('task:status-changed', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('task:deleted', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('task:unblocked', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('comment:created', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('comment:edited', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('comment:deleted', () => useRealtimeStore.getState().bumpTaskEpoch());
  for (const ev of ['sprint:created', 'sprint:updated', 'sprint:deleted',
                    'sprint:activated', 'sprint:completed', 'sprint:tasks-updated'] as const) {
    socket.on(ev, () => useRealtimeStore.getState().bumpSprintEpoch());
  }
  socket.on('project:updated', () => useRealtimeStore.getState().bumpProjectEpoch());
  socket.on('project:workflow-updated', () => useRealtimeStore.getState().bumpProjectEpoch());
  socket.on('project:wip-updated', () => useRealtimeStore.getState().bumpProjectEpoch());
  socket.on('member:added', () => useRealtimeStore.getState().bumpMembersEpoch());
  socket.on('commit:linked', () => useRealtimeStore.getState().bumpTaskEpoch());
  socket.on('commit:unlinked', () => useRealtimeStore.getState().bumpTaskEpoch());

  // presence → UI state only
  socket.on('member:online', ({ userId }) => presence.markOnline(userId));
  socket.on('member:offline', ({ userId }) => presence.markOffline(userId));

  // chat → thin bus (page appends, dedupes by _id)
  socket.on('chat:message', (msg) => {
    emitChatMessage(msg);
    maybeToastChat(msg); // only if chat UI not open for msg.projectId && msg.userId !== me
  });

  // re-join room after reconnect
  socket.on('connect', () => {
    const active = socketStore.activeProjectId;
    if (active) socket.emit('join-project', active);
  });
}
```

Event → action cheat sheet:

| Event(s) | Action |
|----------|--------|
| `online-count` | set count |
| `notification` | store push + badge (+ toast useful types) |
| `invitation` | store add + toast |
| `join:error`, `chat:error` | `toast.error` |
| `chat:message` | chat bus + conditional toast |
| `task:*`, `comment:*`, `commit:*` | bump `taskEpoch` |
| `sprint:*` | bump `sprintEpoch` |
| `project:*` | bump `projectEpoch` |
| `member:added` | bump members epoch |
| `member:online` / `member:offline` | presence dots |

---

## 9 · REST fallbacks (live event missed → refetch)

| Lost event | Refetch with |
|------------|--------------|
| `notification` | `GET /notifications`, `GET /notifications/unread-count` |
| `invitation` | `GET /invitations/pending` |
| `chat:message` | `GET /chat/:projectId/messages?before=&limit=` |
| `task:*` / `comment:*` / `commit:*` | `GET /tasks?projectId=…` (or single task/comments/commits endpoints) |
| `sprint:*` | `GET /sprints?projectId=…` |
| `project:*` | `GET /projects/:projectId` |
| `member:added` / presence | `GET /projects/:projectId` (`onlineMembers`), `GET /projects/:projectId/members` |

---

## 10 · TypeScript event map (appendix)

```ts
import type { Socket } from 'socket.io-client';

interface ChatMsg {
  _id: string; projectId: string; userId: string;
  content: string; type: 'text' | 'image' | 'file';
  createdAt: string; user: { name: string; avatar: string | null };
}

interface ServerToClientEvents {
  'online-count': (p: { count: number }) => void;
  notification: (p: { type: string; data: Record<string, any>; read: boolean }) => void;
  invitation: (p: { _id: string; token: string; projectId: string; projectName: string; [k: string]: any }) => void;
  'join:error': (p: { error: string }) => void;
  'chat:error': (p: { error: string }) => void;

  'chat:message': (p: ChatMsg) => void;
  'member:online': (p: { userId: string; socketId: string }) => void;
  'member:offline': (p: { userId: string; socketId: string }) => void;
  'member:added': (p: { projectId: string; memberId: string; projectName: string; actor: { userId: string }; timestamp: number }) => void;

  'task:created': (p: { task: any; actor: { userId: string }; timestamp: number }) => void;
  'task:updated': (p: { task: any; changes: any[]; actor: { userId: string }; timestamp: number }) => void;
  'task:status-changed': (p: { task: any; changes: any[]; oldStatus?: string; newStatus?: string; actor: { userId: string }; timestamp: number }) => void;
  'task:deleted': (p: { taskId: string; subtaskIds: string[]; actor: { userId: string }; timestamp: number }) => void;
  'task:unblocked': (p: { unblockedTaskIds: string[]; unblockedBy: string; actor: { userId: string }; timestamp: number }) => void;

  'comment:created': (p: { comment: any; taskId: string; taskTitle: string; actor: { userId: string }; timestamp: number }) => void;
  'comment:edited': (p: { comment: any; taskId: string; taskTitle: string; actor: { userId: string }; timestamp: number }) => void;
  'comment:deleted': (p: { commentId: string; taskId: string; taskTitle: string; actor: { userId: string }; timestamp: number }) => void;

  'sprint:created': (p: { sprint: any; actor: { userId: string }; timestamp: number }) => void;
  'sprint:updated': (p: { sprint: any; changes: any[]; actor: { userId: string }; timestamp: number }) => void;
  'sprint:deleted': (p: { sprintId: string; actor: { userId: string }; timestamp: number }) => void;
  'sprint:activated': (p: { sprint: any; actor: { userId: string }; timestamp: number }) => void;
  'sprint:completed': (p: { sprint: any; actor: { userId: string }; timestamp: number }) => void;
  'sprint:tasks-updated': (p: { sprint: any; taskIds: string[]; action: 'added' | 'removed'; actor: { userId: string }; timestamp: number }) => void;

  'project:updated': (p: { project: any; changes: any[]; actor: { userId: string }; timestamp: number }) => void;
  'project:workflow-updated': (p: { workflowRules: any; actor: { userId: string }; timestamp: number }) => void;
  'project:wip-updated': (p: { wipLimits: any; actor: { userId: string }; timestamp: number }) => void;

  'commit:linked': (p: { commit: any; taskTitle: string; actor: { userId: string }; timestamp: number }) => void;
  'commit:unlinked': (p: { commitId: string; commitHash: string; actor: { userId: string }; timestamp: number }) => void;
}

interface ClientToServerEvents {
  'join-project': (projectId: string) => void;
  'leave-project': (projectId: string) => void;
  'chat:message': (p: { projectId: string; content: string; type?: 'text' | 'image' | 'file' }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
```

---

**Quick checklist**

- [ ] Connect with `auth: { token }`; handle auth-failure disconnect → refresh token → reconnect  
- [ ] `bindSocket` once — the only place with `socket.on`  
- [ ] Route change → `leave-project` (old) + `join-project` (new); `connect` → re-join active  
- [ ] Chat: send via socket, append from handler with `_id` dedupe, never double-append  
- [ ] Room entity events → epoch bump → REST refetch (never blind-mutate lists)  
- [ ] Direct `notification`/`invitation` → stores (+ toast per STORES.md catalog)  
- [ ] Never toast when `actor.userId === me`; never toast presence/count  
- [ ] Offline/reconnect → refetch via REST fallbacks (§9)  
