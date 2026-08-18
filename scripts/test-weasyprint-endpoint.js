// Quick test: invoke the doc-html POST handler in isolation to verify
// WeasyPrint renders a real PDF.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const testHtml = `<!DOCTYPE html><html><head><title>Test</title>
<style>
@page { size: A4; margin: 1cm; }
body { font-family: sans-serif; color: #0f172a; }
h1 { color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #cbd5e1; padding: 6px; }
</style></head><body>
<h1>Smart Computers - Test Invoice</h1>
<p>Invoice #SCSS/26-27/001</p>
<table>
<thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
<tbody>
<tr><td>1</td><td>8GB RAM</td><td>1</td><td>2500</td><td>2500</td></tr>
<tr><td>2</td><td>Service Charge</td><td>1</td><td>500</td><td>500</td></tr>
</tbody>
</table>
<p style="text-align:right;margin-top:20px;font-weight:bold;">Total: Rs. 3000</p>
</body></html>`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartcomp-test-'))
const htmlPath = path.join(tmpDir, 'test.html')
const pdfPath = path.join(tmpDir, 'test.pdf')
fs.writeFileSync(htmlPath, testHtml, 'utf-8')

console.log('Running weasyprint...')
try {
  const out = execFileSync('/home/z/.venv/bin/weasyprint', [htmlPath, pdfPath], {
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
  })
  const stats = fs.statSync(pdfPath)
  console.log(`✓ PDF generated successfully: ${stats.size} bytes`)
  // Verify it's a valid PDF (magic header)
  const head = fs.readFileSync(pdfPath, { encoding: null }).slice(0, 5).toString('utf-8')
  if (head.startsWith('%PDF-')) {
    console.log(`✓ Valid PDF (header: ${head})`)
  } else {
    console.error(`✗ NOT a valid PDF! Header: ${head}`)
    process.exit(1)
  }
} catch (e) {
  console.error('✗ weasyprint failed:', e.message)
  process.exit(1)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
