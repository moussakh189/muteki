# Muteki — CTF, Web Security & Vulnerability Research Blog

This is the source code for my personal web security blog and CTF writeup repository. Built with Astro, Tailwind v4, and MDX.

## Content Structure

Content is organized into three collections located in `src/content/`:

1. **Writeups (`/writeups`)**: CTF challenge writeups. These require a `ctf` field in their frontmatter.
2. **Playbook (`/playbook`)**: My web security methodology, attack checklists, and notes. Syncs from the `04 - Methodology` folder in my Obsidian vault.
3. **Blog (`/blog`)**: General posts on things I'm learning, research notes, etc.

## Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Obsidian Integration

This project is designed to be the public output of my personal Obsidian vault.
- Writeups in `05 - Engagements & CTFs` go to `src/content/writeups/`
- Notes in `04 - Methodology` go to `src/content/playbook/`
- Posts in `blog` go to `src/content/blog/`

When migrating methodology files, ensure they have proper YAML frontmatter and that `[[wikilinks]]` are either stripped or handled appropriately. A standard template is available in `WRITEUP_TEMPLATE.md`.

## Tech Stack

- Astro 7.3+
- TailwindCSS v4
- MDX for content
- Geist Sans & Mono fonts
- Shiki for syntax highlighting
