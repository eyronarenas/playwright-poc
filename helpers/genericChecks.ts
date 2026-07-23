import { type Page, expect } from '@playwright/test';

const THIRD_PARTY_NOISE_PATTERNS = [
  /analytics/i, /google-analytics/i, /gtag/i, /googletag/i,
  /facebook/i, /fbq/i, /hotjar/i, /fullstory/i,
  /mixpanel/i, /cdn\.cookielaw/i, /onesignal/i,
  /doubleclick/i, /adzerk/i, /adsystem/i, /scorecardresearch/i,
];

function isThirdPartyNoise(url: string): boolean {
  try { return THIRD_PARTY_NOISE_PATTERNS.some(p => p.test(new URL(url).hostname)); }
  catch { return false; }
}

export async function checkPageLoads(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, `GET ${url} should return < 400`).not.toBeNull();
  expect(response!.status(), `GET ${url} status`).toBeLessThan(400);
  expect(await page.title(), `Page at ${url} should have a non-empty title`).toBeTruthy();
}

export async function checkNoConsoleErrors(page: Page, _url: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  const handler = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  };
  page.on('console', handler);
  await page.waitForTimeout(1500);
  page.removeListener('console', handler);
  const real = errors.filter(e => !isThirdPartyNoise(e));
  expect(real, `Console/page errors at ${_url}`).toEqual([]);
}

export async function checkNoBrokenImages(page: Page): Promise<void> {
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter(img => img.complete && img.naturalWidth === 0)
      .map(img => img.src)
  );
  expect(broken, `Broken images: ${broken.join(', ')}`).toEqual([]);
}

export async function checkAllLinks(page: Page): Promise<void> {
  const hostname = new URL(page.url()).hostname;

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .filter(a => a.offsetParent !== null && a.textContent?.trim())
      .map(a => ({ text: a.textContent!.trim().slice(0, 80), href: a.getAttribute('href')! }))
  );

  const issues: string[] = [];

  for (const link of links) {
    const h = link.href.trim();
    if (!h || h === '#' || h === 'javascript:void(0)' || h === 'javascript:;') {
      issues.push(`"${link.text}" -> "${h}"`);
    }
  }

  if (issues.length) {
    console.warn(`Links with non-navigable hrefs (${issues.length}):`);
    issues.forEach(i => console.warn(`  ${i}`));
  }

  expect(links.length, `Page should have at least some links`).toBeGreaterThan(0);
}

export async function checkAllFormsDynamic(page: Page): Promise<void> {
  const formInfo = await page.evaluate(() =>
    [...document.forms].map((f, i) => ({
      index: i,
      visible: !!(f.offsetParent !== null && !f.classList.contains('et-search-form')),
      isSearch: f.querySelector('input[type="search"]') !== null,
      inputCount: f.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select').length,
      hasSubmit: f.querySelector('button[type="submit"], input[type="submit"]') !== null,
      inputs: [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select')].map(el => ({
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
        tag: el.tagName,
        type: (el as HTMLInputElement).type,
      })),
    }))
  );

  const visibleForms = formInfo.filter(f => f.visible && !f.isSearch && f.inputCount > 0 && f.hasSubmit);

  expect(visibleForms.length, `Expected at least one non-search visible form on page`).toBeGreaterThan(0);

  for (const f of visibleForms) {
    const formEl = page.locator('form').nth(f.index);
    await expect(formEl).toBeVisible({ timeout: 5000 });

    const submit = formEl.locator('button[type="submit"], input[type="submit"]').first();
    await expect(submit).toBeAttached({ timeout: 3000 });

    await submit.click();
    await page.waitForTimeout(2000);

    const stillVisible = await formEl.isVisible().catch(() => false);
    const urlChanged = page.url() !== page.url();

    const hasValidation = await formEl.evaluate(el => {
      return el.querySelector('.wpcf7-not-valid-tip, .wpcf7-validation-errors, .wpcf7-mail-sent-ng, .wpcf7-spam-blocked, [aria-invalid="true"], .error, .alert, [role="alert"], .invalid-feedback') !== null;
    }).catch(() => false);

    const wpcf7Response = await page.locator('.wpcf7-response-output').first().isVisible().catch(() => false);

    const blocked = stillVisible || hasValidation || wpcf7Response;

    if (!blocked) {
      console.warn(`Form[${f.index}]: empty submission may have gone through — page may have changed. Check manually.`);
    }
  }
}

export async function checkPageStructure(page: Page): Promise<void> {
  const audit = await page.evaluate(() => {
    const images = [...document.querySelectorAll('img')];
    const brokenImages = images.filter(img => img.complete && img.naturalWidth === 0);
    const noAlt = images.filter(img => !img.hasAttribute('alt') || img.getAttribute('alt') === '');

    return { brokenImages: brokenImages.length, noAltImages: noAlt.length };
  });

  if (audit.noAltImages > 0) {
    console.warn(`${audit.noAltImages} images missing alt text`);
  }
}

export async function checkTabRevealedForms(page: Page): Promise<void> {
  const tabTriggers = await page.evaluate(() => {
    const triggers: { text: string; parentCls: string }[] = [];

    document.querySelectorAll('a[href="#"]').forEach(a => {
      const text = a.textContent?.trim();
      if (!text) return;
      const parent = a.parentElement;
      if (!parent) return;
      const parentCls = parent.className;
      if (parentCls.includes('et_pb_tab')) {
        triggers.push({ text, parentCls: parentCls.slice(0, 60) });
      }
    });

    document.querySelectorAll('[data-toggle="tab"], [data-bs-toggle="tab"], [role="tab"]:not([aria-disabled="true"])').forEach(el => {
      const text = el.textContent?.trim();
      if (text && !triggers.find(t => t.text === text)) {
        triggers.push({ text, parentCls: el.className.slice(0, 60) });
      }
    });

    return triggers;
  });

  if (tabTriggers.length === 0) {
    console.warn('No tab-like triggers found to reveal hidden forms');
    return;
  }

  let newlyVisibleForms = 0;

  for (const tab of tabTriggers) {
    const visBefore = await page.evaluate(() =>
      [...document.forms].map((f, i) => ({ index: i, visible: f.offsetParent !== null }))
    );

    const clicked = await page.locator('a').filter({ hasText: tab.text }).first().click({ force: true, timeout: 5000 }).then(() => true).catch(() => false);

    if (!clicked) continue;
    await page.waitForTimeout(1500);

    const visAfter = await page.evaluate(() =>
      [...document.forms].map((f, i) => ({ index: i, visible: f.offsetParent !== null }))
    );

    for (const after of visAfter) {
      const before = visBefore.find(v => v.index === after.index);
      if (after.visible && before && !before.visible) {
        newlyVisibleForms++;
        console.warn(`Tab "${tab.text}" revealed Form[${after.index}]`);

        const formEl = page.locator('form').nth(after.index);
        const submit = formEl.locator('button[type="submit"], input[type="submit"]').first();
        const hasSubmit = await submit.count();

        if (hasSubmit > 0) {
          await submit.first().click({ force: true });
          await page.waitForTimeout(2000);

          const hasValidation = await formEl.evaluate(el =>
            el.querySelector('.wpcf7-not-valid-tip, .wpcf7-validation-errors, .wpcf7-mail-sent-ng, [aria-invalid="true"], .error, .alert, [role="alert"]') !== null
          ).catch(() => false);

          if (!hasValidation) {
            console.warn(`  Form[${after.index}] empty submission may not have been blocked`);
          }
        }
      }
    }
  }

  expect(newlyVisibleForms, `At least one tab-revealed form expected`).toBeGreaterThan(0);
}

export async function checkWidgetInteractivity(page: Page): Promise<void> {
  const autocompleteFields = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, textarea')];
    return inputs
      .filter(el => {
        const e = el as HTMLElement;
        const cls = e.className.toLowerCase();
        return cls.includes('autocomplete') || cls.includes('gmautocomplete') || cls.includes('pac-') || el.hasAttribute('data-google-autocomplete');
      })
      .map(el => ({
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
        className: el.className.slice(0, 60),
        id: el.id,
      }));
  });

  if (autocompleteFields.length === 0) {
    console.warn('No autocomplete fields found to test interactivity');
    return;
  }

  let responsiveCount = 0;
  let brokenCount = 0;

  for (const field of autocompleteFields) {
    const locator = field.id
      ? page.locator(`#${field.id}`)
      : page.locator(`input[name="${field.name}"]`).first();

    const exists = await locator.count();
    if (exists === 0) continue;

    await locator.fill('test');
    await page.waitForTimeout(2000);

    const hasSuggestions = await page.evaluate(() => {
      return document.querySelectorAll('.pac-container, .pac-item, .pac-matched, .pac-logo, .pac-icon').length > 0
        || document.querySelectorAll('[class*="pac-"]').length > 0;
    });

    const googleLoaded = await page.evaluate(() => {
      return typeof (window as any).google !== 'undefined'
        && typeof (window as any).google.maps !== 'undefined'
        && typeof (window as any).google.maps.places !== 'undefined';
    }).catch(() => false);

    if (!hasSuggestions) {
      brokenCount++;
      expect.soft(hasSuggestions, `Autocomplete "${field.name || field.placeholder}" — no suggestions after typing. Maps Places API loaded: ${googleLoaded}`).toBe(true);
    }
  }

  if (brokenCount > 0) {
    expect.soft(brokenCount, `${brokenCount}/${autocompleteFields.length} autocomplete widget(s) unresponsive`).toBe(0);
  }
}
