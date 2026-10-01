---
title: "Access Control & IDOR"
tags: [methodology, authorization, idor]
summary: "Systematic checklist for testing horizontal/vertical privilege escalation, IDOR, and broken access control via headers and mass assignment."
draft: false
---

## 1. Horizontal Privilege Escalation (IDOR)
- [ ] Identify parameters that reference resources (e.g., `?user_id=123`, `/api/profile/456`, `{"order_id": 789}`).
- [ ] Change the ID to another user's ID.
- [ ] Does the server grant access? (Read, Update, or Delete).
- [ ] **Bypass techniques**:
  - Parameter Pollution: `?id=123&id=456`
  - Array injection: `{"id": [123, 456]}`
  - Extension swapping: `/api/profile/456.json`

## 2. Vertical Privilege Escalation
- [ ] Identify endpoints reserved for admins (e.g., `/admin/users`, `/api/v1/delete_user`).
- [ ] Attempt to access these endpoints using a low-privileged user's session token.
- [ ] **Method Manipulation**: If `GET /admin/users` is blocked, try `POST`, `PUT`, `PATCH`, or even `OPTIONS`.

## 3. Broken Access Control via Headers
- [ ] Try appending headers to trick the application into thinking you are a local or admin user:
  - `X-Original-URL: /admin`
  - `X-Rewrite-URL: /admin`
  - `X-Custom-IP-Authorization: 127.0.0.1`

## 4. Mass Assignment
- [ ] When updating a profile, inject additional parameters that shouldn't be modifiable.
- [ ] Example: Change `{"username": "test", "email": "test@test.com"}` to `{"username": "test", "email": "test@test.com", "role": "admin", "is_admin": true}`.
