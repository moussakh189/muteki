---
title: "WebSockets"
tags: [methodology, websockets]
summary: "Testing WebSocket security — message manipulation, Cross-Site WebSocket Hijacking (CSWSH), and authorization checks during vs. after handshake."
draft: false
---

## 1. Discovery
- [ ] Look for `wss://` or `ws://` traffic in the Burp Proxy history.
- [ ] Check HTTP requests for `Upgrade: websocket` headers.

## 2. Exploitation
- [ ] **Message Manipulation**: Intercept and modify WebSocket messages in transit (similar to HTTP requests). Test for SQLi, XSS, and IDOR in the JSON/XML payloads sent over the socket.
- [ ] **Cross-Site WebSocket Hijacking (CSWSH)**:
  - This is CSRF for WebSockets.
  - Check if the WebSocket handshake request relies solely on cookies for authentication and lacks CSRF tokens.
  - If vulnerable, an attacker site can initiate a WebSocket connection to the vulnerable server on behalf of the victim and read/write data.

## 3. Escalation
- [ ] Check if the application performs authorization checks on *every* WebSocket message, or only during the initial handshake. If only during the handshake, privilege escalation might be possible by manipulating message parameters.
