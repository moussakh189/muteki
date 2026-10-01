---
title: "Master Web App Pentest Checklist"
tags: [methodology, master-checklist, owasp]
summary: "Full-coverage web application pentest checklist: recon, mapping, vulnerability discovery across injection/IAM/network/logic categories, and post-exploitation."
draft: false
---

*Duplicate this entry for every new engagement or target.*

## Phase 1: Reconnaissance (Information Gathering)
- [ ] **Subdomain Enumeration**: Use `Amass`, `Sublist3r`, `findomain`.
- [ ] **Port Scanning**: Run `Nmap` (all TCP ports + Top 100 UDP).
- [ ] **Tech Stack Fingerprinting**: Use Wappalyzer, WhatWeb, or BuiltWith.
- [ ] **Directory Brute-Forcing**: Run `ffuf` or `Gobuster` for hidden paths.
- [ ] **Parameter Fuzzing**: Use `Arjun` or `ffuf` to find hidden parameters.
- [ ] **GitHub Recon**: Search for leaked API keys, hardcoded credentials, and source code.
- [ ] **JavaScript Analysis**: Extract endpoints from `.js` files using `LinkFinder`.

## Phase 2: Mapping the Application
- [ ] **Spider/Crawl**: Walk through the entire application using Burp Suite proxy.
- [ ] **User Roles**: Create multiple accounts (Admin, User A, User B, Unauthenticated).
- [ ] **Identify Attack Surface**:
  - Login/Registration forms
  - File Uploads
  - APIs / JSON / XML endpoints
  - Search fields

## Phase 3: Vulnerability Discovery & Exploitation

### Identity & Access Management
- [ ] **Authentication**: Test for brute-force, password reset logic, OAuth flaws. → [Authentication](/playbook/authentication)
- [ ] **Authorization (IDOR/PrivEsc)**: Check if User A can access User B's data, or access Admin functions. → [Access Control](/playbook/access-control)
- [ ] **Session Management**: Test JWT tokens, cookie flags (`HttpOnly`, `Secure`), and session fixation. → [JWT Attacks](/playbook/jwt-attacks)

### Injection Flaws
- [ ] **SQL Injection (SQLi)**: Test all inputs connecting to the database. → [SQLi](/playbook/sqli)
- [ ] **Cross-Site Scripting (XSS)**: Test for Reflected, Stored, and DOM-based XSS. → [XSS](/playbook/xss)
- [ ] **XML External Entity (XXE)**: Inject external entities into XML/SOAP requests. → [XXE](/playbook/xxe)
- [ ] **Command Injection**: Test parameters that might interact with the OS (ping, traceroute).

### Network & Server Level
- [ ] **Server-Side Request Forgery (SSRF)**: Test URL inputs to access internal metadata (`169.254.169.254`). → [SSRF](/playbook/ssrf)
- [ ] **File Inclusion (LFI/RFI)**: Try reading `/etc/passwd` via file parameters. → [File Inclusion](/playbook/file-inclusion)
- [ ] **CORS Misconfigurations**: Check if `Access-Control-Allow-Origin: *` is returned with credentials allowed.

### Advanced Logic Flaws
- [ ] **Race Conditions**: Perform simultaneous actions (e.g., applying a coupon twice). → [Race Conditions](/playbook/race-conditions)
- [ ] **GraphQL Introspection**: Dump the schema and look for hidden mutations/fields. → [GraphQL](/playbook/graphql)
- [ ] **WebSockets**: Hijack WebSockets or inject malicious payloads over the socket. → [WebSockets](/playbook/websockets)
- [ ] **Prototype Pollution**: Inject `__proto__` to alter JavaScript object prototypes. → [Prototype Pollution](/playbook/prototype-pollution)
- [ ] **Out-of-Band (OOB) Testing**: When blind, force DNS lookups via Burp Collaborator. → [OOB Attacks](/playbook/oob-attacks)

## Phase 4: Post-Exploitation & Reporting
- [ ] Document all successful exploits with steps-to-reproduce (PoC).
- [ ] Assess the real-world business impact.
- [ ] Draft the final report.
