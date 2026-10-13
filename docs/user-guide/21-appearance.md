# Appearance & Branding

> **Builder → Configure** · `/builder/appearance` · Make the CRM look like your organization — colours, shape, density, typeface, dark mode, chart palette, logo and name — live, for everyone.

## What it is

Appearance & Branding controls how Genesis looks for every user in your organization. Change the brand
colour and every button, link, focus ring, active menu item and tinted surface follows. Choose sharper or
rounder corners, a denser or airier layout, a different typeface, a default light or dark mode, the
sidebar style and the colours your charts use. Everything previews across the whole application as you
edit, and **Save** applies it to everyone on their next page load. No redeploy, no code.

## Where to find it

Sidebar → **Builder** → **Configure** → **Appearance & Branding**. Requires an **Admin** or **Super Admin**
role. The same settings also appear as a group on the Organization Settings page.

## Change the look: step by step

1. Open **Appearance & Branding**. The page shows controls on the left and a **Live preview** card on the
   right — but the whole screen is really the preview: the sidebar, header and page you are on change as
   you edit.
2. **Brand colours** — click a preset (Indigo, Ocean, Emerald, Ruby, …) or set the **Primary colour** and
   **Accent colour** with the picker or a hex code. Primary drives buttons, links and navigation; accent
   appears in gradients and highlights. Text on the primary colour switches between white and dark
   automatically for readability.
3. **Identity** — set the **Application name** (sidebar, tab title, monogram) and optionally a **Logo URL**
   that replaces the monogram. Add a **Login tagline** and choose whether to show "Powered by Genesis".
4. **Light & dark** — pick the default for new sign-ins: Light, Dark or **Follow device**. Untick *Let
   users switch* to pin the mode for everyone (the header toggle disappears).
5. **Shape & density** — choose a **Corner radius** (Sharp, Soft, Rounded, Pill) and a **Density**
   (Compact, Comfortable, Spacious). Density scales the entire interface, not just fonts.
6. **Typography & background** — pick a **Typeface**, a **Page background** (Aurora glow, Plain, Brand
   tint) and a **Sidebar** style (Light, Dark, Brand colour).
7. **Charts** — choose the palette every dashboard and report chart uses. **Brand** derives it from your
   colours; the others are colour-blind-checked sets that look right in both light and dark mode.
8. Click **Save**. Use **Reset** to discard unsaved changes, or **Product defaults** to go back to the
   original look.

While you have unsaved changes a banner reminds you that only you can see them. Leaving the page discards
them.

## Reference: settings

| Setting | Options | Notes |
| --- | --- | --- |
| Primary colour | any hex colour | Generates the full light-to-dark ramp automatically |
| Accent colour | any hex colour | Gradients and highlights |
| Application name | text (≤ 60) | Sidebar and monogram |
| Logo URL | URL | Replaces the monogram; keep it square |
| Default mode | Light · Dark · Follow device | Applies on first sign-in on a device |
| Let users switch | on/off | Off hides the light/dark toggle for everyone |
| Corner radius | Sharp · Soft · Rounded · Pill | Cards, inputs, buttons, dialogs |
| Density | Compact · Comfortable · Spacious | Scales the whole UI |
| Typeface | Inter · System UI · Geometric · Humanist · Serif | |
| Page background | Aurora glow · Plain · Brand tint | |
| Sidebar | Light · Dark · Brand colour | |
| Chart palette | Vivid · Brand · Pastel · Monochrome · Ocean · Warm | Individual dashboard widgets can override it |
| Login tagline / Powered by | text / on-off | Shown on the sign-in page |

## Tips

- Pick the primary colour first, then check the **Live preview** ramp: the numbered swatches are the
  shades the UI will use. If the 500/600 swatches look too light, choose a slightly darker brand colour.
- **Compact** density is popular for data-heavy teams working on large screens; **Spacious** suits touch
  devices.
- Dashboard authors can still pick a palette per chart in the Dashboard Builder; this page sets the default.

## Related guides

- [Dashboard Builder](03-dashboard-builder.md) — per-widget chart appearance.
- [Form Builder](02-form-builder.md) — per-field look and validations.

## Troubleshooting

- **Nothing changed for a colleague** — appearance is applied when the app loads; ask them to refresh.
- **The logo does not show** — the URL must be reachable from the user's browser (https, publicly served).
- **A colour was rejected on Save** — colours must be 6-digit hex, like `#0f766e`.
- **Users cannot find the dark-mode toggle** — *Let users switch* is off; turn it on to restore the switch.
