# Appearance & Branding

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 20 of 20 · **For:** Administrators
> ← [Social media](19-social-media.md) · [System configuration](../administration/system-configuration.md) *(Administration)* →
> New to Genesis? Background: [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md)
<!-- /nav:top -->

> **Builder → Configure** · `/builder/appearance` · Make the CRM look like your organization — themes, colours, shape, density, typeface, dark mode, sign-in page, chart palette, logo and name — live, for everyone.

## What it is

The Appearance Studio controls how Genesis looks for every user in your organization. Start from a theme, or
change the brand colour and every button, link, focus ring, active menu item and tinted surface follows. Choose
sharper or rounder corners, a denser or airier layout, typefaces, a default light or dark mode, the sidebar style,
the sign-in page and the colours your charts use. Everything previews as you edit, and **Save for everyone** applies
it to everyone on their next page load. No redeploy, no code.

## Where to find it

Sidebar → **Builder** → **Configure** → **Appearance Studio**. Requires an **Admin** or **Super Admin** role. The
Organization Settings page links to it from its Appearance group.

## Change the look: step by step

1. Open **Appearance Studio**. Sections run down the left: **Themes**, **Colours**, **Branding**, **Layout &
   shape**, **Typography**, **Light & dark**, **Sign-in page**, **Charts** and **Motion**. A **Live preview** sits on
   the right, and the sidebar and header around you change as you edit.
2. **Themes** — pick a complete look from the **Theme gallery** (Genesis, Cupertino, Graphite, Midnight, Ocean,
   Forest, Sunset, Royal). A theme sets every look setting at once; your name and logos stay. **Export** saves the
   look as a file and **Import** loads one, for reuse in another workspace. Names and logos are never included.
3. **Colours** — click a colour preset or set the **Primary colour** and **Accent colour** with the picker or a hex
   code. Primary drives buttons, links, focus rings and navigation; accent ends gradients and highlights. Text on
   the primary colour switches between white and dark automatically. **Neutral tone** picks the grey used for text
   and borders.
4. **Branding** — set the **Application name** (sidebar, browser tab, sign-in page and emails), the **Logo
   display** (Mark + name, Logo only, Name only) and whether to show "Powered by Genesis". Under **Logos**, upload a
   **Logo**, a **Logo for dark surfaces**, an **App icon** and a **Favicon**, or choose **Use a URL**. Uploads save
   straight away; they do not wait for Save.
5. **Layout & shape** — **Corner radius**, **Density** (scales the whole interface), **Surface style**, **Primary
   buttons**, **Sidebar** style and width, how the **Active item** is marked, and the **Page background**.
6. **Typography** — a **Body typeface** and a **Heading typeface** (or Same as body).
7. **Light & dark** — the **Default mode** for new sign-ins (Light, Dark or Follow device) and the **Dark
   surfaces**. Under **What people may personalize**, turn off *Switch light / dark* to pin everyone to your
   default, or *Choose text size* to stop people changing text size from the header's Personalize menu.
8. **Sign-in page** — the **Layout** (Split panel, Centered card, Full-bleed cover), a **Tagline**, a **Footer
   note** and optional **Sign-in artwork**. The sign-in page shows the brand of the last workspace used on that
   device.
9. **Charts** — the palette every dashboard and report chart uses. **Brand** derives it from your colours.
10. **Motion** — Full, Subtle or Reduced animation.
11. Click **Save for everyone** in the bar at the bottom. **Discard** drops unsaved changes; **Product defaults**
    (top right) goes back to the original look.

While you have unsaved changes the bottom bar says you are previewing them; nobody else sees them. Leaving the
page discards them.

## Reference: settings

| Setting | Options | Notes |
| --- | --- | --- |
| Theme | Genesis · Cupertino · Graphite · Midnight · Ocean · Forest · Sunset · Royal | Sets every look setting; shows "Custom" once you change one |
| Primary colour | any hex colour | Generates the full light-to-dark ramp automatically |
| Accent colour | any hex colour | Gradients and highlights |
| Neutral tone | Cool grey · Slate · Warm stone · Graphite | Text, borders, dividers |
| Application name | text (≤ 60) | Sidebar, browser tab, sign-in page, emails |
| Logo display | Mark + name · Logo only · Name only | Sidebar |
| Logo, dark logo, app icon, favicon | upload (≤ 1 MB) or URL | PNG, JPEG, WebP or SVG (favicon: PNG, SVG or ICO). Saved on upload |
| Corner radius | Sharp · Soft · Rounded · Continuous | Cards, inputs, buttons, dialogs |
| Density | Compact · Comfortable · Spacious | Scales the whole UI |
| Surface style | Glass · Flat · Elevated | |
| Primary buttons | Gradient · Solid · Soft tint | |
| Sidebar | Light · Dark · Brand colour · Frosted glass | Width: Compact · Regular · Wide |
| Active item | Gradient pill · Tinted pill · Leading line | |
| Page background | Aurora glow · Mesh gradient · Brand tint · Plain | |
| Body / heading typeface | Inter · San Francisco · System UI · Plus Jakarta · Source Sans · Source Serif | Heading can be Same as body |
| Default mode | Light · Dark · Follow device | Applies on first sign-in on a device |
| Dark surfaces | Midnight · Graphite · OLED black | |
| Switch light / dark | on/off | Off hides the light/dark toggle for everyone |
| Choose text size | on/off | Off stops people changing text size |
| Sign-in layout | Split panel · Centered card · Full-bleed cover | Plus tagline (≤ 120), footer note (≤ 160), artwork (≤ 4 MB) |
| Chart palette | Vivid · Brand · Pastel · Monochrome · Ocean · Warm · System | Individual dashboard widgets can override it |
| Motion | Full · Subtle · Reduced | People can also pick Reduced for themselves |

## Tips

- Pick the primary colour first, then check **How the brand renders** under **Colours**: the numbered swatches
  are the shades the UI will use, in light and dark mode. If the 500/600 swatches look too light, choose a slightly darker brand colour.
- **Compact** density is popular for data-heavy teams working on large screens; **Spacious** suits touch
  devices.
- Dashboard authors can still pick a palette per chart in the Dashboard Builder; this page sets the default.

## Related guides

- [Dashboard Builder](05-dashboard-builder.md) — per-widget chart appearance.
- [Form Builder](02-form-builder.md) — per-field look and validations.

## Troubleshooting

- **Nothing changed for a colleague** — appearance is applied when the app loads; ask them to refresh.
- **The logo does not show** — an uploaded logo must be PNG, JPEG, WebP or SVG and at most 1 MB. A pasted URL must be
  reachable from the user's browser (https, publicly served).
- **A colour was rejected on Save** — colours must be 6-digit hex, like `#0f766e`.
- **Users cannot find the dark-mode toggle** — *Switch light / dark* is off under **Light & dark**; turn it on to
  restore the switch.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [System configuration](../administration/system-configuration.md) *(Administration)* — Modules, fields, users, settings, import, integrations, monitoring — the overview |
| **Previous** | [Social media](19-social-media.md) |
| **Background** | [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md) |
| **Related** | [Configurability engine](../developer-guide/engines/configurability.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
