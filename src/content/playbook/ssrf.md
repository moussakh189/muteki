---
title: "Server-Side Request Forgery (SSRF)"
tags: [methodology, ssrf]
summary: "SSRF discovery and exploitation — internal network access, cloud metadata, port scanning, and filter bypass techniques."
draft: false
---

## 1. Discovery
- [ ] Identify features that fetch remote resources (profile pictures, PDFs, webhooks, analytics).
- [ ] Input Burp Collaborator URL to test for basic external SSRF.

## 2. Exploitation (Internal Network)
- [ ] Attempt to access `http://127.0.0.1` or `http://localhost`.
- [ ] Port scan internal services: `http://127.0.0.1:22`, `:6379` (Redis), `:3306` (MySQL).
- [ ] Access Cloud Metadata endpoints if running in AWS/GCP/Azure.

## 3. Bypassing Restrictions
- [ ] Obfuscate IP: `http://2130706433/` (127.0.0.1 in decimal).
- [ ] Use IPv6: `http://[::1]/`.
- [ ] Create a DNS record pointing to 127.0.0.1 (e.g., `localtest.me`).
- [ ] URL redirection (host an open redirect on your server).
