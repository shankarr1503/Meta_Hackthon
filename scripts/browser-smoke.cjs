/* Optional browser integration check. Setup and usage: docs/VERIFICATION.md. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', {
  paths: [path.resolve('.tmp/browser'), path.resolve('frontend')],
}));

const BASE_URL = process.env.FAILURELAB_BROWSER_URL || 'http://127.0.0.1:5173';
const OUTPUT = path.resolve('.tmp/browser/evidence');

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [name, width, height, colorScheme] of [
      ['desktop-light', 1440, 1000, 'light'],
      ['desktop-dark', 1440, 1000, 'dark'],
      ['phone-light', 390, 844, 'light'],
      ['phone-dark', 390, 844, 'dark'],
      ['small-phone', 320, 720, 'light'],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const capture = async screen => {
        await page.screenshot({ path: path.join(OUTPUT, `${name}-${screen}.png`), fullPage: true });
        const layout = await page.evaluate(() => ({
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
          canvases: document.querySelectorAll('canvas').length,
          alerts: Array.from(document.querySelectorAll('[role="alert"]'), e => e.textContent),
        }));
        results.push({ name, screen, ...layout, errors: [...errors] });
      };
      await page.goto(BASE_URL);
      await page.getByRole('button', { name: 'Investigate Compressor coupling', exact: true }).waitFor();
      await capture('cases');
      await page.getByRole('button', { name: 'Open replay case-b6-info_gain-0', exact: true }).click();
      await page.getByRole('group', { name: 'Player controls' }).waitFor();
      if (await page.getByRole('heading', { name: /^Diagnosis:/ }).count()) {
        throw new Error('Diagnosis revealed before the end');
      }
      // Choice and predictions precede the measurement; move to updated beliefs.
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Forward/ }).click();
      await page.waitForTimeout(1000);
      await capture('investigation');
      await page.getByRole('button', { name: /Skip to end/ }).click();
      await page.getByRole('heading', { name: /^Diagnosis:/ }).waitFor();
      await capture('diagnosis');
      await page.getByRole('button', { name: 'Manual lab', exact: true }).click();
      await page.getByRole('definition').first().waitFor();
      const response = page.waitForResponse(r => r.url().endsWith('/api/lab/simulate') && r.ok());
      await page.getByLabel(/Bearing friction/).fill('0.75');
      await response;
      await page.waitForTimeout(300);
      await capture('lab');
      await page.getByRole('button', { name: 'Benchmark', exact: true }).click();
      await page.getByRole('table', { name: /^Benchmark results/ }).waitFor();
      if (await page.getByLabel('Challenge condition').count()) {
        await page.getByLabel('Challenge condition').selectOption('injection');
        await page.getByText('Inspect every paired result', { exact: true }).click();
        await page.getByRole('table', { name: 'Per-machine challenge audit', exact: true }).waitFor();
        await page.getByRole('link', { name: /Download all results and model evidence/ }).waitFor();
      }
      await capture('benchmark');
      await page.close();
    }

    // A fresh investigation goes through the real dashboard, API and replay storage.
    // Explicitly select the baseline so this check never incurs model calls or costs.
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByLabel('Investigator').selectOption('info_gain');
    await page.getByLabel('Seed', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Investigate Pump drive A', exact: true }).click();
    await page.getByRole('group', { name: 'Player controls' }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /Skip to end/ }).click();
    await page.getByRole('heading', { name: /^Diagnosis:/ }).waitFor();
    await page.getByRole('button', { name: /Back to cases/ }).click();
    await page.getByRole('button', { name: 'Open replay case-k7-info_gain-3', exact: true }).waitFor();
    await page.close();

    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'WebGLRenderingContext', { value: undefined });
    });
    await fallback.goto(BASE_URL);
    await fallback.getByRole('button', { name: 'Open replay case-b6-info_gain-0', exact: true }).click();
    await fallback.getByText('3D view unavailable (no WebGL).').waitFor();
    await fallback.getByRole('button', { name: 'Manual lab', exact: true }).focus();
    await fallback.keyboard.press('Enter');
    await fallback.getByRole('heading', { name: 'Manual lab', exact: true }).waitFor();
    await fallback.close();

    const disconnected = await browser.newPage();
    await disconnected.route(url => url.pathname.startsWith('/api/'), route => route.abort());
    await disconnected.goto(BASE_URL);
    await disconnected.getByRole('alert').filter({ hasText: 'Backend unreachable' }).waitFor();
    await disconnected.close();

    fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(results, null, 2) + '\n');
    const failures = results.filter(r => r.errors.length || r.alerts.length || r.content > r.viewport);
    console.log(JSON.stringify({
      views: results.length, failures, freshInvestigation: 'passed',
      noWebGL: 'passed', keyboardNavigation: 'passed', backendUnavailable: 'passed',
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
