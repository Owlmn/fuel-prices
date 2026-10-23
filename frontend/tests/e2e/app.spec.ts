import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { snapshotPrice, snapshotComparison } from '../../src/lib/snapshot'
import { snapshotSchema, type Fuel } from '../../src/lib/contracts'

const snapshot = JSON.parse(
  readFileSync(new URL('../../public/snapshot.json', import.meta.url), 'utf8'),
)
const version = snapshot.meta.dataset_version as string

test('production без backend показывает резерв, серверные методы остаются только для чтения', async ({
  page,
}) => {
  test.skip(!process.env.CI, 'Checks the production server started in CI')
  expect((await page.request.get('/api/v1/meta')).status()).toBe(503)
  expect((await page.request.post('/api/v1/prices')).status()).toBe(405)
  expect((await page.request.get('/api/v1/publish')).status()).toBe(404)
  await page.goto('/')
  await expect(page.getByText(/Резервные данные на/)).toBeVisible()
  await expect(page.getByTestId('budget-total')).toContainText('93 370,00')
})

test('реальный API: цены, фильтры и восстановление ссылки', async ({ page }) => {
  test.skip(!!process.env.CI, 'Live API is checked locally')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('93,37', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Резервные данные на/)).toHaveCount(0)
  await page.getByRole('button', { name: /^Регион Приморский/ }).click()
  await page.getByRole('textbox', { name: 'Поиск региона' }).fill('Ростов')
  await page.getByRole('button', { name: 'Ростовская область', exact: true }).click()
  await page.getByRole('button', { name: 'АИ-92', exact: true }).click()
  await page.getByRole('button', { name: '12 недель', exact: true }).click()
  await expect(page).toHaveURL(/region=rostov_oblast&fuel=ai92&from=2026-08-03/)
  await expect(page.getByRole('heading', { name: 'Как менялась цена' })).toBeVisible()
  const before = await page.getByTestId('budget-total').innerText()
  await page.reload()
  await expect(page.getByTestId('budget-total')).toHaveText(before)
  expect(errors).toEqual([])
})

test('сравнение, калькулятор парка, своя цена и валидация', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText(/Резервные данные на/)).toBeVisible()
  await page.getByRole('button', { name: 'Сравнение регионов', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Динамика по регионам' })).toBeVisible()
  await expect(page.getByText('Сравнение на общую дату 19 окт. 2026')).toBeVisible()
  await page.screenshot({ path: 'test-results/comparison-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Калькулятор', exact: true }).click()
  await page.getByRole('button', { name: 'Заправка техники', exact: true }).click()
  await expect(page.getByTestId('budget-total')).toContainText('56 022,00')
  await page.getByRole('button', { name: 'Моя цена', exact: true }).click()
  await page.getByRole('textbox', { name: 'Ваша цена, ₽/л', exact: true }).fill('80')
  await expect(page.getByTestId('budget-total')).toContainText('48 000,00')
  await page.getByRole('button', { name: 'Готовый объём', exact: true }).click()
  await page.getByRole('textbox', { name: 'Объём топлива, литры' }).fill('0')
  await expect(page.getByText('Значение должно быть больше нуля')).toBeVisible()
  await expect(page.getByTestId('budget-total')).toContainText('—')
  await page.getByRole('textbox', { name: 'Объём топлива, литры' }).fill('12,25')
  await expect(page.getByTestId('budget-total')).toContainText('980,00')
  await page.getByRole('button', { name: 'Средняя по региону', exact: true }).click()
  await expect(page.getByTestId('budget-total')).toContainText('1 143,78')
  await page.screenshot({ path: 'test-results/calculator-desktop.png', fullPage: true })
})

test('мобильный обзор и поиск региона не расширяют страницу', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Как менялась цена' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true })
  await page.getByRole('button', { name: /^Регион Приморский/ }).click()
  await page.getByRole('textbox', { name: 'Поиск региона' }).fill('Архангель')
  await page.getByRole('button', { name: 'Архангельская область', exact: true }).click()
  await expect(
    page.getByText(/Территория наблюдения: Архангельская область без Ненецкого/),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('резерв загружается при недоступном API без смешивания наборов', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  const began = Date.now()
  await page.goto('/')
  await expect(page.getByText(/Резервные данные на/)).toBeVisible()
  expect(Date.now() - began).toBeLessThan(8000)
  await expect(page).toHaveURL(new RegExp(`dataset_version=${version}`))
  await expect(page.getByTestId('budget-total')).toContainText('93 370,00')
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true })
})

test('недоступная закреплённая версия не заменяется резервом автоматически', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.goto('/?dataset_version=another-version')
  await expect(page.getByRole('alert', { name: 'Ошибка загрузки данных' })).toContainText(
    'В резерве другая версия',
  )
  await expect(page.getByRole('heading', { name: 'Как менялась цена' })).toHaveCount(0)
  await page.getByRole('button', { name: /Открыть резерв на/ }).click()
  await expect(page).toHaveURL(new RegExp(`dataset_version=${version}`))
  await expect(page.getByText(/Резервные данные на/)).toBeVisible()
})

test('404 и нарушение контракта не маскируются резервом', async ({ page }) => {
  await page.route('**/api/v1/meta**', (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'DATASET_NOT_FOUND' } } }),
  )
  await page.goto('/?dataset_version=missing')
  await expect(page.getByRole('alert', { name: 'Ошибка загрузки данных' })).toContainText(
    'Выбранная версия данных недоступна',
  )
  await expect(page.getByText(/Резервные данные на/)).toHaveCount(0)
  await page.unrouteAll()
  await page.route('**/api/v1/meta**', (route) =>
    route.fulfill({ json: { ...snapshot.meta, schema_version: '2' } }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert', { name: 'Ошибка загрузки данных' })).toContainText(
    'не соответствует контракту',
  )
  await expect(page.getByText(/Резервные данные на/)).toHaveCount(0)
})

test('запросы закрепляют версию; ошибка ответа не показывает старые цены', async ({ page }) => {
  await page.route('**/api/v1/meta**', (route) => route.fulfill({ json: snapshot.meta }))
  await page.route('**/api/v1/prices**', (route) => route.fulfill({ json: { invalid: true } }))
  await page.route('**/api/v1/comparison**', (route) =>
    route.fulfill({ status: 422, json: { error: { code: 'INVALID_REQUEST' } } }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert', { name: 'Ошибка загрузки данных' })).toContainText(
    'не соответствует контракту',
  )
  await expect(page.getByTestId('budget-total')).toHaveCount(0)
})

test('источники открываются и имеют ссылки на публикации', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.goto('/?view=sources')
  await expect(page.getByRole('heading', { name: 'Как читать эти данные' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Публикация Росстата' })).toHaveCount(13)
  await expect(page.getByRole('link', { name: 'Каталог Росстата' })).toHaveAttribute(
    'href',
    'https://rosstat.gov.ru/compendium/document/50798',
  )
})

test('отказ API после открытия сохраняет введённый объём и свою цену', async ({ page }) => {
  const data = snapshotSchema.parse(snapshot)
  let unavailable = false
  await page.route('**/api/v1/**', (route) => {
    if (unavailable) return route.abort()
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/meta')) return route.fulfill({ json: data.meta })
    const params = url.searchParams
    const selection = {
      region: params.get('region') ?? params.get('base_region')!,
      fuel: params.get('fuel') as Fuel,
      from: params.get('from')!,
      to: params.get('to')!,
      compare: params.getAll('regions').filter((region) => region !== params.get('base_region')),
    }
    return route.fulfill({
      json: url.pathname.endsWith('/prices')
        ? snapshotPrice(data, selection.region, selection.fuel, selection.from, selection.to)
        : snapshotComparison(data, selection),
    })
  })
  await page.goto('/?view=calculator')
  await page.getByRole('textbox', { name: 'Объём топлива, литры' }).fill('600')
  await page.getByRole('button', { name: 'Моя цена', exact: true }).click()
  await page.getByRole('textbox', { name: 'Ваша цена, ₽/л', exact: true }).fill('80')
  await expect(page.getByTestId('budget-total')).toContainText('48 000,00')
  unavailable = true
  await page.getByRole('button', { name: 'АИ-92', exact: true }).click()
  await expect(page.getByText(/Резервные данные на/)).toBeVisible()
  await expect(page.getByTestId('budget-total')).toContainText('48 000,00')
  await expect(page.getByRole('textbox', { name: 'Ваша цена, ₽/л', exact: true })).toHaveValue('80')
})
