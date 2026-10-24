import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.abort())
})

test('тема следует системе, запоминает ручной выбор и не вызывает ошибок гидратации', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(message.text())
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const control = page.getByRole('combobox', { name: 'Тема оформления' })
  await expect(control).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await control.selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('fuel-theme'))).toBe('dark')
  await page.reload()
  await expect(control).toHaveValue('dark')
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByRole('combobox', { name: 'Тема оформления' })).toHaveValue('dark')
  await control.selectOption('light')
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(other.getByRole('combobox', { name: 'Тема оформления' })).toHaveValue('light')
  await other.close()
  await control.selectOption('system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test('сохранённая тёмная тема применяется до загрузки клиентских модулей', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('fuel-theme', 'dark'))
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, (route) => route.abort())
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark')
})

test('переключатель работает при запрете записи в localStorage', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage denied', 'SecurityError')
    }
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Тема оформления' }).selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('combobox', { name: 'Тема оформления' })).toHaveValue('dark')
})

for (const theme of ['light', 'dark']) {
  test(`обводка охватывает всё поле объёма и поиска: ${theme}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Тема оформления' }).selectOption(theme)
    const volume = page.getByRole('textbox', { name: 'Объём топлива, литры' })
    await volume.focus()
    const outline = await volume.evaluate((input) => {
      const box = input.closest('.input-unit')!
      return {
        wrapper: getComputedStyle(box).outlineWidth,
        input: getComputedStyle(input).outlineWidth,
        containsUnit: box.contains(box.querySelector('span')),
      }
    })
    expect(outline).toEqual({ wrapper: '3px', input: '0px', containsUnit: true })
    await volume.fill('0')
    await expect(volume).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Значение должно быть больше нуля')).toBeVisible()
    await page.getByRole('button', { name: /^Регион Приморский/ }).click()
    const search = page.getByRole('textbox', { name: 'Поиск региона', exact: true })
    await expect(search).toBeFocused()
    expect(
      await search.evaluate(
        (input) => getComputedStyle(input.closest('.region-search')!).outlineWidth,
      ),
    ).toBe('3px')
    expect(await search.evaluate((input) => getComputedStyle(input).outlineWidth)).toBe('0px')
    await page.screenshot({ path: `test-results/field-focus-${theme}.png`, fullPage: true })
  })
}

for (const width of [390, 1440]) {
  test(`четыре дополнительных региона: поиск, лимит, отмена и восстановление ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/?view=comparison')
    await page
      .getByRole('combobox', { name: 'Тема оформления' })
      .selectOption(width === 390 ? 'dark' : 'light')
    const trigger = page.getByRole('button', { name: 'Выбрать регионы', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Выбор регионов для сравнения' })
    const search = dialog.getByRole('textbox', { name: 'Поиск регионов для сравнения' })
    await expect(search).toBeFocused()
    await expect(
      dialog.getByRole('checkbox', { name: 'Приморский край', exact: true }),
    ).toHaveCount(0)
    for (const name of ['Ростовская область', 'Сахалинская область']) {
      await search.fill(name)
      await dialog.getByRole('checkbox', { name, exact: true }).check()
    }
    await search.fill('Москва')
    await expect(dialog.getByRole('checkbox', { name: 'Москва', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('status')).toHaveText('Выбрано 4 из 4 дополнительных регионов')
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations.map((v) => v.id),
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Применить', exact: true }).click()
    await expect(trigger).toBeFocused()
    await expect(page.locator('.chart-legend i')).toHaveCount(5)
    const rows =
      width < 760
        ? page.locator('.comparison-list article')
        : page.locator('.comparison-table tbody tr')
    await expect(rows).toHaveCount(5)
    expect(new URL(page.url()).searchParams.getAll('compare')).toHaveLength(4)
    const selectedUrl = page.url()
    await trigger.click()
    await search.fill('Амурская')
    const amur = dialog.getByRole('checkbox', { name: 'Амурская область', exact: true })
    await amur.focus()
    await page.keyboard.press('Space')
    await expect(amur).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
    expect(page.url()).toBe(selectedUrl)
    await page.reload()
    await expect(rows).toHaveCount(5)
    await trigger.click()
    await expect(
      dialog.getByRole('checkbox', { name: 'Амурская область', exact: true }),
    ).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.locator('#main h1').click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/five-regions-${width}.png`, fullPage: true })
  })
}
