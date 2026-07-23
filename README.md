# Playwright POC — Dynamic Page Scan Framework

A Playwright (TypeScript) framework that dynamically scans pages rather than relying on hardcoded selectors. Adding a new site is one entry in a config file — the framework discovers all links, forms, images, and console errors automatically.

## Quick Start

```bash
npm install
npx playwright install chromium
```

## Running Tests

| Command | What it does |
|---|---|
| `npm test` | Headless run |
| `npm run test:headed` | With browser window visible |
| `npm run test:ui` | Interactive Playwright UI mode |
| `npm run report` | Open HTML test report |

## How to Add a New Site

Open `sites.config.ts` and add one entry. That's it.

```ts
{ name: 'My Site', url: 'https://example.com', type: 'homepage' }
```

No selectors to find, no fields to configure. The framework scans the page itself.

### Site Types and Their Checks

| Type | Checks |
|---|---|
| `homepage` / `portfolio` | Page loads, no console errors, no broken images, all visible links scanned, all visible forms tested for empty-submission blocking, image alt text audit |
| `login` | Page loads, no console errors, login form empty-submission blocked, credential-based login (if env vars set) |
| `other` | Page loads, no console errors, all visible links scanned, all visible forms tested |

## What the Dynamic Scan Does

- **Links**: Finds every visible `<a>` tag, flags `#` and `javascript:` hrefs as non-navigable, warns about them rather than failing.
- **Forms**: Finds every visible form on the page, identifies its input fields and submit button, attempts an empty submission, and verifies the page blocks it (validation error or stays on same page). Uses CF7-specific selectors (`wpcf7-not-valid-tip`, `wpcf7-response-output`) for WordPress sites.
- **Images**: Checks all `<img>` tags load successfully (naturalWidth > 0) and have alt text.
- **Console**: Captures JS errors and page errors, filters common third-party noise (analytics, ads).

## Credentials (Login Sites)

```bash
cp .env.example .env
```

Login tests auto-skip credential checks when env vars are missing. `.env` is gitignored.

## File Structure

```
├── playwright.config.ts        # Retries, timeouts, reporters
├── sites.config.ts             # Single source of truth — just name, url, type
├── helpers/genericChecks.ts    # Dynamic scan functions
├── tests/site-smoke.spec.ts    # Loops over config, runs all scans
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```
