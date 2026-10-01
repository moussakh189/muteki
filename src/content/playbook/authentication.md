---
title: "Authentication"
tags: [methodology, authentication]
summary: "Testing authentication endpoints for brute force, password reset logic flaws, host header injection, and MFA bypasses."
draft: false
---

## 1. Discovery & Recon
- [ ] Identify all login, registration, password reset, and MFA endpoints.
- [ ] Check if usernames can be enumerated (e.g., differing error messages: "Invalid password" vs "User does not exist", or response time differences).

## 2. Brute Force & Credential Stuffing
- [ ] Attempt brute-forcing common passwords (admin/admin).
- [ ] Check for rate limiting or account lockout mechanisms. If present, try bypassing by:
  - Adding `X-Forwarded-For: 127.0.0.1` (and rotating IPs).
  - Appending null bytes to the username.

## 3. Password Reset Logic Flaws
- [ ] Request a password reset and analyze the token. Is it predictable? (e.g., base64 of username, timestamp).
- [ ] **Host Header Injection**: Change the `Host` header to `attacker.com` when requesting a reset. The user might receive a link pointing to your server with their token.
- [ ] Parameter pollution: `email=victim@target.com&email=attacker@target.com`.

## 4. MFA Bypasses
- [ ] Direct browsing: Try navigating directly to `/dashboard` after submitting the first login step.
- [ ] Response manipulation: If the server sends `{"success": false}`, intercept and change it to `{"success": true}`.
- [ ] Brute-force the MFA code (if it's a short 4-digit PIN and rate limiting is absent).
