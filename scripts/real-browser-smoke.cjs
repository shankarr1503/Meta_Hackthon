/* Real measured-data production check. Uses the existing optional Playwright install. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', {
  paths: [path.resolve('.tmp/browser'), path.resolve('frontend')],
}));
const base = process.env.FAILURELAB_BROWSER_URL || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve('.tmp/browser/real-evidence');
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    for (const [name, width, height, colorScheme] of [
      ['desktop-light', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'],
      ['phone-light', 390, 844, 'light'], ['phone-dark', 390, 844, 'dark'],
      ['small-phone', 320, 720, 'light'],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/?view=real`);
      await page.getByRole('heading', { name: 'Real machine recordings', exact: true }).waitFor();
      await page.getByText('Measured laboratory data', { exact: true }).waitFor();
      if (await page.getByText('Simulated', { exact: true }).count()) throw new Error('Wrong source badge');
      await page.getByRole('img', { name: /physical motor, belt and rotor test bench/ }).evaluate(
        img => img.decode(),
      );
      await page.getByRole('img', { name: 'Real accelerometer waveform', exact: true }).waitFor();
      await page.getByRole('img', { name: 'Real accelerometer frequency spectrum', exact: true }).waitFor();
      if (await page.getByText(/Dataset label:/).count()) throw new Error('Label revealed prematurely');
      for (let channel = 0; channel < 4; channel++) {
        await page.getByLabel('Measured sensor', { exact: true }).selectOption(String(channel));
      }
      // Retain and explicitly expose a failed real assessment, not just a success example.
      const response = await page.request.get(`${base}/api/real-recordings`);
      const data = await response.json();
      if (data.source !== 'measured_laboratory') throw new Error('Invalid provenance');
      const records = data.records.filter(r => r.split === 'held_out');
      const failed = records.findIndex(r => r.meta && r.meta.label !== r.label);
      if (failed >= 0) {
        await page.getByLabel('Held-out recording', { exact: true }).selectOption(String(failed));
      }
      await page.getByRole('button', { name: /Reveal dataset label/ }).click();
      await page.getByText(/Dataset label:/).waitFor();
      if (failed >= 0) await page.getByText('Meta assessment did not match the dataset label.', { exact: true }).waitFor();
      await page.waitForTimeout(300);
      const layout = await page.evaluate(() => ({
        viewport: innerWidth, content: document.documentElement.scrollWidth,
        charts: document.querySelectorAll('.recharts-wrapper').length,
        alerts: Array.from(document.querySelectorAll('[role="alert"]'), x => x.textContent),
      }));
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      results.push({ name, ...layout, errors });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
  const failures = results.filter(r => r.content > r.viewport || r.errors.length || r.alerts.length || r.charts !== 2);
  console.log(JSON.stringify({ views: results.length, failures, realSourceAndPhoto: 'passed',
    sensorSelection: 'passed', failedAssessmentRetained: 'passed' }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
