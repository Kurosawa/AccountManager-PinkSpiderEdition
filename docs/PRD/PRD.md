# AccountManager PRD (draft)

> Note for the public copy: this is the working version from the private repository, translated into English. The files it refers to (`docs/Wish.md`, `Conversation/discussionNN.md`, `docs/Guide.md`) are private and not included. The UI is in Japanese, so on-screen wording is quoted in Japanese with an English gloss.

- Version: 0.7 (2026-11-15; written from the answers in discussion01 and 02. In 0.2 the user confirmed the parts marked "provisional". 0.3 recorded the completion of phase 1 and the contents of phase 2 (discussion24, 25). 0.4 added to chapter 5 the unlock method and settings added in phase 2, and recorded the completion of phase 2 (discussion47, 48). 0.5 settled the contents of phase 3 and moved sharing to "Out of scope" (discussion50). 0.6 added the conversion rate to 5.1 and 5.2 and recorded the completion of phase 3 (discussion53, 54). 0.7 replaced the open questions in chapter 9 with what the Dev Spec decided (discussion57))
- Sources: `docs/Wish.md`, `Conversation/discussion01.md`, `Conversation/discussion02.md`

---

## 1. Purpose

Keep, per person, the account details of the services they use (URL, account name, password, billing, whether two-factor authentication is on, and so on) safely, and get them back when needed. Open only to close acquaintances (about 10 people).

The top priority is **robust security**. The design must keep both the operator (administrator) and Cloudflare from reading users' data.

## 2. Users

| Role | What they can do |
| --- | --- |
| User | Creates their own vault and reads and writes only their own data. Other people's data is not even visible as existing |
| Administrator (the developer) | Adds and removes users in the Cloudflare Access dashboard. There is no admin screen inside the app. The administrator cannot read other people's data either |

- About 10 people are expected
- The data of someone removed from Access is kept as it is (put them back in Access and they carry on where they left off; it is encrypted, so nobody can read it)

## 3. Security requirements

### 3.1 Two gates

1. **Cloudflare Access**: Only the chosen people can open the app. Login is a one-time code sent by email. This screen belongs to Cloudflare; the app does not build it
2. **Vault lock**: Inside the app, the vault is unlocked by entering the master password

### 3.2 Encryption

- Encryption and decryption happen only in the browser. Only ciphertext is sent to or stored on the server (Workers, D1)
- Every field is encrypted (including the service name, URL, and amounts). The server knows no more than whose data it is, when it was updated, and how many entries there are
- The master password is never sent to the server. Neither are the keys derived from it
- Searching, sorting, and computing totals happen in the browser after decryption
- The encryption scheme and key derivation are decided in the Dev Spec (standard schemes usable with the browser's built-in cryptography)

### 3.3 Master password and recovery key

- The master password is chosen when the vault is created
- At the same time a **recovery key** (a long string) is shown once, and the user writes it down. If they forget the master password, they unlock the vault with the recovery key and choose a new master password
- If both the master password and the recovery key are lost, nobody can recover the data. The vault creation screen says this clearly
- The minimum length and strength rules for the master password are decided in the Dev Spec

### 3.4 Protection while in use

- The vault closes automatically after a period without interaction (default 5 minutes; selectable in settings from 1, 5, 15, and 30 minutes)
- When the vault closes, the keys and decrypted data in the browser are discarded
- A copied password is cleared from the clipboard after 30 seconds (fixed)
- Passwords and other secret fields are masked at first and shown only while pressed

### 3.5 No room for malicious scripts in the UI

- No external scripts, fonts, or images are loaded
- A strict Content-Security-Policy is set
- Detailed measures are decided in the Dev Spec

### 3.6 Outbound communication

- The only party the app talks to is its own Workers (exchange rates and the like are not fetched from outside)

## 4. Fields recorded

One entry = "service × account". Several accounts can be registered for the same service (e.g. a work Google account and a personal one).

| Field | Contents | Required |
| --- | --- | --- |
| Service name | e.g. Netflix | Required |
| URL | The URL of the login page, etc. | |
| Account name | The ID used to log in | |
| Registered email address | Which email address was used to register | |
| Display name | The name shown inside the service | |
| Summary | What it is used for | |
| Password | | |
| Billing | Amount, currency, cycle (monthly, yearly, one-time), next renewal date | |
| Two-factor authentication | Whether it is on, and the method (SMS, authenticator app, security key, etc.) | |
| Backup codes | Spare codes for two-factor authentication | |
| Tags | For filtering by "work", "subscription", and so on | |
| Memo | A free-form field | |

- TOTP seeds for two-factor authentication are not stored. Keeping them next to the password would defeat the purpose of two-factor authentication
- Only the service name is required. Everything else may be empty
- The currency is chosen from yen and dollars

## 5. Screens

| Screen | Contents |
| --- | --- |
| (Access login) | Cloudflare's screen. Not built by the app |
| Create the vault | First-time users only. Choose the master password and write down the recovery key |
| Unlock the vault | Enter the master password. On registered devices it can also be unlocked with a fingerprint or face (passkey; phase 2; the master password must be used at least once every two weeks). There is also a way in to "Unlock with the recovery key" |
| Unlock with the recovery key | Enter the recovery key and choose a new master password |
| List | List of registered services. Search and filter by tag. Billing totals |
| Detail | All fields of one entry. Copying passwords and so on. Ways in to edit and delete |
| New / Edit | Enter the fields. A feature that generates strong passwords |
| Settings | See below |

### 5.1 Billing totals

- Show a monthly total per currency (e.g. ¥3,200 + $25 a month)
- Yearly payments are converted to a monthly amount (÷12) and included. One-time purchases are not included
- The totals appear at the top of the list screen
- If a dollar conversion rate is set in settings, a combined amount in yen is also shown below the totals (phase 3; discussion53)

### 5.2 Settings screen

- Change the master password
- Regenerate the recovery key (the old recovery key stops working)
- Time until the vault closes automatically
- Delete all of one's own data (asks for confirmation twice)
- Added in phase 2: export and import of backups that stay encrypted / import from CSV files of other apps (Chrome, Safari) / registering, listing, and removing fingerprint or face (passkey) unlock
- Added in phase 3: a rate for converting dollars to yen (set by the user; discussion53)

### 5.3 Language and screen width

- The UI is in Japanese only
- It must be usable on narrow phone screens
- The visual design is made through Impeccable

## 6. Phases

### Phase 1 (a vault you can use first)

- Guard the entrance with Cloudflare Access
- Create the vault (master password, recovery key), unlock, lock, and unlock with the recovery key
- List, detail, add, edit, and delete services (all fields in chapter 4)
- Search and filter by tag
- Billing totals (5.1)
- Automatic locking and automatic clipboard clearing
- Strong password generation
- Settings screen (5.2)

- Completed on 2026-11-17 (discussion24). The check against the PRD is in discussion22; known limitations are in chapter 13 of the Dev Spec

### Phase 2 (built in this order; discussion25)

1. Export and import of backups that stay encrypted (a safeguard against losing data)
2. An app form that can be placed on a phone's home screen (PWA)
3. Import from other password managers (browsers, etc.)
4. Unlocking the vault with a fingerprint or face (passkey)

- For each item, settle the spec in a discussion and write it into the Dev Spec before building it
- Completed on 2026-11-18 (discussion48). The check is in discussion47; things to verify later are in Dev Spec 18.1

### Phase 3 (built in this order; discussion50)

1. Reminders for billing renewal dates (the server cannot read renewal dates, so the only option is to remind when the app is opened)
2. Combine the totals into yen at a conversion rate set by the user

- For each item, settle the spec in a discussion and write it into the Dev Spec before building it
- Completed on 2026-11-19 (discussion54). The check is in item 4 of discussion54

### Candidates for phase 4 and later

- Publishing on an own domain (it is used only within a small circle, so there is no plan to get a domain; discussion50)

## 7. Technical setup and publishing

- React + TypeScript (Vite) SPA / Cloudflare Workers / D1 / Cloudflare Access
- Published first at `*.workers.dev` (can move to an own domain later)
- Create a new Access policy for this app (do not reuse existing policies)

## 8. Out of scope

- An admin screen inside the app
- Any way for the administrator to read or restore other people's data
- Generating TOTP codes
- An English UI
- Sharing between people (discussion50)

## 9. Open questions

- None (the encryption scheme and key derivation were decided in Dev Spec chapter 3, the master password rules in 9.5, and the Argon2id strength in chapter 11)
