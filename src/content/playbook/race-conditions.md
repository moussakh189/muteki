---
title: "Race Conditions"
tags: [methodology, race-condition]
summary: "Discovering and exploiting race conditions — TOCTOU flaws, limit overrun attacks using Burp parallel requests and Turbo Intruder."
draft: false
---

## 1. Discovery
- [ ] Identify endpoints where state changes happen (e.g., applying a discount code, transferring funds, redeeming a gift card, voting).
- [ ] Look for multi-step processes where limits are enforced (e.g., "You can only use this promo code once").

## 2. Exploitation (Turbo Intruder / Repeater)
- [ ] Send the exact same request concurrently in large batches.
- [ ] In Burp Suite, send the request to Repeater. Group the requests into a tab group, and choose **Send group in parallel (last-byte sync)**.
- [ ] Alternatively, use the Turbo Intruder extension with a race condition script (e.g., `race.py`).
- [ ] Observe the responses: Did the coupon code apply 5 times instead of 1? Did the account balance go negative?

## 3. Limit Overrun (TOCTOU)
- [ ] Time-of-check to time-of-use (TOCTOU) flaws occur when the server checks a condition (e.g., "Balance > 0") and then executes the action (e.g., "Deduct $100") slightly later.
- [ ] Mass parallel requests can sneak multiple "Deduct $100" actions in between the check and the use phase.
