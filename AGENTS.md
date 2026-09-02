<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project-local design skills

- `$frontend-design`: `.agents/skills/frontend-design/SKILL.md`
  - Source: `anthropics/claude-plugins-official/plugins/frontend-design/skills/frontend-design`
- `$ui-ux-pro-max`: `.agents/skills/ui-ux-pro-max/SKILL.md`
  - Source: `nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max`

For Martu OS product-design work, read both skills before changing UI. Use
`$frontend-design` to establish the visual direction and `$ui-ux-pro-max` to
query design-system guidance and run the final UI/UX checklist.
