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

<!-- impeccable:design-map -->
Name: AccountManager
Colors: primary: accent #1f5fd6; secondary: danger #c62828; neutral: ground #f4f5f7; primary: accent-hover #1a50b5; primary: accent-ink #ffffff; primary: accent-soft #e9f0fd; primary: focus #1f5fd6 (+10 more in the sidecar)
Fonts: system-ui (headline, headline-gate, title, title-section, entry-name, body, body-small, label, caption); ui-monospace (secret, recovery-key)
Spacing: s1 4px, s2 8px, s3 12px, s4 16px, s5 24px, s6 32px, s7 48px
Radius: control 8px, container 12px, pill 999px
North Star: "The Everyday Toolbox"
Rules:
- The One Blue Rule. The only accent color is one blue. It is used only for selection, primary buttons, focus, links, the key next to the name, and the remaining-time line after copying. Never fill headings or decorative surfaces with blue.
- The Meaning-Only Color Rule. Red is used only for irreversible actions and errors, green only for things that are done. When either fills a background, use the pale tone (danger-soft, ok-soft) with text in the dark tone of the same hue.
- The Mono-for-Secrets Rule. The monospace font is used only for revealed passwords and the recovery key, so that 1 and l, and 0 and O, can be told apart when copying them by hand.
- The Tabular Numbers Rule. Amounts, counts, and dates use tabular figures (font-variant-numeric: tabular-nums) so that the digits of amounts line up in the list.
- The 13px Floor Rule. Text meant to be read is at least 13px (the only exception is the 12px billing-cycle suffix). No small, cramped text.
- (+1 more)
Elevation:
- Shadow of the card before unlocking: 0 1px 2px rgb(20 24 32 / 6%), 0 4px 12px rgb(20 24 32 / 6%)
Don't:
- Don't load fonts, icons, or images from outside (a security rule; any font must be bundled).
- Don't write styles in style attributes (CSP style-src 'self'). Write everything as classes in src/app.css.
- Don't use blue as decoration. Don't add a second accent color.
- Don't go for a "security" look with glowing colors on black. Dark mode uses a calm, navy-leaning gray background (discussion13).
- Don't add shadows to surfaces inside the main screen. Only the white card before unlocking has a shadow.
- Don't make text meant to be read smaller than 13px (the 12px billing-cycle suffix is the only exception).
Full: .impeccable/design-full.md (read a section when you need its detail)
