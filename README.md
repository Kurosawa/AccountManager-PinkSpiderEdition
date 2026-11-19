# AccountManager

A web app for safely keeping, per person, the account details of the services you use: URLs, account names, passwords, billing, whether two-factor authentication is on, backup codes, and so on. It is meant to be used only by invited people and runs on Cloudflare (Workers, D1, and Access). The UI is in Japanese.

This repository is here to be read as a portfolio piece. Development continues in a private repository; what you see here is a version prepared for showing, squashed into a single commit.

> [!IMPORTANT]
> **This repository is for reading only.**
>
> - There is no live demo or hosted environment you can try.
> - Running it locally or deploying it is not supported. Cloning it does not give you a working app as-is.
> - The design documents and spec discussions it refers to are private and not included.
> - Issues and pull requests are not accepted.

## Security design

- **Encryption happens only in the browser**: Each entry's contents, the settings, and passkey names are encrypted with AES-256-GCM in the browser before they are sent. The server (Workers and D1) holds only ciphertext, so neither the administrator nor Cloudflare can read the contents. All the server can tell is whose data it is, when it was written, and how many entries there are.
- **The master password is never sent**: Keys are derived from the master password with Argon2id and HKDF, and only a verifier is sent to the server, which HMACs it again before comparing. The vault key is stored wrapped in a non-extractable form (Web Crypto `wrapKey`).
- **Swapped ciphertext is detected**: The user ID and row ID are bound into the AAD, so ciphertext moved from another user or another row will fail to decrypt.
- **Two gates**: Only people who pass Cloudflare Access (a one-time code sent by email) can reach the app, and the Worker also verifies the signature, audience, and expiry of the Access token (JWT). On top of that, the vault is unlocked inside the app with the master password.
- **Protection while in use**: The vault locks itself and discards the keys after a period of inactivity; passwords are shown only while you press to reveal them; copied values are cleared from the clipboard after 30 seconds; and repeated wrong attempts add a delay.
- **No room for malicious scripts**: The app loads no external scripts, fonts, or images, and enforces a strict Content Security Policy and Trusted Types.
- **Recovery**: A recovery key (160 bits), plus export and import of backups that stay encrypted.

## Features

- Create, unlock, and lock the vault, or unlock it with the recovery key. It can also be unlocked with a fingerprint or face (passkey PRF).
- List, view, add, edit, and delete services; search and filter by tag; generate strong passwords.
- Monthly billing totals (per currency, optionally converted to yen at rates you set yourself) and reminders for upcoming renewal dates.
- Import from CSV files exported by Chrome and Safari.
- Installable on a phone's home screen as an app (PWA).

## Tech stack

| Area | What is used |
| --- | --- |
| Front end | React 19 + TypeScript, Vite. The router is home-made |
| Server | Cloudflare Workers (`worker/`), D1 (`migrations/`), Cloudflare Access |
| Cryptography | Web Crypto (AES-GCM, HKDF, HMAC), Argon2id (hash-wasm), jose (for the Access JWT) |
| Checks | Vitest (Worker tests run against a local D1; screen tests use React Testing Library on jsdom), oxlint, Prettier, type checking. GitHub Actions runs the same `npm run verify` |
| UI design | Impeccable (`PRODUCT.md`, `DESIGN.md`, `.impeccable/`) |

## Where things are

| Path | Contents |
| --- | --- |
| `src/crypto/` | Key derivation and encryption |
| `src/vault/` | Vault flows, entry contents, backups, import, passkeys, renewal dates, settings |
| `src/screens/`, `src/app.css` | Screens (the settings sections are in `src/screens/settings/`) |
| `worker/` | API, Access verification, sessions, D1 |
| `docs/Deploy.md` | How to deploy to your own Cloudflare account |
| `CLAUDE.md` | Rules for developing with Claude Code |

## How it was built

It was built together with Claude Code (Anthropic's AI coding tool). Rather than having the AI write code straight away, the work went in this order:

1. Write down the requirements, then answer the AI's questions by choosing from options, and consolidate the result into a PRD (what to build) and a Dev Spec (how to build it).
2. For each group of features (a phase), settle the spec before building it. The look of the screens is decided through Impeccable.
3. After building, check what was built against the PRD item by item before calling it done.

The conversations used to settle the spec and the design documents are private. References in code comments such as `Dev Spec 8 章` (chapter 8 of the Dev Spec) and `discussionNN` point to those documents. Code comments are in Japanese.

## For reference (not supported)

```sh
npm ci
cp .dev.vars.example .dev.vars   # fill in the values
npm run db:migrate:local
npm run dev
npm run verify                   # formatting, lint, type check, tests, build
```

Node.js 24 is required. Instructions for deploying to your own Cloudflare account are in `docs/Deploy.md`.

## License

No license is granted. This repository is published to be read; using or redistributing it is not permitted.
