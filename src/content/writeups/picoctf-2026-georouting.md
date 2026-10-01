---
title: "GeoRouting — picoCTF 2026"
date: 2026-03-01
tags: [web, nginx, geo-restriction, picoctf]
ctf: "picoCTF 2026"
summary: "Nginx geo-based routing misconfiguration — the restriction logic only applies to the main location block, leaving a secondary endpoint fully accessible from any IP."
draft: false
---

## Overview

> I've set up geo-based routing — can you outsmart it? Access to the real service is restricted based on your geographic location. Only requests from a specific region are routed to the server that holds the flag.

A link to the full nginx configuration was provided alongside the target URL — the entire vulnerability is visible in that config.

---

## Recon

Visiting the target URL returns a generic "access denied" page. The provided nginx config shows a geo module setup:

```nginx
geo $allowed_country {
    default 0;
    XX.XX.XX.XX/24 1;  # allowed region
}

server {
    location / {
        if ($allowed_country = 0) {
            return 403 "Access restricted to authorized regions only.";
        }
        proxy_pass http://backend/;
    }
    
    location /flag {
        proxy_pass http://backend/flag;
    }
}
```

## Vulnerability

The `geo` restriction is only applied to the `/` location block. The `/flag` location block has **no geo check at all** — it proxies directly to the backend for any IP.

## Exploitation

```bash
curl http://target/flag
# Returns: picoCTF{g30_r0ut1ng_byp4ss_...}
```

Direct access to `/flag` bypasses the geo restriction entirely.

## Lessons Learned

- Nginx geo restrictions must be applied to **every** location block that serves sensitive content, or applied at the server level
- Reading the provided config first saved hours of blind probing
- Security misconfigurations are often in what's missing, not what's present
