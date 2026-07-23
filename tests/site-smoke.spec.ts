import { test, type Page } from '@playwright/test';
import { sites } from '../sites.config';
import {
  checkPageLoads,
  checkNoConsoleErrors,
  checkNoBrokenImages,
  checkAllLinks,
  checkAllFormsDynamic,
  checkPageStructure,
  checkTabRevealedForms,
  checkWidgetInteractivity,
} from '../helpers/genericChecks';

for (const site of sites) {
  test.describe(site.name, () => {
    let page: Page;

    test.beforeEach(async ({ browser }) => {
      page = await browser.newPage();
    });

    test(`${site.name} — loads with valid status and title`, async () => {
      await checkPageLoads(page, site.url);
    });

    test(`${site.name} — no console errors`, async () => {
      await checkNoConsoleErrors(page, site.url);
    });

    if (site.type === 'homepage' || site.type === 'portfolio') {
      test(`${site.name} — no broken images`, async () => {
        await checkPageLoads(page, site.url);
        await checkNoBrokenImages(page);
      });

      test(`${site.name} — tabs reveal hidden forms`, async () => {
        await checkPageLoads(page, site.url);
        await checkTabRevealedForms(page);
      });

      test(`${site.name} — widget interactivity (autocomplete fields)`, async () => {
        await checkPageLoads(page, site.url);
        await checkWidgetInteractivity(page);
      });
    }

    test(`${site.name} — all visible links have valid hrefs`, async () => {
      await checkPageLoads(page, site.url);
      await checkAllLinks(page);
    });

    test(`${site.name} — all visible forms block empty submission`, async () => {
      await checkPageLoads(page, site.url);
      await checkAllFormsDynamic(page);
    });

    if (site.type === 'homepage' || site.type === 'portfolio') {
      test(`${site.name} — page structure audit`, async () => {
        await checkPageLoads(page, site.url);
        await checkPageStructure(page);
      });
    }
  });
}
