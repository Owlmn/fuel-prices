import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { formatPrice } from '../../src/lib/numbers'
import { snapshotSchema, type Fuel } from '../../src/lib/contracts'

const snapshot = snapshotSchema.parse(
  JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url), 'utf8')),
)

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
})

test('кнопки темы: выбранное состояние, подсказки мышью и клавиатурой, Escape', async ({
  page,
}) => {
  await page.goto('/')
  const group = page.getByRole('group', { name: 'Тема оформления' })
  await expect(group.getByRole('button')).toHaveCount(3)
  const dark = group.getByRole('button', { name: 'Тёмная тема', exact: true })
  await dark.focus()
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'Тёмная тема' })
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('при слабом освещении')
  await page.keyboard.press('Enter')
  await expect(dark).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()
  await page.getByRole('heading', { level: 1 }).click()
  await group.getByRole('button', { name: 'Системная тема', exact: true }).hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'Системная тема' })).toContainText(
    'тему устройства',
  )
})

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 600 },
  { width: 390, height: 640 },
  { width: 844, height: 390 },
]) {
  test(`кнопки выбора регионов видны без прокрутки страницы ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click()
    await page.getByRole('button', { name: 'Выбрать регионы', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Выбор регионов для сравнения' })
    const apply = dialog.getByRole('button', { name: 'Применить', exact: true })
    const before = await apply.boundingBox()
    expect(before).not.toBeNull()
    expect(before!.y).toBeGreaterThanOrEqual(0)
    expect(before!.y + before!.height).toBeLessThanOrEqual(viewport.height - 8)
    expect(before!.x + before!.width).toBeLessThanOrEqual(viewport.width - 8)
    await dialog.locator('.comparison-options').evaluate((list) => {
      list.scrollTop = list.scrollHeight
    })
    expect(await apply.boundingBox()).toEqual(before)
    await dialog.getByRole('textbox').focus()
    await page.keyboard.press('Shift+Tab')
    await expect(apply).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('textbox')).toBeFocused()
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      scan.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((n) => n.target),
      })),
    ).toEqual([])
    await page.screenshot({
      path: `test-results/region-dialog-${viewport.width}-${viewport.height}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Выбрать регионы', exact: true })).toBeFocused()
  })
}

test('три вида топлива показаны одновременно, смена топлива графика не меняет блок; регион и период обновляются', async ({
  page,
}) => {
  await page.goto('/')
  const panel = page.getByRole('region', { name: 'Все виды топлива в регионе' })
  const assertPrices = async (region: string) => {
    for (const fuel of ['diesel', 'ai92', 'ai95'] as Fuel[]) {
      const point = snapshot.observations.find(
        (point) =>
          point.region_id === region && point.fuel_type === fuel && point.date === '2026-10-19',
      )!
      await expect(panel.getByTestId(`fuel-price-${fuel}`)).toContainText(
        formatPrice(point.price_kopecks),
      )
    }
  }
  await assertPrices('primorsky_krai')
  await page.getByRole('button', { name: 'АИ-92', exact: true }).click()
  await assertPrices('primorsky_krai')
  await page.getByRole('button', { name: /^Регион Приморский/ }).click()
  await page.getByRole('textbox', { name: 'Поиск региона', exact: true }).fill('Хабаровский')
  await page.getByRole('button', { name: 'Хабаровский край', exact: true }).click()
  await expect(panel).toContainText('Хабаровский край')
  await assertPrices('khabarovsk_krai')
  await page.getByLabel('Выбрать даты наблюдений').click()
  await page.getByLabel('Конец периода', { exact: true }).fill('2026-10-12')
  await expect(panel).toContainText('цены на 12 окт. 2026')
  const diesel = snapshot.observations.find(
    (p) => p.region_id === 'khabarovsk_krai' && p.fuel_type === 'diesel' && p.date === '2026-10-12',
  )!
  await expect(panel.getByTestId('fuel-price-diesel')).toContainText(
    formatPrice(diesel.price_kopecks),
  )
})

test('пропуск цены не заменяется предыдущим наблюдением', async ({ page }) => {
  const data = structuredClone(snapshot)
  data.observations = data.observations.filter(
    (p) => !(p.region_id === 'primorsky_krai' && p.fuel_type === 'ai95' && p.date === '2026-10-19'),
  )
  await page.route('**/snapshot.json', (route) => route.fulfill({ json: data }))
  await page.goto('/')
  const panel = page.getByRole('region', { name: 'Все виды топлива в регионе' })
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(panel.getByTestId('fuel-price-ai95')).toContainText('—')
  await expect(panel.getByRole('article', { name: 'Бензин АИ-95' })).toContainText(
    'Нет наблюдения на эту дату',
  )
  await expect(panel.getByTestId('fuel-price-diesel')).toContainText('93,37')
})
