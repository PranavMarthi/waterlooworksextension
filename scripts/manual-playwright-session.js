const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const userDataDir = path.join(projectRoot, '.pw-user-data');
  const startUrl = 'https://waterlooworks.uwaterloo.ca/myAccount/dashboard.htm';
  const channel = process.env.PW_CHANNEL || 'chrome';

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${projectRoot}`,
      `--load-extension=${projectRoot}`
    ]
  });

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

  try {
    const appName = channel === 'chrome' ? 'Google Chrome' : 'Chromium';
    execSync(`osascript -e 'tell application "${appName}" to activate'`, { stdio: 'ignore' });
  } catch (_) {
    // no-op
  }

  console.log(`[WAW][PW] Browser launched with unpacked extension using channel: ${channel}.`);
  console.log('[WAW][PW] Sign in to WaterlooWorks in the opened browser window.');
  console.log('[WAW][PW] Return here and press Enter when done.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise((resolve) => {
    rl.question('', () => resolve());
  });

  await context.close();
  rl.close();
}

main().catch((error) => {
  console.error('[WAW][PW] Failed to launch manual session:', error);
  process.exit(1);
});
