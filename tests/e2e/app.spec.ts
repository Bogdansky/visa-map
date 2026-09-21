import { expect, test, type Page } from '@playwright/test';

const painted = (page: Page, iso: string) =>
  page.locator(`path.country[data-iso="${iso}"]`).evaluate((el) => getComputedStyle(el).fill);

/** RGB of #2E9E5B etc. as computed styles report them. */
const GREEN = 'rgb(46, 158, 91)';
const GREY = 'rgb(201, 205, 210)';

const waitLoaded = (page: Page) => expect(page.getByText(/Данные от/)).toBeVisible({ timeout: 15_000 });

/** Taps a country the way a user does: real pointer down/up at its centre. */
async function tapCountry(page: Page, iso: string) {
  const box = await page.locator(`path.country[data-iso="${iso}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
}

test('opens, paints, switches passport, selects a country, refreshes', async ({ page, isMobile }) => {
  await page.goto('./');
  // default passport BY, and the map starts grey then gets coloured
  await expect(page.getByLabel('Паспорт')).toHaveValue('BY');
  await waitLoaded(page);
  await expect.poll(() => painted(page, 'POL')).not.toBe(GREY);
  await expect.poll(() => painted(page, 'RUS')).not.toBe(GREY);

  // switch passport: the map is re-coloured for the new passport (KZ has visa-free access to Kyrgyzstan)
  await page.getByLabel('Паспорт').selectOption('KZ');
  await expect.poll(() => painted(page, 'KGZ')).toBe(GREEN);
  await expect(page.getByLabel('Паспорт')).toHaveValue('KZ');
  await page.reload();
  await expect(page.getByLabel('Паспорт')).toHaveValue('KZ'); // remembered

  // search -> zoom + details
  await page.getByRole('button', { name: 'Поиск страны' }).click();
  await page.getByRole('searchbox', { name: 'Поиск страны' }).fill('герм');
  await page.getByRole('option', { name: /Германия/ }).click();
  await expect(page.getByRole(isMobile ? 'region' : 'complementary', { name: 'Детали страны' })).toContainText(
    'Германия',
  );
  await expect(page.getByText(/Информация справочная/)).toBeVisible();

  // details close
  await page.getByRole('button', { name: 'Закрыть' }).first().click();
  await expect(page.getByLabel('Детали страны')).toHaveCount(0);

  // tap on the map opens details for that country (reset the view first: the search zoomed in)
  await page.getByRole('button', { name: 'Сбросить вид' }).click();
  await expect(page.locator('.map-svg > g')).toHaveAttribute('transform', /scale\(1\)/);
  await tapCountry(page, 'POL');
  await expect(page.getByLabel('Детали страны')).toContainText('Польша');

  // refresh from the menu
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('menuitem', { name: 'Обновить данные' }).click();
  await waitLoaded(page);
  await expect.poll(() => painted(page, 'KGZ')).toBe(GREEN);
});

test('list tab groups countries and selecting one returns to the map', async ({ page }) => {
  await page.goto('./');
  await waitLoaded(page);
  await page.getByRole('tab', { name: 'Список' }).click();
  await expect(page.getByRole('heading', { name: /Без визы/ })).toBeVisible();
  await page.getByPlaceholder('Поиск по названию').fill('Польша');
  await page.getByRole('button', { name: /Польша/ }).click();
  await expect(page.getByRole('tab', { name: 'Карта' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Детали страны')).toContainText('Польша');
});

test('micro-states can be picked from the map marker (Singapore)', async ({ page }) => {
  await page.goto('./');
  await waitLoaded(page);
  const hit = page.locator('circle.hit[data-iso="SGP"]');
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await expect(page.getByLabel('Детали страны')).toContainText('Сингапур');
});

test('no horizontal scroll and 44px tap targets on the main controls', async ({ page }) => {
  await page.goto('./');
  await waitLoaded(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['Поиск страны', 'Меню', 'Приблизить', 'Отдалить', 'Сбросить вид']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box!.width, name).toBeGreaterThanOrEqual(43.5);
    expect(box!.height, name).toBeGreaterThanOrEqual(43.5);
  }
});

test('a failed chunk shows the banner and Retry restores it', async ({ page }) => {
  let fail = true;
  await page.route('**/data/BY/asia-west.json*', (route) => (fail ? route.fulfill({ status: 404 }) : route.continue()));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить часть данных');
  await expect.poll(() => painted(page, 'RUS')).not.toBe(GREY); // other chunks unaffected
  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('works offline after the first visit (PWA shell + cached data)', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker offline check runs on Chromium');
  await page.goto('./');
  await waitLoaded(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload(); // let the SW take control
  await waitLoaded(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Данные от/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/оффлайн/)).toBeVisible();
  await expect.poll(() => painted(page, 'POL')).not.toBe(GREY);
});

test('search from the list tab lands on the map with details open', async ({ page }) => {
  await page.goto('./');
  await waitLoaded(page);
  await page.getByRole('tab', { name: 'Список' }).click();
  await page.getByRole('button', { name: 'Поиск страны' }).click();
  await page.getByRole('searchbox', { name: 'Поиск страны' }).fill('франц');
  await page.getByRole('option', { name: /Франция/ }).click();
  await expect(page.getByRole('tab', { name: 'Карта' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Детали страны')).toContainText('Франция');
});
