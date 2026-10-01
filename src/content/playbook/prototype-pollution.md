---
title: "Prototype Pollution"
tags: [methodology, prototype-pollution]
summary: "Client-side and server-side prototype pollution — discovery via merge/clone operations, exploitation through __proto__ injection, gadget identification, and NodeJS RCE."
draft: false
---

## 1. Discovery
- [ ] Identify areas where JavaScript objects are merged, cloned, or parsed from JSON (especially using vulnerable libraries like lodash `_.merge()`).
- [ ] Look for query parameters or JSON bodies that might be recursively merged into objects.

## 2. Exploitation (Client-Side)
- [ ] Inject `__proto__` properties into the URL or JSON.
  ```json
  {"__proto__": {"isAdmin": true}}
  ```
  Or via URL: `?__proto__[isAdmin]=true`
- [ ] Verify if the property polluted the global `Object.prototype` by checking `Object.prototype.isAdmin` in the browser console.
- [ ] Find a "gadget" — a piece of code that uses the polluted property in a dangerous way (e.g., executing a script, changing UI logic).

## 3. Exploitation (Server-Side Node.js)
- [ ] Send prototype pollution payloads to Node.js endpoints.
- [ ] Look for RCE gadgets (e.g., if the server spawns child processes using `child_process.spawn` and doesn't explicitly define `env`, you can pollute `env` variables like `NODE_OPTIONS` to execute code).
