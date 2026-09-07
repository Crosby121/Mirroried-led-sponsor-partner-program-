# Mirroried LED Main Website → Sponsor Portal Integration

## Purpose
Connect the existing public Mirroried LED storefront at `https://mirroriedled.com` to the separate Sponsor Partner / Advertising portal at `https://sponsors.mirroriedled.com` without replacing or moving the main website.

## Architecture
- Main public website: `https://mirroriedled.com`
- Existing main-site source: Hostinger `public_html`
- Sponsor portal: `https://sponsors.mirroriedled.com`
- Sponsor portal runtime: separate Hostinger VPS / Docker project
- PostgreSQL remains private inside the Sponsor Portal Docker stack.

## Required public-site link
Use this exact target anywhere the public site says Sponsor Login, Sponsor Portal, Advertise, or Partner Login:

```html
<a href="https://sponsors.mirroriedled.com/" rel="noopener">Sponsor Login</a>
```

Primary Sponsor Partner CTA:

```html
<a class="button" href="https://sponsors.mirroriedled.com/" rel="noopener">Sponsor Login</a>
```

## Recommended public navigation
Preserve the current storefront and add/retain these destinations:

- Home
- Products
- Custom Design
- Advertising on the Go
- Sponsor Partner Program
- Events
- Advertise With Us
- Client Login / Portals
- Contact
- Cart / Checkout

## Sponsor section
The main site should remain the public marketing surface. The Sponsor Partner section should explain the program and then hand off authenticated activity to the Sponsor Portal.

Recommended actions:
- `BECOME A PARTNER` → public contact/application flow on `mirroriedled.com`
- `SPONSOR LOGIN` → `https://sponsors.mirroriedled.com/`
- `ADVERTISE WITH US` → public Advertising on the Go information/application flow
- Approved sponsor campaign management → Sponsor Portal only

## Security boundary
Do not expose Sponsor Portal API credentials, PostgreSQL, Docker ports, private fleet/device information, customer records, or admin routes from the public storefront.

Do not proxy PostgreSQL through the main website.

Do not move the Sponsor Portal into `public_html`.

## Deployment rule
Before changing `public_html`:
1. Download or copy the current `index.html`, `app.js`, and `styles.css` as a rollback snapshot.
2. Change only the relevant navigation/CTA href values.
3. Do not replace the root domain DNS record.
4. Do not replace the existing storefront files with the Sponsor Portal build.
5. Verify `mirroriedled.com` still loads normally.
6. Verify the Sponsor Login link opens `https://sponsors.mirroriedled.com/`.
7. Verify the Sponsor Portal HTTPS health endpoint passes before advertising the login publicly.

## Go-live dependency
Do not publish the Sponsor Login handoff as live until:
- `sponsors.mirroriedled.com` resolves to the production VPS;
- valid HTTPS is active;
- `/api/health` returns healthy PostgreSQL status;
- the Sponsor Portal go-live gate passes.

## Rollback
If the new Sponsor Portal link or subdomain fails:
- restore the saved `public_html` files if they were modified;
- remove only the Sponsor Portal link/CTA or temporarily point it to the public Sponsor Partner information section;
- leave the rest of `mirroriedled.com` untouched.
