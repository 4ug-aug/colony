import { expect, test } from 'bun:test'

test('the stylesheet does not reference undeclared design tokens', async () => {
  const css = await Bun.file(new URL('./styles.css', import.meta.url)).text()
  const declared = new Set(
    [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
  )
  const undeclared = [
    ...new Set(
      [...css.matchAll(/var\((--[\w-]+)/g)]
        .map((match) => match[1])
        .filter((token) => !declared.has(token)),
    ),
  ]

  expect(undeclared).toEqual([])
})
