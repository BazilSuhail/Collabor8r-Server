# Collabora8r — Server

**Collabora8r** is a modern project management suite built on the MERN stack. This repository contains the backend API server with real-time collaboration, task management, sprint planning, and team workflows.

[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](#)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat&label=Contributions&colorA=red&colorB=black)](#)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Real-time | Socket.IO |
| Email | Nodemailer (SMTP) |
| AI | Groq / OpenAI |
| Uploads | Multer |

## Socket.IO Architecture

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Socket.IO Server
    participant DB as MongoDB
    participant N as Notification Service

    C->>S: connect(auth: { userId })
    S->>S: Map userId → socketId in connectedUsers
    S-->>C: online-count { count }

    C->>S: emit("join-project", projectId)
    S->>S: socket.join("project:" + projectId)

    N->>DB: Save notification
    N->>S: sendMessageToUser(userId, payload)
    S-->>C: emit("notification", { type, data, read, createdAt })

    S->>S: sendToProjectRoom(projectId, event, data)
    S-->>C: emit(event, data) to all in project room

    C->>S: emit("leave-project", projectId)
    S->>S: socket.leave("project:" + projectId)

    C->>S: disconnect
    S->>S: Remove from connectedUsers
    S-->>C: online-count { count }
```

---

## Documentation

Full API reference: [`docs/api-reference.md`](docs/api-reference.md)

---

## Get Started

```bash
git clone https://github.com/BazilSuhail/Collabora8r-Server.git
cd Collabora8r-Server
npm install
```

Configure `.env` with `MONGO_URI`, `JWT_SECRET`, and optionally `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASS`.

```bash
npm start
```

Server runs at `http://localhost:3001`.

---

## Links

- **Live Demo**: [collabora8r.vercel.app](https://collabora8r.vercel.app/)
- **Client Repo**: [Collabora8r-Client](https://github.com/BazilSuhail/Collabora8r-Client)
