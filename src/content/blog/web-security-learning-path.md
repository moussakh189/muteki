---
title: "Breaking Into Web Security: A Practical Learning Path"
date: 2026-09-15
tags: [web-security, learning, methodology, ctf]
summary: "How I'm approaching web security as a complete beginner — what actually helped, what wasted time, and the mental model that makes vulnerability classes click."
draft: false
---

I've been at this for about a year now. Started with TryHackMe rooms and OWASP Top 10 theory, got nowhere interesting, then discovered CTFs and things finally started to move.

This isn't a "how to learn web security in 30 days" post. It's more honest than that.

---

## What didn't work

Reading vulnerability descriptions without touching anything. I spent two weeks reading PortSwigger's Web Security Academy articles without doing the labs, convinced that understanding the concept was enough.

It wasn't. Theory without practice is just vocabulary.

The second thing that didn't work: jumping into hard CTF challenges before building any pattern recognition. I'd read a writeup, nod along, think I understood it, then fail to apply anything similar the next time.

## What actually started working

### The labs-first approach

PortSwigger's labs. Do the lab before reading the solution. Fail. Fail again. Then read the solution, understand what you missed, do the next lab.

The failure is the point. Every time you get stuck on something specific — like not knowing how MySQL handles null bytes in prepared statements — that specific confusion burns into memory in a way that reading about it never does.

### Building a methodology doc for each vulnerability class

Instead of reading writeups passively, I started maintaining my own methodology notes for each class (SQLi, XSS, SSRF, etc.). Every time I learn a new bypass or technique from a writeup or lab, I add it to the relevant note.

This is where my [Playbook](/playbook) comes from. It's not complete — it's a living document that grows as I do.

### Playing CTFs with intention

Random CTF entry is fine for exposure. But I started being intentional about which events I play. I pick CTFs with:
- Good web categories (not mostly reverse/pwn)
- Source code provided for web challenges (so I can actually learn from the code)
- Post-event writeup culture

BYUCTF, CrewCTF, and Alpacahack have all been good for this.

---

## The mental model that made vulnerability classes click

Each class of web vulnerability has the same structure once you strip it down:

1. **User input reaches a sink** without sufficient sanitization
2. **The context determines what "sufficient" means** (HTML body, SQL query, JS eval, OS command...)
3. **The bypass is determined by the gap between what the developer thought was sufficient and what actually is**

Every vulnerability I've studied maps onto this. SQLi: user input reaches a SQL query without parameterization. XSS: user input reaches an HTML/JS context without proper escaping. SSRF: user input reaches a URL-fetching function without sufficient blocklist validation.

Once you have this model, reading source code for vulnerabilities becomes: "find where user input goes, trace it to its sink, check the context, check what sanitization exists."

---

## Where I am now

Still early. Still making basic mistakes. Still sometimes staring at a challenge for two hours before realizing the answer was in the first 10 lines of source code.

But the pattern recognition is building. Each writeup I write, each challenge I solve — even the ones I don't fully solve — leaves something behind.

If you're reading this and you're earlier in the journey than me: the confusion is normal. Keep touching things.
