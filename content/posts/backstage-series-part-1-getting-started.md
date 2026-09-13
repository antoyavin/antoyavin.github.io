---
title: "Backstage.io Series — Part 1: Getting Started & Setting Up PostgreSQL"
date: 2026-09-06
tags:
  - en
  - backstage
  - dev
layout: post.njk
permalink: "/writing/{{ page.fileSlug }}/"
---

If you work in platform engineering or you're building internal developer tooling, you've probably heard of Backstage. Created by Spotify and donated to the CNCF, it's an open-source framework for building Internal Developer Platforms — a single place where developers can discover services, find documentation, scaffold new projects, and understand who owns what.

This series is a hands-on walkthrough of setting up Backstage from scratch. We'll go from zero to a production-ready configuration, step by step. By the end of this first article, you'll have a running Backstage instance backed by PostgreSQL, ready to be extended.

---

## What Is Backstage, Exactly?

Backstage is best understood as a framework, not an application. Out of the box it gives you:

- **Software Catalog** — a registry of all your services, libraries, websites, APIs, and other components, linked to their owners, documentation, and dependencies.
- **TechDocs** — documentation as code: Markdown files in your repos, rendered and searchable inside Backstage.
- **Software Templates (Scaffolder)** — self-service project creation. Developers pick a template, fill in a form, and get a new repository with CI/CD wired up.
- **Plugin ecosystem** — hundreds of community and official plugins for Kubernetes, ArgoCD, PagerDuty, Grafana, and more.

The real value isn't any single feature — it's having all of this in one place, with a consistent model for ownership and discoverability across your entire organization.

---

## Prerequisites

- **Node.js 18 or 20** (LTS) — check with `node --version`
- **Yarn** — Backstage's build system uses Yarn workspaces: `npm install -g yarn`
- **Docker** — we'll use it to run PostgreSQL locally
- **Git**
- A GitHub account (we'll use it for authentication in Part 2)

---

## Creating a New Backstage App

Backstage provides a CLI to scaffold a new app:

```bash
npx @backstage/create-app@latest
```

It will ask for an app name — use something like `my-backstage`. The CLI pulls the latest template and installs dependencies. This takes a couple of minutes.

```
? Enter a name for the app [required] my-backstage

Creating the app...

 Checking fetch package version.
 Fetching template
 Preparing files
 Installing dependencies ... done
```

Once done, move into the directory:

```bash
cd my-backstage
```

### Understanding the Project Structure

```
my-backstage/
├── app-config.yaml           # main configuration (committed)
├── app-config.local.yaml     # local overrides (gitignored — put secrets here)
├── packages/
│   ├── app/                  # React frontend (port 3000)
│   │   └── src/
│   │       ├── App.tsx       # app root, routing, plugins
│   │       └── index.tsx
│   └── backend/              # Node.js backend (port 7007)
│       └── src/
│           └── index.ts      # backend entrypoint, module registration
├── plugins/                  # custom plugins you write (empty at start)
└── package.json              # root workspace config
```

A few things worth knowing upfront:

- **`app-config.yaml`** is the central config file. It's committed to Git and defines everything except secrets.
- **`app-config.local.yaml`** is gitignored and merges on top of `app-config.yaml` locally. This is where local database credentials, API tokens, and dev-only settings go.
- The **new backend system** (`packages/backend/src/index.ts`) uses module-based registration — you add capabilities by calling `backend.add(import('...'))`. This is the current standard and what we'll use throughout this series.

---

## The Default Database: Why SQLite Isn't Enough

Out of the box, Backstage uses SQLite stored in a temporary file. Open `app-config.yaml` and you'll see:

```yaml
backend:
  database:
    client: better-sqlite3
    connection: ':memory:'
```

This is intentional — it lets you try Backstage without any setup. But it has a hard limitation: **data doesn't persist across restarts**. Every time you stop the backend, your entire catalog is wiped.

For anything beyond a first look, you need a real database. Backstage supports PostgreSQL (recommended) and MySQL. We'll use PostgreSQL.

---

## Setting Up PostgreSQL Locally

The fastest way to get PostgreSQL running locally is Docker Compose. Create a `docker-compose.yml` at the root of the project:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: backstage
      POSTGRES_PASSWORD: backstage
      POSTGRES_DB: backstage_plugin_catalog
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Start it:

```bash
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
```

> **One database, many schemas.** Backstage doesn't use a single database — each plugin manages its own schema. The `POSTGRES_DB` value above is just the default database; Backstage will create separate schemas like `backstage_plugin_auth`, `backstage_plugin_scaffolder`, etc. automatically. You don't need to create them manually.

---

## Configuring Backstage to Use PostgreSQL

### Install the PostgreSQL client

```bash
yarn --cwd packages/backend add pg
```

### Update `app-config.yaml`

Replace the SQLite database block with the PostgreSQL configuration:

```yaml
backend:
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
```

This uses environment variable substitution — `${VAR}` is resolved at runtime. For production, you'd inject these via your secrets manager or CI/CD environment.

### Set local credentials in `app-config.local.yaml`

Create (or edit) `app-config.local.yaml` at the project root. This file is already in `.gitignore`:

```yaml
backend:
  database:
    connection:
      host: localhost
      port: 5432
      user: backstage
      password: backstage
```

Backstage merges `app-config.local.yaml` on top of `app-config.yaml` automatically when running locally. You never commit this file — it only exists on your machine.

---

## Running the App

```bash
yarn dev
```

This starts both the frontend and the backend in parallel. The first startup takes a moment — Backstage runs database migrations for every plugin on boot. Watch the logs for lines like:

```
[catalog] Running migrations...
[auth] Running migrations...
[scaffolder] Running migrations...
```

Once you see `[0] webpack compiled successfully`, open your browser:

- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:7007`

You should land directly in the Backstage UI. Since we haven't configured authentication yet, you're in as a guest. The Software Catalog is populated with a few example entities from the scaffolded template — a good sign that the database connection is working.

### Verifying the Database Connection

To confirm PostgreSQL is actually being used (and not an in-memory fallback), connect directly to the database and list the schemas:

```bash
docker exec -it my-backstage-postgres-1 psql -U backstage -d backstage_plugin_catalog -c "\dn"
```

You should see schemas created by Backstage plugins:

```
         List of schemas
            Name             | Owner
-----------------------------+----------
 backstage_plugin_catalog    | backstage
 backstage_plugin_scaffolder | backstage
 public                      | pg_database
```

If those schemas are there, data is persisting correctly.

---

## Troubleshooting

**`error: password authentication failed for user "backstage"`**
Double-check `app-config.local.yaml` credentials match what's in `docker-compose.yml`. Also confirm Docker is running: `docker compose ps`.

**`Error: connect ECONNREFUSED 127.0.0.1:5432`**
PostgreSQL isn't running or isn't accessible. Run `docker compose up -d` and wait a few seconds for it to be ready.

**Frontend loads but catalog is empty / shows errors**
Check the backend terminal for migration errors. If a plugin migration fails, the backend still starts but that plugin won't work. Usually indicates a database permission issue.

**`yarn dev` hangs at "Waiting for app to compile"**
Normal on first run — Webpack is building the frontend bundle. Give it 60–90 seconds.

---

## What We Have So Far

At this point you have:

- A Backstage app generated with `create-app`
- A PostgreSQL database running in Docker, with persistent storage
- Backstage configured to use it via `app-config.local.yaml`
- A running instance accessible at `http://localhost:3000`

The app runs but anyone who opens it is a guest with no real identity. In [Part 2](/writing/backstage-series-part-2-github-auth/), we'll add GitHub OAuth so users can sign in with their GitHub account, and configure the GitHub Org provider to automatically import your organization's users and teams into the catalog.
