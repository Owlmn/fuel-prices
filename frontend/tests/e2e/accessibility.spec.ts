import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [360, 1440]) {
    for (const view of ['overview', 'comparison', 'calculator', 'sources']) {
      test(`${view}: доступность и границы экрана ${width}px ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width, height: 900 })
        await page.route('**/api/v1/**', (route) => route.abort())
        await page.goto(`/?view=${view}`)
        await expect(page.locator('#main h1')).toBeVisible()
        await expect(page.locator('.skeleton')).toHaveCount(0)
        if (view === 'calculator') {
          await page.getByRole('button', { name: 'Заправка техники', exact: true }).click()
          await page.getByRole('button', { name: 'Моя цена', exact: true }).click()
          await page.getByRole('textbox', { name: 'Ваша цена, ₽/л', exact: true }).fill('80')
        }
        await page.evaluate(() => document.fonts.ready)
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(
          scan.violations.map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target) })),
        ).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const smallControls = await page
          .locator('#main button, .sidebar button, #main summary, #main input')
          .evaluateAll((elements) =>
            elements
              .filter((el) => {
                const r = el.getBoundingClientRect()
                return r.width > 0 && r.height > 0 && (r.height < 43.9 || r.width < 43.9)
              })
              .map((el) => ({
                text: el.textContent || el.getAttribute('aria-label'),
                width: el.getBoundingClientRect().width,
                height: el.getBoundingClientRect().height,
              })),
          )
        expect(smallControls).toEqual([])
        if (width === 360 && view === 'comparison') {
          await expect(page.locator('.comparison-table-wrap')).toBeHidden()
          await expect(page.locator('.comparison-list article')).toHaveCount(3)
          await expect(
            page.locator('.comparison-list').getByText('Разница с базовым', { exact: true }),
          ).toHaveCount(3)
        }
        if (width === 360 && view === 'overview') {
          const price = await page.locator('.current-price .stat-value').boundingBox()
          expect(price!.y + price!.height).toBeLessThan(800)
          await expect(
            page.getByRole('button', { name: 'Рассчитать заправку', exact: true }),
          ).toBeInViewport()
        }
        await page.locator('#main h1').click()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: `test-results/${view}-${width}-${colorScheme}.png`,
          fullPage: true,
        })
      })
    }
  }
}

test('регион выбирается клавиатурой, некорректные даты не меняют расчёт', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /^Регион Приморский/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const search = page.getByRole('textbox', { name: 'Поиск региона' })
  await expect(search).toBeFocused()
  await search.fill('Ростов')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Ростовская область', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Регион Ростовская/ })).toBeFocused()
  await expect(page).toHaveURL(/region=rostov_oblast/)
  await page.getByRole('button', { name: /^Регион Ростовская/ }).press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Регион', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '12 недель', exact: true }).click()
  await page.getByLabel('Выбрать даты наблюдений').click()
  const before = page.url()
  await page.getByLabel('Начало периода', { exact: true }).fill('2020-01-01')
  await expect(page.getByText(/Показан предыдущий корректный период/)).toBeVisible()
  expect(page.url()).toBe(before)
  await page.getByRole('button', { name: '12 недель', exact: true }).click()
  await expect(page.getByLabel('Начало периода', { exact: true })).toHaveValue('2026-08-03')
  await expect(page.getByText(/Показан предыдущий корректный период/)).toHaveCount(0)
  await page.getByLabel('Начало периода', { exact: true }).fill('2026-09-01')
  await expect(page.getByText(/Показан предыдущий корректный период/)).toHaveCount(0)
  await expect(page).toHaveURL(/from=2026-09-01/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/custom-dates-390.png', fullPage: true })
})

test('страница 404 возвращает к обзору; ссылка содержит превью', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  const response = await page.goto('/missing-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
  await page.getByRole('link', { name: 'Открыть обзор цен' }).click()
  await expect(page.locator('#main h1')).toBeVisible()
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /opengraph-image/,
  )
  const previewUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  const image = await page.request.get(new URL(previewUrl!).pathname)
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toContain('image/png')
})
