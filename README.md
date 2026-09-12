# antoyavin.github.io

Personal site built with [Eleventy](https://www.11ty.dev/), deployed to GitHub Pages via GitHub Actions.

---

## Local development

**Prerequisites:** Node 20+

```bash
npm install        # first time only
npm start          # dev server → http://localhost:8080
npm run build      # production build → _site/
```

---

## Deployment

1. In your GitHub repo, go to **Settings → Pages**.
2. Under *Build and deployment*, set Source to **GitHub Actions**.
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds and deploys automatically.

The site lives at `https://antoyavin.github.io` (no path prefix needed — this is a user page repo).

---

## Adding content

Everything is plain Markdown files. No code to touch.

### Add a new blog post

Create a file in `content/posts/` — the filename becomes the URL slug.

```
content/posts/my-new-post.md
```

Paste this frontmatter at the top, then write your post in Markdown below it:

```yaml
---
title: My Post Title
date: 2026-09-08
tags:
  - en        # language tag: always include "en" or "fr"
  - dev       # add any topic tags you want (dev, notes, tools, …)
layout: post.njk
permalink: "/writing/{{ page.fileSlug }}/"
---

Your post content here...
```

The post will appear at `/writing/my-new-post/` and show up in the writing list with tag filtering.

**Images in posts:** put image files in `assets/img/` and reference them as:

```markdown
![Alt text](/assets/img/my-image.png)
*Optional caption displayed below the image.*
```

**Code blocks:** use standard fenced code blocks with a language hint:

````markdown
```yaml
key: value
```
````

### Add a new project

Create a file in `content/projects/`:

```
content/projects/my-project.md
```

```yaml
---
permalink: false
title: Project Name
url: https://github.com/you/project
year: 2026
---

One short paragraph describing the project.
```

It appears on the home page, sorted newest first by `year`.

### Edit the About / bio section

Edit `content/about.md`. The H1 becomes the hero headline; the paragraph below it is the bio. To update certifications, edit the `certifications` list in the frontmatter:

```yaml
certifications:
  - name: Certified Kubernetes Administrator (CKA)
    url: https://www.credly.com/badges/your-real-badge-id
    year: 2024
```

---

## Project structure (for reference)

```
.
├── .eleventy.js          # Eleventy config (collections, filters)
├── .github/workflows/    # GitHub Actions deploy
├── assets/
│   ├── css/style.css     # all styles — single file
│   └── img/              # post images
├── content/
│   ├── about.md          # bio + certifications
│   ├── posts/            # blog posts → /writing/<slug>/
│   └── projects/         # project entries (home page only)
├── _layouts/
│   ├── base.njk          # HTML shell, nav, footer
│   └── post.njk          # wraps individual post pages
├── _includes/
│   ├── nav.njk
│   └── footer.njk
├── index.njk             # home page (/)
└── writing/index.njk     # writing list (/writing/)
```
