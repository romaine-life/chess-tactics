const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const targetUrl = 'http://chess-tactics-1.tank.dev.romaine.life/';
const wsEndpoint = 'ws://slot-playwright.chess-tactics-1.svc.cluster.local:3000';
const screenshotDir = '/workspace/screenshots';

// Ensure screenshot directory exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

(async () => {
  console.log('Connecting to browser at', wsEndpoint);
  const browser = await chromium.connect(wsEndpoint);

  try {
    // 1. Host Context
    console.log('Setting up Host context...');
    const hostContext = await browser.newContext();
    await hostContext.addCookies([
      {
        name: 'mock-session',
        value: 'host',
        domain: 'chess-tactics-1.tank.dev.romaine.life',
        path: '/',
      }
    ]);
    const hostPage = await hostContext.newPage();

    // 2. Guest Context
    console.log('Setting up Guest context...');
    const guestContext = await browser.newContext();
    await guestContext.addCookies([
      {
        name: 'mock-session',
        value: 'guest',
        domain: 'chess-tactics-1.tank.dev.romaine.life',
        path: '/',
      }
    ]);
    const guestPage = await guestContext.newPage();

    // 3. Navigation
    console.log('Navigating players to', targetUrl);
    await Promise.all([
      hostPage.goto(targetUrl),
      guestPage.goto(targetUrl)
    ]);

    // Verify login headers
    const hostName = await hostPage.locator('#accountName').innerText();
    const guestName = await guestPage.locator('#accountName').innerText();
    console.log(`Host user display name: "${hostName}"`);
    console.log(`Guest user display name: "${guestName}"`);

    // 4. Host hosts a lobby
    console.log('Host: hosting a lobby...');
    await hostPage.fill('#hostInput', 'E2E Match Lobby');
    await hostPage.click('button[data-action="host"]');

    // Wait for Host to be in the lobby phase
    await hostPage.waitForSelector('text=Leave Lobby', { timeout: 10000 });
    console.log('Host: lobby hosted successfully.');

    // Take screenshot of host lobby
    await hostPage.screenshot({ path: path.join(screenshotDir, 'host_lobby_created.png') });

    // 5. Guest searches for the lobby
    console.log('Guest: opening search panel...');
    await guestPage.click('button[data-action="search"]');

    // Wait for the lobby to appear in guest's search list
    console.log('Guest: waiting for "E2E Match Lobby" to appear...');
    await guestPage.waitForSelector('text=E2E Match Lobby', { timeout: 10000 });

    // Take screenshot of guest search list
    await guestPage.screenshot({ path: path.join(screenshotDir, 'guest_search_results.png') });

    // Guest joins the lobby
    console.log('Guest: joining the lobby...');
    await guestPage.click('button[data-action="join"]');

    // Wait for Guest to enter the lobby phase
    await guestPage.waitForSelector('text=Leave Lobby', { timeout: 10000 });
    console.log('Guest: joined lobby successfully.');

    // Wait for Host page to update and show the start button
    console.log('Host: waiting for game start button to become active...');
    await hostPage.waitForSelector('button[data-action="start"]', { timeout: 10000 });

    // Take screenshot of both players in the lobby
    await hostPage.screenshot({ path: path.join(screenshotDir, 'host_lobby_joined.png') });
    await guestPage.screenshot({ path: path.join(screenshotDir, 'guest_lobby_joined.png') });

    // 6. Host starts the match
    console.log('Host: starting match...');
    await hostPage.click('button[data-action="start"]');

    // Wait for the menuLayer to be hidden on both pages (indicates game phase is active)
    console.log('Waiting for both players to enter the match...');
    await hostPage.waitForSelector('#menuLayer', { state: 'hidden', timeout: 10000 });
    await guestPage.waitForSelector('#menuLayer', { state: 'hidden', timeout: 10000 });
    console.log('Match started successfully for both players!');

    // Take screenshot of game board
    await hostPage.screenshot({ path: path.join(screenshotDir, 'host_game_board.png') });
    await guestPage.screenshot({ path: path.join(screenshotDir, 'guest_game_board.png') });

  } catch (error) {
    console.error('Test failed:', error);
    process.exitCode = 1;
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
})();
