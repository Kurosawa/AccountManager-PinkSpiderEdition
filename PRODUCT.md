# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Used only by close acquaintances whom the administrator has invited through Cloudflare Access. Each person's data is fully separated, and nothing is shared.
- Mostly people comfortable with computers and phones. Many have used another password manager before (discussion12).
- Computers and phones are used about equally. On a computer, the app is open next to a login form; on a phone, it is used to look up a password while out (discussion12).
- Main tasks: look up and copy the account name and password for a service / add a newly subscribed service / check the monthly billing total.

## Product Purpose

Keep each person's account details for the services they use (URL, account name, email address, password, billing, whether two-factor authentication is on, backup codes, and so on) safe, and retrieve them when needed. Billing can be reviewed at a glance as monthly totals per currency.

Success: reaching the password you need within a few seconds, and neither the administrator nor Cloudflare being able to read users' data.

## Positioning

A self-run home for passwords and subscriptions, just for close acquaintances. All encryption and decryption happen in the browser, and the server (Workers and D1) holds only ciphertext. The master password is never sent to the server.

## Operating Context

- Two gates: Cloudflare Access (a one-time code by email, on a screen outside the app) → inside the app, entering the master password opens the main screen.
- After a period of inactivity, the main screen closes automatically (default 5 minutes; choose from 1, 5, 15, or 30 minutes). Closing discards the keys and the decrypted data.
- Passwords are hidden at first and shown only while pressed. Copied values are cleared from the clipboard after 30 seconds.
- If the same entry is edited on two devices at once, the one that saves later is told "ほかの端末で更新されています" (this was updated on another device).

## Capabilities and Constraints

- Screens: first-time setup (writing down the key for account recovery), opening the main screen, account recovery (opening with the recovery key), the list (search, tags, billing totals), details, adding and editing (with a strong password generator), and settings (changing the master password, regenerating the recovery key, the auto-close time, deleting all data).
- UI text is Japanese only. The app is usable at narrow phone widths.
- Build: a React + TypeScript SPA on Cloudflare Workers, D1, and Access, deployed to `*.workers.dev`.
- Security rules (Dev Spec chapter 9): no external scripts, fonts, images, or analytics are loaded (any font must be bundled). A strict Content Security Policy (`style-src 'self'`, so inline `<style>` and style attribute strings cannot be used). Trusted Types are enabled.
- Currencies are yen and US dollars. Two-factor authentication seeds (TOTP) are not stored.
- The Argon2id cost parameters are settled (measured on a phone on 2026-11-17; Dev Spec 3.2 and chapter 11).

## Brand Commitments

- The name is "AccountManager" (at the top of the screen and in the browser tab; discussion12).
- The look follows the familiar password manager pattern (list and details, a calm accent color), built with care. The quality bar is 1Password, Bitwarden, and Apple's Passwords app (discussion15, discussion16). Screens added later follow the same direction.
- Text is written in plain, short Japanese (the style of the PRD, the design documents, and the existing UI text).
- UI terms: 「管理画面を開く・閉じる」 (open / close the main screen), 「はじめての準備」 (first-time setup), 「アカウント復旧のためのキー(復旧キー)」 (the key for account recovery, or recovery key), 「アカウントの復旧」 (account recovery). The words 「金庫」 (vault) and 「回復キー」 (an alternative word for recovery key) are not shown in the UI (discussion13, discussion14; the mapping to the design document's terms is in Dev Spec chapter 12).

## Evidence on Hand

- There are no real user testimonials, track record, or figures. Nothing made up is shown in the UI.
- Local sample data for development: 12 fictional services (`scripts/seed-sample.mjs`).
- Requirements and design: `docs/PRD/PRD.md`, `docs/DevSpec/DevSpec.md`, `Conversation/discussion01〜12.md` (private; not included in this repository).

## Product Principles

1. Security first, convenience second. No shortcuts that weaken protection (for example, the browser is not allowed to remember passwords, and nothing is loaded from outside).
2. Reach the password you need in a few seconds, without hesitation.
3. Secret values appear only when the user chooses to reveal or copy them.
4. Irreversible actions (deleting all data, regenerating the recovery key) are explained clearly and confirmed before they run.
5. Be honest about what is unknown or not possible (no made-up figures or testimonials).
