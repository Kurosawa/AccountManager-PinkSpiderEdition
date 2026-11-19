# AccountManager

An app for safely keeping, per person, the account details of the services in use (URL, account name, password, billing, whether two-factor authentication is on, and so on). It runs on Cloudflare and is open only to invited people.

This file holds the rules for developing with Claude Code. The app was built after the spec was written up in a PRD and a Dev Spec (design document). Both are private; references in code comments such as `Dev Spec 8 章` (chapter 8 of the Dev Spec) and `discussionNN` point to those private documents.

## Main commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the UI and the Worker locally (needs `.dev.vars`; copy `.dev.vars.example` and fill in the values) |
| `npm run db:migrate:local` | Applies migrations to the local D1 (does not touch the production D1) |
| `npm run verify` | Runs the format check, oxlint, type check, unit tests, and build together |
| `npx wrangler deploy` | Deploys. **Always confirm with a human before running it** (steps in `docs/Deploy.md`). If you added to `migrations/`, apply them to the production D1 first (in the reverse order, the new Worker fails when it reads columns that don't exist yet) |

- Stack: React + TypeScript (Vite) SPA / Cloudflare Workers / D1 / Cloudflare Access
- Packages allowed to run install scripts: `workerd` and `esbuild` (`node install.js`, which fetches the binary for the local machine; recorded in `allowScripts` in `package.json`)
- `vite build` copies `.dev.vars` into `dist/`. If you recreate `.dev.vars`, rebuild before previewing.

## Rules

```text
// While implementing

[] Keep secrets outside Git (e.g. in .dev.vars), and never include their contents in output, logs, or commits (check names only)
[] Do not guess URLs of external documentation. If you can't find one, search for it or ask a human
[] Anything decided by guesswork or not yet confirmed must be recorded as such in the design document
[] When asking a human for a decision, write it in a file with options, and keep the answer in the same file (to keep a history)
[] Commit only with a human's permission. A human does the push
[] Delete files or branches only with a human's permission
[] Before adding a new column or value on the server (D1), check it against the rule: "every field is encrypted in the browser, and the server knows no more than whose data it is, when it was written, and how many entries there are"
[] For commands whose output shows the public URL or the D1 ID (wrangler deploy, D1 commands), write the output to a file and mask those values before reading it

// UI design

[] Do not decide the look of the UI on your own; build it through Impeccable commands (PRODUCT.md, DESIGN.md, .impeccable/)
[] Confirm with a human the choice of direction, approval of the brief, and whether to adopt improvements

// Before reporting completion

[] Run npm run verify and confirm the exit code is 0
[] When checking the UI, run npm run build and then restart vite preview before looking (a preview left running serves stale bundles; the dev server does not set the CSP)
[] After changing the UI, check it in a browser (including narrow widths)
[] After changing the design, update the design document
```

From npm 11 on, install scripts are blocked by default (`npm warn install-scripts`). Check what the script does, then allow it with `npm install-scripts approve <pkg>` (the approval is recorded in `allowScripts` in `package.json`).
