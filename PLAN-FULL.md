# PLAN-FULL: Project Manager Suite server (MERN, Express 5, Mongoose 9, ESM, plain JS)

Schema source of truth: `docs/02-mongodb-schema.md` (62 collections). Workers read the table for their own collections for exact fields, enums, defaults, indexes. This plan fixes names, paths, signatures and ownership only. No tests, no client code. Where this plan and the schema disagree on a field name, the schema wins; where this plan lists an ADDITION, add it.

Conventions (all groups)
- ESM, `import ... from '...js'` with explicit `.js`. Named exports for helpers, default export for models and routers.
- Mongoose model name = PascalCase singular export name (table in section c). Always pass explicit collection name as 3rd arg: `mongoose.model('Issue', schema, 'issues')`. Use `mongoose.models.X || mongoose.model(...)` is NOT needed (ESM loads once).
- IDs in routes are ObjectId strings; validate with `objectId` from `utils/helpers.js`.
- Handlers: `export const name = asyncHandler(async (req,res) => {...})`. Validated input is at `req.valid.body|query|params` (set by `validate`). Controllers call services; services never touch `req/res`.
- Express 5 route syntax: no `*` wildcards, no `(.*)`; use `/:name` params only; routers use `Router({ mergeParams: true })` when nested.
- Every project-scoped query includes `projectId` in the filter (project isolation). No module may join across projects, except `my-work` (G7) which queries by `assigneeId` across projects the user can access.
- Never log or store prompt text, password, or raw tokens.
- Module file layout: `src/modules/<name>/<name>.routes.js` (default export Router), `<name>.controller.js`, `<name>.service.js`, `<name>.schemas.js` (zod). A module with <3 lines of real logic may omit a service and use `utils/crud.js`.

---------------------------------------------------------------------------------------------------
## a) FILE MANIFEST

Existing files KEPT (G1 edits): `src/server.js`, `src/app.js`, `src/config/env.js`, `src/utils/http.js`, `src/utils/helpers.js`, `src/middleware/auth.js`, `src/middleware/error.js`, `package.json`.
Files DELETED by G1 at the start: `src/models/{activity,comment,project,task,user}.model.js`, `src/modules/{auth,comment,dashboard,project,task,user}/*` (old). New modules reuse the folder names `auth`, `user`, `project` (G5/G6 overwrite).

### G1 infra (owner G1)
| path | purpose |
|---|---|
| package.json | add dep `@anthropic-ai/sdk`; scripts unchanged |
| src/server.js | connect Mongo, `syncIndexes` skip, register handlers, listen |
| src/app.js | middleware + mounts (section g) |
| src/config/env.js | env table (section f) |
| src/config/constants.js | role lists, rank maps, event types, activity kinds |
| src/utils/http.js | ApiError, asyncHandler, ok, created, noContent, paged |
| src/utils/helpers.js | JWT sign/verify, hashToken, randomToken, objectId, slugify, pick |
| src/utils/pagination.js | cursor pagination |
| src/utils/rank.js | lexicographic rank helpers |
| src/utils/crud.js | generic project/org-scoped CRUD router factory |
| src/middleware/auth.js | `auth`, `authOrToken`, `optionalAuth`, `requireScope` |
| src/middleware/orgRole.js | `requireOrgRole` |
| src/middleware/projectRole.js | `requireProjectRole`, project access resolution |
| src/middleware/validate.js | `validate` (moved from error.js) |
| src/middleware/error.js | `notFound`, `errorHandler` only |
| src/services/access.service.js | role resolution used by guards and services |
| src/services/events.service.js | in-process domain event bus |
| src/services/notify.service.js | notification emitter |
| src/services/activity.service.js | projectActivity writer |
| src/services/rollup.service.js | rollup $inc upserts |
| src/services/counter.service.js | atomic counters |
| src/services/audit.service.js | audit writer |
| src/services/history.service.js | issueHistory writer (G1 so G6/G7/G8 share it) |

### G2 models: user, org, system, audit (owner G2)
`src/models/user/{users,sessions,apiTokens}.model.js`; `src/models/org/{organizations,orgMembers,orgInvites,orgJoinRequests,orgGroups}.model.js`; `src/models/system/{counters,rollups}.model.js`; `src/models/audit/auditLog.model.js`.

### G3 models: project, issue (owner G3)
`src/models/project/{projects,projectMembers,projectInvites,projectJoinRequests,projectRoles,issueTypes,priorities,resolutions,workflows,customFields,boards,sprints,releases,components,labels,savedFilters}.model.js`; `src/models/issue/{issues,issueComments,issueAttachments,issueHistory,issueLinks,worklogs}.model.js`.

### G4 models: the rest (owner G4)
`src/models/wiki/{wikiSpaces,wikiPages,wikiPageVersions}.model.js`; `src/models/dashboard/{dashboards,goals}.model.js`; `src/models/automation/{automationRules,automationRuns,webhooks,webhookDeliveries,integrations,integrationLinks}.model.js`; `src/models/servicedesk/{customers,requestTypes,slaPolicies,slaTimers,approvals}.model.js`; `src/models/modules/{testCases,testRuns,testResults,risks,budgetLines,budgetActuals,forms,formSubmissions,catEntries,catGlossaryTerms}.model.js`; `src/models/notification/{notifications,notificationPrefs,projectActivity}.model.js`; `src/models/ai/{aiDrafts,aiUsage}.model.js`.

### Models index (owner G2, written last among models, imports all fixed paths)
`src/models/index.js` re-exports every model by export name (section c). G2 owns it although it imports G3/G4 files; paths are fixed by this plan.

### G5 modules: auth, user, org
`src/modules/auth/{auth.routes,auth.controller,auth.service,auth.schemas}.js`; `src/modules/user/{user.routes,user.controller,user.service,user.schemas}.js` (profile, sessions, api tokens, notification prefs endpoints are under user); `src/modules/org/{org.routes,org.controller,org.service,org.schemas}.js` (orgs, members, invites, join requests, groups).

### G6 modules: project config
`src/modules/project/{project.routes,project.controller,project.service,project.schemas}.js` (projects, members, invites, join requests); `src/modules/roles/roles.routes.js` (uses crud + `roles.service.js` for member count); `src/modules/workflows/{workflows.routes,workflows.controller,workflows.service,workflows.schemas}.js` (workflows + `applyTransition` engine, issue types, priorities, resolutions, custom fields via crud in `projectconfig.routes.js`); `src/modules/projectconfig/projectconfig.routes.js` (issueTypes, priorities, resolutions, customFields, labels, components, savedFilters via crud); `src/modules/boards/{boards.routes,boards.controller,boards.service,boards.schemas}.js` (boards, board query, backlog query); `src/modules/sprints/{sprints.routes,sprints.controller,sprints.service,sprints.schemas}.js`; `src/modules/releases/{releases.routes,releases.controller,releases.service,releases.schemas}.js`.

### G7 modules: issues
`src/modules/issue/{issue.routes,issue.controller,issue.service,issue.schemas}.js`; `src/modules/comments/{comments.routes,comments.controller,comments.service,comments.schemas}.js`; `src/modules/attachments/{attachments.routes,attachments.controller,attachments.service,attachments.schemas}.js`; `src/modules/links/{links.routes,links.controller,links.service,links.schemas}.js`; `src/modules/worklogs/{worklogs.routes,worklogs.controller,worklogs.service,worklogs.schemas}.js`; `src/modules/history/{history.routes,history.controller}.js`; `src/modules/mywork/{mywork.routes,mywork.controller,mywork.service}.js`.

### G8 modules: everything else
`src/modules/wiki/*` (4 files + versions in service), `src/modules/dashboards/*` (dashboards + goals; goals in `goals.routes.js`), `src/modules/reports/{reports.routes,reports.controller,reports.service}.js`, `src/modules/automation/{automation.routes,automation.controller,automation.service,automation.schemas,automation.runner}.js`, `src/modules/webhooks/{webhooks.routes,webhooks.controller,webhooks.service,webhooks.schemas,webhooks.dispatcher}.js`, `src/modules/integrations/*` (4 files; includes integrationLinks), `src/modules/servicedesk/*` (4 files + `sla.ticker.js`), `src/modules/forms/*` (4 files, public submit in `forms.public.routes.js`), `src/modules/testmgmt/*` (testCases, testRuns, testResults), `src/modules/risks/*`, `src/modules/budget/*`, `src/modules/cat/*` (each: routes via crud + schemas; tests/risks/budget/cat use `utils/crud.js`, plus `testmgmt.service.js` for run result summary), `src/modules/notifications/{notifications.routes,notifications.controller,notifications.service}.js`, `src/modules/activity/{activity.routes,activity.controller}.js`, `src/modules/audit/{audit.routes,audit.controller}.js`, `src/modules/ai/{ai.routes,ai.controller,ai.service,ai.schemas,ai.client}.js`.

Ownership rule: a file path appears in exactly one group. Cross-group use only through section d exports.

---------------------------------------------------------------------------------------------------
## b) ROUTE TABLE

Base prefix `/api`. Auth column: `none`, `JWT` (auth), `JWT|PAT` (authOrToken; API token needs scope). Guards: `org:<minRole>` via `requireOrgRole`, `proj:<minRole>` via `requireProjectRole`. Role order low to high. Org: viewer < guest < member < admin < owner. Project: guest < viewer < reporter < developer < lead < admin. Handler names are in `<module>.controller.js` (or the crud factory). Schema names live in `<module>.schemas.js`. `*` = list supports cursor pagination.

### auth (G5) mount `/api/auth`
| method path | auth | guard | handler | schema |
|---|---|---|---|---|
| POST /register | none | | register | registerSchema |
| POST /login | none | | login | loginSchema |
| POST /refresh | none | | refresh | refreshSchema |
| POST /logout | JWT | | logout | refreshSchema (optional body) |
| POST /logout-all | JWT | | logoutAll | none |
| GET /me | JWT | | me | none |
| POST /change-password | JWT | | changePassword | changePasswordSchema |

### user (G5) mount `/api/users`
| GET /me | JWT | | getProfile | |
| PATCH /me | JWT | | updateProfile | updateProfileSchema |
| GET /search?q= | JWT | | searchUsers (only users sharing an org with caller) | searchQuerySchema |
| GET /me/sessions | JWT | | listSessions | |
| DELETE /me/sessions/:sessionId | JWT | | revokeSession | sessionParamSchema |
| GET /me/api-tokens | JWT | | listApiTokens | |
| POST /me/api-tokens | JWT | | createApiToken (raw token returned once) | createApiTokenSchema |
| DELETE /me/api-tokens/:tokenId | JWT | | revokeApiToken | tokenParamSchema |
| GET /me/notification-prefs | JWT | | getPrefs | |
| PUT /me/notification-prefs | JWT | | updatePrefs | updatePrefsSchema |

### org (G5) mount `/api/orgs`
| GET / | JWT | | listMyOrgs | |
| POST / | JWT | | createOrg (creator becomes owner) | createOrgSchema |
| GET /:orgId | JWT | org:guest | getOrg | |
| PATCH /:orgId | JWT | org:admin | updateOrg | updateOrgSchema |
| DELETE /:orgId | JWT | org:owner | deleteOrg (soft: status) | |
| GET /:orgId/members* | JWT | org:member | listMembers | |
| PATCH /:orgId/members/:userId | JWT | org:admin | changeMemberRole (cannot demote last owner; only owner sets owner) | changeOrgRoleSchema |
| DELETE /:orgId/members/:userId | JWT | org:admin (self allowed) | removeMember | |
| GET /:orgId/invites | JWT | org:admin | listInvites | |
| POST /:orgId/invites | JWT | org:admin | createInvite | createOrgInviteSchema |
| DELETE /:orgId/invites/:inviteId | JWT | org:admin | revokeInvite | |
| POST /invites/accept | JWT | | acceptInvite (token in body) | acceptInviteSchema |
| GET /:orgId/join-requests | JWT | org:admin | listJoinRequests | |
| POST /:orgId/join-requests | JWT | | createJoinRequest (by org slug/id) | createJoinRequestSchema |
| POST /:orgId/join-requests/:requestId/decide | JWT | org:admin | decideJoinRequest | decideSchema |
| GET,POST /:orgId/groups ; PATCH,DELETE /:orgId/groups/:id | JWT | org:member read / org:admin write | crud (makeOrgCrud) | createOrgGroupSchema, updateOrgGroupSchema |

### projects (G6) mount `/api`
| GET /orgs/:orgId/projects* | JWT | org:guest | listOrgProjects (only projects caller can access) | listProjectsQuerySchema |
| POST /orgs/:orgId/projects | JWT | org:member | createProject (seeds default roles, issueTypes, priorities, resolutions, workflow, board, counter) | createProjectSchema |
| GET /projects/personal | JWT | | listPersonalProjects | |
| POST /projects/personal | JWT | | createPersonalProject (orgId null, private) | createProjectSchema |
| GET /projects/:projectId | JWT | proj:guest | getProject | |
| PATCH /projects/:projectId | JWT | proj:admin | updateProject | updateProjectSchema |
| DELETE /projects/:projectId | JWT | proj:admin | archiveProject | |
| GET /projects/:projectId/members* | JWT | proj:viewer | listProjectMembers | |
| POST /projects/:projectId/members | JWT | proj:admin | addProjectMember (org member only, unless guest invite) | addProjectMemberSchema |
| PATCH /projects/:projectId/members/:userId | JWT | proj:admin | changeProjectRole | changeProjectRoleSchema |
| DELETE /projects/:projectId/members/:userId | JWT | proj:admin (self allowed) | removeProjectMember | |
| GET,POST /projects/:projectId/invites ; DELETE .../invites/:inviteId | JWT | proj:admin | list/create/revokeProjectInvite | createProjectInviteSchema |
| POST /projects/invites/accept | JWT | | acceptProjectInvite | acceptInviteSchema |
| GET,POST /projects/:projectId/join-requests | JWT | admin list / any JWT create | list/createProjectJoinRequest | createJoinRequestSchema |
| POST /projects/:projectId/join-requests/:requestId/decide | JWT | proj:admin | decideProjectJoinRequest | decideSchema |

### roles (G6) `/api/projects/:projectId/roles` crud: GET/POST proj:viewer/proj:admin; GET/PATCH/DELETE `/:id` admin write (system roles cannot be deleted; delete blocked while memberCount>0). Schemas createRoleSchema, updateRoleSchema.

### projectconfig (G6) all `crud` under `/api/projects/:projectId/<seg>` (GET list/one proj:viewer, POST/PATCH proj:lead, DELETE proj:admin; savedFilters: any proj:reporter may write own, delete own):
`issue-types` (issueTypes), `priorities`, `resolutions`, `custom-fields` (customFields), `labels` (reporter may create), `components`, `saved-filters` (savedFilters). Schemas `create<Name>Schema`/`update<Name>Schema`, e.g. createIssueTypeSchema, createLabelSchema.

### workflows (G6) `/api/projects/:projectId/workflows`
| GET / , GET /:workflowId | JWT | proj:viewer | listWorkflows, getWorkflow | |
| POST / | JWT | proj:admin | createWorkflow | createWorkflowSchema |
| PATCH /:workflowId | JWT | proj:admin | updateWorkflow (draft edit) | updateWorkflowSchema |
| POST /:workflowId/publish | JWT | proj:admin | publishWorkflow (validates statuses/transitions, audit) | |
| DELETE /:workflowId | JWT | proj:admin | deleteWorkflow (not if in use) | |

### boards (G6) `/api/projects/:projectId`
| GET,POST /boards ; GET,PATCH,DELETE /boards/:boardId | JWT | viewer read / lead write | boards CRUD | createBoardSchema, updateBoardSchema |
| GET /boards/:boardId/issues | JWT | proj:viewer | getBoardIssues (columns by status, swimlanes, filter by sprint/quick filters) | boardQuerySchema |
| GET /backlog* | JWT | proj:viewer | getBacklog (issues with no sprint or in future sprints, rank order) | backlogQuerySchema |
| PATCH /issues/:issueId/rank | JWT | proj:developer | rankIssue (body: beforeId/afterId, sprintId) | rankIssueSchema |

### sprints (G6) `/api/projects/:projectId/sprints`
| GET /* , GET /:sprintId | JWT | viewer | listSprints, getSprint | |
| POST / | JWT | lead | createSprint | createSprintSchema |
| PATCH /:sprintId | JWT | lead | updateSprint | updateSprintSchema |
| POST /:sprintId/start | JWT | lead | startSprint (only one active per board; sets dates, snapshots committed points) | startSprintSchema |
| POST /:sprintId/complete | JWT | lead | completeSprint (body: carryOver: 'backlog' or nextSprintId; moves unresolved issues, records velocity) | completeSprintSchema |
| DELETE /:sprintId | JWT | lead | deleteSprint (future only; issues return to backlog) | |

### releases (G6) `/api/projects/:projectId/releases`
GET /*, GET /:releaseId (viewer); POST / , PATCH /:releaseId (lead); POST /:releaseId/ship (lead; sets shippedAt, emits release.shipped); DELETE (lead). Schemas createReleaseSchema, updateReleaseSchema.

### issues (G7) `/api/projects/:projectId/issues`
| GET /* | JWT|PAT | proj:viewer | listIssues (filters: status, assignee, sprint, epic, label, type, text, jql-lite saved filter id) | listIssuesQuerySchema |
| POST / | JWT|PAT | proj:reporter | createIssue | createIssueSchema |
| GET /:issueId | JWT|PAT | proj:viewer | getIssue (also accepts key like PAY-12 via `GET /by-key/:key` registered before) | |
| GET /by-key/:key | JWT|PAT | proj:viewer | getIssueByKey | |
| PATCH /:issueId | JWT|PAT | proj:developer (reporter may edit own) | updateIssue (field diff, history, version check) | updateIssueSchema |
| POST /:issueId/transition | JWT|PAT | proj:developer | transitionIssue | transitionSchema |
| DELETE /:issueId | JWT | proj:lead | deleteIssue | |
| POST /bulk | JWT | proj:developer | bulkUpdate (max 100 ids) | bulkUpdateSchema |
| GET /:issueId/history* | JWT | proj:viewer | listHistory | |
| GET /:issueId/children | JWT | proj:viewer | listChildren | |

### comments (G7) `/api/projects/:projectId/issues/:issueId/comments`
GET /* (viewer; internal comments hidden from roles below developer when `internal`), POST / (reporter; mentions notify), PATCH /:commentId (author or lead), DELETE /:commentId (author or lead). Schemas createCommentSchema, updateCommentSchema.

### attachments (G7) `/api/projects/:projectId/issues/:issueId/attachments`
GET / (viewer); POST /upload-url (developer; returns `{storageKey, uploadUrl, expiresAt}` HMAC-signed placeholder); POST / (developer; registers metadata with storageKey); GET /:attachmentId/download-url (viewer; signed placeholder); DELETE /:attachmentId (uploader or lead). Schemas uploadUrlSchema, createAttachmentSchema.

### links (G7) `/api/projects/:projectId/issues/:issueId/links`
GET / (viewer), POST / (developer; body targetIssueId must be in SAME project else 422; both directions derived), DELETE /:linkId (developer). Schema createLinkSchema.

### worklogs (G7) `/api/projects/:projectId/issues/:issueId/worklogs`
GET / (viewer), POST / (developer; $inc issue.spentSec, adjusts remaining), PATCH /:worklogId (author or lead; delta applied), DELETE /:worklogId (author or lead). Schemas createWorklogSchema, updateWorklogSchema. Also `GET /api/projects/:projectId/worklogs*` (viewer, timesheet by user and date range, `timesheetQuerySchema`).

### my-work (G7) `/api/my-work`
GET /issues* (JWT; assigned or reported by caller across accessible projects; the only cross-project read), GET /worklogs* (caller). Schema myWorkQuerySchema.

### wiki (G8) `/api/projects/:projectId/wiki`
| GET,POST /spaces ; PATCH,DELETE /spaces/:spaceId | JWT | viewer / lead | spaces CRUD | createSpaceSchema |
| GET /pages* , GET /pages/:pageId | JWT | viewer | listPages (tree via parentId), getPage | |
| POST /pages | JWT | developer | createPage | createPageSchema |
| PATCH /pages/:pageId | JWT | developer | updatePage (writes wikiPageVersions; body.version check -> 409) | updatePageSchema |
| DELETE /pages/:pageId | JWT | lead | deletePage | |
| GET /pages/:pageId/versions* , GET /pages/:pageId/versions/:versionId | JWT | viewer | listVersions, getVersion | |
| POST /pages/:pageId/versions/:versionId/restore | JWT | developer | restoreVersion | |

### dashboards + goals (G8) `/api/projects/:projectId`
GET,POST /dashboards ; GET,PATCH,DELETE /dashboards/:dashboardId (viewer read; reporter create; owner or lead edit/delete; schemas createDashboardSchema, updateDashboardSchema). GET,POST /goals ; GET,PATCH,DELETE /goals/:goalId (viewer / lead; createGoalSchema, updateGoalSchema); POST /goals/:goalId/progress (developer; progressSchema).

### reports (G8) `/api/projects/:projectId/reports` (all GET, proj:viewer, from rollups)
`/summary` (counts by status/type), `/created-vs-resolved`, `/burndown?sprintId=`, `/velocity`, `/time-spent`, `/workload`. Handlers getSummary, getCreatedVsResolved, getBurndown, getVelocity, getTimeSpent, getWorkload. Schema reportQuerySchema.

### automation (G8) `/api/projects/:projectId/automation`
GET,POST /rules ; GET,PATCH,DELETE /rules/:ruleId (viewer / admin); POST /rules/:ruleId/toggle (admin); POST /rules/:ruleId/run (admin; manual test run on given issueId); GET /rules/:ruleId/runs* (viewer); GET /runs* (viewer). Schemas createRuleSchema, updateRuleSchema, manualRunSchema.

### webhooks (G8) `/api/projects/:projectId/webhooks`
GET,POST / ; GET,PATCH,DELETE /:webhookId (admin; secret returned once on create, stored as given for HMAC signing, never listed); POST /:webhookId/test (admin; sends ping); GET /:webhookId/deliveries* (admin); POST /:webhookId/deliveries/:deliveryId/redeliver (admin). Schemas createWebhookSchema, updateWebhookSchema.

### integrations (G8) `/api/projects/:projectId/integrations`
GET,POST / ; GET,PATCH,DELETE /:integrationId (admin; store config only, no OAuth; `status` set by `POST /:integrationId/connect` and `/disconnect`, admin, no network). GET,POST `/:integrationId/links` ; DELETE `/:integrationId/links/:linkId` (developer; ties an issue to an external ref). Schemas createIntegrationSchema, updateIntegrationSchema, createIntegrationLinkSchema.

### servicedesk (G8) `/api/projects/:projectId/servicedesk`
GET,POST /customers ; PATCH,DELETE /customers/:id (viewer / developer) ; GET,POST /request-types ; PATCH,DELETE /request-types/:id (viewer / lead) ; GET,POST /sla-policies ; PATCH,DELETE /sla-policies/:id (viewer / lead) ; GET /sla-timers* (viewer); POST /sla-timers/:timerId/pause and /resume (developer); GET /issues/:issueId/approvals (viewer); POST /issues/:issueId/approvals (developer; request approvers); POST /approvals/:approvalId/decide (the approver only; approve/decline; emits approval.decided; may auto-transition). Schemas createCustomerSchema, createRequestTypeSchema, createSlaPolicySchema, createApprovalSchema, decideApprovalSchema. Public portal submit lives in forms (below).

### forms (G8) `/api/projects/:projectId/forms`
GET,POST / ; GET,PATCH,DELETE /:formId (viewer / lead; createFormSchema, updateFormSchema); GET /:formId/submissions* (developer). Public: `POST /api/public/forms/:publicKey/submit` (none; rate-limited in-memory 10/min/IP; validates answers against form fields; creates issue via G7 `createIssueInternal` with reporter null, `formSubmissions` row links issueId) schema submitFormSchema; `GET /api/public/forms/:publicKey` (none; returns public form definition).

### modules via crud (G8) under `/api/projects/:projectId/<seg>`: GET list/one proj:viewer, POST/PATCH proj:developer, DELETE proj:lead:
`test-cases` (testCases), `test-runs` (testRuns; plus `POST /test-runs/:id/complete` computing summary), `test-runs/:runId/results` (testResults; POST upserts result per testCaseId), `risks`, `budget-lines` (budgetLines), `budget-actuals` (budgetActuals), `cat-entries` (catEntries), `cat-glossary` (catGlossaryTerms). Schemas `create<Name>Schema`/`update<Name>Schema` (createTestCaseSchema, createTestRunSchema, createTestResultSchema, createRiskSchema, createBudgetLineSchema, createBudgetActualSchema, createCatEntrySchema, createCatTermSchema). Also `GET /budget-lines/summary` (planned vs actual).

### notifications (G8) `/api/notifications`
GET /* (JWT; filter unread, projectId), GET /unread-count, POST /:notificationId/read, POST /read-all (optional body projectId). Schema listNotificationsQuerySchema.

### activity (G8) `/api/projects/:projectId/activity`
GET /* (proj:viewer; cursor on `at`+`_id`, filter kind). Schema activityQuerySchema.

### audit (G8)
GET `/api/orgs/:orgId/audit*` (org:admin), GET `/api/projects/:projectId/audit*` (proj:admin). Filters actorId, action, from, to. Schema auditQuerySchema. Write path is the G1 service only.

### ai (G8) `/api/ai`
| POST /drafts | JWT | proj:reporter (projectId in body, checked in service) | createDraft (kinds: issueFromText, summarize, subtasks, wikiOutline; 503 `{message:'AI not configured'}` if no key; 429 when daily cap reached) | createDraftSchema |
| GET /drafts* | JWT | | listMyDrafts (never returns prompt; none stored) | |
| GET /drafts/:draftId | JWT | owner only | getDraft | |
| POST /drafts/:draftId/accept | JWT | owner + proj:reporter | acceptDraft (applies via issue service for issueFromText/subtasks, sets status accepted, activity `aiCreated:true`) | acceptDraftSchema (edits) |
| POST /drafts/:draftId/discard | JWT | owner | discardDraft | |
| GET /usage | JWT | | getUsage (aiUsage for caller, today and month) | |

Health: `GET /api/health` stays in app.js.

---------------------------------------------------------------------------------------------------
## c) MODEL INDEX

All paths under `src/models/`. File = `<domain>/<collection>.model.js`, default export the model, also re-exported by name from `models/index.js`. Model name = export name; collection = table name. "Refs" are ObjectId `ref` targets (use string model names; no import needed between model files).

| file | export | collection | refs |
|---|---|---|---|
| user/users | User | users | |
| user/sessions | Session | sessions | User |
| user/apiTokens | ApiToken | apiTokens | User, Organization, Project |
| org/organizations | Organization | organizations | User |
| org/orgMembers | OrgMember | orgMembers | Organization, User, OrgGroup |
| org/orgInvites | OrgInvite | orgInvites | Organization, User |
| org/orgJoinRequests | OrgJoinRequest | orgJoinRequests | Organization, User |
| org/orgGroups | OrgGroup | orgGroups | Organization, User |
| project/projects | Project | projects | Organization, User |
| project/projectMembers | ProjectMember | projectMembers | Project, User, ProjectRole |
| project/projectInvites | ProjectInvite | projectInvites | Project, User |
| project/projectJoinRequests | ProjectJoinRequest | projectJoinRequests | Project, User |
| project/projectRoles | ProjectRole | projectRoles | Project |
| project/issueTypes | IssueType | issueTypes | Project |
| project/priorities | Priority | priorities | Project |
| project/resolutions | Resolution | resolutions | Project |
| project/workflows | Workflow | workflows | Project, IssueType |
| project/customFields | CustomField | customFields | Project |
| project/boards | Board | boards | Project, Workflow |
| project/sprints | Sprint | sprints | Project, Board |
| project/releases | Release | releases | Project |
| project/components | Component | components | Project, User |
| project/labels | Label | labels | Project |
| project/savedFilters | SavedFilter | savedFilters | Project, User |
| issue/issues | Issue | issues | Project, Organization, IssueType, User, Sprint, Release, Component, Label |
| issue/issueComments | IssueComment | issueComments | Issue, User |
| issue/issueAttachments | IssueAttachment | issueAttachments | Issue, User |
| issue/issueHistory | IssueHistory | issueHistory | Issue, User |
| issue/issueLinks | IssueLink | issueLinks | Issue |
| issue/worklogs | Worklog | worklogs | Issue, User |
| wiki/wikiSpaces | WikiSpace | wikiSpaces | Project |
| wiki/wikiPages | WikiPage | wikiPages | WikiSpace, User |
| wiki/wikiPageVersions | WikiPageVersion | wikiPageVersions | WikiPage, User |
| dashboard/dashboards | Dashboard | dashboards | Project, User |
| dashboard/goals | Goal | goals | Project, User |
| automation/automationRules | AutomationRule | automationRules | Project, User |
| automation/automationRuns | AutomationRun | automationRuns | AutomationRule, Issue |
| automation/webhooks | Webhook | webhooks | Project |
| automation/webhookDeliveries | WebhookDelivery | webhookDeliveries | Webhook |
| automation/integrations | Integration | integrations | Project |
| automation/integrationLinks | IntegrationLink | integrationLinks | Integration, Issue |
| servicedesk/customers | Customer | customers | Project |
| servicedesk/requestTypes | RequestType | requestTypes | Project, IssueType |
| servicedesk/slaPolicies | SlaPolicy | slaPolicies | Project |
| servicedesk/slaTimers | SlaTimer | slaTimers | Issue, SlaPolicy |
| servicedesk/approvals | Approval | approvals | Issue, User |
| modules/testCases | TestCase | testCases | Project |
| modules/testRuns | TestRun | testRuns | Project |
| modules/testResults | TestResult | testResults | TestRun, TestCase |
| modules/risks | Risk | risks | Project |
| modules/budgetLines | BudgetLine | budgetLines | Project |
| modules/budgetActuals | BudgetActual | budgetActuals | BudgetLine |
| modules/forms | Form | forms | Project, IssueType |
| modules/formSubmissions | FormSubmission | formSubmissions | Form, Issue |
| modules/catEntries | CatEntry | catEntries | Project |
| modules/catGlossaryTerms | CatGlossaryTerm | catGlossaryTerms | Project |
| notification/notifications | Notification | notifications | User, Project |
| notification/notificationPrefs | NotificationPref | notificationPrefs | User |
| notification/projectActivity | ProjectActivity | projectActivity | Project |
| ai/aiDrafts | AiDraft | aiDrafts | User, Project |
| ai/aiUsage | AiUsage | aiUsage | User |
| audit/auditLog | AuditLog | auditLog | |
| system/counters | Counter | counters | |
| system/rollups | Rollup | rollups | Project (ADDITION, see below) |

Model rules
- Each file: `import mongoose from 'mongoose'; const schema = new mongoose.Schema({...}, {timestamps?: per table, versionKey:false unless noted}); indexes from the table via `schema.index(...)`; `export default mongoose.model(Name, schema, collection)`.
- TTL: `schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })` on sessions, automationRuns, webhookDeliveries, notifications, aiDrafts, auditLog.
- projectActivity: `new Schema({...}, { timeseries: { timeField: 'at', metaField: 'projectId', granularity: 'hours' }, autoCreate: true, versionKey: false })`. Timeseries documents are immutable-ish and cannot hold meta updates; written only via `insertOne`; no `_id` uniqueness reliance. Retention via env `ACTIVITY_RETENTION_DAYS` applied as `expireAfterSeconds` in the timeseries option (G4 reads env).
- counters: `_id` String, `seq` Number, `updatedAt`.
- ADDITIONS (not in the schema, required by plan): `sessions.refreshHash` (String, unique, index), `sessions.prevRefreshHash` (String, for reuse detection), `sessions.userAgent` fallback via device/browser fields; `rollups` collection: `{ _id: String "projectId:yyyy-mm-dd", projectId, orgId, date: Date (UTC day), counts: Mixed }`, index `{projectId:1, date:1}`; `issues` schema option `optimisticConcurrency: true` (versionKey `__v`) for atomic version checks; `webhooks.secret` select:false.
- Enums: copy from table exactly. Defaults: copy from table. If a table says a field is Mixed/Object, use `Schema.Types.Mixed`.
- `models/index.js` (G2): `export { default as User } from './user/users.model.js';` one line per model, all 63 names in section c.

---------------------------------------------------------------------------------------------------
## d) EXPORT CONTRACTS (cross-file imports, exact names)

All paths relative to `src/`. Types in JSDoc-like notation.

### config/env.js (G1) - `export const env`
`{ port, nodeEnv, isProd, mongoUri, jwtSecret, accessTtl ('15m'), refreshTtlDays (30), clientOrigins[], anthropicApiKey (string|''), aiModel ('claude-haiku-5-5'), aiDailyCallLimit (number), uploadSigningSecret, uploadUrlTtlSec, webhookTimeoutMs, activityRetentionDays, publicBaseUrl }`.

### config/constants.js (G1)
`ORG_ROLES = ['owner','admin','member','guest','viewer']`; `ORG_ROLE_RANK = {viewer:1,guest:2,member:3,admin:4,owner:5}`; `PROJECT_ROLES = ['admin','lead','developer','reporter','viewer','guest']`; `PROJECT_ROLE_RANK = {guest:1,viewer:2,reporter:3,developer:4,lead:5,admin:6}`; `EVENT_TYPES = ['issue.created','issue.updated','issue.transitioned','issue.deleted','comment.added','sprint.started','sprint.completed','member.added','member.removed','release.shipped','page.updated','form.submitted','approval.decided']`; `ACTIVITY_KINDS` (= enum from projectActivity table); `DEFAULT_PROJECT_ROLE_PERMISSIONS` (map role -> permission strings used when seeding projectRoles).

### utils/http.js (G1)
`class ApiError extends Error { constructor(statusCode, message, errors?) }`; `asyncHandler(fn) -> RequestHandler`; `ok(res, data=null, meta?)`; `created(res, data, meta?)`; `noContent(res)` (200 `{success:true,data:null}` to keep envelope); `paged(res, items, pageMeta)` = ok(res, items, pageMeta). Envelope `{success:true,data,meta}` / `{success:false,message,errors}`.

### utils/helpers.js (G1)
`signAccessToken({id,email}) -> string` (15m, HS256, claims `sub`,`email`,`typ:'access'`); `verifyAccessToken(token) -> {sub,email}`; `hashToken(raw) -> sha256 hex`; `randomToken(bytes=32) -> base64url string`; `objectId` (zod string 24-hex); `slugify(str) -> string`; `pick(obj, keys) -> object`; `escapeRegex(str)`; `isoDay(date=new Date()) -> Date at UTC midnight`. REMOVED: `signToken`, `verifyToken`, `parsePagination`, `pageMeta` (use utils/pagination.js).

### utils/pagination.js (G1)
- `parsePageQuery(query, { defaultLimit=25, maxLimit=100 }) -> { limit, cursor (string|null) }`
- `pageQuerySchema` (zod: `limit` coerced 1..100, `cursor` string optional), spread into other query schemas via `.extend`.
- `paginate(Model, filter, { sort = {_id:-1}, cursorField = '_id', limit, cursor, select, populate, lean = true }) -> Promise<{ items, meta }>` where `meta = { limit, count, hasMore, nextCursor }`. Cursor is opaque base64url of `{v: lastValueOfCursorField, id: lastId}`; direction follows sort sign of `cursorField`; works for `_id`, `rank` (string, tie-break `_id`), `at`, `createdAt`. Fetches `limit+1`.
- `encodeCursor(obj) / decodeCursor(str)` (throws ApiError 400 on garbage).
- `withTotal` is not provided; no total counts by default (`meta.total` only if caller passes `{ countTotal: true }`).

### utils/rank.js (G1)
`rankBetween(prev: string|null, next: string|null) -> string` (lexicographic base-36 midpoint, min length growth); `rankAfter(last: string|null) -> string`; `INITIAL_RANK = 'm'`.

### utils/crud.js (G1)
```
makeProjectCrud({
  Model,                        // mongoose model with projectId (and orgId if present)
  name,                         // string for audit action prefix, e.g. 'label'
  createSchema, updateSchema,   // zod objects (body)
  listQuerySchema?,             // zod; pageQuerySchema extended
  filterFields?: string[],      // query keys copied into the filter (exact match)
  searchFields?: string[],      // ?q= regex over these
  sort?: object,                // default {_id:-1}; supports {rank:1}
  roles?: { read='viewer', create='developer', update='developer', remove='lead' },
  ownerField?: string,          // if set, update/remove allowed to the doc owner regardless of role
  beforeCreate?: async (req, body) -> body,   // may add computed fields; must not add projectId
  afterWrite?: async (req, doc, action: 'create'|'update'|'delete') -> void,
  beforeDelete?: async (req, doc) -> void      // throw ApiError to block
}) -> express.Router   // Router({mergeParams:true}); routes: GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
makeOrgCrud({ same options but scoped by req.params.orgId, roles use org roles: {read='member', create='admin', update='admin', remove='admin'} })
```
Router applies `auth` (callers mount behind `authOrToken` if desired by passing `authMiddleware` option, default `auth`), the role guards, `validate`, scopes every filter and every update by `projectId` from `req.project._id` (never from body), strips `projectId`, `orgId`, `_id` from bodies, writes audit via `writeAudit` for create/update/delete, returns `{success,data}`; list returns cursor meta. Update uses `findOneAndUpdate({_id, projectId}, {$set}, {new:true, runValidators:true})`.

### middleware/auth.js (G1)
- `auth(req,res,next)`: Bearer JWT only; sets `req.user = { id: string, email }`; 401 on fail.
- `authOrToken(req,res,next)`: Bearer starting with `pmk_` is an API token (hash lookup in ApiToken, not revoked/expired, updates lastUsedAt/Ip fire-and-forget) -> `req.user = {id, email: null}`, `req.apiToken = { id, scopes, orgId, projectId }`; otherwise falls through to JWT logic.
- `optionalAuth` (sets req.user if valid, never errors).
- `requireScope(scope: string)`: passes for JWT users; for API tokens requires `scopes` include scope or `*`, and token's projectId/orgId (if set) equal the route's project/org (`req.project`).

### middleware/orgRole.js (G1)
`requireOrgRole(minRole: 'viewer'|'guest'|'member'|'admin'|'owner')` -> middleware; reads `req.params.orgId`; loads OrgMember; sets `req.org` (lean Organization), `req.orgRole` (string), 403/404 otherwise. Also exports `ORG_ROLE_RANK` re-export not needed.

### middleware/projectRole.js (G1)
`requireProjectRole(minRole: 'guest'|'viewer'|'reporter'|'developer'|'lead'|'admin')` -> middleware; reads `req.params.projectId`; uses `getProjectAccess`; sets `req.project` (lean), `req.projectRole` (system role string; custom roles are mapped to their `baseRole`/closest rank by permission count: if the ProjectRole has `permissions`, rank = the highest system role whose default permission set is a subset), `req.projectPerms` (string[]), `req.projectOrgRole` (string|null). 404 if project missing or caller has no access (do not reveal personal projects), 403 if rank too low. Archived project: writes (non-GET) blocked with 409 unless role admin and path ends `/restore`.
`hasPerm(req, 'issue.create') -> boolean` for fine checks in services.

### middleware/validate.js (G1)
`validate(schema, source='body'|'query'|'params') -> middleware`; stores in `req.valid[source]`; on fail ApiError(422,'Validation failed',[{path,message}]). Express 5 note: `req.query` is read-only getter; never assign to it.

### middleware/error.js (G1)
`notFound`, `errorHandler` (unchanged behavior; add `ZodError`-free; keep CastError/ValidationError/11000/JWT mapping).

### services/access.service.js (G1)
- `getOrgRole(userId, orgId) -> Promise<string|null>` (OrgMember.role, status active)
- `getProjectAccess(userId, projectId) -> Promise<null | { project, role, rank, perms, orgRole }>`: personal project (orgId null) only for `ownerId`; membership row in ProjectMember wins; org owner/admin get `role:'admin'` implicitly for org projects; org member of a project with `visibility:'org'` (if schema has it) gets `viewer`; otherwise null.
- `listAccessibleProjectIds(userId) -> Promise<ObjectId[]>` (for my-work)
- `assertSameProject(ModelOrDoc..)` not provided; use plain filters.

### services/events.service.js (G1)
`emitEvent(event) -> void` where `event = { type: EVENT_TYPES[number], orgId, projectId, actorId, issueId?, issue? (lean snapshot), changes? ({field:{from,to}}), payload?: object, at: Date }`. Fire-and-forget: handlers run via `setImmediate`, errors caught and `console.error`ed, never thrown into callers. `onEvent(handler: (event)=>Promise|void) -> void` registers a handler. Handlers registered at boot by G8.

### services/notify.service.js (G1)
`notify({ userIds: ObjectId[]|string[], type, title, body?, projectId?, orgId?, link?: {kind, id, key?}, actorId? }) -> Promise<void>`: skips `actorId` from recipients, dedups, respects NotificationPref (in-app channel flags), inserts via `Notification.insertMany` with `expireAt` +90 days. `notifyMentions(text, ctx) -> Promise<ObjectId[]>` parses `@email` / `@[userId]` mentions in text, restricted to project members, calls notify, returns notified ids.

### services/activity.service.js (G1)
`logActivity({ projectId, orgId, kind, actor: {id,name,avatar}, item?: {id,key,title}, summary, aiCreated=false }) -> Promise<void>` (insertOne into ProjectActivity, `at: new Date()`, swallows errors). `kind` must be in ACTIVITY_KINDS.
`actorOf(userDoc|{id}) -> {id,name,avatar}` helper (loads user if only id given, cached for 60s in a Map).

### services/rollup.service.js (G1)
`bumpRollup({ projectId, orgId, date = new Date(), inc: { [metric]: number } }) -> Promise<void>` does `Rollup.updateOne({_id:`${projectId}:${yyyy-mm-dd}`}, {$setOnInsert:{projectId,orgId,date: isoDay(date)}, $inc: {'counts.<metric>': n}}, {upsert:true})`. Metric names (fixed): `created`, `resolved`, `status.<statusKey>` (signed delta), `type.<typeName>` (signed), `points.created`, `points.resolved`, `spentSec`, `comments`. Call sites: issue create (+created, +status.X, +type.T, +points.created), transition (-status.old +status.new, +resolved/-resolved when entering or leaving a done category, +points.resolved), issue delete (reverse), worklog add/edit/remove (spentSec), comment add (comments).
`getRollups({ projectId, from: Date, to: Date }) -> Promise<Array<{date, counts}>>` sorted asc (used by G8 reports).

### services/counter.service.js (G1)
`nextSeq(counterId: string) -> Promise<number>` via `Counter.findOneAndUpdate({_id}, {$inc:{seq:1}, $set:{updatedAt:now}}, {upsert:true, new:true})`. `issueCounterId(projectId) = 'project:<id>:issue'`. Export both. Other counters: `'project:<id>:sprint'`, `'org:<id>:project'` use `nextSeq` with those ids.

### services/audit.service.js (G1)
`writeAudit({ req?, orgId, projectId, action, targetType, targetId, targetName, before, after, actor? }) -> Promise<void>`; takes actor from `req.user` (name looked up via actorOf) and ip from `req.ip`; sets `at` and `expireAt = at + env.auditRetentionDays`; swallows errors. Action naming `<noun>.<verb>` e.g. `member.removed`, `workflow.published`, `role.changed`.

### services/history.service.js (G1)
`diffFields(before, after, fields: string[]) -> { [field]: {from, to} }`; `writeHistory({ issueId, projectId, actorId, changes, kind='update' }) -> Promise<void>` (one issueHistory row per call with items array per the table; skips when changes empty).

### G2 provides (models only, via models/index.js): User, Session, ApiToken, Organization, OrgMember, OrgInvite, OrgJoinRequest, OrgGroup, Counter, Rollup, AuditLog.
### G3 provides: all project/ and issue/ models.
### G4 provides: all remaining models.

### G5 exports
- `modules/auth/auth.service.js`: `registerUser({email,password,displayName}) -> {user, tokens}`, `loginUser({email,password,ip,userAgent}) -> {user, tokens}`, `refreshSession({refreshToken, ip, userAgent}) -> {tokens}`, `logoutSession({userId, refreshToken})`, `issueTokens(user, meta) -> { accessToken, refreshToken, expiresIn: 900, refreshExpiresAt }` (creates Session with `refreshHash`, `expireAt` +30d). Refresh rotation: atomic `findOneAndUpdate({refreshHash:hash(old), revokedAt:null, expireAt:{$gt:now}}, {$set:{refreshHash:new, prevRefreshHash:old, lastSeenAt:now}})`; if no match but a session has `prevRefreshHash == hash(old)` -> reuse detected: revoke all that user's sessions, 401. Password: bcryptjs cost 12. Login failure: generic 401; account `status !== 'active'` 403.
- `modules/org/org.service.js`: `ensureOrgMember(orgId, userId) -> Promise<OrgMemberDoc|null>`, `addOrgMember({orgId,userId,role,invitedBy}) -> OrgMemberDoc` (used by invite accept and G6 for guest adds), `isLastOwner(orgId,userId) -> bool`.
- `modules/user/user.service.js`: `getPublicUsers(ids: string[]) -> Promise<Map<string,{id,displayName,avatar,email}>>`.

### G6 exports
- `modules/workflows/workflows.service.js`: `getWorkflowForIssueType(projectId, issueTypeId) -> Promise<WorkflowDoc>`; `getInitialStatus(workflow) -> {key,name,category}`; `getAvailableTransitions(workflow, fromStatusKey) -> transition[]`; `applyTransition({ issue (lean), transitionId|toStatus, actorId, fields, req }) -> Promise<{ toStatus, setFields: object }>` runs validators/conditions/post-functions from the workflow doc (required fields, assignee-required, resolution-required, only-roles via `req.projectRole`) and throws `ApiError(422)` with `errors` listing failed validators; it does NOT write the issue (G7 writes).
- `modules/sprints/sprints.service.js`: `getActiveSprint(projectId, boardId?) -> doc|null`; `assertSprintInProject(projectId, sprintId) -> doc` (404 if other project).
- `modules/boards/boards.service.js`: `computeRank(projectId, {beforeId, afterId}) -> Promise<string>`; `rankIssueService(...)` (used by route).
- `modules/project/project.service.js`: `seedProjectDefaults(project, ownerId) -> Promise<void>` (roles, issueTypes, priorities, resolutions, default workflow, default board, counters); `addProjectMember({projectId,userId,roleId|role,addedBy}) -> doc` (updates `projectRoles.memberCount`); `getProjectLite(projectId) -> {key, name, orgId, ownerId}`.
- `modules/releases/releases.service.js`: `assertReleaseInProject(projectId, id) -> doc`.
- Also `modules/projectconfig/projectconfig.service.js` is NOT needed. Label/component lookups use models directly.

### G7 exports
- `modules/issue/issue.service.js`: `createIssueInternal({ projectId, reporterId|null, input, source: 'api'|'form'|'ai'|'automation', actor? }) -> Promise<IssueLean>` (numbering via `nextSeq(issueCounterId)`, key = `${project.key}-${number}`, initial status via workflow, type snapshot, rank via `rankAfter`, history row, rollup, activity `issueCreated`, `emitEvent('issue.created')`, notify assignee); `updateIssueInternal({ projectId, issueId, patch, expectedVersion?, actorId, req? }) -> IssueLean` (version-checked `findOneAndUpdate({_id,projectId,__v:expected})`, 409 on mismatch; history diff; rollups; events `issue.updated`); `transitionIssueInternal({ projectId, issueId, transitionId|toStatus, actorId, fields, req }) -> IssueLean` (uses G6 `applyTransition`, then writes; emits `issue.transitioned` and activity `statusChanged`); `getIssueInProject(projectId, issueId) -> lean|ApiError 404`; `issueSnapshot(issue) -> lean subset for events`.
- `modules/comments/comments.service.js`: `addCommentInternal({projectId, issueId, authorId, body, internal=false}) -> comment` (used by automation and approvals).
- `modules/worklogs/worklogs.service.js`: `addWorklogInternal(...)` (used by none outside; not exported contract).
- `modules/mywork/mywork.service.js`: not imported elsewhere.

### G8 exports (consumed by G1 `server.js` and G5-G7)
- `modules/automation/automation.runner.js`: `registerAutomationRunner() -> void` (calls `onEvent`; for each event loads enabled `AutomationRule`s for `projectId` with matching `trigger.type`; evaluates conditions (field equals/in, issue type, priority, labels, assignee), runs actions (set field, transition, assign, add comment, add label, send notification, call webhook), writes `AutomationRun` with `status`, `log`, `expireAt` +30d; loop guard: events carrying `payload.automationDepth >= 3` are ignored; a rule does not re-trigger itself within the same chain); `evaluateRule(rule, event) -> Promise<{matched:boolean, log:[]}>`; `runRuleManually(rule, issueId, actorId)`.
- `modules/webhooks/webhooks.dispatcher.js`: `registerWebhookDispatcher() -> void` (calls `onEvent`; selects enabled webhooks for `projectId` whose `events` include `event.type`; POST JSON with header `X-PM-Signature: sha256=<hmac of body with secret>`, `X-PM-Event`, `X-PM-Delivery`; global `fetch` with `AbortSignal.timeout(env.webhookTimeoutMs)`; records `WebhookDelivery` {status, responseCode, durationMs, error, attempt, requestBody truncated to 10KB, `expireAt` +14d}; one retry after 5s on network error/5xx; increments `webhook.failureCount`, auto-disables after 20 consecutive failures); `deliverWebhook(webhook, event, {attempt}) -> Promise<DeliveryDoc>` (also used by test and redeliver).
- `modules/servicedesk/sla.ticker.js`: `registerSlaTicker() -> void` (setInterval 60s, unref; marks timers breached, creates notifications and `issue.updated` events; also creates timers on `issue.created` via `onEvent` when a policy matches request type or priority; pauses on statuses listed in policy; stops on resolution).
- `modules/ai/ai.client.js`: `isAiConfigured() -> boolean`; `generateText({ system, user, maxTokens=1024 }) -> Promise<{ text, inputTokens, outputTokens }>`; lazy `new Anthropic({ apiKey: env.anthropicApiKey })`, model `env.aiModel`; throws `ApiError(503,'AI is not configured')` when key empty; maps SDK errors: 429 -> ApiError(429), other -> ApiError(502,'AI provider error'). `ai.service.js`: `createDraft(userId, input)` computes `promptHash = sha256(system+user)`, stores NO prompt text, stores parsed `result` (JSON), `status:'pending'`, `expireAt` +24h; `bumpAiUsage({userId, orgId, projectId, kind, inputTokens, outputTokens})` upserts `_id: `${userId}:${yyyy-mm-dd}`` with `$inc` calls, tokens, `costMicros` (estimate from per-token constants in constants), `byKind.<kind>`; daily cap `env.aiDailyCallLimit`.
- `modules/reports/reports.service.js`: reads `getRollups`, plus Issue aggregate for velocity via Sprint docs. Not imported by others.
- `modules/forms/forms.service.js`: `submitPublicForm(publicKey, answers, meta) -> {issueKey}` uses G7 `createIssueInternal`.
- `modules/notifications/notifications.service.js`: reads only; writing is G1 `notify`.

### Call-site rules (who must call what)
- Every issue/sprint/member/release/page/comment mutation: `logActivity` (G1) and `emitEvent` (G1). Issue mutations also `writeHistory` and `bumpRollup`.
- Every admin-level change (role, member add/remove, workflow publish, webhook/integration/automation change, project archive, org settings): `writeAudit`.
- Notifications: assignee change, mention, comment on watched/assigned issue, join request decisions, invites to existing users, SLA breach, approval requests and decisions, sprint start/complete to members.

---------------------------------------------------------------------------------------------------
## DOMAIN LOGIC NOTES (G5 to G8 must follow)

Auth (G5)
- Register: lowercase email unique, bcryptjs hash, creates personal workspace? No: only user plus `notificationPrefs` row defaults lazily on first read. Returns tokens. `emailVerifiedAt` stays null (no mailer; verification not enforced).
- Login rate limit: in-memory `Map` keyed email+ip, 10 attempts / 15 min, 429 after. Access token payload `{sub,email,typ:'access'}`; the old 7d token flow removed.
- `API token`: raw `pmk_<randomToken(24)>`; `tokenPrefix` = first 8 chars of raw; `tokenHash = hashToken(raw)`; allowed only on routes marked JWT|PAT.

Org (G5)
- Create org: `slug` unique via slugify with numeric suffix on clash; insert Organization then OrgMember owner (no transaction; if member insert fails, delete org).
- Invites: token = randomToken, store only `hashToken`; return raw token once in response (`acceptUrl` built from `env.publicBaseUrl`); expiry 7 days; accept requires logged-in user whose email matches invite email (case-insens) unless invite has no email; accept is a single atomic `findOneAndUpdate({_id, status:'pending'}, {status:'accepted'})` then `addOrgMember`.
- Join requests: one pending per (org,user); decide atomic on `status:'pending'`; approve adds member with requested role limited to `member`/`guest`/`viewer`.
- Role change rules: only owner can grant/revoke owner; admin can change member/guest/viewer; never remove or demote the last owner (409). Removing an org member also removes their ProjectMember rows for that org's projects and unassigns nothing (issues keep assigneeId; UI shows removed).

Project (G6)
- Project key: 2-10 uppercase letters, unique per org (personal: unique per owner). Creating org projects requires org role member+. Org owners/admins implicit project admin without a ProjectMember row (see access.service). Personal project: `orgId:null`, only owner (implicit admin), cannot add members or invites (422) in v1; join requests rejected.
- Project role changes: `roleId` may be a ProjectRole _id (custom) or a system role name; store `role` (system name) plus optional `roleId`; keep `projectRoles.memberCount` in sync with `$inc`.
- Project invites/join requests mirror org ones; accepting requires org membership unless invite `asGuest:true` (then org `guest` OrgMember is created if missing).
- Workflows: statuses `[{key,name,category: todo|inprogress|done}]`, transitions `[{id,name,from[],to,validators[],conditions[],postFunctions[]}]`; publish validates every `from/to` exists, at least one `done` status, one initial status; published workflows are versioned (`version` $inc, `publishedAt`); issues keep status key. Validators supported: `requiredField(field)`, `assigneeRequired`, `resolutionRequired`, `onlyRoles(roles[])`, `subtasksDone`. Post-functions supported: `setResolution(id)`, `clearResolution`, `assignToReporter`. Anything else rejected at publish.
- Sprint start: no other active sprint on the board (409); needs startDate/endDate; sets `status:'active'`, `committedPoints` = sum of issue points; emits `sprint.started`; notifies members. Complete: for issues in sprint with status category != done, `updateMany({projectId, sprintId, 'status.category' ...}, {$set:{sprintId: next|null}})`, record `completedPoints`, `velocity`, `carriedIssueIds count`; sprint `status:'closed'`; emits `sprint.completed`. Idempotent: a closed sprint returns 409.
- Boards: `getBoardIssues` groups by workflow column mapping; `rank` ordering; issues returned lean with assignee public user data from `getPublicUsers`. `getBacklog` = issues where sprintId null or sprint.status future, excluding done, rank asc, cursor on rank.

Issues (G7)
- Create: validates type belongs to project, parent/epic in same project (422 otherwise), hierarchy rules (subtask needs parent; epic has no parent), custom fields validated against `customFields` defs. `reporterId` = caller. Insert retries once on E11000 for `{projectId, number}`.
- Update: whitelisted fields only; changing `status` through PATCH is rejected (must use /transition). Assignee must be a project member (or null). Version check via `expectedVersion` (client sends `version`, maps to `__v`); missing version means last-write-wins on the specified fields via `$set` only.
- Delete: removes issue, comments, attachments metadata, links, worklogs, history, SLA timers for that issue (`deleteMany` by issueId, and `projectId` in filter), reverses rollups, emits `issue.deleted`.
- Links: types `blocks`, `relates`, `duplicates`, `clones`; stored once with `fromIssueId`,`toIssueId`,`projectId`; target must have same `projectId`; self-link and duplicates rejected; list returns both directions with inverse label.
- Worklogs: seconds `timeSpentSec` > 0; `$inc` issue.`spentSec`; edit applies delta; remaining estimate reduced with floor 0 when `adjustRemaining`.
- Attachments: storageKey = `projects/<projectId>/issues/<issueId>/<random>-<sanitizedName>`; signed placeholder URL = `${publicBaseUrl}/uploads/<storageKey>?exp=<ts>&sig=<hmac sha256 uploadSigningSecret>`; size cap 25MB metadata check; no bytes handled by server.
- My Work: `listAccessibleProjectIds(userId)` then `Issue.find({projectId:{$in}, assigneeId: userId, 'status.category': {$ne:'done'}})` sorted by due date then updatedAt, cursor paginated.
- Comments: markdown body max 20k chars; `internal` visibility only for proj role >= developer.

Wiki (G8): version rows created on each content update (`version` int, snapshot of title/body, editorId); page `version` check for 409; max 200 stored versions per page (delete oldest on insert). Restore creates a new version. Emits `page.updated`.
Dashboards/goals (G8): dashboards hold widget layout JSON (validated shape: id, type, config, x,y,w,h; types from table); goals have `target`, `current`, `progress` computed on read where linked metric is set.
Reports (G8): all from `rollups` (cumulative sums over date range) plus sprint docs; burndown = sprint committedPoints minus cumulative `points.resolved` in sprint dates.
Automation (G8): triggers from `EVENT_TYPES` subset (`issue.created`, `issue.updated`, `issue.transitioned`, `comment.added`, `sprint.started`); the runner only processes events whose `projectId` matches the rule's.
Service desk (G8): SLA target minutes per priority; timer fields from table; `sla.ticker` as in exports. Approvals: approver set must be project members; decision by approver only; any decline declines the approval; all approve -> approved.
Forms (G8): `publicKey` random 16 chars; submit validates required fields, honeypot field `website` must be empty, in-memory rate limit; creates issue as reporter `null` with `source:'form'`.
AI (G8): kinds and system prompts hardcoded in `ai.service.js`; model output must be JSON; parse failure -> ApiError(502). 503 before any DB write when key is missing. Drafts list never exposes `promptHash`.

Mongo / transactions
- No code path requires a transaction. Everything is single-document atomic or idempotent multi-step (create org then member with compensation; sprint complete via `updateMany` guarded by sprint status transition `active -> closed` done FIRST with `findOneAndUpdate`, so retries see closed and 409; issue numbering via `$inc` counter; version checks via `__v`).
- Optional hardening when the deployment is a replica set (documented, not implemented): wrap org create, project create + seed, and sprint complete in `session.withTransaction`. The plan does not depend on it, so a standalone `mongod` works for dev.
- `autoIndex` on in dev, `syncIndexes` not called at boot. Timeseries `projectActivity` is created via `autoCreate`.

---------------------------------------------------------------------------------------------------
## e) BUILD GROUPS (disjoint ownership, parallel-safe)

Order of dependency: G1, G2, G3, G4 (infra and models; no inter-imports except fixed names) then G5 to G8 (modules). All eight can run concurrently because every cross-file name is fixed in sections c and d. The merge step does the verification in section h.

| group | owns | must provide to others | imports from |
|---|---|---|---|
| G1 infra | all of section a "G1" | everything in section d under G1 (config, utils, middleware, services) | models/index.js (G2) for services, modules routers (mounts) |
| G2 models user/org/system/audit + models/index.js | section a "G2" + index | User, Session, ApiToken, Organization, OrgMember, OrgInvite, OrgJoinRequest, OrgGroup, Counter, Rollup, AuditLog; index.js re-exports all 63 | mongoose only |
| G3 models project/issue | section a "G3" | the 16 project and 6 issue models, with indexes | mongoose only |
| G4 models rest | section a "G4" | the remaining 29 models, TTL and timeseries config | mongoose, `config/env.js` (activity retention) |
| G5 auth/user/org | section a "G5" | `issueTokens`, `ensureOrgMember`, `addOrgMember`, `isLastOwner`, `getPublicUsers`, three routers (default exports) | G1 helpers, models |
| G6 project config | section a "G6" | `seedProjectDefaults`, `addProjectMember`, `applyTransition`, `getWorkflowForIssueType`, `getInitialStatus`, `assertSprintInProject`, `getActiveSprint`, `assertReleaseInProject`, `computeRank`, routers | G1, G5 (`addOrgMember`, `getPublicUsers`), models |
| G7 issues | section a "G7" | `createIssueInternal`, `updateIssueInternal`, `transitionIssueInternal`, `getIssueInProject`, `addCommentInternal`, routers | G1, G6 (`applyTransition`, `getInitialStatus`, `getWorkflowForIssueType`, `computeRank`, `assertSprintInProject`, `assertReleaseInProject`), G5 `getPublicUsers` |
| G8 rest | section a "G8" | `registerAutomationRunner`, `registerWebhookDispatcher`, `registerSlaTicker`, routers (default exports) | G1, G7 (`createIssueInternal`, `updateIssueInternal`, `transitionIssueInternal`, `addCommentInternal`, `getIssueInProject`), G5 `getPublicUsers` |

Router default-export file names that `app.js` imports (fixed; see section g): each module's `<name>.routes.js` default export a Router.

Worker instructions common to all
1. Read your collections' tables in `docs/02-mongodb-schema.md` before writing; copy field names exactly.
2. Do not edit files you do not own. If you need a missing helper, use the contract; if the contract is insufficient, write a local private helper inside your own module and note it in your reply.
3. Keep every file self-contained, no circular imports across modules: services import G1 services and models, never other modules' routes. Allowed module-to-module imports are exactly the ones in section d.
4. No stubs, no TODO. Every route listed for your module must be wired and functional.
5. Use `mongoose.Types.ObjectId` conversions explicitly in `$in` and aggregate pipelines (aggregates do not auto-cast).
6. Use `.lean()` for reads. Use `select` to avoid returning secrets (`passwordHash`, `totp`, `tokenHash`, `refreshHash`, `webhook.secret`).

---------------------------------------------------------------------------------------------------
## f) ENV VARS

| var | default | notes |
|---|---|---|
| NODE_ENV | development | |
| PORT | 4000 | |
| MONGO_URI | mongodb://127.0.0.1:27017/pm_suite | |
| JWT_SECRET | dev-secret-change-me | required when production |
| JWT_ACCESS_TTL | 15m | access token |
| REFRESH_TTL_DAYS | 30 | |
| BCRYPT_ROUNDS | 12 | |
| CLIENT_ORIGIN | http://localhost:5173 | comma list |
| PUBLIC_BASE_URL | http://localhost:4000 | invite and upload URLs |
| UPLOAD_SIGNING_SECRET | dev-upload-secret | HMAC for signed placeholders; required in production |
| UPLOAD_URL_TTL_SEC | 900 | |
| ANTHROPIC_API_KEY | (empty) | empty -> AI routes 503 |
| AI_MODEL | claude-haiku-5-5 | |
| AI_DAILY_CALL_LIMIT | 100 | per user per day |
| WEBHOOK_TIMEOUT_MS | 5000 | |
| ACTIVITY_RETENTION_DAYS | 365 | timeseries expireAfterSeconds |
| AUDIT_RETENTION_DAYS | 365 | |
| LOGIN_RATE_LIMIT | 10 | per 15 min per email+ip |

`env.js` removed key: `jwtExpiresIn`. Old `JWT_EXPIRES_IN` ignored.

---------------------------------------------------------------------------------------------------
## g) MOUNT TABLE (src/app.js, G1)

Middleware order: `cors`, `express.json({limit:'1mb'})`, `morgan`, health, mounts, `notFound`, `errorHandler`. Routers below are imported from the fixed paths. Mount order matters only where noted.

| prefix | import | notes |
|---|---|---|
| /api/health | inline | |
| /api/auth | modules/auth/auth.routes.js | |
| /api/users | modules/user/user.routes.js | |
| /api/orgs | modules/org/org.routes.js | contains `/invites/accept` registered before `/:orgId` |
| /api/my-work | modules/mywork/mywork.routes.js | |
| /api/notifications | modules/notifications/notifications.routes.js | |
| /api/ai | modules/ai/ai.routes.js | |
| /api/public/forms | modules/forms/forms.public.routes.js | no auth |
| /api | modules/project/project.routes.js | defines `/orgs/:orgId/projects`, `/projects/personal`, `/projects/invites/accept` before `/projects/:projectId` |
| /api/projects/:projectId/roles | modules/roles/roles.routes.js | |
| /api/projects/:projectId | modules/projectconfig/projectconfig.routes.js | sub-segments issue-types, priorities, resolutions, custom-fields, labels, components, saved-filters |
| /api/projects/:projectId/workflows | modules/workflows/workflows.routes.js | |
| /api/projects/:projectId | modules/boards/boards.routes.js | boards, backlog, issues/:issueId/rank (mount BEFORE issues) |
| /api/projects/:projectId/sprints | modules/sprints/sprints.routes.js | |
| /api/projects/:projectId/releases | modules/releases/releases.routes.js | |
| /api/projects/:projectId/issues | modules/issue/issue.routes.js | `/by-key/:key` and `/bulk` defined before `/:issueId` |
| /api/projects/:projectId/issues/:issueId/comments | modules/comments/comments.routes.js | |
| /api/projects/:projectId/issues/:issueId/attachments | modules/attachments/attachments.routes.js | |
| /api/projects/:projectId/issues/:issueId/links | modules/links/links.routes.js | |
| /api/projects/:projectId/issues/:issueId/history | modules/history/history.routes.js | (`GET /` here; the `/issues/:id/history` row in issues table points at this router) |
| /api/projects/:projectId | modules/worklogs/worklogs.routes.js | defines `/issues/:issueId/worklogs` and `/worklogs` |
| /api/projects/:projectId/wiki | modules/wiki/wiki.routes.js | |
| /api/projects/:projectId | modules/dashboards/dashboards.routes.js | `/dashboards`, `/goals` (goals routes imported inside this file from goals.routes.js) |
| /api/projects/:projectId/reports | modules/reports/reports.routes.js | |
| /api/projects/:projectId/automation | modules/automation/automation.routes.js | |
| /api/projects/:projectId/webhooks | modules/webhooks/webhooks.routes.js | |
| /api/projects/:projectId/integrations | modules/integrations/integrations.routes.js | |
| /api/projects/:projectId/servicedesk | modules/servicedesk/servicedesk.routes.js | |
| /api/projects/:projectId/forms | modules/forms/forms.routes.js | |
| /api/projects/:projectId | modules/testmgmt/testmgmt.routes.js | `/test-cases`, `/test-runs` |
| /api/projects/:projectId | modules/risks/risks.routes.js | `/risks` |
| /api/projects/:projectId | modules/budget/budget.routes.js | `/budget-lines`, `/budget-actuals` |
| /api/projects/:projectId | modules/cat/cat.routes.js | `/cat-entries`, `/cat-glossary` |
| /api/projects/:projectId/activity | modules/activity/activity.routes.js | |
| /api | modules/audit/audit.routes.js | defines `/orgs/:orgId/audit`, `/projects/:projectId/audit` |

Router contract: any router mounted under a `:projectId` prefix is `Router({mergeParams:true})` and applies its own `authOrToken|auth` + `requireProjectRole(...)` per route (no global guard in app.js, so a router cannot be accidentally open). Routers that mount at a shared prefix (`/api/projects/:projectId`) must only declare their own distinct sub-paths; no wildcard routes.

`server.js` (G1): `await mongoose.connect(env.mongoUri)`, then `registerAutomationRunner(); registerWebhookDispatcher(); registerSlaTicker();` (imports from G8 fixed paths), then `app.listen`. Handles SIGTERM with `mongoose.disconnect`. Import `./models/index.js` first so all models and timeseries are registered.

---------------------------------------------------------------------------------------------------
## h) RISKS AND MERGE CHECKS

Known risks
1. Schema field names vs plan: the plan names a few fields it does not list in full (`status.category`, `committedPoints`, `payload`, `baseRole`, `failureCount`, `log`). Workers must map to the actual table field names and, where a needed field is missing from the table, add it to the Mongoose schema and mention it in the reply. Merge step greps for such additions.
2. Cross-group name drift on service exports (section d). Merge step verifies by script (below).
3. Timeseries `projectActivity`: Mongoose requires the collection to be created with timeseries options before first insert; if a normal collection of the same name exists the option is ignored. Dev DB must be fresh. Documents cannot be updated freely.
4. Express 5: `req.query` getter-only; no regex path strings; param names must be valid identifiers; async errors are forwarded automatically but keep `asyncHandler`. Mounting several routers on `/api/projects/:projectId` is fine but a router with `router.use(auth)` at its top would run for all later routes of that prefix if it did not match; so guards are per route, never `router.use` at shared prefixes.
5. `optimisticConcurrency` with `findOneAndUpdate` does not auto-check `__v`; code must put `__v` in the filter and `$inc: {__v: 1}` explicitly.
6. Event bus is in-process; a crash can lose webhook deliveries/automation runs. Accepted for v1.
7. SLA ticker and rate limiters are per-process (fine for single instance).
8. Cursor pagination on `rank` requires a compound index `{projectId:1, rank:1, _id:1}` on issues (G3 adds if the table lacks it).
9. Reports depend on rollups; issues created before this code existed have no rollups (fresh DB assumed).
10. Personal projects: access resolved from `projects.ownerId` and `orgId:null`; confirm the table has `ownerId` (else add).

Merge checklist (the merge step runs these, in order)
1. `node -e` script walks `src/**/*.js`, parses each `import ... from '<rel>'`, and fails if any resolved path does not exist.
2. Script greps each named import against the target's `export` list (named exports and default). Fail on mismatch with section d.
3. Every file under `src/models/**/*.model.js` has exactly one `export default mongoose.model(` and the model name matches section c; the set of names is unique (no duplicate model names, no duplicate collection names); count = 63 files; `models/index.js` re-exports 63 names.
4. Every `src/modules/*/*.routes.js` has `export default` a Router; every router file imported in `app.js` exists; no module imports another module's `*.routes.js` except `dashboards.routes.js` importing `goals.routes.js` (same group).
5. Grep for forbidden patterns: `router.use('*'`, `'/*'`, `'(.*)'`, `app.get('*'`, `req.query =`, `TODO`, `FIXME`, `not implemented`, `console.log(` of tokens/passwords, any `prompt` field in `aiDrafts` model or writes.
6. Grep that every Mongoose query on a project-scoped model inside `src/modules` includes `projectId` (spot-check list: Issue, Sprint, Board, Release, Label, Component, WikiPage, Webhook, Form, Risk). Exception: `mywork.service.js` and `forms.service.js` (resolve project by publicKey).
7. Boot test with dummy URI: `MONGO_URI=mongodb://127.0.0.1:1/x JWT_SECRET=x node -e "import('./src/app.js').then(()=>console.log('app ok'))"` must print `app ok` (importing app does not connect; no listener started). Then `node src/server.js` with the dummy URI must fail cleanly with a Mongo connection error (not an import/syntax error). With a reachable `mongod`, `GET /api/health` returns `{success:true,...}`, register/login/refresh/logout round-trip works, and `POST /api/ai/drafts` returns 503 with no `ANTHROPIC_API_KEY`.
8. `npm ls` shows `@anthropic-ai/sdk` installed; no other new dependency added (global `fetch` is used for webhooks).
9. Remove leftovers: old `src/models/*.model.js` flat files and old modules `task`, `comment`, `dashboard` folders no longer exist; `app.js` no longer imports them.
10. Confirm envelope: spot-check one error path (validation 422 with `errors[]`, 404 route, 401) returns `{success:false,message,errors?}`.
