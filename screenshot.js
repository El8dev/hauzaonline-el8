import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:8000/');
  
  // Wait for app to be ready
  await page.waitForTimeout(2000);
  
  // Inject the mock student data to trigger the certificate
  await page.evaluate(() => {
    window.app.currentRegistry = {
      '999': {
        id: '100',
        name: 'طالبة تجريبية - زينب محمد',
        phone: '999',
        stage: 'مرحلة اولى',
        qualification: 'أ',
        submissions: [
          {examTitle: 'تلاوة', score: 100},
          {examTitle: 'فقه', score: 95},
          {examTitle: 'عقائد', score: 90},
          {examTitle: 'منطق', score: 88},
          {examTitle: 'نحو', score: 92},
          {examTitle: 'سيرة', score: 99},
        ],
        successMeasure: 94
      }
    };
    window.app.openCertificateModal('999');
  });
  
  // Wait for the modal animation and network requests (like the background image)
  await page.waitForTimeout(1000);
  
  // Wait explicitly for the background image to be fully loaded
  await page.evaluate(async () => {
    const img = document.getElementById('cert-custom-bg-img');
    if (img && img.src && !img.complete) {
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }
    // Also wait for web fonts to load
    await document.fonts.ready;
  });

  await page.waitForTimeout(500);
  
  // Take screenshot of the printable area only
  const elementHandle = await page.$('#cert-print-area');
  await elementHandle.screenshot({ path: 'C:\\Users\\hayder\\.gemini\\antigravity-ide\\brain\\06512e1d-b2fd-405c-a5a4-0636742e7b78\\cert_screenshot.png' });
  
  await browser.close();
  console.log("Screenshot saved.");
})();
