---
title: "Backstage.io Series — Part 2: GitHub Authentication & User Ingestion"
date: 2026-09-13
tags:
  - en
  - backstage
  - dev
layout: post.njk
permalink: "/writing/{{ page.fileSlug }}/"
---

In [Part 1](#), we bootstrapped a Backstage instance, wired it to PostgreSQL, and got a running app. At this point, anyone who opens the UI lands directly in the app as a guest — no authentication, no identity. In this article we'll fix that in two steps:

1. Users can sign in with their GitHub account (OAuth)
2. Backstage automatically imports users and teams from your GitHub organization into the Software Catalog

By the end, a developer who logs in will have a real identity in Backstage, and you'll be able to assign ownership of catalog entities to actual people and teams.

---

## Part 1 — GitHub Authentication

### Creating a GitHub OAuth App

Go to your GitHub organization: **Settings → Developer Settings → OAuth Apps → New OAuth App**.

Fill in the fields:

| Field | Value |
|---|---|
| Application name | `Backstage (dev)` |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:7007/api/auth/github/handler/frame` |

Click **Register application**, then generate a client secret. Copy both the **Client ID** and the **Client Secret** — you'll need them in the next step.

> For a production deployment, create a second OAuth App with your real domain (e.g. `https://backstage.example.com`) and manage credentials via environment variables. Never commit secrets to Git.

### Configuring Backstage for GitHub Auth

Store your credentials as environment variables (`.env` or however you manage secrets locally):

```bash
AUTH_GITHUB_CLIENT_ID=your_client_id
AUTH_GITHUB_CLIENT_SECRET=your_client_secret
```

Then add the auth provider block to `app-config.yaml`:

```yaml
auth:
  environment: development
  providers:
    github:
      development:
        clientId: ${AUTH_GITHUB_CLIENT_ID}
        clientSecret: ${AUTH_GITHUB_CLIENT_SECRET}
        signIn:
          resolvers:
            - resolver: usernameMatchingUserEntityName
```

A few things to understand here:

- `environment: development` tells Backstage which provider block to use. In production, swap this for `production` and add a matching `production:` block.
- `resolver: usernameMatchingUserEntityName` is the sign-in resolver — it links the authenticated GitHub user to a `User` entity in the catalog by matching the GitHub username to the entity name. We'll come back to this once we ingest users in Part 2.

### Wiring the Sign-In Page in the Frontend

By default Backstage skips the sign-in screen entirely. We need to tell the app to show a login page and which provider to use.

Open `packages/app/src/App.tsx` and update the `createApp` call:

{% raw %}
```tsx
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { SignInPage } from '@backstage/core-components';

const app = createApp({
  // ... your existing config
  components: {
    SignInPage: props => (
      <SignInPage
        {...props}
        auto
        provider={{
          id: 'github-auth-provider',
          title: 'GitHub',
          message: 'Sign in using GitHub',
          apiRef: githubAuthApiRef,
        }}
      />
    ),
  },
});
```
{% endraw %}

The `auto` prop will silently attempt a sign-in on page load if a valid session already exists, so returning users don't see the login screen unnecessarily.

### Registering the Auth Module in the Backend

Backstage's new backend system uses a module-based registration. Open `packages/backend/src/index.ts` and add the GitHub auth module:

```ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... your existing modules

backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));

backend.start();
```

If the package isn't installed yet:

```bash
yarn --cwd packages/backend add @backstage/plugin-auth-backend-module-github-provider
```

### Understanding the Sign-In Resolver

The resolver is the bridge between "someone authenticated with GitHub" and "a known entity in the Backstage catalog". Without it, Backstage wouldn't know how to map an OAuth identity to a `User` entity.

`usernameMatchingUserEntityName` is the simplest resolver: it looks for a `User` entity whose `metadata.name` matches the GitHub username of the person logging in. If no matching entity exists, the login fails — which is exactly why we need user ingestion (Part 2 below).

Backstage ships several built-in resolvers. Another common one is `emailMatchingUserEntityProfileEmail` if you prefer to match on email instead. You can also write a custom resolver for advanced cases (e.g. mapping contractor accounts to internal identities).

### Testing the Login Flow

Start the app:

```bash
yarn dev
```

Open `http://localhost:3000`. You should now see a "Sign in with GitHub" button instead of landing directly in the app. Click it, authorize the OAuth app, and you'll be redirected back.

**If login fails immediately:** the resolver can't find a matching `User` entity — this is expected if you haven't ingested users yet. Add a temporary fallback resolver to unblock yourself while setting up ingestion:

```yaml
signIn:
  resolvers:
    - resolver: usernameMatchingUserEntityName
    - resolver: allowGuestsResolver  # remove this once ingestion works
```

Remove `allowGuestsResolver` once your catalog has real users.

**Common errors at this stage:**

- *"redirect_uri_mismatch"* — the callback URL in the OAuth App doesn't match exactly what Backstage sends. Double-check `http://localhost:7007/api/auth/github/handler/frame`.
- *"CORS error"* — usually means the backend isn't running or is on the wrong port.
- *"User not found"* — resolver can't match the user; expected until ingestion is set up.

---

## Part 2 — Ingesting Users and Groups from GitHub

### Why Ingest Users and Groups?

There's an important distinction between **authentication** and **catalog presence**:

- Authentication answers "who are you?" — GitHub OAuth handles this.
- Catalog presence answers "do we know about you?" — that's what ingestion provides.

Without ingestion, Backstage has no `User` entities. Ownership records on catalog components say things like `owner: team-platform` but nothing in the catalog actually represents that team. The **People** section of the catalog is empty. The sign-in resolver fails.

After ingestion, every member of your GitHub organization becomes a `User` entity, every team becomes a `Group` entity, and membership relations are set automatically. Ownership links resolve to real entities. The org chart is navigable.

### Installing the GitHub Org Entity Provider

```bash
yarn --cwd packages/backend add @backstage/plugin-catalog-backend-module-github-org
```

Register it in `packages/backend/src/index.ts`:

```ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... auth modules from Part 1

backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-github-org'));

backend.start();
```

### Creating a GitHub App for Ingestion

The org provider needs read access to your organization's members and teams. A GitHub App is the recommended approach for production (better rate limits, no personal token, installable at org level). A Personal Access Token works fine for local dev.

**Option A — Personal Access Token (simpler, fine for dev)**

Go to GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token.

Required scopes: `read:org`, `read:user`, `user:email`.

**Option B — GitHub App (recommended for production)**

Go to your organization: **Settings → Developer Settings → GitHub Apps → New GitHub App**.

- Permissions needed: `Members: Read-only`, `Organization administration: Read-only`
- Install the app on your organization after creation
- Generate and download a private key

Then configure both options in `app-config.yaml` under the `integrations` section (Backstage uses this for all GitHub connectivity):

```yaml
integrations:
  github:
    # Option A — PAT
    - host: github.com
      token: ${GITHUB_TOKEN}

    # Option B — GitHub App (replace Option A with this in production)
    # - host: github.com
    #   apps:
    #     - appId: ${GITHUB_APP_ID}
    #       privateKey: |
    #         -----BEGIN RSA PRIVATE KEY-----
    #         ${GITHUB_APP_PRIVATE_KEY}
    #         -----END RSA PRIVATE KEY-----
    #       webhookSecret: ${GITHUB_APP_WEBHOOK_SECRET}
    #       clientId: ${GITHUB_APP_CLIENT_ID}
    #       clientSecret: ${GITHUB_APP_CLIENT_SECRET}
```

### Configuring the Org Entity Provider

Add the provider configuration to the `catalog` section of `app-config.yaml`:

```yaml
catalog:
  providers:
    githubOrg:
      - id: my-org
        githubUrl: https://github.com
        orgs:
          - your-org-name   # replace with your actual GitHub org name
        schedule:
          initialDelay: { seconds: 30 }
          frequency: { hours: 1 }
          timeout: { minutes: 50 }
```

Key options:

- `orgs` — list of GitHub organization names to ingest from. You can list multiple orgs.
- `schedule.frequency` — how often to re-sync. `{ hours: 1 }` is a reasonable default; for large orgs you may want less frequent runs.
- `schedule.initialDelay` — waits 30 seconds after startup before the first sync, giving the rest of the backend time to initialize.
- `schedule.timeout` — how long a single sync run can take before being killed. Set this high for large orgs.

### Running the Ingestion

Restart the backend. In the logs you should see something like:

```
[catalog] Scheduling task: GitHubOrgEntityProvider:my-org:refresh
[catalog] Processing 34 entities from provider GitHubOrgEntityProvider:my-org
```

Open the Backstage UI and navigate to the **Catalog**. You should now see:

- **User** entities — one per organization member
- **Group** entities — one per GitHub team
- Relations automatically set: team membership, parent/child team hierarchy

### Verifying the Results

Navigate to:

- `http://localhost:3000/catalog?kind=User` — all ingested users
- `http://localhost:3000/catalog?kind=Group` — all ingested teams

Click on a `User` entity. You'll see their GitHub profile data and which groups they belong to. Click on a `Group` to see its members and sub-teams.

Now try signing in. The `usernameMatchingUserEntityName` resolver will find your `User` entity in the catalog, and you'll land in the app with your real identity — your name appears in the top right, and pages like "My Entities" will show components you own.

---

## Putting It All Together

Here's how the three pieces connect end-to-end:

```
GitHub OAuth App  →  Backstage auth provider  →  Sign-in resolver
                                                        │
                                                        ▼
                                              Looks up User entity
                                              in the catalog
                                                        │
                                              ┌─────────┴──────────┐
                                              │  GitHub Org Provider│
                                              │  (syncs every 1h)   │
                                              └─────────────────────┘
```

1. The user clicks "Sign in with GitHub" — GitHub OAuth authenticates them and returns a token.
2. Backstage's auth backend receives the GitHub identity (username, email, profile).
3. The sign-in resolver looks up a `User` entity in the catalog whose name matches the GitHub username.
4. That `User` entity was created by the GitHub Org Entity Provider, which periodically syncs your organization's members and teams.
5. The user gets a Backstage session tied to their catalog entity — ownership, team membership, and all associated relations are available.

---

## Troubleshooting

**"Login works but I still show as Guest"**  
The sign-in resolver found no matching entity. Check that ingestion has run (look for log lines from `GitHubOrgEntityProvider`) and that the `metadata.name` of the ingested `User` entity matches your GitHub username exactly (it's case-sensitive).

**"No users appear in the catalog after startup"**  
Check the `GITHUB_TOKEN` or GitHub App credentials. Run `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/orgs/your-org/members` locally to confirm the token has the right scopes.

**"Some teams are missing"**  
GitHub teams can be set to "secret" visibility, which hides them from the API unless the token belongs to a team member or org owner. Switch to a GitHub App with org admin read access, or make the teams visible.

**"CORS or callback errors"**  
Verify the Authorization callback URL in your OAuth App settings matches `http://localhost:7007/api/auth/github/handler/frame` character for character — trailing slash included or excluded matters.

**Rate limiting with large orgs**  
Switch to a GitHub App — it gets 15,000 requests/hour per installation vs 5,000/hour for PATs. Also increase `schedule.frequency` to run less often.

---

## What's Next

In Part 3, we'll configure the **GitHub Discovery provider** to automatically find and register repositories from your organization into the Software Catalog — so every service, library, and tool your org owns gets a catalog entry without anyone having to manually add a `catalog-info.yaml`.
