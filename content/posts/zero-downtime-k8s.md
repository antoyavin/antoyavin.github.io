---
title: Zero-Downtime Deployments in Kubernetes
date: 2026-09-04
tags:
  - en
  - dev
layout: post.njk
permalink: "/writing/{{ page.fileSlug }}/"
---

Zero-downtime deployments are table stakes for any production Kubernetes setup. The concept is simple: new pods must be fully ready before old ones are killed. Getting there requires three things working together.

## The core: readinessProbe

The most important lever is a properly configured `readinessProbe`. Kubernetes won't route traffic to a pod until this probe returns success — and it keeps old pods alive until their replacements pass.

```yaml
readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

Without this, Kubernetes routes traffic to pods the moment their containers start — before your app is actually ready to serve.

## Rolling update strategy

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

`maxUnavailable: 0` is the key setting. It means no running pod is removed until a healthy replacement is ready. `maxSurge: 1` allows one extra pod to exist during the rollout.

![Diagram showing rolling update pod lifecycle](/assets/img/rolling-update.png)
*Rolling update: new pods become ready before old pods are terminated — no gap in serving capacity.*

## PodDisruptionBudgets for node maintenance

Rolling updates handle application deploys, but cluster maintenance (node drains, upgrades) needs its own protection. A PDB guarantees a minimum number of replicas stay available during voluntary disruptions:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: my-app
```

Combine these three — `readinessProbe`, rolling update strategy with `maxUnavailable: 0`, and a PDB — and you have a solid baseline for zero-downtime deployments that survives both application releases and infrastructure maintenance.
