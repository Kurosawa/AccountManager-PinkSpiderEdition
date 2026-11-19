---
name: AccountManager
description: A home for passwords and subscriptions, just for close acquaintances, browsed through a list and details
colors:
  ground: '#f4f5f7'
  surface: '#ffffff'
  surface-2: '#f8f9fb'
  ink: '#141820'
  ink-2: '#4a5160'
  ink-3: '#6b7280'
  line: '#e3e6eb'
  line-strong: '#cfd4dc'
  accent: '#1f5fd6'
  accent-hover: '#1a50b5'
  accent-ink: '#ffffff'
  accent-soft: '#e9f0fd'
  danger: '#c62828'
  danger-soft: '#fdecec'
  ok: '#1b7a45'
  ok-soft: '#e7f5ec'
  focus: '#1f5fd6'
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '26px'
    fontWeight: 700
    lineHeight: 1.3
  headline-gate:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '18px'
    fontWeight: 700
    lineHeight: 1.3
  title-section:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '17px'
    fontWeight: 700
    lineHeight: 1.3
  entry-name:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '16px'
    fontWeight: 650
    lineHeight: 1.6
  body:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.6
  caption:
    fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo UI', 'Noto Sans JP', sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.6
  secret:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Mono', monospace"
    fontSize: '16px'
    fontWeight: 400
    letterSpacing: '0.04em'
  recovery-key:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Mono', monospace"
    fontSize: '19px'
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: '0.06em'
rounded:
  control: '8px'
  container: '12px'
  pill: '999px'
spacing:
  s1: '4px'
  s2: '8px'
  s3: '12px'
  s4: '16px'
  s5: '24px'
  s6: '32px'
  s7: '48px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
    height: '40px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
    height: '40px'
  button-secondary-hover:
    backgroundColor: '{colors.surface-2}'
  button-quiet:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
  button-quiet-hover:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
  button-danger-solid:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
  button-small:
    rounded: '{rounded.control}'
    padding: '4px 12px'
    height: '34px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '8px 12px'
    height: '44px'
  entry-row:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '12px'
  entry-row-hover:
    backgroundColor: '{colors.surface-2}'
  entry-row-selected:
    backgroundColor: '{colors.accent-soft}'
  sheet:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.container}'
  sheet-row:
    padding: '12px 16px'
  gate-card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.container}'
    padding: '32px 24px'
    width: '440px'
  settings-section:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.container}'
    padding: '24px'
  form-group:
    backgroundColor: '{colors.surface-2}'
    rounded: '{rounded.control}'
    padding: '16px'
  tag:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
  notice-error:
    backgroundColor: '{colors.danger-soft}'
    textColor: '{colors.danger}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
  notice-ok:
    backgroundColor: '{colors.ok-soft}'
    textColor: '{colors.ok}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
  notice-info:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
  topbar:
    backgroundColor: '{colors.surface}'
    height: '56px'
    padding: '8px 16px'
---

# Design System: AccountManager

<!-- Written from the shipped look (src/app.css, src/screens/*.tsx, src/screens/icons.tsx) and the screenshots from the finish review. The source of truth for values is :root in src/app.css. -->

## Overview

**Creative North Star: "The Everyday Toolbox"**

Screens that keep the familiar password manager pattern (the same list and details as 1Password, Bitwarden, and Apple's Passwords app) intact, and finish it with care through alignment, spacing, type hierarchy, and how states are shown. White surfaces sit on a light gray ground, text is dark ink, and the only accent is one calm blue. There is no eye-catching decoration; the visual goal is that finding, viewing, and copying are over in a few seconds.

Density is medium. Body text is 16px with a line height of 1.6, with 12–16px of space between rows. Surfaces are separated by thin 1px gray rules rather than shadows, and the only thing with a shadow is the white card on the screens before unlocking. Following the device's light/dark setting (prefers-color-scheme), each color role is swapped for its dark-mode value.

No fonts, icons, or images are loaded from outside (the security rule in PRODUCT.md). Fonts are the system's own, and icons are home-made SVGs (24 grid, 1.75 stroke). No style attributes are used; every style is written as a class in src/app.css (CSP style-src 'self').

**Key Characteristics:**

- Light gray ground, white surfaces, ink text, and one blue accent. Dark mode provides the same roles
- Two panes: list and details. On phones only one of them is shown
- Surfaces are separated by 1px rules. Only the white card before unlocking has a shadow
- Two corner radii: 8px for controls, 12px for surfaces (tables, settings sections, the card before unlocking). Only tags are fully rounded
- Monospace font only for secret values and the recovery key. Tabular figures for amounts, counts, and dates
- Signature motion: after copying, a blue line under the field shrinks over 30 seconds

## Colors

A palette of neutral grays and ink, plus one blue and a meaningful red and green, nothing else.

### Primary

- **Calm blue (accent)**: primary buttons (「登録」 Add, 「開く」 Open, 「変える」 Change), the background of the selected list row (accent-soft), the focus ring, links, the key icon in the top bar and on the screens before unlocking, checkbox and radio colors, the text caret, and the line under a copied field. In dark mode it becomes a lighter blue (#6a9df5), and primary button text becomes dark navy (#0d1420).
- **Dark blue (accent-hover)**: primary buttons under the pointer. In dark mode it gets lighter instead (#8ab3f8).
- **Pale blue (accent-soft)**: the background of the selected row, of info notices (notice-info), and of selected text. Dark mode: #1d2a42.

### Secondary

- **Red (danger)**: irreversible actions only. The text of 「削除する」 (Delete) and 「消す」 (Erase) buttons, the filled button in the confirmation step, error notices, and the heading of 「自分のデータをすべて消す」 (Delete all my data) in settings. Dark mode: #f08a8a. Pale red (danger-soft) is the background of error notices (dark mode #3a1f22).
- **Green (ok)**: notices that something is done. The text of a button that has changed to 「コピーしました」 (Copied), and the saved notice. Dark mode: #74c99a. Pale green (ok-soft) is the background of done notices (dark mode #17301f).

### Neutral

- **Light gray ground (ground)**: the background of the whole screen, behind the details pane and the screens before unlocking. Dark mode: #101318.
- **White surface (surface)**: the top bar, the list pane, field tables, settings sections, the card before unlocking, inputs, and regular buttons. Dark mode: #181c23.
- **Recessed surface (surface-2)**: the background of regular buttons and list rows under the pointer, of form groups (form-group), of tags, and of the recovery key. Dark mode: #1d222a.
- **Ink (ink)**: body text and headings. Dark mode: #e8eaee.
- **Ink 2 (ink-2)**: input labels, descriptions, amounts, and quiet button text. Dark mode: #b4bac5.
- **Ink 3 (ink-3)**: field names in field tables, counts, secondary text such as account names, the search icon, and input placeholders. Dark mode: #9aa1ad.
- **Rule (line)**: dividers between surfaces, between table rows, and under the top bar. Dark mode: #2a3039.
- **Strong rule (line-strong)**: borders of inputs and buttons, the dashed border of the recovery key, and scrollbars. Dark mode: #3a414c.

### Named Rules

**The One Blue Rule.** The only accent color is one blue. It is used only for selection, primary buttons, focus, links, the key next to the name, and the remaining-time line after copying. Never fill headings or decorative surfaces with blue.

**The Meaning-Only Color Rule.** Red is used only for irreversible actions and errors, green only for things that are done. When either fills a background, use the pale tone (danger-soft, ok-soft) with text in the dark tone of the same hue.

## Typography

**Body font:** the system font (system-ui, -apple-system; for Japanese, Hiragino Sans, Yu Gothic UI, Meiryo UI, Noto Sans JP, in that order)
**Monospace font:** ui-monospace (SFMono-Regular, Menlo, Consolas, Noto Sans Mono, in that order)

**Character:** the device's own font, set plainly. This follows from the rule against loading external fonts, and, like Apple's Passwords app, it lets people read in the letters they are used to on that device. There are no large display headings; hierarchy comes from weight (400, 600, 650, 700) more than size.

### Hierarchy

- **Headline** (700, 26px, 1.3): headings in the details pane (the service name, 「新しく登録」 New entry, 「設定」 Settings). Below 600px it is 22px and spans the full width.
- **Headline (before unlocking)** (700, 24px, 1.3): the heading on the white card before unlocking (such as 「管理画面を開く」 Open the main screen).
- **Title** (700, 18px, 1.3): the list pane heading 「登録したサービス」 (Saved services).
- **Title (section)** (700, 17px, 1.3): settings section headings, the name above the card before unlocking, and the monthly total amount. Form group headings (legend) are 15px, 700.
- **List name** (650, 16px): the service name in list rows. Just one step heavier than body text.
- **Body** (400, 16px, 1.6): body text and values in field tables. Input text is also 16px (so phones don't zoom in).
- **Body small** (400, 15px, 1.5): buttons (600), notices, descriptions, and the empty-list hint.
- **Label** (600, 14px): input labels. Field names and the copy status in field tables are 14px, 400. Small buttons are 14px as well.
- **Caption** (400, 13px): counts, secondary text such as account names, input hints, tags, and 「自動で閉じます」 (closes automatically) in the top bar. Only the billing-cycle suffix (「/ 月」, per month) is 12px.
- **Secret value** (monospace, 16px, letter spacing 0.04em): a revealed password.
- **Recovery key** (monospace, 19px, 1.7, letter spacing 0.06em): the recovery key shown during first-time setup and when it is regenerated. Centered, and selectable all at once.

### Named Rules

**The Mono-for-Secrets Rule.** The monospace font is used only for revealed passwords and the recovery key, so that 1 and l, and 0 and O, can be told apart when copying them by hand.

**The Tabular Numbers Rule.** Amounts, counts, and dates use tabular figures (font-variant-numeric: tabular-nums) so that the digits of amounts line up in the list.

**The 13px Floor Rule.** Text meant to be read is at least 13px (the only exception is the 12px billing-cycle suffix). No small, cramped text.

## Layout

**The spacing scale** has seven steps: 4, 8, 12, 16, 24, 32, and 48px (s1–s7). 8–12px inside components, 16px between components, 24px between sections, and 32–48px around the outside of a pane.

**The main screen** has a 56px-high white top bar (name, time until auto-close, Settings, Close; it stays at the top while scrolling), with two panes side by side below it.

- On the left, the list pane (300–380px wide, white): heading and count, monthly total, search, tag filter and 「登録」 (Add), and the rows. At 900px and wider, the pane is kept to the height from below the top bar to the bottom of the screen, and only the rows scroll inside it (the details on the right scroll as the page; discussion45). This height (`calc(100dvh - 56px)`, `top: 56px`) hard-codes the 56px top bar height, so change both together if the bar height changes.
- On the right, the details pane (on the light gray ground, content up to 760px wide): 32px at the top, and 16–48px on the sides depending on screen width. Sections inside are 24px apart.
- **Below 900px**: only the list or the details is shown. The details show a quiet 「一覧に戻る」 (Back to list) button at the top left. 「自動で閉じます」 in the top bar is hidden, and the name is truncated with an ellipsis. The space around the details pane is 16px.
- **Below 600px**: field table rows stack into a single column, with the copy button placed left-aligned under the value. 「設定」 (Settings) in the top bar hides its text and shows only the icon.

**The screens before unlocking** (open the main screen, first-time setup, account recovery) have a single white card, up to 440px wide, centered on the ground. The space above it is 24–96px depending on screen height, and a key icon and the name sit above the card.

Fields placed side by side in a form group are each at least 200px, and wrap when they don't fit.

## Elevation & Depth

An almost flat design. Layering is shown through the difference in lightness between the ground and surfaces and through 1px rules, not shadows. The top bar, the list pane, field tables, and settings sections have no shadows.

### Shadow Vocabulary

- **Shadow of the card before unlocking** (`box-shadow: 0 1px 2px rgb(20 24 32 / 6%), 0 4px 12px rgb(20 24 32 / 6%)`; in dark mode `0 1px 2px rgb(0 0 0 / 30%), 0 4px 14px rgb(0 0 0 / 25%)`): only on the white card on the screens before unlocking.

### Named Rules

**The One Lifted Card Rule.** Only the white card before unlocking has a shadow. Surfaces inside the main screen are separated by rules, with no added shadows.

## Shapes

Corner radii come in two steps. Buttons, inputs, list rows, notices, form groups, and the recovery key have modest corners (8px). Large surfaces that group components, such as field tables, settings sections, and the card before unlocking, are one step rounder (12px). Only tags are rounded at both ends (999px).

All borders are 1px. Dividers between surfaces use the rule color (line); borders of interactive components use the strong rule (line-strong). The only dashed border is around the recovery key (to make clear it is something to write down).

Icons are home-made SVGs: 24 grid, 1.75 stroke, rounded caps and joins, displayed at 20px. They inherit the text color. There are 12 of them: search, copy, done, show, hide, add, settings, lock (close), back, open externally, warning, and the key next to the name.

## Components

### Buttons

Calm, square buttons you can press without hesitation.

- **Shape:** modest corners (8px), a 1px border, at least 40px high, 15px text at 600. 8px between icon and text.
- **Primary:** white text on blue. Only one per section (the list pane, the card before unlocking, a settings section, an input screen): 「登録」 (Add), 「開く」 (Open), 「変える」 (Change), 「保存する」 (Save).
- **Secondary (regular):** a white surface with a strong rule border and ink text: 「編集する」 (Edit), 「閉じる」 (Close), 「コピー」 (Copy), 「開く」 (Open).
- **Hover / Focus:** under the pointer, over 120ms, the background recesses one step (regular) or turns dark blue (primary). Focus draws a 2px blue ring offset by 2px. Disabled buttons have an opacity of 0.55.
- **Quiet:** no border or background, Ink 2 text: 「設定」 (Settings), 「一覧に戻る」 (Back to list). Under the pointer the background recesses and the text becomes ink.
- **Danger:** a white button with red text: 「削除する」 (Delete), 「消す」 (Erase). Pressing it changes to a red notice and a confirmation step with a red-filled button. The filled red darkens slightly under the pointer (brightness 0.92).
- **Small:** 34px high, 14px text. Used in the top bar and inside field tables.

### Chips

- **Style:** tags. A recessed surface background, a 1px rule, Ink 2 text at 13px, rounded at both ends.
- **State:** display only; they are not pressed to select (filtering is done with a select box).

### Cards / Containers

- **Field table (details):** a white surface, a 1px rule, one step rounder corners (12px), no shadow. Rows have 12px 16px padding, in three columns: field name (180px), value, and buttons. Rows are separated by 1px rules. Field names are 14px in Ink 3.
- **Settings section:** a white surface, a 1px rule, 12px corners, 24px padding inside. In the dangerous section, only the heading is red.
- **Form group:** a recessed surface, a 1px rule, 8px corners, 16px padding inside. The heading (legend) is 15px, 700.
- **Card before unlocking:** a white surface, a 1px rule, 12px corners, 32px 24px padding, up to 440px wide, one shadow. Below it, separated by a rule, sits a secondary area (「マスターパスワードを忘れたとき」, If you forgot your master password).

### Inputs / Fields

- **Style:** a white surface, a 1px strong rule border, 8px corners, at least 44px high, 16px text. The label sits above in 14px, 600, Ink 2; the hint sits below in 13px Ink 2.
- **Focus:** the border turns blue, with a 2px blue ring over the border (1px inward).
- **Search:** an Ink 3 magnifying glass icon 12px from the left, with the text starting at 40px.
- **Checkboxes and radios:** 18px, blue. The tap target is at least 36px high.

### Navigation

- **Top bar:** a white surface, 56px high, with a 1px rule below. On the left, a blue key and the name (700); on the right, 「5 分さわらないと自動で閉じます」 (closes automatically after 5 minutes without use; 13px Ink 3), a quiet 「設定」 (Settings), and a regular 「閉じる」 (Close).
- **List row:** a transparent background, 8px corners, 12px padding. On the left, the service name (16px, 650) with the account name below it (13px Ink 3); on the right, the amount (14px Ink 2, tabular figures) and the cycle (12px). Under the pointer it recesses one step, and the selected row has a pale blue background.
- **Phone:** switches between list and details, with 「一覧に戻る」 (Back to list) at the top left of the details.
- **Renewal badge (discussion51):** rows whose renewal is near or past show, under the amount, a badge shaped like a tag (「今日」 Today, 「あと 2 日」 2 days left, 「過ぎています」 Overdue; 13px Ink 2). Overdue ones use ink at 600 and a strong rule.
- **Total converted to yen (discussion53):** under the monthly total, one step more subdued (13px Ink 2, the amount in 15px, 600, ink, and the rate and the date it was set in Ink 3). Shown only when a rate has been set and there are dollar charges.
- **Upcoming renewals:** under the total in the list pane, in the same recessed surface, strong rule, and 8px corners as the warning notice, show a heading (14px, 600) and the first 3 rows (name, plus date and badge). The rows can be pressed, and turn to a white surface under the pointer. No blue or red is used.

### Notices

- **Style:** 8px corners, 12px 16px padding, 15px text with a line height of 1.5, an icon on the left. Errors are red on pale red, done is green on pale green, info is ink on pale blue, and warnings are ink on a recessed surface with a strong rule border.

### Copy countdown line (Signature Component)

When the copy button is pressed, it changes to a green 「コピーしました」 (Copied) with the done icon, and a 3px blue line appears along the bottom edge of that field's row, shrinking to the left and disappearing over 30 seconds (at a constant speed). Below the table, the notice 「コピーしました。30 秒たつと、クリップボードから消えます。」 (Copied. It will be cleared from the clipboard after 30 seconds.) is shown. Below 600px, the same short notice also appears inside the row. With reduced motion, the line does not shrink and is shown still at an opacity of 0.6.

## Do's and Don'ts

### Do:

- **Do** use colors by the role names on :root in src/app.css (ground, surface, ink, accent, and so on), and swap in dark-mode values on the prefers-color-scheme side.
- **Do** fit new screens into the list-and-details pattern, and separate surfaces with 1px rules.
- **Do** give controls 8px corners and surfaces that group components 12px corners.
- **Do** choose spacing from the 4, 8, 12, 16, 24, 32, and 48px steps.
- **Do** add icons to src/screens/icons.tsx as SVGs on a 24 grid with a 1.75 stroke and rounded caps.
- **Do** confirm irreversible actions in two steps: a red-text button → a red notice and a red-filled button.
- **Do** use tabular figures for amounts, counts, and dates, and the monospace font for revealed secret values and the recovery key.
- **Do** always pair motion with a way to stop it under prefers-reduced-motion.

### Don't:

- **Don't** load fonts, icons, or images from outside (a security rule; any font must be bundled).
- **Don't** write styles in style attributes (CSP style-src 'self'). Write everything as classes in src/app.css.
- **Don't** use blue as decoration. Don't add a second accent color.
- **Don't** go for a "security" look with glowing colors on black. Dark mode uses a calm, navy-leaning gray background (discussion13).
- **Don't** add shadows to surfaces inside the main screen. Only the white card before unlocking has a shadow.
- **Don't** make text meant to be read smaller than 13px (the 12px billing-cycle suffix is the only exception).
