const fs = require('fs');
const paths = ['src/pages/writeups/[slug].astro', 'src/pages/blog/[slug].astro', 'src/pages/playbook/[slug].astro'];

paths.forEach(p => {
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace("import { getCollection, getEntry } from 'astro:content'", "import { getCollection, render } from 'astro:content'");
  content = content.replace("import { getCollection } from 'astro:content'", "import { getCollection, render } from 'astro:content'");
  content = content.replace("await entry.render()", "render(entry)");
  fs.writeFileSync(p, content);
  console.log('Fixed ' + p);
});
