// Renders build/icon.svg to build/icon.png, which electron-builder turns into
// the Windows icon. Run after editing the SVG: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 512
const dir = join(__dirname, '..', 'build')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>')
  const svg = readFileSync(join(dir, 'icon.svg'), 'utf8')
  const png = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ${SIZE}
    canvas.getContext('2d').drawImage(img, 0, 0, ${SIZE}, ${SIZE})
    return canvas.toDataURL('image/png').split(',')[1]
  })()`)
  writeFileSync(join(dir, 'icon.png'), Buffer.from(png, 'base64'))
  console.log(`Wrote build/icon.png (${SIZE} px)`)
  app.quit()
})
