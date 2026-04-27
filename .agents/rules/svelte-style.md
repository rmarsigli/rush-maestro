---
trigger: glob
description: Activates Svelte 5 and SvelteKit coding standards when editing frontend files.
globs: frontend/**/*.svelte
---

# Svelte/SvelteKit File — Active Skills

You are editing a frontend file. You MUST consult the relevant skill before writing or reviewing code:

- **Reactivity & state:** `svelte-runes` — covers `$state`, `$derived`, `$effect`, `$props`, `$bindable`
- **Template directives:** `svelte-template-directives` — covers `{@attach}`, `{@html}`, `{@render}`
- **Routing & layouts:** `sveltekit-structure` — covers file naming, layouts, error boundaries, SSR
- **Data fetching:** `sveltekit-remote-functions` — covers `query()`, `form()`, `command()`, `prerender()`

If the task matches a skill description, read the full SKILL.md before writing code.

## Key conventions (always apply)
- Use `untrack()` for `$state` initialized from `$props` inside `$effect`
- Rune-based stores must use `.svelte.ts` extension (not `.ts`)