---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/screens"]
---

# Surface: AccountManager, the whole app (the screens before unlocking and the main screen)

- Mode: operate
- Audience: only close acquaintances invited by the administrator. Mostly experienced users. Computers and phones are used about equally
- The most important moment: finding an entry in the list and copying its password (within seconds)
- To avoid (discussion13): a stiff, cold feel; a "security" look with glowing colors on black; lots of decoration; small, cramped text; Japanese that reads like a translation
- Wording: UI terms follow the term mapping in Dev Spec chapter 12 (「管理画面を開く」 open the main screen, 「はじめての準備」 first-time setup, 「復旧キー」 recovery key)
- Chosen direction: the familiar password manager pattern (canon). The bar is 1Password, Bitwarden, and Apple's Passwords app (discussion15, discussion16)
- Security rules: nothing is loaded from outside (fonts are the system's own). The CSP is style-src 'self' (style attribute strings cannot be used. React style objects go through the CSSOM and would work, but classes are used instead)

## Direction contract

THESIS: Build the familiar list-and-details pattern with enough care that it can be used without hesitation. Not a screen that draws the eye with decoration, but one where finding, viewing, and copying are over in a few seconds. Keep the category's standard form, and surpass it through alignment, spacing, type hierarchy, and how states are shown.

OWN-WORLD: White surfaces on a light gray ground, dark ink text, and a single calm blue accent (only for selection, primary buttons, and focus). Danger is red. Rules are thin 1px gray. Corner radii: 8px for components such as buttons and inputs, 12px for large surfaces that group components, such as tables and settings sections (matched to the look shipped in discussion18). Icons are unified as home-made SVGs (1.75px stroke). Numbers use tabular figures. A dark mode is provided to follow the device's light/dark setting.

STORY: The person opening the app first puts a finger on search, narrows the rows with part of a name, selects a row, and copies the password in the details on the right. They can see on the spot that it was copied, and that it will be cleared in 30 seconds. The monthly billing total sits quietly at the top of the list.

FIRST VIEWPORT: On a computer (960px and wider), a thin bar at the top (name, time until auto-close, Settings, Close). On the left, a list pane of 300–380px (it changes with the screen width; discussion18): search, tag filter, monthly total, and rows (service name large, account name small, amount on the right). On the right, the details pane: the service name as the heading, with the field table below it (field name, value, and copy and show buttons). When nothing is selected, a short hint on the right. On a phone, only the list is shown; pressing a row switches to the details, with 「一覧に戻る」 (Back to list) at the top. The screens before unlocking (open the main screen, first-time setup, account recovery) have a single 440px-wide white card centered on the ground.

FORM: The standard form (category standard), chosen outside the draw (option (d) in discussion15). seed:0bdae50a9b3bb149. Signature motion: the copied field's button changes to 「コピーしました」 (Copied), and a thin line under the field shrinks over 30 seconds (when it runs out, the user is told the clipboard has been cleared).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
