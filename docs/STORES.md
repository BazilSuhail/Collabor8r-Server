# Collabora8r — Client State (Zustand) + Realtime

## Rules

1. **REST lives on the page** — each page calls its own APIs (see `docs/PAGES.md`). No store fetches list/detail data for a page.
2. **Stores = shared only** — things many pages read or that arrive over the socket without a page-level fetch.
3. **One Socket.IO connection** — not one per store. Handshake: `auth: { token }` (same JWT as REST).
4. **Pages / bindSocket do not need a toast store** — call `toast()` (sonner / react-hot-toast / etc.) directly where the event is handled.

---

## What goes in a store

| Store | State | Realtime? | Why shared |
|-------|--------|-----------|------------|
| `authStore` | `token`, `user`, `status` | No | Used by every request + socket connect |
| `socketStore` | `socket`, `connected`, `onlineCount` | Connection only | Single connection for the app |
| `notificationStore` | `items[]`, `unreadCount` | **Yes** — `notification` | Sidebar badge on every page |
| `invitationStore` | `pending[]` | **Yes** — `invitation` | Badge on every page |
| `sessionStore` *(optional)* | `activeProjectId` | No | Which project room to join when route changes |

**Not in stores:** tasks, comments, sprints, reports, boards, filters, labels, time entries, activity, profile form, project lists — page fetches on mount, page owns the data.

**Toasts:** no store. Trigger from the place that owns the logic:

- Page action fails → `toast.error(...)` in the page’s catch  
- Socket event wants a UI ping (new chat message while away, invite arrived, `join:error`) → `toast(...)` in `bindSocket` or the handler that already runs on that event  
- Library (`sonner`, etc.) holds its own queue; you just call `toast()`

See [Realtime toasts](#realtime-toasts-catalog) for what is worth toasting vs ignoring.

If a socket event updates data a page is showing (task board), either:

- **Refetch on event** (simplest): page listens via a tiny helper or invalidates a key when `task:*` / `chat:message` fires for the current `projectId`, or  
- **Page-local state** holds the cache; store only signals “something changed” (`realtimeEpoch` / bump counter in `sessionStore`).

Recommended default: **bump an epoch** in `sessionStore` (or a `realtimeStore` with `{ taskEpoch, chatEpoch }`) and let the open page `useEffect` refetch. Keeps stores small and REST on the page as you wanted.

**Exception — chat append:** refetching the whole history on every message is wasteful. Chat page owns `messages[]`; it **subscribes while open** to `chat:message` via a tiny bus (not a store, not `socket.on` in the page). See [Chat](#chat-page-owned-no-chat-store).

---

## Chat (page-owned, no chat store)

Server behavior (from `socket.js` + `chat/service.js`):

| Direction | How |
|-----------|-----|
| Load history | Page → `GET /chat/:projectId/messages?before=&limit=` |
| **Send (preferred)** | Page → `socket.emit('chat:message', { projectId, content, type })` — server **saves** and broadcasts `chat:message` to the room (you get your own message back; don’t double-append) |
| Send (fallback) | Page → `POST /chat/:projectId/messages` if socket disconnected |
| **Receive live** | Room event `chat:message` → only the open chat UI appends |
| Errors | `chat:error` → `toast.error(...)` in `bindSocket` |

**No `chatStore`.** State is local to the chat page/component:

```ts
// page
const [messages, setMessages] = useState([]);
useEffect(() => { /* REST history */ }, [projectId]);

useEffect(() => {
  return onChatMessage((msg) => {
    if (msg.projectId !== projectId) return;
    setMessages((prev) =>
      prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]
    ); // dedupe by _id (REST + socket echo)
  });
}, [projectId]);
```

**Bus** (one place still owns `socket.on` for chat fan-out — `bindSocket`):

```ts
// realtime/chatBus.ts
const handlers = new Set<(msg: ChatMessage) => void>();
export function onChatMessage(fn: (msg: ChatMessage) => void) {
  handlers.add(fn);
  return () => handlers.delete(fn);
}
export function emitChatMessage(msg: ChatMessage) {
  handlers.forEach((h) => h(msg));
}
// bindSocket.ts
socket.on('chat:message', emitChatMessage);
```

- Mount chat → `onChatMessage` + REST seed  
- Unmount → unsubscribe (bus stays; socket stays)  
- Other pages: no chat list in memory  
- Optional: if you need a **global** “new message while away” ping → `toast('New message')` in `bindSocket` only when `document.hidden` or chat route isn’t open — still no store  

**When you *would* add a chat store:** floating chat dock open across many routes, or you must show unread chat count in the sidebar without visiting the page. Server does not push a separate chat notification today — only room `chat:message` — so a sidebar chat badge would need your own counting client-side.

---

## Realtime toasts (catalog)

Two delivery paths on the server — know which you are on:

| Path | Events | You receive when… |
|------|--------|-------------------|
| **Direct to you** | `notification`, `invitation` | Always (after connect), any page |
| **Project room** | `chat:message`, `task:*`, `comment:*`, `sprint:*`, `project:*`, `member:*`, `commit:*` | Only if you emitted `join-project` for that id (route set `activeProjectId`) |

Room events **do not** reach you if you left the project or never joined — no toast possible without being in the room (or server adding a direct `sendNotification`).

### Worth toasting (recommended)

| Event / type | Example toast | Where | Skip when |
|--------------|---------------|-------|-----------|
| `invitation` | **New invite** — “Acme invited you to Project X” | `bindSocket` + `invitationStore.addPending` | — |
| `notification` → `taskAssigned` | **Task** — “You were assigned: Fix login bug” | `bindSocket` (badge always; toast optional) | You are the actor (server usually targets assignee only) |
| `notification` → `commentAdded` | **Comment** — “Jane commented on your task” | `bindSocket` | Open on that task’s comments |
| `notification` → `dueDateApproaching` | **Due soon** — “Task due tomorrow: …” | `bindSocket` | — |
| `notification` → `invitationResponse` | **Invite** — “Bob accepted your lead invite” | `bindSocket` | — |
| `chat:message` (room) | **Chat** — “**Maya** in **Website Redesign**: hey, can you…” | `bindSocket` if chat page **not** open for that `projectId` **or** `document.hidden` | Chat open for same project; **your own** `userId === authStore.user.id`; type `system` if you add it later |
| `task:status-changed` (room) | **Optional** — “Task moved to Done by Sam” | only if you want ambient project buzz | Board already open (epoch refetch is enough) |
| `member:added` | **Team** — “You added Priya to the project” (for the **added** user better via `notification`) | light / optional | — |
| `join:error` / `chat:error` | `toast.error` | `bindSocket` | — |
| REST failures | `toast.error(api message)` | page `catch` | — |

### Skip toasting (noise)

| Event | Why |
|-------|-----|
| `online-count` | Global vanity metric |
| `member:online` / `member:offline` | Presence dots in members UI, not toasts |
| `task:created` / `updated` / `deleted` / `unblocked` | Open pages refetch via epoch; toast only if you opt-in |
| `comment:edited` / `deleted` | Same |
| `sprint:*` except maybe `sprint:completed` | Epoch; optional “Sprint completed” |
| `project:updated` / `workflow` / `wip` | Settings UI already open or silent |
| `commit:*` | Git page interest only |
| Own actions’ room echo | You just clicked — no toast |

### Chat toast details

Payload: `{ _id, projectId, userId, content, type, createdAt, user: { name, avatar } }`.

```ts
// bindSocket — after emitChatMessage(msg)
const myId = useAuthStore.getState().user?.id;
const chatOpenFor = getOpenChatProjectId(); // from route or ui helper
if (msg.userId !== myId && msg.projectId !== chatOpenFor) {
  toast(`${msg.user.name}: ${msg.content.slice(0, 80)}`, {
    action: { label: 'Open', onClick: () => navigate(`/projects/${msg.projectId}/chat`) },
  });
}
```

- **Who messaged:** use `msg.user.name` (already on payload).  
- **Which project:** you only get the event if in that room — put project name in the toast if you cache `sessionStore.projectNames[id]`, or show id only if unknown.  
- You will **not** get “message in project B” while joined only to project A (single `activeProjectId` pattern). Multi-room: `joinProject` for each open project / favorites list.

### Server notification types (direct `notification`)

From `sendNotification` call sites — each becomes store item + optional toast:

| `type` | Meaning |
|--------|---------|
| `taskAssigned` | Assigned a task |
| `dueDateApproaching` | Due date reminder |
| `taskStatusChanged` | Status changed on your task |
| `commentAdded` | Comment on your task |
| `invitation…` / invite notify types | Invitation sent (invited user) |
| `invitationResponse` | Accept/decline feedback to inviter |

Inbox still loads via `GET /notifications`; socket `notification` is the live tail + toast source.

### Minimal `bindSocket` toast rules

1. Direct `invitation` / useful `notification` types → toast + store.  
2. `chat:message` → chat bus always; toast only if chat UI not showing that project (and not self).  
3. Room entity events → epoch, not toast (except opt-ins like `sprint:completed`).  
4. Errors → `toast.error`.  
5. Never toast your own echoes.

---

## Minimal store set (4)

```
authStore         // token + user (persist)
socketStore       // connect/disconnect, onlineCount, join/leave project room
notificationStore // list + unreadCount (badge)
invitationStore   // pending invites (badge/dropdown)
```

Optional 5th: `realtimeStore` — `{ taskEpoch, chatEpoch, sprintEpoch }` bumped on room events so open pages can refetch without stores holding entities.

Toasts are **not** a store — call the toast library where the event or error already lives.

---

## REST vs socket

| Concern | Source |
|---------|--------|
| Initial page data | Page → REST on mount |
| Mutations (create/update) | Page → REST; server emits room event |
| Someone else’s change | Socket → store signal / epoch → page refetch or patch |
| Badge (notifications, invites) | Socket push + REST seed on login |
| Presence / online count | Socket only |

---

## One connection

```
login success → authStore.setToken(t)
             → socketStore.connect(t)

route change to /projects/:id
             → socketStore.joinProject(id)   // emit "join-project"
leave route   → socketStore.leaveProject(id)

logout        → socketStore.disconnect() → authStore.clear()
```

Server room: `project:${projectId}`. Global events (no room): `online-count`, `notification`, `invitation`.

---

## Event router (single file)

Bind once after connect. Stores expose actions only — they never call `socket.on`.

| Event | Action |
|-------|--------|
| `online-count` | `socketStore.setOnlineCount` (no toast) |
| `notification` | `notificationStore.push` + unread++; toast if type is useful (assign, comment, due, invite response) |
| `invitation` | `invitationStore.addPending` + `toast('New invite…')` |
| `join:error` | `toast.error(...)` |
| `chat:error` | `toast.error(...)` |
| `task:created\|updated\|status-changed\|deleted\|unblocked` | bump `taskEpoch` for active project (toast only opt-in) |
| `comment:*` | bump `commentEpoch` (or only if task page open) |
| `chat:message` | `emitChatMessage` on chat bus → open chat page appends (dedupe `_id`); `toast` only if chat UI not open for that project and not self |
| `sprint:*` | bump `sprintEpoch` (`sprint:completed` may toast) |
| `project:updated\|workflow-updated\|wip-updated` | bump `projectEpoch` |
| `member:online\|offline` | presence UI only, no toast |
| `member:added` | bump members / optional toast |
| `commit:*` | bump `gitEpoch` if git page open |

**Idempotent refetch:** page keys queries on `epoch` + its own filters:

```ts
const epoch = useRealtimeStore((s) => s.taskEpoch);
useEffect(() => { fetchTasks(projectId); }, [projectId, epoch]);
```

---

## Persistence

| Persist | Do not persist |
|---------|----------------|
| `authStore.token` + minimal `user` | Notification/invitation lists |
| UI prefs (theme, sidebar) | Epochs, socket |
| Optional last `activeProjectId` | Page caches |

On refresh: hydrate token → connect socket → pages REST-seed themselves → badge pages call `GET /notifications/unread-count` + `GET /invitations/pending`.

---

## File layout (client)

```
src/
  lib/api.ts              # fetch + Authorization header (used BY PAGES)
  lib/socket.ts           # createSocket(token)
  stores/
    authStore.ts
    socketStore.ts
    notificationStore.ts
    invitationStore.ts
    realtimeStore.ts      # optional epochs
  realtime/
    bindSocket.ts         # socket.on → store actions / chat bus / toast() (only place with .on)
    chatBus.ts            # onChatMessage / emitChatMessage for open chat UI
  pages/                  # each page: REST in loader/effect + read shared stores + toast() on errors
```

---

## Summary

- **Pages:** all REST for their data; `toast()` on their own errors.  
- **Stores:** auth, socket, notifications, invitations (+ optional epochs). No toast store.  
- **Socket:** one connection; one `bindSocket`; rooms joined from route.  
- **Toasts:** imperative `toast()` wherever the logic already runs (page catch, bindSocket).  
- **Chat:** page owns `messages[]`; history via REST; send via socket (REST fallback); live via `chatBus` while open — no chat store.  
- **Live entity updates:** epoch bump → open page refetch (keeps stores out of the business-data business).

See also: `docs/PAGES.md`, `docs/API.md`.
