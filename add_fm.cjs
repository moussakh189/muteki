const fs = require('fs');

const files = [
  {
    name: 'picoctf-2024-elements.md',
    fm: `---\ntitle: "picoCTF 2024 — Elements"\ndate: 2024-03-01\ntags: [web, blind-xss, csp-bypass, picoctf]\nctf: "picoCTF 2024"\nsummary: "A blind XSS + strict CSP bypass challenge. Data exfiltration from a headless Chrome bot using DNS/WebRTC restrictions, requiring creative side-channels."\ndraft: false\n---\n\n`
  },
  {
    name: 'picoctf-2024-nosql-injection.md',
    fm: `---\ntitle: "picoCTF 2024 — No SQL Injection"\ndate: 2024-03-01\ntags: [web, nosql, mongodb, picoctf]\nctf: "picoCTF 2024"\nsummary: "Bypassing authentication in a Node.js/Express app using MongoDB NoSQL injection to extract the flag from a token field."\ndraft: false\n---\n\n`
  },
  {
    name: 'picoctf-2024-trickster.md',
    fm: `---\ntitle: "picoCTF 2024 — Trickster"\ndate: 2024-03-01\ntags: [web, file-upload, rce, picoctf]\nctf: "picoCTF 2024"\nsummary: "Bypassing PNG file upload validation to achieve Remote Code Execution (RCE) via a malicious PHP file."\ndraft: false\n---\n\n`
  },
  {
    name: 'picoctf-2026-sqlmap1.md',
    fm: `---\ntitle: "picoCTF 2026 — SqlMap1"\ndate: 2026-03-01\ntags: [web, sqli, sqlmap, picoctf]\nctf: "picoCTF 2026"\nsummary: "sqlmap-assisted exploitation of a login form with legacy MD5 hashing — extract the admin hash, crack it, and authenticate to retrieve the flag."\ndraft: false\n---\n\n`
  }
];

for (const { name, fm } of files) {
  const path = `src/content/writeups/${name}`;
  const content = fs.readFileSync(path, 'utf8');
  // Avoid double-prepending if script is re-run
  if (!content.startsWith('---')) {
    fs.writeFileSync(path, fm + content);
  }
}

console.log('Done');
