const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('http://localhost:5176/');
  await page.waitForTimeout(1000); // Wait for board and pieces
  await page.screenshot({ path: '/Users/avaneeshchavan/.gemini/antigravity-ide/brain/c85e69ab-1d70-4934-8fb3-5038957218a2/scratch/start.png' });
  
  // Simulate a mid-drag move (e2 to e4)
  const sourceSquare = page.locator('square').first(); // e2 is roughly at x: 4.5*600/8, y: 6.5*600/8
  // We'll just grab the bounding box of the piece and drag it.
  const piece = page.locator('piece.pawn.white').nth(4); // e2 pawn
  const box = await piece.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - box.height); // move up 2 squares
  await page.screenshot({ path: '/Users/avaneeshchavan/.gemini/antigravity-ide/brain/c85e69ab-1d70-4934-8fb3-5038957218a2/scratch/mid_drag.png' });
  await page.mouse.up();
  
  // Clear the board
  const textarea = await page.locator('textarea');
  await textarea.fill('8/8/8/8/8/8/8/8 w - - 0 1');
  await textarea.blur();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/avaneeshchavan/.gemini/antigravity-ide/brain/c85e69ab-1d70-4934-8fb3-5038957218a2/scratch/empty.png' });
  
  await browser.close();
})();
