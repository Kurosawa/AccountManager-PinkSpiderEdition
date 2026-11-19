# AccountManager Dev Spec (draft)

> Note for the public copy: this is the working version from the private repository, translated into English. The files it refers to (`docs/Wish.md`, `Conversation/discussionNN.md`, `docs/Guide.md`) are private and not included. The UI is in Japanese, so on-screen wording is quoted in Japanese with an English gloss. Section numbers are kept, because code comments refer to them (`Dev Spec 8 章` means chapter 8). File paths are as they were when each section was written; since then the settings sections of `src/screens/SettingsScreen.tsx` have moved to `src/screens/settings/`.

- Version: 0.24 (2026-11-18. 0.2: confirmed by the user. 0.3: matched to the step 1 implementation (the router is home-made, the linter is oxlint, and Trusted Types was confirmed to work while enabled). 0.4: matched to step 2; added 3.5. 0.5: renamed "段" to "step" (discussion06). 0.6: matched to step 3; added 5.6 and the responses in chapter 8. 0.7: recorded the source of the list in 9.5. 0.8: matched to step 4; added 6.1. 0.9: matched to step 5; added 8.1. 0.10: added chapter 12 (design terms vs. UI terms). 0.11: matched to the step 7 deployment; added the procedure `docs/Deploy.md` to chapter 4 and wrote down how Access is applied (discussion19, 20). 0.12: added chapter 13 (known limitations) and showed the created and updated dates on the detail screen (discussion22, 23). 0.13: added chapter 14 (backups, phase 2 item 1; discussion25, 26). 0.14: added chapter 15 (PWA, phase 2 item 2; discussion29, 30). 0.15: added the iPhone check to chapter 15. 0.16: added chapter 16 (import from other apps, phase 2 item 3; discussion32). 0.17: added the handling of the iPhone ZIP to chapter 16 (discussion35, 36). 0.18: added chapter 17 (passkeys, phase 2 item 4; discussion38). 0.19: added passkey unlock to chapter 17 (discussion40). 0.20: changed the layout of the unlock screen and which devices show the button (discussion43). 0.21: encrypted passkey names and added chapter 18 (the phase 2 check; discussion47). 0.22: added chapter 19 (renewal reminders, phase 3 item 1; discussion51). 0.23: added chapter 20 (conversion rate, phase 3 item 2; discussion53). 0.24: recorded the answers of discussion57 in chapter 13 and 18.1)
- Sources: `docs/PRD/PRD.md` (version 0.2), `Conversation/discussion01–14.md`
- Scope: phases 1, 2, and 3 of the PRD
- Parts marked "provisional" are to be measured and decided again while building

---

## 1. Architecture

```text
Browser (React + TypeScript SPA)
  ├─ All encryption, decryption, and key generation happen here
  │
  │ HTTPS (same origin; carries the Access login cookie)
  ▼
Cloudflare Access (one-time code by email; a login lasts 24 hours)
  ▼
Cloudflare Workers (one Worker serves both the UI files and /api/*)
  ├─ Verifies the Access JWT on every request
  ├─ Checks the auth token, counts failures, manages sessions
  ▼
D1 (holds only encrypted data and the values used for checks)
```

| Part | What is used |
| --- | --- |
| UI | React, TypeScript, Vite |
| Key derivation | Argon2id (`hash-wasm`, pinned to 4.12.0. The WebAssembly is bundled with the app and not loaded from outside; discussion04) |
| Other cryptography | The browser's built-in Web Crypto (AES-256-GCM, HKDF-SHA256, SHA-256) |
| Server | Cloudflare Workers (a small home-made router, to keep the number of dependencies down) |
| Access JWT verification | `jose` |
| Data | D1 |
| Tests | Vitest (D1 is started locally with wrangler's `getPlatformProxy`) |

Keep dependencies few and pin their versions (commit `package-lock.json`).

---

## 2. What is protected, and from whom

### 2.1 What is protected

| Adversary | Protection |
| --- | --- |
| People who cannot get through Access | Access keeps both the UI and the API closed to them |
| Someone who stole the contents of D1 | There is only ciphertext. Argon2id slows brute force down |
| Someone who got through Access but does not know the master password (e.g. who stole the device) | Without a matching auth token, the encrypted data itself is not handed over. After 10 failures in a row, they must wait 1 hour |
| The administrator, people inside Cloudflare | The keys exist only in the browser. They cannot be read from the server |
| Other users | Every API matches the Access user against the owner in D1 |
| A device left open and unattended | After 5 minutes without interaction (1–30 in settings), the vault closes and the keys are discarded |

### 2.2 What cannot be fully protected (stated honestly)

- **If the served UI files themselves are tampered with**: if the Cloudflare account is taken over and a UI that steals passwords is served, this cannot be prevented (a weakness shared by all web-based password managers). Mitigated by enabling two-factor authentication on the Cloudflare account and deploying only from the local machine
- **If the device itself has malware**: the typed master password can be stolen
- **If D1 is stolen and the master password is weak**: brute force can be slowed but not stopped. That is why at least 12 characters are required

---

## 3. Key design

### 3.1 Values

| Name | How it is made | Where it is kept |
| --- | --- | --- |
| Vault key | 256 random bits when the vault is created | Only its wrapped (encrypted) form is stored in D1 |
| salt | 16 random bytes. Regenerated every time the master password changes | D1 (not secret) |
| Parent key | Argon2id(master password, salt) → 32 bytes | Browser memory only. Discarded right after use |
| Wrapping key | HKDF(parent key, `am:v1:wrap`) | Browser memory only |
| Auth token | HKDF(parent key, `am:v1:auth`) | Sent to the server. D1 holds only its HMAC |
| Recovery key | 160 random bits. 32 alphanumeric characters (grouped in fours) | Only in the user's written copy |
| Recovery wrapping key, recovery auth token | HKDF(recovery key, recovery salt, `am:v1:rk-wrap` / `am:v1:rk-auth`) | The wrapping key stays in memory only. The auth token's HMAC is stored in D1 |

- The vault key is wrapped twice, separately, with the wrapping key and with the recovery wrapping key, and both are stored in D1. Changing the master password only rewraps it; the data is not re-encrypted
- The recovery key is a long enough random value, so it goes through HKDF only, not Argon2id
- The auth token is separate from the wrapping key, so even if the server learns the auth token it cannot open the vault key

### 3.2 Argon2id strength

- Values: 64 MiB of memory, 3 iterations, parallelism 1 (provisional at first; as chapter 11 says, they were measured on a phone and kept)
- Measured so that it takes about 1 second on a phone. The values are stored per user in D1 (`kdf_params`) so they can be strengthened later (rederived with the new values when the master password changes)

### 3.3 Encrypting an entry

- One entry = one row. Its contents (all fields in chapter 4) are serialized as JSON and encrypted with AES-256-GCM
- The IV is 12 random bytes each time
- The additional authenticated data (AAD) is `am:v1:entry:<user ID>:<entry ID>`. If the ciphertext is swapped with another row's or another person's, decryption fails
- The settings (auto-lock time, etc.) are also encrypted the same way as a single blob (AAD `am:v1:settings:<user ID>`)

### 3.4 Handling keys in the browser

- The vault key is held in memory as a non-extractable CryptoKey (`extractable: false`)
- Only when rewrapping is needed (changing the master password, regenerating the recovery key, recovery) is it reopened from the wrapped form in an extractable form, and discarded afterwards
- Byte arrays such as the parent key are filled with zeros after use
- Keys, decrypted data, and the session token are never put in localStorage, sessionStorage, or IndexedDB (reloading closes the vault)

### 3.5 Details decided in step 2 (decided by Claude; to be corrected if anything seems off)

Code: `src/crypto/`.

| Item | Decision | Reason |
| --- | --- | --- |
| Checking `kdf_params` | The browser checks the range and refuses to derive a key outside it (provisional: memory 19–1024 MiB, iterations 2–10, parallelism 1–4) | So that even if the server or D1 is tampered with and weak values are handed over, no easily brute-forced key is made. The lower bound is OWASP's minimum recommendation for Argon2id |
| Master password characters | Normalized to Unicode NFC before being passed to Argon2id | Depending on the device (macOS, etc.), Japanese text that looks the same can have different bytes |
| HKDF from the parent key | The salt is empty (the parent key already differs per user because of the Argon2id salt) | As in the table in 3.1 |
| Wrapping the vault key | Web Crypto `wrapKey` / `unwrapKey` (AES-256-GCM). Format: IV (12 bytes) + ciphertext. AAD `am:v1:vault-key:<user ID>` | Keeps the vault key's bytes out of JavaScript. The AAD stops it opening if swapped with another person's row |
| Encrypting entries and settings | Format: IV (12 bytes) + ciphertext. After decryption, the caller (step 4) checks the shape of the contents | As in 3.3 |
| Recovery key characters | Crockford's Base32 (`0-9` and the uppercase letters except `I`, `L`, `O`, `U`). When reading, case, spaces, and `-` are ignored; `O` is read as `0`, and `I` and `L` as `1` | So that misreading a written copy does not lock the user out |
| Checking Argon2id | A test compares hash-wasm's output with Node.js's built-in Argon2id (OpenSSL) (`src/crypto/argon2.node.test.ts`) | To confirm with a separate implementation that the bundled WebAssembly computes correctly (discussion04) |

- Not fully protected: the master password string (a JavaScript string) and the contents of hash-wasm's WebAssembly memory cannot be zeroed

---

## 4. Identifying users, and Access

- On every request, the Worker verifies the JWT in `Cf-Access-Jwt-Assertion` (signature, `aud`, expiry, issuer). The public keys are fetched from `https://<TEAM_DOMAIN>/cdn-cgi/access/certs` and cached briefly in the Worker
- User ID = HMAC-SHA256(`USER_ID_PEPPER`, the lowercased email address). D1 never stores the email address itself
  - If someone is removed from Access and added back, the same email address gives the same ID, so they carry on where they left off (PRD chapter 2)
  - If `USER_ID_PEPPER` is lost, there is no way to tell whose data is whose. The administrator keeps a copy
- Put Access in front of `*.workers.dev`. Preview URLs are either not used (turned off) or also put behind Access
- Create a new Access policy for this app. A login lasts 24 hours
- The deployment and Access setup steps are in `docs/Deploy.md`. Access is applied to workers.dev from the Worker's Domains & Routes screen (Scope: All traffic). The automatically added "Cloudflare account members" policy is removed, leaving only this app's policy (discussion20)
- The login method is One-time PIN (Cloudflare One → Integrations → Identity providers). Access applied from a Worker has no per-application setting for choosing the login method
- No JWKS is registered. The Worker fetches the public keys from `ACCESS_TEAM_DOMAIN`

### 4.1 Secret values (Worker secrets)

| Name | Contents |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | The host name of the Access team (the host only, not a URL) |
| `ACCESS_AUD` | The AUD of the Access application |
| `USER_ID_PEPPER` | The key that turns an email address into a user ID (32 random bytes) |
| `AUTH_PEPPER` | The key used to HMAC auth tokens (32 random bytes) |

For local development they go in `.dev.vars` (outside Git). Their contents are never included in output, logs, or commits.

### 4.2 Access in local development

- There is no Access locally, so `DEV_ACCESS_EMAIL` in `.dev.vars` is treated as the user
- This bypass takes effect only when `ENVIRONMENT=development` and the request's host is `localhost` or `127.0.0.1`. The production configuration (`wrangler.jsonc`) does not set `ENVIRONMENT`
- A test confirms that the bypass does not work with the production configuration

---

## 5. Unlock flows

### 5.1 Creating the vault

1. UI: enter the master password twice (at least 12 characters, not on the list of common passwords)
2. Browser: generate the salt, recovery salt, vault key, and recovery key. Derive the wrapping key and auth token from the parent key, and the recovery wrapping key and recovery auth token from the recovery key
3. UI: show the recovery key. The user retypes its last 4 characters
4. Browser → server: `kdf_params`, salt, auth token, wrapped vault key, recovery salt, recovery auth token, vault key wrapped for recovery, encrypted settings
5. Server: HMAC the auth token and the recovery auth token and store them. Start a session

### 5.2 Unlocking the vault

1. Browser → server: `GET /api/me` returns the user ID, whether a vault exists, `kdf_params`, the salt, and the time until which the user must wait
2. Browser: derive the parent key from the master password and split it into the wrapping key and auth token
3. Browser → server: send the auth token to `POST /api/unlock`
4. Server: HMAC it and compare with the stored value (a comparison whose time does not depend on the contents)
   - If it matches: reset the failure count to 0, and return the session token, the wrapped vault key, and the encrypted settings
   - If not: add 1 to the failure count. At 10, make the user wait 1 hour (`locked_until`) and reset the count to 0
   - While the user must wait, even a correct value is not accepted
5. Browser: open the vault key with the wrapping key. Discard the parent key and the wrapping key

### 5.3 Unlocking with the recovery key

1. Browser: derive the recovery wrapping key and recovery auth token from the recovery key
2. Browser → server: send the recovery auth token to `POST /api/recover`. Failures are counted as in 5.2 (shared with the master password)
3. Server: if it matches, return a token usable only for recovery (expires in 10 minutes) and the vault key wrapped for recovery
4. UI: choose a new master password. The browser rewraps from a new salt and replaces the values with `POST /api/recover/complete`
5. All sessions on other devices are ended. The recovery key keeps working

### 5.4 Sessions

- The token is 32 random bytes. It is kept only in browser memory and sent as `Authorization: Bearer` (not a cookie, so forged requests from other sites do not get through)
- D1 holds only its SHA-256. The token is bound to the Access user and cannot be used with another user's JWT
- Expires 30 minutes after last use, and 12 hours after creation (provisional)
- Closing the vault ends it with `POST /api/lock`

### 5.5 Closing the vault

- Closes once the configured time has passed since the last action (press, typing, scrolling). Time keeps counting while the tab is hidden
- On closing: discard the vault key, the decrypted data, and the token, call `/api/lock`, and go back to the unlock screen

---

### 5.6 Details decided in step 3 (decided by Claude; to be corrected if anything seems off)

Code: `worker/vault.ts`, `worker/session.ts` (Worker), and `src/vault/`, `src/screens/` (UI).

| Item | Decision | Reason |
| --- | --- | --- |
| Counting failures | Add 1 to the count **before** comparing the auth token (in a single D1 UPDATE). Reset to 0 on a match. If the comparison was the 10th, a miss makes the user wait. The 11th and later (sent concurrently) are not compared and are made to wait | Even if many are sent at once, at most 10 are compared before the wait. Confirmed by a test that sends 25 at once |
| Attempts while waiting | Refused with 429 without counting | So the vault can be opened right after the wait ends |
| Comparing the auth token | Web Crypto HMAC `verify` | The comparison time does not depend on the contents |
| Completing recovery | Also reset the failure count and the wait time. Delete all of the user's sessions, including the recovery token, and return a new vault session | The user has been confirmed as the holder of the recovery key |
| `/api/lock` | Ends both vault tokens and recovery tokens | So that abandoning a recovery also ends it |
| Cleaning up expired sessions | When creating a new session, delete that user's expired ones | Avoids a separate scheduled job |
| `kdf_params` in the UI | If the values from `/api/me` are outside the range in 3.5, refuse to derive a key and show an error | As in 3.5 |
| Order when creating the vault | Derive and wrap the keys → show the recovery key → check the last 4 characters → send. Nothing is sent to the server until the check | As in 5.1 |
| Automatic locking | Presses, typing, scrolling, wheel, and touch update the timestamp. Compare times every 5 seconds and when the tab comes back to the front | Even if timers are throttled while the tab is hidden, it closes on return |
| Where Argon2id runs | On the UI's main thread. Paint "鍵を作っています…" (Making the key…) before starting | About 0.3 seconds on the local PC. On 2026-11-17, on the user's iPhone 15 Pro (production), the time from the press to the list appearing was under 1 second all 3 times, so it was not moved to a Web Worker |
| D1 BLOBs | Values read back are accepted as an ArrayBuffer, a typed array, or an array of numbers, and normalized to bytes (`blobBytes`) | The local D1 sometimes did not return an ArrayBuffer |

- Confirmed: in a local browser (same build and CSP as production), the Argon2id WebAssembly ran without CSP violations and the vault could be unlocked. The create, unlock, lock, auto-lock, and recovery flows were checked on the dev server
- The dev server (`npm run dev`) does not add the CSP to the UI files (`public/_headers` applies only to the build). Check the CSP with `vite preview` after `vite build`

## 6. Entry contents (the JSON before encryption)

```ts
type Entry = {
  schema: 1
  serviceName: string // required
  url?: string // only http: and https: are accepted
  accountName?: string
  email?: string
  displayName?: string
  summary?: string
  password?: string
  billing?: {
    amount: number // yen is an integer; dollars allow up to 2 decimal places
    currency: 'JPY' | 'USD'
    cycle: 'monthly' | 'yearly' | 'once'
    nextRenewal?: string // YYYY-MM-DD
  }
  twoFactor?: {
    enabled: boolean
    methods: Array<'sms' | 'app' | 'securityKey' | 'email' | 'other'>
  }
  backupCodes?: string
  tags: string[]
  memo?: string
  createdAt: string
  updatedAt: string
}
```

- The created and updated times are stored inside too (the D1 timestamps are not used for sorting)
- The totals (PRD 5.1) are computed in the browser after decryption

---

### 6.1 Details decided in step 4 (decided by Claude; to be corrected if anything seems off)

Code: `worker/entries.ts` (Worker), and `src/vault/entry*.ts`, `entries.ts`, `clipboard.ts`, `password-generator.ts`, `src/screens/Entry*.tsx`, `VaultHome.tsx` (UI).

| Item | Decision | Reason |
| --- | --- | --- |
| Entry ID | A lowercase UUID made in the browser (`crypto.randomUUID`). 400 if the format is wrong | As in chapter 7 |
| Adding | The count check and the insert are a single SQL statement. 409 `entry_exists` if the ID already exists, 409 `limit_reached` at the limit | The limit is not exceeded even with concurrent adds |
| Updating, deleting | `expectedVersion` and ownership are conditions of a single SQL statement. 409 `version_conflict` if the version differs, 404 if the user has no such entry | Of 5 concurrent updates only 1 succeeds (confirmed by a test). Whether another person's entry exists cannot be learned |
| On 409 | Show "ほかの端末で更新されています" (Updated on another device) and "読み込み直す" (Reload). Reloading discards what was being typed and goes back to the list | discussion03 item 6 |
| Entries that cannot be decrypted | Not shown in the list; show "読めない件が N 件あります" (N entries cannot be read) | So swapped or corrupted rows do not break the screen |
| Checking decrypted contents | Fields with the wrong shape are dropped (`parseEntry`). Without a service name, the entry counts as unreadable | Protects the UI from old versions and corrupted values |
| Search | Entries containing all space-separated words. Full-width/half-width and case are ignored (NFKC). Covers service name, URL, account name, email address, display name, summary, memo, and tags. Passwords and backup codes are not searched | So secret values cannot be guessed through search |
| Tag filter | Pick one ("all" or a single tag) | Provisional. Whether to allow several will be decided after use |
| Order | By service name in Japanese collation, then by account name | — |
| Totals | Computed over all entries regardless of the filter. Rounded after summing (yen to integers, dollars to cents) | As in 5.1 |
| Tag input | Separated by "、", ",", or full-width "，". Surrounding spaces removed, duplicates removed | — |
| Spaces in passwords | Passwords and backup codes keep leading and trailing spaces as part of the value. Other fields are trimmed | Spaces in a password can be meaningful |
| Secret fields | Passwords and backup codes are masked. Copy is offered for the account name, email address, password, and backup codes | PRD 3.4 |
| Password generation | Regenerate until every chosen character class appears at least once. Each character is picked without bias by discarding out-of-range random values | As in 9.4 |
| Deleting | Press "削除する" (Delete) twice ("元には戻せません" (This cannot be undone) is shown before the second) | — |
| When the session expires | If a read or write returns `invalid_session`, close the vault | When the server session (30 minutes) expires first |
| Long strings | Only `overflow-wrap: anywhere` is put in `src/base.css` so nothing overflows sideways on narrow screens (the look is step 6) | Long URLs and memos without spaces overflowed |

- Confirmed (headless Chrome at 375px and 1280px; the same flow was also run on a production build, with 0 CSP violations): add → detail → reveal and copy → second entry → totals, search, tags → updated on another device while editing (409) → reload and edit → delete → closing empties the clipboard → the clipboard empties after 30 seconds
- Clearing after returning to the front when the tab was in the background and could not clear (9.3): checked by the user in production Chrome on 2026-11-17. While on another tab (about 40 seconds) the value stayed on the clipboard, and it was cleared on returning to the tab

## 7. D1 tables

```sql
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,   -- HMAC(email address)
  kdf_params            TEXT NOT NULL,      -- {"alg":"argon2id","m":65536,"t":3,"p":1}
  salt                  BLOB NOT NULL,
  auth_hash             BLOB NOT NULL,      -- HMAC(AUTH_PEPPER, auth token)
  wrapped_key           BLOB NOT NULL,      -- vault key wrapped with the wrapping key (includes the IV)
  recovery_salt         BLOB NOT NULL,
  recovery_auth_hash    BLOB NOT NULL,
  recovery_wrapped_key  BLOB NOT NULL,
  settings_ct           BLOB NOT NULL,      -- encrypted settings (includes the IV)
  settings_version      INTEGER NOT NULL DEFAULT 1,
  failed_count          INTEGER NOT NULL DEFAULT 0,
  locked_until          INTEGER,            -- UNIX time (milliseconds)
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE entries (
  id          TEXT PRIMARY KEY,             -- UUID made in the browser
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  ciphertext  BLOB NOT NULL,                -- IV + ciphertext
  updated_at  INTEGER NOT NULL
);
CREATE INDEX entries_user ON entries(user_id);

CREATE TABLE sessions (
  token_hash  BLOB PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,                -- 'vault' or 'recover'
  created_at  INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
```

- Rows of people removed from Access are not deleted (PRD chapter 2)

---

## 8. API

Everything is under `/api/*` on the same origin. The Access JWT is verified on every request. Where the Token column says "Required", the token from 5.4 is also required.

| Method and path | Token | Contents |
| --- | --- | --- |
| `GET /api/me` | Not needed | User ID (used in the AAD), whether a vault exists, `kdf_params`, salt, recovery salt, time until which the user must wait |
| `POST /api/vault` | Not needed | Create the vault (409 if it already exists) |
| `POST /api/unlock` | Not needed | Check the auth token; return the token, the wrapped vault key, and the settings |
| `POST /api/recover` | Not needed | Check the recovery auth token; return a recovery token |
| `POST /api/recover/complete` | Recovery | Replace the values with those of the new master password |
| `POST /api/lock` | Required | End the token |
| `GET /api/entries` | Required | All entries (still encrypted) |
| `POST /api/entries` | Required | Add one entry |
| `PUT /api/entries/:id` | Required | Update one entry. 409 if `expectedVersion` differs |
| `DELETE /api/entries/:id` | Required | Delete one entry. 409 if `expectedVersion` differs |
| `PUT /api/settings` | Required | Update the settings. 409 if `expectedVersion` differs |
| `POST /api/password` | Required | Change the master password. Also requires the current auth token. Ends other sessions |
| `POST /api/recovery-key` | Required | Regenerate the recovery key. Also requires the current auth token |
| `POST /api/delete-all` | Required | Delete all of one's own data. Also requires the current auth token |

- On 409, the UI shows "ほかの端末で更新されています" (Updated on another device) and has the user reload (discussion03 item 6)
- Operations that require the current auth token also count toward failures
- Size limits (provisional): 64 KB per entry ciphertext, 2,000 entries per person, 256 KB per request body
- Error bodies return only the kind of reason (`locked`, etc.) and the wait time, never internal information

| Status | Reason | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not JSON, has the wrong shape or length, or `kdf_params` is out of range |
| 401 | `unauthorized` | The Access user cannot be verified |
| 401 | `invalid_session` | The token is missing, expired, for the wrong purpose, or another user's |
| 403 | `wrong_secret` | The auth token (or recovery auth token) is wrong |
| 404 | `no_vault` | There is no vault yet |
| 409 | `vault_exists` | A vault already exists |
| 413 | `too_large` | The body exceeds 256 KB |
| 429 | `locked` | The user must wait (`lockedUntil` is also returned) |
| 500 | `server_misconfigured` / `internal_error` | A secret is missing / an unexpected exception (the log shows only the path, the exception type, and the D1 error message) |

---

### 8.1 Details decided in step 5 (decided by Claude; to be corrected if anything seems off)

Code: `worker/settings.ts` (Worker), and the second half of `src/vault/flows.ts` and `src/screens/SettingsScreen.tsx` (UI).

| Item | Decision | Reason |
| --- | --- | --- |
| Order of checking the current auth token | The server checks `currentAuthToken` **before any other field** and counts failures (the same 10 attempts / 1 hour as unlocking) | Chapter 8: "Operations that require the current auth token also count toward failures" |
| When the current master password is wrong | The UI can tell it is wrong because the wrapped vault key does not open, but it **sends only the auth token** so the server counts it. When only the auth token is sent, the server returns 400 even if it matches, and replaces nothing | So that on a device left open, the current master password cannot be tried from the UI without being counted. It also never replaces the vault key using a wrong value |
| Values held by the UI | The open vault holds the current salt, `kdf_params`, and the wrapped vault key (ciphertext) | Needed for rewrapping. All are ciphertext or non-secret values |
| Changing the master password | Rederive with a new salt and the current default `kdf_params`. Keep this session, end the others. Reset the failure count to 0 | As in 3.2 and chapter 8 |
| Regenerating the recovery key | Check the current master password → show the new recovery key → check its last 4 characters → send. Until the check, the old recovery key stays. Sessions are not ended | The same way of writing it down as 5.1 |
| Auto-lock time | Chosen from 1, 5, 15, and 30 minutes and saved as encrypted settings (409 if the version differs) | PRD 3.4 |
| 409 on settings | Show "ほかの端末で設定が変わっています。金庫を閉じて開け直してから、もう一度" (Settings were changed on another device. Close and reopen, then try again) | There is only one settings blob, so reopening and reading the latest is simplest |
| Deleting all data | First: the current master password and a tick for "元に戻せないことを分かっています" (I understand this cannot be undone). Second: "本当にすべて消しますか" (Really delete everything?). After deleting, go back to the vault creation screen | PRD 5.2 "asks for confirmation twice" |

- Confirmed (headless Chrome, production build, 375px, 0 CSP violations): change the auto-lock time and reopen → change the master password (wrong current one / the old one no longer opens / the new one opens) → regenerate the recovery key (wrong current one / wrong last 4 characters) → both confirmations of deleting all data
- To keep the data in the local D1 (discussion09), deleting all data was not sent from the browser; success was returned instead. That the data is actually deleted was confirmed by the Worker tests

## 9. Protection on the UI side

### 9.1 Response headers

Added to both the UI files and the API.

```text
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store            (the API and index.html; hashed files may be cached long)
```

- `'wasm-unsafe-eval'` is needed for the Argon2id WebAssembly
- `require-trusted-types-for 'script'` was confirmed in a browser in step 1 not to conflict with the React 19 and Vite build (no CSP violations)

### 9.2 Coding rules

- Do not use `dangerouslySetInnerHTML`, `eval`, or `new Function` (oxlint blocks them). Writes to `innerHTML` and the like are blocked in the browser by the Trusted Types CSP
- When turning a URL into a link, allow only `http:` and `https:` (so a `javascript:` URL cannot run a malicious script). Links get `rel="noopener noreferrer"`
- Do not load external scripts, fonts, images, or tracking tags
- Input fields get `autocomplete="off"`, and the browser is not allowed to remember the master password field (provisional; some browsers ignore it)

### 9.3 Clipboard

- 30 seconds after copying, clear it by writing an empty string
- Browsers cannot write to the clipboard unless the tab is in front. If clearing fails, clear when the tab comes back to the front. Also clear when the vault closes

### 9.4 Password generation

- Use `crypto.getRandomValues` and pick characters without bias
- Defaults: 20 characters; uppercase, lowercase, digits, and symbols. The length (8–64) and the character classes can be changed in the UI

### 9.5 Master password rules

- At least 12 characters
- Not on a list of common passwords (about 10,000). The list is bundled with the app
  - The list: from SecLists (MIT), the list of 1 million leaked passwords (`xato-net-10-million-passwords-1000000.txt`, commit `913b327`), the first 10,000 entries of 12 or more characters, keeping the order by frequency. `src/vault/common-passwords.txt` (how it was extracted is at the top of the file). discussion08
  - The 10,000 most common list (`10k-most-common.txt`) is not used, because it has only 10 entries of 12 or more characters
  - Compared case-insensitively. The list is a separate file, loaded only on the vault creation and recovery screens (about 74 KB compressed). If it cannot be loaded, the user cannot proceed
- No character-class rules

---

## 10. Build order (steps within phase 1)

| Step | Contents | Check at the end |
| --- | --- | --- |
| 1 | Scaffolding (Vite, Workers, D1), headers, Access JWT verification, migrations | `npm run verify` passes. Tests for JWT verification |
| 2 | Cryptographic building blocks (key derivation, wrapping, entry encryption, recovery key) | Crypto tests (round trip, wrong password does not open, swapped AAD does not open) |
| 3 | APIs and screens for creating, unlocking, locking, and recovering the vault (look is provisional) | Tests against D1 (failure count, waiting, rejecting another person's token) |
| 4 | List, detail, new, edit, delete, search, tags, totals | Tests for 409. Check the behavior in a browser |
| 5 | Settings screen (change master password, regenerate recovery key, auto-lock time, delete all data) | Tests and a check in a browser |
| 6 | Build the look with Impeccable | Check in a browser, including narrow widths |
| 7 | Deployment (after the user's confirmation) and the Access setup procedure | Confirm in production that it cannot be opened without passing Access |

### 10.1 Commands (planned)

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the UI and the Worker locally |
| `npm run verify` | Runs the format check, oxlint, type check, unit tests, and build together |
| `npm run deploy` | Deploys (confirm with the user before running) |

---

## 11. Open questions

- Argon2id strength (3.2): decided. On 2026-11-17 it was measured on the user's phone (production): from the press to the list appearing was under 1 second all 3 times, so the current values (m 65536, t 3, p 1) were kept and it runs on the UI's main thread (5.6). The accepted range (3.5) is also unchanged. The device measured was an iPhone 15 Pro (the browser was not recorded). It is a fairly new model, so if someone uses an older phone, measure again on that model
- hash-wasm version: upgrade to 4.13.0 or later only after it has been out for a while (discussion04)
- Session lengths (5.4) and size limits (chapter 8): to be decided again while building

---

## 12. Design terms and UI terms

The design documents and code names (`vault`, `recovery`, etc.) keep the terms "vault" and "recovery key" to match the explanation of the cryptography. The UI uses the following wording (discussion13, 14).

| Design term | UI term |
| --- | --- |
| Unlock the vault | 管理画面を開く (Open the manager) |
| Lock the vault / the vault is open | 管理画面を閉じる / 管理画面を開いています (Close the manager / The manager is open) |
| Create the vault | はじめての準備 (First-time setup; the button is 準備を終える, Finish setup) |
| Recovery key | アカウント復旧のためのキー (Key for account recovery; headings and the first explanation) / 復旧キー (Recovery key; elsewhere) |
| Write down the recovery key | アカウント復旧のためのキーを控える (Write down the key for account recovery) |
| Unlock with the recovery key (recovery screen) | アカウントの復旧 / 復旧キーで開く (Account recovery / Open with the recovery key) |
| Regenerate the recovery key | 復旧キーの作り直し (Remake the recovery key) |
| Vault key, wrapping key, auth token | Not shown in the UI |
| Master password | マスターパスワード (the same) |

---

## 13. Known limitations (discussion22, 23)

Things noticed in the PRD check (discussion22) and decided not to fix in phase 1.

- **The size of each entry's ciphertext is visible to the server**: the contents cannot be read, but from the ciphertext size one can roughly tell whether there is a long memo or backup codes. Only people who can read D1 (Cloudflare, the administrator, someone who stole D1) can see it. The contents, service name, and kind of entry are not revealed. A fix would be to pad the plaintext to fixed sizes (e.g. in 1 KB steps) before encryption (this changes the entry format, so the old format must stay readable). On 2026-11-19 it was decided not to pad (discussion57; the user's instruction was "fix it if it is a critical vulnerability"). Claude's judgment: not critical. Only people who can read D1 can see it, and all they learn is the approximate length. The contents, service name, and password are not revealed, and it gives no foothold for other attacks
- **After 30 seconds the clipboard is emptied even if something else has been copied since**: comparing its contents before clearing would need the "read clipboard" permission, which shows a permission prompt every time, so no comparison is made (9.3)
- The bottom of the detail screen shows the created and updated dates (`createdAt` and `updatedAt` inside the ciphertext, as dates in the device's time zone; `localDate`)

---

## 14. Backups that stay encrypted (phase 2 item 1; discussion26)

### 14.1 File

- Name: `account-manager-backup-YYYY-MM-DD.json` (the date in the device's time zone). "バックアップを書き出す" (Export backup) on the settings screen has the device save it
- Contents (JSON): `format` (`account-manager-backup`), `version` (1), `exportedAt`, `userId`, `kdfParams`, `salt`, `wrappedKey`, `recoverySalt`, `recoveryWrappedKey`, `entries` (pairs of `id` and `ciphertext`, still encrypted)
- Not included: the master password, keys derived from it, the auth token, settings, decrypted contents. It can be opened without the server's PEPPERs
- How to open: with the master password at the time of export (derive the wrapping key from `salt` and `kdfParams` and open `wrappedKey`), or with the recovery key at that time (derive from `recoverySalt` and open `recoveryWrappedKey`). `userId` is part of the AAD, so if it is rewritten the file will not open
- Protection: a stolen file cannot be opened without guessing the password. Guessing offline is possible, though (its strength is as set for Argon2id). The UI tells the user to keep it somewhere only they can see

### 14.2 Export

1. Ask for the current master password again (discussion26 item 1). The browser checks it by opening the wrapped key; if it does not match, it sends only the auth token so that the failure is counted (as in chapter 8)
2. `POST /api/backup-keys` (body: `currentAuthToken`). The server checks the auth token (counting failures) and returns `kdfParams`, `salt`, `wrappedKey`, `recoverySalt`, and `recoveryWrappedKey`. The key wrapped for recovery is normally returned only during recovery, so the current master password is required
3. Receive all entries, still encrypted, with `GET /api/entries` and make the file. It passes the same checks as an import before being saved
4. Put the export time in `lastBackupAt` in the encrypted settings (discussion26 item 5). The settings screen shows "最後に書き出した日" (Last exported). If recording it fails, the file has still been saved

### 14.3 Import

1. Enter the file (with a size limit), what is used to open it (the master password or the recovery key), and its value
2. Check the shape (`format`, `version`, the range of `kdfParams`, the lengths of keys and salts, the format and uniqueness of entry IDs, the size of entry ciphertexts, the entry count limit). If it is wrong: "バックアップのファイルではないか、壊れています" (This is not a backup file, or it is damaged)
3. Open the key only in the browser. If it does not match: "このファイルを開けませんでした" (Could not open this file) (nothing is sent to the server, so it does not count toward failures)
4. Decrypt each entry, re-encrypt it with the current vault's key and AAD (the current `userId`), and add it with `POST /api/entries`
   - If an entry with the same ID exists in the current vault, keep the current one and skip it (discussion26 item 3). Importing any number of times never damages the current data
   - If the ID is not in the current vault but exists (someone else's entry), add it with a new ID. This also lets a backup be imported into the vault of a different email address
   - The created and updated dates are kept as in the file
   - Entries that cannot be decrypted are counted and skipped. Stop when the entry limit is reached. Even if it stops partway, importing again adds only the rest
5. Settings are not restored (discussion26 item 4)
6. If anything was added, reload the list

### 14.4 Confirmed

- Tests: `worker/settings.test.ts` (returns the values on a matching auth token; 403 and counted when wrong, 429 on the 10th; a token is required; cannot be fetched with another person's auth token), `src/vault/backup.test.ts` (contains no password; opens with the recovery key too; does not open if userId is rewritten; shape checks; restores deleted entries; importing repeatedly does no damage; can be imported into another person's vault; unreadable entries and the limit)
- Browser (production build, local D1, headless Chrome): export (12 entries; the file contains no master password; the last export date appears) → delete 1 entry → a wrong password is refused → importing brings back 1 entry → also opens with the recovery key. At 1440 and 390, light and dark. 0 overflow, 0 CSP violations
- The text of the file picker ("Choose File", etc.) is the browser's own and follows the browser's language setting
- Fixed after the Impeccable reviewer's comments (discussion28): the file picker's button now has the same shape as small buttons (`.btn.btn-small`, via `::file-selector-button`). When 0 entries were added, show "足したものはありませんでした" (Nothing was added). Judged ship on retaken screenshots

---

## 15. An app form for the home screen (PWA; phase 2 item 2; discussion29, 30)

- No Service Worker is used (discussion29 item 1). The data exists only on the server, so opening just the UI without a connection would be useless. It also avoids adding the risk of an old UI lingering on the device or being swapped. Without a connection it does not open, just as in the browser
- `public/manifest.webmanifest`: name `AccountManager`, home screen name `アカウント管理` (Account manager; discussion29 item 2), `display: standalone`, `start_url` and `scope` `/`, background color `#f4f5f7`
- Icon (option A in discussion30): a white key on a full blue (#1f5fd6) background. The key is the same shape as `KeyIcon` in the top bar, enlarged with thicker lines. In `public/icons/`: `icon.svg` (the source; also used for the browser tab), `icon-192.png`, `icon-512.png` (also maskable; the key is inside the safe circle), and `apple-touch-icon.png` (180). The PNGs were made from the SVG in headless Chrome
- `index.html`: `manifest` (`crossorigin="use-credentials"`, so it is fetched with the Access cookie), `icon`, `apple-touch-icon`, `apple-mobile-web-app-title`, `theme-color` (light `#ffffff`, dark `#181c23`; the top bar's `--surface`)
- Protection: the CSP is unchanged (`manifest-src 'self'` and `img-src 'self'` are enough). Nothing external is loaded. Automatic locking and clipboard clearing behave the same when opened from the home screen (times are compared when the app comes back to the front, just as when a tab does)
- Confirmed (production build, headless Chrome): the manifest is served as `application/manifest+json`, Chrome parses it without errors, and there is no reason it cannot be installed. 0 CSP violations
- Confirmed (production, Safari on an iPhone 15 Pro, 2026-11-17): even with Access, placing it on the home screen showed the icon (white key on blue) and the name "アカウント管理". Opening it from the home screen showed Safari's frameless view and got as far as the master password screen. It was right after logging in to Access in Safari, so the Access login screen did not appear (we think the login carried over to the home screen app; how iOS does this was not checked). No measures to move the icon and such outside Access were needed
- To check: after the Access login (24 hours) expires, opening from the home screen shows the Access login screen, and after logging in the user gets back to the app
- How to use it (placing it on the home screen) is in `docs/Guide.md`

## 16. Import from other apps (phase 2 item 3; discussion32)

Code: `src/vault/csv-import.ts` (and its tests) and `ImportCsv` in `src/screens/SettingsScreen.tsx`.

| Item | Decision | Reason |
| --- | --- | --- |
| What can be read | Only the CSV files exported by Chrome and Safari (the Passwords app) (discussion32 item 1) | What the users use |
| Detection | The column names on the first line (case-insensitive). With `url`, `username`, and `password`: Safari if there is `title`, Chrome if there is `name` | Column order does not matter |
| Column names | Chrome: `name,url,username,password,note`. Safari: `Title,URL,Username,Password,Notes,OTPAuth` | There is no official documentation of the column names; they come from memory and a self-made sample. Safari (iPhone) was confirmed with the user's real file on 2026-11-18 (the first line matched; English column names even on a Japanese device; the counts and list appeared, and it imported in production; discussion37). Chrome is unconfirmed |
| Where it is read | Entirely in the browser. The CSV is never sent to the server. Each entry is encrypted and added the usual way (`addEntry`) | As in chapter 3 |
| Mapping | name → service name (the URL's host name if missing), URL → URL, username → account name (also email address if it contains `@`), password → password (keeping leading and trailing spaces), notes → memo | — |
| URL | If it is not `http:` or `https:`, it is not put in the URL field; instead "元の URL: …" (Original URL: …) is left in the memo | e.g. Android app markers |
| Duplicates | Skipped when the URL's host name (without a leading `www.`; the service name if there is none) and the account name (the email address if there is none) are the same. Compared after NFKC and lowercasing. Passwords are not compared. Also compared against earlier rows in the same file (discussion32 item 2) | Importing repeatedly never creates two |
| Two-factor keys | Not imported. Only a `twoFactor: { enabled: true, methods: ['app'] }` marker is set, and the count is shown (discussion32 item 3) | Do not keep the key in the same place as the password |
| Tags | "Chrome から" (From Chrome) / "Safari から" (From Safari) (discussion32 item 4) | Lets the user filter and review them later |
| Unreadable rows | Rows whose column count differs from the first line, with neither a service name nor a URL, or too large (one entry close to the limit) are counted and skipped. Rows with neither an account name nor a password are counted as "not imported" | — |
| Limits | 10 MB per file, 4,000 rows. If the entry limit is reached, stop and say so | Same as backup import |
| Confirmation | Show the counts (to add, skipped, not imported, unreadable, two-factor keys) and a list of the entries to add (service name and account name only), and add them after "取り込む" (Import) is pressed (discussion32 item 5) | — |
| Afterwards | Show "読み込んだ CSV を消し、ゴミ箱も空にしてください" (Delete the CSV you loaded and empty the trash) | The CSV is not encrypted |
| Safari on iPhone | Exporting gives a ZIP, which expands to a file named 「パスワード」 (Passwords) with no extension. The app does not read ZIPs and does not change the picker's filter (`.csv,text/csv`). `docs/Guide.md` describes expanding it and adding `.csv` to the name (discussion35, 36) | Keeps the amount of work down |

- discussion32's "before importing, show 'Exporting a backup first lets you undo this'" was changed to "Exporting a backup first is reassuring". Backup import only adds missing entries; it cannot remove imported entries to undo an import
- Confirmed (production build, headless Chrome, 1440px and 390px, self-made samples): a malformed file is refused → counts and list → import → the list count goes up → reading the same file again skips everything and "取り込む" does not appear → cancel. 0 overflow, 0 CSP violations
- Fixed the 4 issues found by the Impeccable audit (17/20) (discussion33): when the pressed button disappears, focus moves to the count sentence, the result, or the file field / the "delete the CSV" request is separated from the green result as `notice-warn` / the vertical line left of the counts was removed / the frame of the list of entries to add is keyboard-focusable and labeled. Checked where focus goes at 1440px and 390px

## 17. Unlocking with a fingerprint or face (passkeys; phase 2 item 4; discussion38)

Code: `migrations/0002_passkeys.sql`, `0004_passkey_name_ciphertext.sql`, `worker/passkeys.ts` (and its tests), `derivePasskeyKeys` in `src/crypto/keys.ts`, `src/vault/passkeys.ts` (and its tests), and `Passkeys` in `src/screens/SettingsScreen.tsx`.

Decisions (discussion38; all option (a)):

- A passkey is "one more way to unlock". The master password and the recovery key keep working as now
- Up to 5 per person. They are named and can be removed in settings
- The master password must be used once every two weeks (two weeks after the last unlock with the master password, "パスキーで開く" (Open with a passkey) is not shown)
- On the unlock screen, if registered, show "Open with a passkey" at the top and the master password field below it (discussion43 changed this to the field on top and the passkey button below; 17.3)
- Build order: first build and deploy registration only, check that it works on iPhone and on desktop Chrome, then build unlocking

### 17.1 How it works

| Item | Decision | Reason |
| --- | --- | --- |
| Keys | Pass a random 32 bytes per passkey (`prf_salt`) to the passkey's PRF (a WebAuthn extension) and receive a 32-byte value. Split it with HKDF (salt = `prf_salt`, info `am:v1:pk-wrap` and `am:v1:pk-auth`) into a wrapping key and an auth token | The same shape as the recovery key (chapter 3). The PRF value is long enough that Argon2id is not needed |
| Stored on the server | Credential ID, encrypted name (`name_ct`), `prf_salt`, HMAC of the auth token (AUTH_PEPPER), wrapped vault key, registration time (the `passkeys` table) | The PRF value and the wrapping key are never sent. Neither the server nor the administrator can read the contents. The credential ID and `prf_salt` are random values made by the device and say nothing about the user |
| Signatures | The server does not verify the passkey's signature (assertion). It only compares the HMAC of the auth token | The auth token is derived from the PRF value (which only comes out with the passkey and biometrics), so this protects as well as verifying the signature. It reduces the amount of work |
| Registration | Requires the current master password (`requireCurrentSecret`; counted toward failures). The extractable vault key opened on the device is wrapped with the passkey's wrapping key | discussion38 |
| Creation options | `residentKey: required`, `userVerification: required`. `user.id` is the user ID (64 characters). `rp.id` is omitted, so it is the open host name | Always requires biometrics or similar |
| A second one in the same place | Refused by putting registered credential IDs in `excludeCredentials` ("この端末には、もう登録してあります", Already registered on this device) | Creating one with the same `user.id` overwrites the earlier one on the device, leaving only the app's registration behind |
| Checking registration | After creating, receive the PRF value again the same way as unlocking (`navigator.credentials.get`). If a value also came out at creation, check that they match. If no value comes out or they differ, say "この端末・ブラウザでは使えません" (Not usable on this device or browser) and do not send | The check from discussion38 item 5. Biometrics are requested twice |
| Devices without PRF | If `extension:prf` from `PublicKeyCredential.getClientCapabilities()` is false, the register button is disabled. If there is no answer, try. If it turns out unusable after creating, tell the user to delete the passkey on the device | — |
| Count and name | Up to 5 (the count check and the insert are a single SQL statement). Names are trimmed in the UI and 1–40 characters; control characters are refused. Names are encrypted with the vault key before being sent (AES-GCM, AAD `am:v1:passkey-name:<user ID>:<credential ID>`). The server checks only the ciphertext size (31–512 bytes). The ciphertext size reveals the approximate length of the name (as with entry ciphertexts in chapter 13) | PRD 3.2 (encrypt every field). At first names were stored unencrypted. Found and fixed in the phase 2 check (discussion47 item 1) |
| Names from the earlier version | `migrations/0004` added `name_ct`. Older rows have an unencrypted name in `name` and an empty `name_ct`. When the settings list is opened, the browser encrypts it and stores it again with `PUT /api/passkeys/:id/name`, and the server empties `name`. If that fails, the list is still shown and it is tried again next time. If a name cannot be decrypted, show "(名前を読めませんでした)" (Could not read the name) and only allow removing it | Does not add work for the user |
| Removing | "消す" (Remove) in the settings list (one press. No data is lost; the master password still opens the vault). After removing, tell the user to delete it on the device too | The app cannot delete passkeys on the device |
| Deleting all data | Also deletes passkey registrations | — |
| Changing the master password, recovery | The vault key does not change, so passkeys keep working | discussion38 |
| Deployment | Tables were added and changed (0002, 0004), so run `npx wrangler d1 migrations apply account-manager-demo --remote` before deploying (`docs/Deploy.md`) | — |

### 17.2 Confirmed (registration only)

- Unit tests: Worker (register, list, remove, up to 5, same ID, malformed body, another person's, deleting all data); UI side (with a fake WebAuthn: the wrapped key opens from the PRF value, the PRF value is not sent, unusable / cancelled / already registered / wrong master password)
- A virtual authenticator in headless Chrome (CDP `WebAuthn.addVirtualAuthenticator`): register with PRF → a second one in the same place is refused → remove. Without PRF, "unusable" and the request to delete it on the device appear. 1440px and 390px, 0 overflow, 0 CSP violations. After "消す", focus moves to the result
- Real devices: on 2026-11-18, registration worked on an iPhone 15 Pro (home screen app) (Face ID twice; the query checking the PRF value also passed; discussion40). It also registered and unlocked in desktop Chrome (2026-11-18; 17.3)
- The Passwords app's passkey item saying "自動入力するパスワードがありません" (No passwords to autofill) is correct (a passkey has no password). The saved items shown above the keyboard on the master password field are the iPhone's suggestions; the app does not ask for them (Safari ignores `autocomplete="off"`)

### 17.3 Unlocking with a passkey (discussion40)

| Item | Decision | Reason |
| --- | --- | --- |
| Whether it can be used | `vault.passkeys` in `/api/me`: `none` (nothing registered) / `password_due` (14 days or more since the last master password unlock, or no record) / `available` (the list of registered credential IDs and `prf_salt`s; neither is secret) | The two-week rule is decided on the server |
| Record | `users.password_unlocked_at` (`migrations/0003`). Set to the current time when the vault is created, unlocked with the master password, or recovered. Unlocking with a passkey does not extend it. Existing users have it empty, so they first unlock once with the master password | discussion38 item 3 |
| Query | `navigator.credentials.get`. All registered IDs go in `allowCredentials`, and PRF uses `evalByCredential` (the `prf_salt` per ID). `userVerification: required` | Whichever passkey is chosen, its salt produces the value |
| What is sent | The credential ID and the auth token to `POST /api/unlock/passkey`. The server compares with the HMAC of that passkey's auth token. Failures are counted together with the master password; 10 means waiting. Unknown IDs also count as failures. With `password_due`, 403 without comparing | discussion38 |
| What is returned | The token, the key wrapped by the passkey, **the key wrapped by the master password**, and the settings. The UI opens the key wrapped by the passkey. The key wrapped by the master password is kept for operations (settings) that require the current master password | The settings screen works the same as now after unlocking |
| Unlock screen | From the top: the master password field, "開く" (Open; the primary button), "または" (or), "パスキーで開く(Face ID など)" (Open with a passkey (Face ID, etc.); a regular button), "忘れたとき" (Forgot it). The input focus always starts on the field. With `password_due`, a notice "2 週間に 1 回はマスターパスワードで" (Use the master password once every two weeks) above the field. No button while the user must wait | discussion43 item 2 (the usual login screen layout). Originally discussion38 item 4 put the passkey at the very top |
| Devices that show the button | The credential IDs registered or used to unlock on this device are kept in localStorage under `am:passkeys-here` (IDs only. IDs are non-secret values returned by `/api/me`, and no keys or tokens are stored, so this does not conflict with 3.4). The button appears only when an ID overlaps with the `available` list, and the button queries only those IDs. Keyboard suggestions query all IDs regardless of the marker (suggestions appear only when the device has a passkey). If storage cannot be read or written, it is treated as having no marker | discussion43 item 1. Pressing the button on a device without a passkey made Windows ask for a USB key or a phone, which confused the user (desktop Chrome, 2026-11-18) |
| Keyboard suggestions | If `PublicKeyCredential.isConditionalMediationAvailable()` is true, the master password field gets `autocomplete="current-password webauthn"`, and a `mediation: 'conditional'` query is made as soon as the unlock screen appears. Pressing the button cancels that query and queries again. If a suggestion yields no PRF value: "この端末では、パスキーで開けませんでした" (Could not open with a passkey on this device) | discussion40 item 2. Whether suggestions yield PRF on iPhone is to be checked on a real device |

- Confirmed: Worker tests (unlock, failure counting, unknown IDs, two weeks, users with no record, another person's passkey) and UI-side tests (unlock from the PRF value, conditional, no PRF value). With a virtual authenticator in headless Chrome: register → close → unlock from a keyboard suggestion / turn suggestions off and unlock with the button; 1440px, 390px, dark; the two-week notice. 0 overflow, 0 CSP violations
- Checks after discussion43: with a virtual authenticator in headless Chrome, the button appears only on the device where it was registered / clearing the marker hides the button (that unlocking sets the marker was confirmed by a unit test). 1440px, 390px, dark, 0 overflow, 0 CSP violations. Impeccable's detector (the files, and the running UI at 1280px and 390px) found nothing
- The virtual authenticator also answers suggestion queries automatically, so after closing it reopens right away (on a real device it waits until a suggestion is chosen)
- Real devices: on 2026-11-18, on an iPhone 15 Pro (home screen app): right after deployment the two-week notice appeared and the master password opened it / "パスキーで開く" opened it / tapping the master password field showed the AccountManager passkey above the keyboard, and choosing it opened the vault (the suggestion also yielded the PRF value). It also opened in desktop Chrome (2026-11-18; on a device without a passkey, a USB key was requested → "Devices that show the button" above)

---

## 18. The phase 2 check (discussion47)

The four items of phase 2 in the PRD (version 0.3) and the rules in chapters 3, 4, 5, and 8 were compared one by one with what was built. The table of results is in discussion47.

- Mismatch: passkey names were stored on the server unencrypted (PRD 3.2). They are now encrypted (17.1)
- A value with no dedicated message in the UI: `passkey_exists` on registration (same credential ID). The device generates a random credential ID every time, and a second one in the same place is refused first on the device (`excludeCredentials`), so it normally does not happen. It is shown as "うまくいきませんでした" (That did not work). Not fixed

### 18.1 To check later (discussion47 item 3; done after phase 2 was marked complete)

2026-11-19: the user has already checked the four items below (the answer in discussion57; the details of the results were not recorded).

1. Home screen app: after the Access login (24 hours) expires, open from the home screen; the Access login screen appears, and after logging in the user gets back to the app (chapter 15)
2. Backups: export once in production and confirm the file is saved (chapter 14)
3. The unlock screen and passkeys, and scrolling the list at desktop widths: the steps given after discussion44 and 46 (desktop and iPhone)
4. Chrome CSV: with a real CSV exported by desktop Chrome, the counts and list appear (chapter 16; Safari was checked)

## 19. Billing renewal reminders (phase 3 item 1; discussion51)

Renewal dates are inside the ciphertext, so the server does not know them. After the vault is unlocked, the UI alone counts and shows reminders (no emails or notifications can be sent). The D1 tables and the API are unchanged.

- Covered: monthly and yearly payments with a "next renewal date". One-time purchases get no reminder
- Counting: the number of days from today (device time) to the renewal date. 0–7 days (including today) show "今日" (Today) or "あと N 日" (N days left); past ones show "過ぎています" (Overdue) (`src/vault/renewal.ts`)
- Above the list (below the billing totals), "更新が近いもの N 件" (N renewals coming up) is shown together, ordered by renewal date (overdue first). Pressing a name opens its detail. Not shown when there are none. There is no close button. Counted over all entries regardless of the filter
- Each list row gets a badge below the amount (the same shape as tags)
- The billing row on the detail screen: a badge after the next renewal date. If overdue, a "YYYY-MM-DD に進める" (Move to YYYY-MM-DD) button. Pressing it saves that date (the same as a normal update; if it was updated on another device, the same message as a normal update)
- Advancing: monthly by 1 month, yearly by 1 year, until it is after today. A missing day (31st, Feb 29) becomes the last day of that month. Always counted from the original date (1/31 → 2/28 → 3/31)

### 19.1 Details decided by Claude (to be corrected if anything seems off)

- The reminder above the list shows the first 3 only. For the rest it says only "ほか N 件は、一覧の行の印で分かります" (N more are marked in the list rows) (otherwise the top of the list grows and the rows get squeezed)
- The color is the same grey surface as warning notices (notice-warn). No blue or red (The One Blue Rule and The Meaning-Only Color Rule in DESIGN.md). Overdue items are distinguished by bold ink
- Reminder dates are "11/21" for this year and "2027/1/5" for other years
- "Today" is computed from device time on every render (if the date changes while open, it is correct the next time the screen re-renders)

### 19.2 Confirmed

- Unit tests (`src/vault/renewal.test.ts`): 0–7 days, 8 days, days overdue, crossing months, one-time purchases, ordering, advancing (end of month, leap years, crossing years, never landing on today)
- Locally (vite preview, headless Chrome): changed the renewal dates of 4 entries; 5 reminders (3 + 2 more) and the row badges. Open an overdue one and press "Move" → it becomes 1 month later and the reminders drop to 4. 1440px, 390px, dark, 0 overflow, 0 CSP violations

## 20. Combining the totals into yen at a user-set rate (phase 3 item 2; discussion53)

- The rate is stored in the settings (the encrypted settings of 3.3) as `usdJpyRate: { rate, decidedOn }`. rate is yen per dollar (greater than 0 and up to 10,000, up to 2 decimal places), and decidedOn is the date it was saved (YYYY-MM-DD in device time). The server learns neither the rate nor the date. The D1 tables and the API are unchanged
- No communication with external exchange rate services (PRD 3.6)
- On the settings screen, a "ドルを円に換算する" (Convert dollars to yen) section (after the auto-lock time). Every save sets the date to today (saving the same rate still counts as deciding it again). "レートを消す" (Clear rate) returns to the unset state
- Above the list: only when a rate is set and the dollar total is greater than 0, below the current totals: "円にすると 月 約 ¥14,125(1 ドル = 150 円。11/19 に決めた)" (In yen: about ¥14,125 a month ($1 = ¥150, set on 11/19)). The yen total + the dollar total × the rate, rounded to the nearest yen (`yenTotal` in `src/vault/settings.ts`). Individual amounts stay as they are
- No warning when it gets old (the user looks at the date and decides again)

### 20.1 Details decided by Claude (to be corrected if anything seems off)

- Input also accepts full-width digits and commas ("１５０", "1,000"). Malformed or out-of-range input: "1 ドルあたりの円を、0 より大きく 10,000 までの数で入れてください(小数は 2 桁まで)" (Enter the yen per dollar as a number greater than 0 and up to 10,000 (up to 2 decimal places))
- The yen line is one step quieter than the totals (13px in ink 2; the amount at 15px, weight 600). The rate and the date are in ink 3
- The date is short above the list (11/19 for this year) and YYYY-MM-DD in settings

### 20.2 Confirmed

- Unit tests (`src/vault/settings.test.ts`): parsing input, refused forms, the yen calculation, checking the rate in decrypted settings
- Locally (vite preview, headless Chrome): malformed numbers are refused → save at 150 → ¥14,125 above the list (¥10,525 + $24.00 × 150) → still there after closing and reopening → clearing removes the line. 1440px, 390px, dark, 0 overflow, 0 CSP violations
