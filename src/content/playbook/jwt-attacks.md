---
title: "JWT Attacks"
tags: [methodology, jwt]
summary: "JWT exploitation — none algorithm, signature stripping, RS256→HS256 confusion, secret cracking, and JKU/JWK/KID injection."
draft: false
---

## 1. Inspection
- [ ] Decode the JWT (base64) using jwt.io or Burp Suite.
- [ ] Analyze the header (`alg`, `typ`) and payload (`sub`, `name`, `admin`, `role`).

## 2. Signature Bypasses
- [ ] **None Algorithm**: Change the algorithm in the header to `None` or `none`, remove the signature, and try to use it.
- [ ] **Signature Stripping**: Delete the signature entirely but keep the trailing dot (`header.payload.`).
- [ ] **Algorithm Confusion (RS256 to HS256)**: If you have the public key, sign the token using HMAC (HS256) with the public key as the secret.

## 3. Secret Cracking
- [ ] If the token uses HS256, attempt to crack the secret using Hashcat or John the Ripper.
  ```bash
  hashcat -a 0 -m 16500 jwt.txt rockyou.txt
  ```

## 4. Payload Manipulation
- [ ] Modify claims in the payload (e.g., `"admin": true`, or change `"user_id"` to another user's ID).
- [ ] Check if the server properly validates the expiration (`exp`) claim.

## 5. Key Injection (JKU/JWK/KID)
- [ ] **KID Traversal**: If `kid` is a file path, try directory traversal (`../../../../dev/null`) and sign with an empty secret.
- [ ] **JKU/JWK Injection**: Provide your own JWK (JSON Web Key) in the header or point `jku` to your own server hosting a public key, then sign the token with your corresponding private key.
