<div align="center">

<img src="assets/collabor8r.webp" alt="Collabor8r logo" width="140" />

# Collabor8r Server

**v2.0**

*One workspace for every team, every ticket, every conversation.*

![Version](https://img.shields.io/badge/version-2.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/express-5.3.0-000000?style=flat-square&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-7-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/mongoose-9.12.0-880000?style=flat-square&logo=mongoose&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)

</div>

---

## Overview

Collabor8r Server is the Node/Express backend API of **Collabor8r**, a Jira-style work management suite. It covers organizations, projects, issues, configurable workflows, boards and sprints, automation, webhooks, a service desk with SLA tracking, a wiki, forms, test management, AI-assisted drafts and a full audit log, all behind one REST API with sessions and API tokens.

It serves the **Collabor8r web client** and the **Collabora8r-Mobile-App**.

## What Collabor8r is about

Most teams run their work across a pile of tools: Jira for engineering, a separate help desk for support, Confluence or Notion for docs, a test tool, a spreadsheet for budgets and risks, and glue automation in between. Every tool has its own users, permissions, search and bill, and the data never lines up.

Collabor8r puts all of it in one data model and one permission system. An issue can sit next to a wiki page, a test case, a release, a risk, a service desk request and an SLA timer, and one role setup decides who can see and change each of them.

### Why it beats Jira and the usual alternatives

- **Unified, not stitched together.** Jira needs add-ons or a second product for docs, service desk, test management and forms. Trello, Asana, ClickUp and Linear cover only part of that. Here they are modules of the same API.
- **One permission model.** Org roles, project roles, custom roles and per-project membership apply everywhere, including the wiki, service desk and reports.
- **Automation and webhooks included.** Rules, outbound webhooks and integrations are built in.
- **Real audit trail.** Org and project audit logs, issue history and activity feeds come with the server.
- **Self-hosted and open.** MIT licensed, runs from one `docker compose up`, and you own the data in your MongoDB.
- **Predictable for clients.** Optimistic locking, cursor pagination and a consistent response envelope suit web and mobile clients alike.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | ![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=nodedotjs&logoColor=white) ES modules, plain JavaScript |
| Framework | ![Express](https://img.shields.io/badge/express-5.3.0-000000?style=flat-square&logo=express&logoColor=white) ![CORS](https://img.shields.io/badge/cors-2.8.6-lightgrey?style=flat-square) ![Morgan](https://img.shields.io/badge/morgan-1.12.1-lightgrey?style=flat-square) |
| Database | ![MongoDB](https://img.shields.io/badge/mongodb-7-47A248?style=flat-square&logo=mongodb&logoColor=white) ![Mongoose](https://img.shields.io/badge/mongoose-9.12.0-880000?style=flat-square&logo=mongoose&logoColor=white) |
| Validation | ![Zod](https://img.shields.io/badge/zod-4.6.7-3E67B1?style=flat-square) |
| Auth | ![JWT](https://img.shields.io/badge/jsonwebtoken-9.0.3-000000?style=flat-square&logo=jsonwebtokens&logoColor=white) ![bcryptjs](https://img.shields.io/badge/bcryptjs-3.0.3-lightgrey?style=flat-square) |
| Email | ![Resend](https://img.shields.io/badge/resend-6.37.0-000000?style=flat-square) |
| Security | ![Helmet](https://img.shields.io/badge/helmet-8.3.0-lightgrey?style=flat-square) ![express-rate-limit](https://img.shields.io/badge/express--rate--limit-8.7.3-lightgrey?style=flat-square) |
| Config | ![dotenv](https://img.shields.io/badge/dotenv-18.0.9-ECD53F?style=flat-square&logo=dotenv&logoColor=black) |
| DevOps | ![Docker](https://img.shields.io/badge/docker-node%3A22--alpine-2496ED?style=flat-square&logo=docker&logoColor=white) ![Compose](https://img.shields.io/badge/compose-mongo%3A7-2496ED?style=flat-square&logo=docker&logoColor=white) |

## Features

**Identity and access**
- Registration, login, rotating refresh tokens with reuse detection, logout of one or all sessions, password change and reset
- Personal API tokens (`pmk_` prefix)
- Account lockout after repeated failed logins, plus rate limiting
- Organizations with groups, members, email invites and join requests
- Org roles (viewer, guest, member, admin, owner) and project roles (guest to admin), plus custom project roles

**Projects and issues**
- Projects with members, invites, join requests and archiving
- Issues with types, priorities, resolutions, labels, components, custom fields, links, comments, attachments, worklogs and full history
- Configurable workflows and transitions, bulk updates, ranking, saved filters
- Optimistic locking through an issue `version` field
- Releases and "My Work" across projects

**Planning and delivery**
- Boards, sprints and a board hub
- Reports with daily roll-up counters
- Dashboards and goals
- Budget lines and actuals, risk register, CAT entries and glossary

**Automation and integrations**
- Automation rules with run history
- Outbound webhooks with delivery tracking
- Integrations and integration links

**Service desk**
- Request types, customers and approvals
- SLA policies with timers and a background SLA ticker

**Knowledge and quality**
- Wiki spaces and pages with version history
- Forms and form submissions
- Test management: test cases, runs and results

**AI**
- AI drafts with per-user daily call limits and usage tracking (optional; returns 503 when no key is configured)

**Collaboration and visibility**
- Comments, notifications with per-user preferences, project activity feed (MongoDB time-series collection)
- Org and project audit logs
- Transactional emails: welcome, invites, join request updates, role changes, password reset and change, mention digest

**Operations**
- Signed, expiring upload and download URLs
- Health and readiness probes, request IDs on every response and error
- Graceful shutdown, and a Docker image that runs as non-root with a healthcheck

## Functionalities: what is used for what

| Need | Technology | Why it is a good fit |
|---|---|---|
| HTTP API | Express 5 | Native async error handling, small and well understood |
| Data | MongoDB + Mongoose 9 | Flexible documents suit custom fields and per-project workflows; schemas still enforce structure; time-series collection for activity |
| Input validation | Zod 4 | One schema per route, strict errors (422), rules documented in code |
| Sessions | jsonwebtoken + stored refresh sessions | Short-lived access tokens, revocable and rotating refresh tokens with reuse detection |
| Passwords | bcryptjs | Salted hashing, tunable cost (`BCRYPT_ROUNDS`), no native build |
| Email | Resend | Simple transactional email API with HTML templates in `src/email` |
| Hardening | Helmet, express-rate-limit, CORS allowlist | Secure headers, per-IP limits, no wildcard origins in production |
| Config | dotenv + Zod | Environment validated at boot; the process exits with a list of problems |
| Logging | morgan + request IDs | Traceable requests across logs and error bodies |
| AI | Groq chat completions over `fetch` | No extra SDK, 30 s timeout, daily limits per user |
| Deployment | Docker + Compose | Multi-stage `node:22-alpine` image, `mongo:7` with a named volume, unpublished DB port |

## Comparison

### Collabor8r v2.0 vs v1

| Area | v1 | v2.0 |
|---|---|---|
| Scope | Core project and issue tracking | Full suite: service desk, wiki, forms, test management, budget, risks, AI |
| Auth | Basic login | Rotating refresh sessions, reuse detection, lockout, API tokens |
| Permissions | Simple roles | Org roles, project roles and custom roles |
| Workflow | Fixed | Configurable workflows, boards and sprints |
| Automation | None | Rules, webhooks, integrations |
| Auditing | Minimal | Audit log, issue history, activity feed |
| Operations | Manual | Docker, health and readiness probes, index sync script |

### Collabor8r vs Jira and alternatives

| Capability | Collabor8r | Jira | Trello | Asana | ClickUp | Linear |
|---|---|---|---|---|---|---|
| Issues, boards, sprints | Yes | Yes | Basic | Partial | Yes | Yes |
| Custom workflows | Yes | Yes | No | Partial | Yes | Limited |
| Service desk with SLA | Built in | Separate product | No | No | No | No |
| Wiki | Built in | Confluence | No | No | Docs | Limited |
| Test management | Built in | Add-on | No | No | No | No |
| Automation and webhooks | Built in | Yes | Butler | Rules | Yes | Limited |
| Audit log | Built in | Higher tiers | Higher tiers | Higher tiers | Higher tiers | Higher tiers |
| Self-hosted | Yes | Data Center | No | No | No | No |
| Open source | MIT | No | No | No | No | No |

Third-party columns are a general summary and vary by plan; check each vendor for current details.

## Getting started

```bash
cp .env.example .env     # set JWT_SECRET and UPLOAD_SIGNING_SECRET
npm install
npm run dev              # node --watch src/server.js
npm run db:indexes       # sync indexes (once per production deploy)
```

Or with Docker: `docker compose up -d --build`, then `docker compose exec server npm run db:indexes`.

`GET /api/health` is liveness and `GET /api/ready` is readiness. Responses use `{ success, data, meta? }` and errors use `{ success: false, message, errors? }`.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 BazilSuhail.

## About the author

Built by **BazilSuhail**: [github.com/BazilSuhail](https://github.com/BazilSuhail)
