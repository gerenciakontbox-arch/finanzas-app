import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
const root = path.resolve('test/dist')
const server = createServer((req, res) => { let p = path.join(root, req.url.split('?')[0]); if (!existsSync(p) || p.endsWith('/')) p = path.join(root, 'index.html'); const ext = path.extname(p); res.setHeader('Content-Type', ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html'); res.end(readFileSync(p)) }).listen(4177)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:4177/'); await page.waitForTimeout(500)
await page.screenshot({ path: 'test/shot-login.png' })
await page.fill('input[type=email]', 'andres@test.co'); await page.click('button:has-text("Enviarme")'); await page.waitForTimeout(300)
await page.screenshot({ path: 'test/shot-login-codigo.png' })
await browser.close(); server.close()
