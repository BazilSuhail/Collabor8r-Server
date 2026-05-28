# Project Manager Suite Server - Build Plan

Stack: Node >=20, Express 5, Mongoose, jsonwebtoken, bcryptjs, zod 4, dotenv, cors, morgan. ESM, plain JS.
Install with `npm install express mongoose jsonwebtoken bcryptjs zod dotenv cors morgan` (no version pins = latest stable).
Scripts: `"dev": "node --watch src/server.js"`, `"start": "node src/server.js"`. `"type": "module"`, `"engines": {"node": ">=20"}`.
No tests, no client code. Short comments only. All imports use relative paths with the `.js` extension.

## Conflict resolution: merged files (files under ~40 lines)

Dropped from the required structure (content folded into a neighbour):
- `utils/ApiError.js`, `utils/asyncHandler.js`, `utils/response.js` -> merged into **`utils/http.js`** (three tiny HTTP helpers, ~40 lines together).
- `utils/jwt.js`, `utils/pagination.js` -> merged into **`utils/helpers.js`** (sign/verify token, pagination, shared zod `objectId`; ~45 lines).
- `middleware/role.js` -> merged into **`middleware/auth.js`** (both are access control; role needs only the Project model; ~65 lines).
- `middleware/validate.js` -> merged into **`middleware/error.js`** (validate throws ApiError that errorHandler formats; ~60 lines).
- `config/db.js` -> merged into **`server.js`** (connect is 5 lines, only server.js uses it).
- `modules/user/user.service.js` -> not created: user has 6 handlers (routes + controller by the module rule), logic lives in the controller.
Kept despite being short: `app.js` and `server.js` (required entry points), the 5 model files (one schema per file is a hard rule), `.env.example`, `.gitignore` (config files).
Modules with <=5 handlers have no controller: auth (2), comment (4), dashboard (2); handlers are inline in the routes file.

---

## a) File manifest

| Path | Purpose | ~Lines |
|---|---|---|
| package.json | deps, scripts, type module | 30 |
| .env.example | env template | 8 |
| .gitignore | node_modules, .env | 5 |
| README.md | setup, run, endpoint overview | 70 |
| PLAN.md | this file | - |
| src/server.js | load env, connect Mongo, listen, graceful shutdown | 35 |
| src/app.js | express app: cors, json, morgan, mounts, notFound, errorHandler | 45 |
| src/config/env.js | dotenv load + typed `env` object | 25 |
| src/utils/http.js | ApiError, asyncHandler, ok, created | 40 |
| src/utils/helpers.js | signToken, verifyToken, parsePagination, pageMeta, objectId | 45 |
| src/middleware/auth.js | auth, requireProjectRole, ROLE_SETS | 65 |
| src/middleware/error.js | validate, notFound, errorHandler | 60 |
| src/models/user.model.js | User schema | 40 |
| src/models/project.model.js | Project schema + role/status constants | 60 |
| src/models/task.model.js | Task schema + status/priority constants | 60 |
| src/models/comment.model.js | Comment schema | 35 |
| src/models/activity.model.js | Activity schema + `log` static + types | 45 |
| src/modules/auth/auth.routes.js | register, login | 70 |
| src/modules/user/user.routes.js | 6 routes + zod schemas | 55 |
| src/modules/user/user.controller.js | 6 handlers with logic | 110 |
| src/modules/project/project.routes.js | 11 routes + zod schemas | 85 |
| src/modules/project/project.controller.js | thin handlers over service | 80 |
| src/modules/project/project.service.js | project/member/activity logic | 220 |
| src/modules/task/task.routes.js | 11 routes + zod schemas | 100 |
| src/modules/task/task.controller.js | thin handlers over service | 85 |
| src/modules/task/task.service.js | task logic, numbering, rank, counts | 280 |
| src/modules/comment/comment.routes.js | 4 routes + schemas + inline handlers | 110 |
| src/modules/dashboard/dashboard.routes.js | 2 routes with aggregations | 70 |

---

## b) Endpoint -> handler map

All paths are prefixed `/api`. "Auth" = `auth` middleware. Role = `requireProjectRole(...)` set (see e). Schemas are in the routes file of the module unless noted. Every request with params/query/body goes through `validate(schema, source)`; `objectId` params use schema `IdParams`.

### Auth (`/api/auth`, routes only, inline handlers)
| Method Path | Auth | Role | Schema | Handler |
|---|---|---|---|---|
| POST /auth/register | no | - | RegisterBody | inline `register` |
| POST /auth/login | no | - | LoginBody | inline `login` |

### User (`/api/users`)
| Method Path | Auth | Schema | Controller fn |
|---|---|---|---|
| GET /users/me | yes | - | getMe |
| PATCH /users/me | yes | UpdateMeBody | updateMe |
| PATCH /users/me/preferences | yes | PreferencesBody | updatePreferences |
| PUT /users/me/password | yes | ChangePasswordBody | changePassword |
| GET /users | yes | SearchUsersQuery | searchUsers |
| GET /users/:userId | yes | UserIdParams | getUser |
Register `/me*` routes before `/:userId`.

### Project (`/api/projects`)
| Method Path | Role | Schema (source) | Controller -> service fn |
|---|---|---|---|
| GET /projects | auth only | ListProjectsQuery (query) | list -> listProjects |
| POST /projects | auth only | CreateProjectBody | create -> createProject |
| GET /projects/:projectId | read | ProjectIdParams | get -> (uses req.project) |
| PATCH /projects/:projectId | admin | ProjectIdParams + UpdateProjectBody | update -> updateProject |
| DELETE /projects/:projectId | owner | ProjectIdParams | remove -> deleteProject |
| GET /projects/:projectId/members | read | ProjectIdParams | listMembers -> listMembers |
| POST /projects/:projectId/members | admin | ProjectIdParams + AddMemberBody | addMember -> addMember |
| PATCH /projects/:projectId/members/:userId | admin | MemberParams + UpdateMemberBody | updateMember -> updateMemberRole |
| DELETE /projects/:projectId/members/:userId | read (self-leave) or admin | MemberParams | removeMember -> removeMember |
| POST /projects/:projectId/transfer-ownership | owner | ProjectIdParams + TransferBody | transferOwnership -> transferOwnership |
| GET /projects/:projectId/activity | read | ProjectIdParams + PageQuery (query) | activity -> listActivity |
`removeMember` route uses `read` roles; the service enforces "self leave, or admin+ removing a lower role".

### Task (router mounted at `/api`, full paths inside)
| Method Path | Role | Schema | Controller -> service fn |
|---|---|---|---|
| GET /projects/:projectId/tasks | read | ProjectIdParams + ListTasksQuery | list -> listTasks |
| POST /projects/:projectId/tasks | write | ProjectIdParams + CreateTaskBody | create -> createTask |
| GET /projects/:projectId/board | read | ProjectIdParams + BoardQuery | board -> getBoard |
| GET /tasks/mine | auth only | MyTasksQuery | mine -> myTasks |
| GET /tasks/:taskId | read | TaskIdParams | get -> getTask |
| PATCH /tasks/:taskId | write | TaskIdParams + UpdateTaskBody | update -> updateTask |
| DELETE /tasks/:taskId | write (service: reporter or admin+) | TaskIdParams | remove -> deleteTask |
| POST /tasks/:taskId/move | write | TaskIdParams + MoveTaskBody | move -> moveTask |
| PUT /tasks/:taskId/assignee | write | TaskIdParams + AssignBody | assign -> assignTask |
| GET /tasks/:taskId/activity | read | TaskIdParams + PageQuery | activity -> taskActivity |
| POST /tasks/:taskId/duplicate | write | TaskIdParams | duplicate -> duplicateTask |
Register `/tasks/mine` before `/tasks/:taskId`.

### Comment (router mounted at `/api`, routes only)
| Method Path | Role | Schema | Inline handler |
|---|---|---|---|
| GET /tasks/:taskId/comments | read | TaskIdParams + PageQuery | listComments |
| POST /tasks/:taskId/comments | write | TaskIdParams + CommentBody | createComment |
| PATCH /comments/:commentId | write (author only) | CommentIdParams + CommentBody | updateComment |
| DELETE /comments/:commentId | write (author) or admin+ | CommentIdParams | deleteComment (soft: sets deletedAt) |

### Dashboard (`/api/dashboard`, routes only)
| Method Path | Auth | Schema | Handler |
|---|---|---|---|
| GET /dashboard/summary | yes | - | summary: `{projects, myOpenTasks, overdue, dueSoon (7d), byStatus:{todo,in_progress,review,done}}` |
| GET /dashboard/activity | yes | ActivityQuery (limit<=50, default 20) | recent activity across my projects, newest first |

Plus `GET /api/health` -> `{success:true,data:{status:"ok"}}` defined in app.js.

---

## c) Models

All schemas `{timestamps: true}` unless noted. `_id` ObjectId. Each file default-exports the model; named constants exported where noted. `toJSON` for User strips `passwordHash` and `__v`.

### User (`User`, collection users)
- `email` String required, lowercase, trim, **unique index**
- `passwordHash` String required, `select: false`
- `name` String required trim max 80; `avatarUrl` String default ''; `headline` String max 140 default ''; `timezone` String default 'UTC'
- `preferences`: `{theme: enum light|dark|system default system, emailNotifications: Boolean default true, weekStartsOn: Number 0|1 default 1}`
- Indexes: `{email:1}` unique, `{name:1}` (prefix search)

### Project (`Project`)
Exports: `PROJECT_ROLES = ['owner','admin','member','viewer']`, `PROJECT_STATUSES = ['active','completed','archived']`, `PROJECT_VISIBILITY = ['private','public']`.
- `name` String required max 100; `key` String required uppercase `/^[A-Z][A-Z0-9]{1,5}$/`, **unique**; `description` String max 2000 default ''
- `status` enum default active; `visibility` enum default private
- `owner` ObjectId ref User; `ownerName` String
- `members`: `[{userId: ObjectId ref User, role: enum PROJECT_ROLES, name, avatarUrl, joinedAt: Date}]` with `_id:false`; bounded at 100 via validator. Owner is always also a member with role owner.
- `counts`: `{tasks: 0, done: 0, seq: 0, members: 1}` (seq = last task number issued)
- Indexes: `{key:1}` unique; `{'members.userId':1, status:1, updatedAt:-1}`; `{owner:1}`; `{visibility:1, status:1}`

### Task (`Task`)
Exports: `TASK_STATUSES = ['todo','in_progress','review','done']`, `TASK_PRIORITIES = ['low','medium','high','urgent']`.
- `projectId` ObjectId ref Project required; `number` Number required; `key` String (e.g. "WEB-12")
- `title` String required max 200; `description` String max 10000 default ''
- `status` enum default todo; `priority` enum default medium
- `assigneeId` ObjectId|null ref User; `assigneeName` String|null; `reporterId` ObjectId required; `reporterName` String
- `labels` [String] (each lowercase trim max 30, array max 10); `dueDate` Date|null
- `rank` Number required (float; ordering inside a status column); `completedAt` Date|null; `commentCount` Number default 0
- `version` Number default 0 (manual optimistic concurrency; schema option `versionKey:false`)
- Indexes: `{projectId:1, number:1}` unique; `{projectId:1, status:1, rank:1}`; `{assigneeId:1, status:1, dueDate:1}`; `{projectId:1, labels:1}`; `{projectId:1, updatedAt:-1}`

### Comment (`Comment`)
- `projectId`, `taskId` ObjectId required; `authorId` ObjectId required; `authorName` String; `authorAvatarUrl` String
- `body` String required max 5000; `editedAt` Date|null; `deletedAt` Date|null
- Indexes: `{taskId:1, createdAt:1}`; `{projectId:1}`

### Activity (`Activity`, `timestamps:false`)
Exports: `ACTIVITY_TYPES = ['project.created','project.updated','member.added','member.removed','member.role_changed','ownership.transferred','task.created','task.updated','task.moved','task.assigned','task.deleted','comment.added']`.
- `projectId` required; `taskId` ObjectId|null; `actorId` required; `actorName` String; `type` enum; `summary` String max 300; `at` Date default Date.now
- Indexes: `{projectId:1, at:-1}`; `{taskId:1, at:-1}`
- Static `Activity.log({projectId, taskId, actorId, actorName, type, summary})` -> Promise<void>; creates the doc, catches and swallows errors (never breaks the caller).

Denormalization rule: names/avatars are copied at write time. `PATCH /users/me` with a changed `name` or `avatarUrl` best-effort propagates via `updateMany` (Project.members.$[m] with arrayFilters, Project.ownerName, Task.assigneeName/reporterName, Comment.authorName/authorAvatarUrl). Activity actorName is historical and not updated.

---

## d) Zod schemas (zod 4: `import { z } from 'zod'`; `z.email()`)

Shared: `objectId` (helpers.js) = 24-hex string.
- **RegisterBody**: name 1-80 trim; email email lowercase; password 8-72.
- **LoginBody**: email; password min 1.
- **UpdateMeBody**: partial of name, avatarUrl (url or ''), headline <=140, timezone <=64; at least one key.
- **PreferencesBody**: partial of theme enum, emailNotifications bool, weekStartsOn 0|1; at least one key.
- **ChangePasswordBody**: currentPassword; newPassword 8-72 (must differ).
- **SearchUsersQuery**: q string 1-50 optional; limit coerce int 1-20 default 10.
- **UserIdParams**: userId objectId.
- **ProjectIdParams**: projectId objectId. **MemberParams**: projectId, userId objectId.
- **ListProjectsQuery**: page, limit (PageQuery rules), q optional, status enum optional, role enum optional (my role).
- **CreateProjectBody**: name 1-100; key 2-6 `[A-Za-z][A-Za-z0-9]*` transformed to uppercase; description <=2000 optional; visibility enum optional.
- **UpdateProjectBody**: partial of name, description, status, visibility (key immutable); at least one key.
- **AddMemberBody**: `email` (email) ; role enum admin|member|viewer default member.
- **UpdateMemberBody**: role enum admin|member|viewer.
- **TransferBody**: userId objectId (must be an existing member).
- **PageQuery**: page coerce int >=1 default 1; limit coerce int 1-50 default 20.
- **TaskIdParams**: taskId objectId. **CommentIdParams**: commentId objectId.
- **ListTasksQuery**: PageQuery + status (enum or comma list), priority enum, assigneeId objectId or "me" or "none", label string, q string <=100, dueBefore/dueAfter ISO date, sort enum `rank|-createdAt|dueDate|-updatedAt|priority` default `-createdAt`.
- **BoardQuery**: assigneeId objectId or "me", label optional.
- **MyTasksQuery**: PageQuery + status optional, overdue boolean optional.
- **CreateTaskBody**: title 1-200 trim; description <=10000 optional; status enum default todo; priority enum default medium; assigneeId objectId nullable optional; labels array <=10 of 1-30 chars; dueDate ISO date nullable optional.
- **UpdateTaskBody**: partial of CreateTaskBody fields (not status; use move) plus `version` int optional (409 on mismatch); at least one field besides version.
- **MoveTaskBody**: status enum required; beforeTaskId objectId optional; afterTaskId objectId optional (place between neighbours; neither = end of column).
- **AssignBody**: assigneeId objectId or null.
- **CommentBody**: body 1-5000 trim.
- **ActivityQuery**: limit coerce int 1-50 default 20.

---

## e) Auth flow, roles, permissions

Flow: `POST /auth/register` -> check email free (409) -> `bcrypt.hash(password, 10)` -> create User -> respond 201 `{user, token}`. `POST /auth/login` -> find by email with `+passwordHash` -> `bcrypt.compare` -> 401 "Invalid email or password" on any failure -> respond `{user, token}`. Client sends `Authorization: Bearer <token>`. No refresh tokens, no cookies.
JWT: HS256, payload `{sub: <userId string>, email}`, `expiresIn = env.jwtExpiresIn`. `auth` verifies, sets `req.user = {id: sub, email}` (no DB hit). Missing/invalid/expired -> 401.
`changePassword` verifies current password, hashes new one; existing tokens stay valid until expiry (MVP).

Project roles: **owner** (exactly one, = Project.owner), **admin**, **member**, **viewer**. Non-members of a `public` project are treated as virtual `viewer` for read-only routes. Non-members of private projects get 403.

Role sets (exported from middleware/auth.js): `ROLE_SETS = {read: [owner,admin,member,viewer], write: [owner,admin,member], admin: [owner,admin], owner: [owner]}`.

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View project, members, tasks, board, comments, activity | Y | Y | Y | Y |
| Create/edit/move/assign/duplicate tasks | Y | Y | Y | N |
| Delete task | Y | Y | only own reported | N |
| Create comment | Y | Y | Y | N |
| Edit comment | own | own | own | N |
| Delete comment (soft) | any | any | own | N |
| Edit project fields/status/visibility | Y | Y | N | N |
| Add member / change role / remove member | all | only member/viewer targets; may grant member/viewer only | N | N |
| Leave project (remove self) | N (transfer first) | Y | Y | Y |
| Transfer ownership (old owner becomes admin) | Y | N | N | N |
| Delete project (cascades tasks, comments, activity) | Y | N | N | N |
Any authenticated user may create a project (becomes owner) and list projects they belong to.

---

## f) Envelopes and pagination

Success: `{ "success": true, "data": <any>, "meta"?: {...} }`. `created` uses status 201. Deletes return 200 with `data: null`.
Error: `{ "success": false, "message": string, "errors"?: [{path: string, message: string}] }`.
Status codes: 400 bad id/cast, 401 auth, 403 role, 404 missing, 409 conflict (duplicate email/key, version mismatch), 422 validation, 500 unexpected (message hidden when NODE_ENV=production).
Pagination `meta`: `{ page, limit, total, totalPages }`; limit default 20, max 50; applied to list endpoints (data is the array of items).

---

## g) Environment

| Var | Default | Notes |
|---|---|---|
| PORT | 4000 | |
| MONGO_URI | mongodb://127.0.0.1:27017/pm_suite | |
| JWT_SECRET | dev only: `dev-secret-change-me` | required when NODE_ENV=production (throw at startup) |
| JWT_EXPIRES_IN | 7d | |
| CLIENT_ORIGIN | http://localhost:5173 | comma-separated allowed origins for cors |
| NODE_ENV | development | |

---

## h) Agent groups and build order

Owners unchanged from the brief (no reason to change). Because section i fixes every cross-file contract, all six agents can write in parallel; the dependency order below only matters for a final integration check.
1. **Agent A (infra)**: package.json, .env.example, .gitignore, README.md, src/config/env.js, src/utils/http.js, src/utils/helpers.js, src/middleware/auth.js, src/middleware/error.js, src/app.js, src/server.js.
2. **Agent B (models)**: src/models/*.model.js (5 files).
3. **Agent C**: src/modules/auth/auth.routes.js, src/modules/user/user.routes.js, user.controller.js.
4. **Agent D**: src/modules/project/*.
5. **Agent E**: src/modules/task/*.
6. **Agent F**: src/modules/comment/comment.routes.js, src/modules/dashboard/dashboard.routes.js.
Dependency layers: (A utils/config/models) -> (middleware) -> (module services) -> (controllers/routes) -> app.js. No agent edits another agent's files; a contract change must be recorded here first.

---

## i) Export contracts

### config/env.js
`export const env = { port:Number, nodeEnv:String, isProd:Boolean, mongoUri:String, jwtSecret:String, jwtExpiresIn:String, clientOrigins:String[] }` (imports `dotenv/config` itself).

### utils/http.js
- `export class ApiError extends Error { constructor(statusCode, message, errors /* optional [{path,message}] */) }` with fields `statusCode`, `errors`.
- `export const asyncHandler = (fn) => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`
- `export const ok = (res, data = null, meta) => res.status(200).json({success:true, data, ...(meta && {meta})})`
- `export const created = (res, data) => res.status(201).json({success:true, data})`

### utils/helpers.js
- `export const signToken = ({id, email}) => string` (payload `{sub:id, email}`)
- `export const verifyToken = (token) => {sub, email, iat, exp}` (throws jsonwebtoken errors)
- `export const parsePagination = (query) => ({page, limit, skip})` (query already validated; clamps limit to 50, defaults 1/20)
- `export const pageMeta = (page, limit, total) => ({page, limit, total, totalPages: Math.ceil(total/limit)})`
- `export const objectId` zod string schema (24 hex)

### middleware/auth.js
- `export const auth = (req,res,next)` -> sets `req.user = {id, email}`; ApiError 401 otherwise.
- `export const requireProjectRole = (...roles) => middleware` (async-safe). Resolves projectId from `req.params.projectId`, else the task of `req.params.taskId`, else the comment of `req.params.commentId` (loads with `.select('projectId')`). Loads the Project (`lean`), 404 if absent. Sets `req.projectId` (string), `req.project` (lean Project doc), `req.projectRole` ('owner'|'admin'|'member'|'viewer'). Non-member: if `project.visibility==='public'` and roles include 'viewer' -> role 'viewer', else 403. Member whose role is not in `roles` -> 403. Empty `roles` = any member.
- `export const ROLE_SETS = {read, write, admin, owner}` (arrays as defined in e).

### middleware/error.js
- `export const validate = (schema, source = 'body')` -> parses `req[source]` with `schema.safeParse`; on failure `ApiError(422, 'Validation failed', issues.map(i=>({path:i.path.join('.'), message:i.message})))`. On success sets `req.valid = req.valid || {}; req.valid[source] = parsed` (never reassigns `req.query`, Express 5). Controllers read `req.valid.body|query|params`.
- `export const notFound = (req,res,next)` -> `next(new ApiError(404, 'Route not found'))`.
- `export const errorHandler = (err,req,res,next)` -> maps ApiError, mongoose CastError (400), ValidationError (422), duplicate key code 11000 (409), JsonWebTokenError/TokenExpiredError (401), else 500; emits the error envelope.

### models (default export = model; names given)
- `user.model.js`: default `User`. Doc methods none. Named: none.
- `project.model.js`: default `Project`; named `PROJECT_ROLES`, `PROJECT_STATUSES`, `PROJECT_VISIBILITY`.
- `task.model.js`: default `Task`; named `TASK_STATUSES`, `TASK_PRIORITIES`.
- `comment.model.js`: default `Comment`.
- `activity.model.js`: default `Activity` (static `Activity.log(entry)`); named `ACTIVITY_TYPES`.

### modules: routers (all `export default router` of `express.Router()`)
- `auth/auth.routes.js`, `user/user.routes.js`, `project/project.routes.js`, `task/task.routes.js`, `comment/comment.routes.js`, `dashboard/dashboard.routes.js`. Mount paths in j.
- Each routes file imports only from middleware/utils/models and its own controller/service. Routes files never import other modules.

### user/user.controller.js (named exports, each `asyncHandler`-wrapped `(req,res)`)
`getMe, updateMe, updatePreferences, changePassword, searchUsers, getUser`. Public user shape from `getUser`/`searchUsers`: `{_id, name, email, avatarUrl, headline}`.

### project/project.service.js (named async exports; `actor` = `req.user` `{id,email}`; all throw ApiError)
- `listProjects(userId, {q, status, role, page, limit}) -> {items, total}`
- `createProject(actor, {name, key, description, visibility}) -> project` (409 on key clash; seeds members with owner; logs `project.created`)
- `updateProject(projectId, actor, patch) -> project`
- `deleteProject(projectId) -> void` (cascades Task, Comment, Activity)
- `listMembers(project) -> members[]` (project = `req.project`)
- `addMember(projectId, actor, actorRole, {email, role}) -> members[]` (404 unknown email, 409 already member)
- `updateMemberRole(projectId, actor, actorRole, targetUserId, role) -> members[]`
- `removeMember(projectId, actor, actorRole, targetUserId) -> void` (unassigns that user's tasks)
- `transferOwnership(projectId, actor, newOwnerId) -> project`
- `listActivity(projectId, {page, limit}) -> {items, total}`

### project/project.controller.js (named exports)
`list, create, get, update, remove, listMembers, addMember, updateMember, removeMember, transferOwnership, activity`.

### task/task.service.js (named async exports; `actor` = `req.user`; `role` = `req.projectRole`)
- `listTasks(projectId, query) -> {items, total}`
- `createTask(projectId, actor, body) -> task` (atomic `$inc counts.seq` on Project, builds `key`, rank = last rank in column + 1024, counts.tasks++, logs)
- `getBoard(projectId, {assigneeId, label}, actor) -> {todo:[],in_progress:[],review:[],done:[]}` (each sorted by rank)
- `myTasks(userId, {status, overdue, page, limit}) -> {items, total}`
- `getTask(taskId) -> task`
- `updateTask(taskId, actor, body) -> task` (checks `version`; bumps version; assignee must be a project member)
- `deleteTask(taskId, actor, role) -> void` (member must be reporter; also deletes comments; updates counts)
- `moveTask(taskId, actor, {status, beforeTaskId, afterTaskId}) -> task` (rank = midpoint of neighbours; sets/clears completedAt; adjusts counts.done)
- `assignTask(taskId, actor, assigneeId|null) -> task`
- `taskActivity(taskId, {page, limit}) -> {items, total}`
- `duplicateTask(taskId, actor) -> task` (title "Copy of ...", status todo)
- Services load the Project themselves when needed; they do not rely on `req.project`.

### task/task.controller.js (named exports)
`list, create, board, mine, get, update, remove, move, assign, activity, duplicate`.

### comment and dashboard
No exports besides the default router. They import `Comment`, `Task`, `Project`, `Activity`, `User`-free; Task `commentCount` updated with `Task.updateOne({_id}, {$inc:{commentCount:±1}})`; activity via `Activity.log`.

### Shared conventions
- Controllers: `export const fn = asyncHandler(async (req,res) => { ...; ok(res, data, meta) })`; read `req.valid.body|query|params`, `req.user`, `req.project`, `req.projectRole`.
- List handlers return `ok(res, items, pageMeta(page, limit, total))`.
- Returned docs are `.lean()` objects or `toJSON` docs; ids are strings in responses via default toJSON.
- Activity summaries are plain sentences, e.g. `Ada moved WEB-12 to review`.

---

## j) Mount table (app.js)

Middleware order: `cors({origin: env.clientOrigins, credentials:false})`, `express.json({limit:'1mb'})`, `morgan(env.isProd ? 'combined' : 'dev')`, routes, `notFound`, `errorHandler`.

| Prefix | Router |
|---|---|
| /api/health | inline handler in app.js |
| /api/auth | auth.routes.js |
| /api/users | user.routes.js |
| /api/dashboard | dashboard.routes.js |
| /api/projects | project.routes.js |
| /api | task.routes.js (declares /projects/:projectId/tasks, /projects/:projectId/board, /tasks/...) |
| /api | comment.routes.js (declares /tasks/:taskId/comments, /comments/:commentId) |

Mount `/api/projects` before the two `/api` routers; unmatched project paths fall through to them. Every router except auth applies `router.use(auth)` at the top (task/comment routers: `router.use(auth)` is safe because they are mounted last-before-notFound and only declare authenticated paths).
