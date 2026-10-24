import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { snapshotPrice } from '../../src/lib/snapshot'
import { budgetChange, Decimal, formatSigned } from '../../src/lib/numbers'

const snapshot = JSON.parse(readFileSync('public/snapshot.json', 'utf8'))

for (const width of [390, 1440]) {
  test(`годовая история, полный бак и экспорт ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/v1/**', (route) => route.abort())
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    if (width < 700) await page.getByLabel('Выбрать даты наблюдений').click()
    await page.getByRole('button', { name: 'Год', exact: true }).click()
    await expect(page).toHaveURL(/from=2025-10-19&to=2026-10-19/)
    await expect(page.getByRole('heading', { name: 'Как менялась цена' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Влияние цены на бюджет' })).toHaveCount(0)
    if (width > 1100) {
      const chart = await page.locator('.overview-grid .chart-panel').boundingBox()
      const budget = await page.locator('.overview-grid .budget-card').boundingBox()
      expect(Math.abs(chart!.height - budget!.height)).toBeLessThan(1)
      expect(Math.abs(chart!.y - budget!.y)).toBeLessThan(1)
    }
    await page
      .locator('.overview-grid')
      .screenshot({ path: `test-results/overview-budget-${width}.png` })
    const price = snapshotPrice(snapshot, 'primorsky_krai', 'diesel', '2026-04-19', '2026-10-19')
    const change = budgetChange(new Decimal(1000), price.observations)!
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width < 700) await page.getByLabel('Выбрать даты наблюдений').click()
    await page.getByRole('button', { name: '6 месяцев', exact: true }).click()
    await expect(page).toHaveURL(/from=2026-04-19/)
    await page.getByRole('button', { name: 'Рассчитать заправку', exact: true }).click()
    await expect(page.getByTestId('budget-change')).toHaveText(
      `${formatSigned(change.difference)} ₽`,
    )
    await page.getByRole('button', { name: 'Заправка техники', exact: true }).click()
    await page.getByRole('button', { name: 'До полного бака', exact: true }).click()
    await page.getByRole('textbox', { name: 'Объём бака, л', exact: true }).fill('200')
    await page.getByRole('textbox', { name: 'Остаток в каждом баке, л', exact: true }).fill('40')
    await expect(page.getByTestId('budget-total')).toContainText('44 817,60')
    await expect(page.getByText('На одну машину: 160 л.', { exact: false })).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать расчёт CSV' }).click()
    const download = await downloadPromise
    const file = await download.path()
    const csv = readFileSync(file!, 'utf8')
    expect(csv).toContain('"Объём, л";"480,00"')
    expect(csv).toContain('"Стоимость, ₽";"44817,60"')
    expect(csv).toContain('"Резервный снимок"')
    const beforeCustom = await page.getByTestId('budget-change').innerText()
    await page.getByRole('button', { name: 'Моя цена', exact: true }).click()
    await page.getByRole('textbox', { name: 'Ваша цена, ₽/л', exact: true }).fill('80,55')
    await expect(page.getByTestId('budget-total')).toContainText('38 664,00')
    await expect(page.getByTestId('budget-change')).toHaveText(beforeCustom)
    await page.getByRole('textbox', { name: 'Остаток в каждом баке, л', exact: true }).fill('201')
    await expect(page.getByText('Остаток не может превышать объём бака')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Скачать расчёт CSV' })).toBeDisabled()
    await page.getByRole('textbox', { name: 'Остаток в каждом баке, л', exact: true }).fill('200')
    await expect(page.getByTestId('budget-total')).toContainText('0,00')
    await page.getByRole('textbox', { name: 'Остаток в каждом баке, л', exact: true }).fill('40')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/budget-history-${width}-light.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click()
    const audit = await new AxeBuilder({ page }).analyze()
    expect(audit.violations).toEqual([])
    await page.screenshot({ path: `test-results/budget-history-${width}-dark.png`, fullPage: true })
    expect(errors).toEqual([])
  })
}

test('год недоступен в старом снимке; одна точка не становится динамикой', async ({ page }) => {
  const short = structuredClone(snapshot)
  short.meta.expected_dates = short.meta.expected_dates.filter(
    (date: string) => date >= '2026-07-27',
  )
  short.observations = short.observations.filter(
    (row: { date: string }) => row.date >= '2026-07-27',
  )
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.route('**/snapshot.json', (route) => route.fulfill({ json: short }))
  await page.goto('/?region=primorsky_krai&fuel=diesel&from=2026-10-19&to=2026-10-19')
  await expect(page.getByRole('button', { name: 'Год', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Влияние цены на бюджет' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Рассчитать заправку', exact: true }).click()
  await expect(
    page.getByText('Для оценки изменения нужны цены минимум на две даты выбранного периода.'),
  ).toBeVisible()
  await expect(page.getByTestId('budget-change')).toHaveCount(0)
})
