import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');
const OUT_DIR = path.join(__dirname, '..', 'android', 'screenshots');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Simple MIME types map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

// Start local static server for dist
function startServer(port = 4567) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(DIST_DIR, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        const fallback = path.join(DIST_DIR, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(fallback).pipe(res);
      }
    });

    server.listen(port, () => resolve(server));
  });
}

async function run() {
  console.log('Starting static server on port 4567...');
  const server = await startServer(4567);

  console.log('Launching Chromium with 9:16 mobile viewport (1080x1920 scaled)...');
  // 450 x 800 with deviceScaleFactor: 2.4 => EXACTLY 1080 x 1920
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 450, height: 800 },
    deviceScaleFactor: 2.4,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  await page.goto('http://localhost:4567/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // --------------------------------------------------------------------------
  // SCREEN 1: Home / Role Selection
  // --------------------------------------------------------------------------
  console.log('Capturing Screen 1: Home...');
  await page.evaluate(() => {
    if (window.app) {
      window.app.switchView('view-role-selection', false);
      const splash = document.getElementById('splash-screen');
      if (splash) splash.style.display = 'none';
      const loader = document.getElementById('app-loading');
      if (loader) loader.style.display = 'none';
    }
  });
  await page.waitForTimeout(600);
  const p1 = path.join(OUT_DIR, '01_home_screen.png');
  await page.screenshot({ path: p1 });
  console.log(`Saved: ${p1}`);

  // --------------------------------------------------------------------------
  // SCREEN 2: Student Exams Portal
  // --------------------------------------------------------------------------
  console.log('Capturing Screen 2: Exams Portal...');
  await page.evaluate(() => {
    if (window.app) {
      window.app.currentStudent = {
        id: '1001',
        studentName: 'زينب أحمد الموسوي',
        studentPhone: '07723260009',
        memberNumber: '1042',
        stage: 'المرحلة الأولى',
        qualification: 'شعبة أ'
      };
      window.app.switchView('view-student-entry', false);
      window.app.showStudentCard('student-exams-list-card', false);

      const nameEl = document.getElementById('student-list-name');
      if (nameEl) nameEl.textContent = 'زينب أحمد الموسوي';

      const container = document.getElementById('student-exams-container');
      if (container) {
        container.innerHTML = `
          <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:1.05rem; color:var(--text-main, #0f172a);">📖 فقه العبادات (منهاج الصالحين)</span>
              <span style="background:#ecfdf5; color:#065f46; font-size:0.75rem; font-weight:700; padding:3px 10px; border-radius:999px;">تم التسليم بنجاح</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted, #64748b);">
              <span>المرحلة الأولى • شعبة أ</span>
              <span style="color:#0284c7; font-weight:700; font-size:0.95rem;">الدرجة: 98 / 100 ⭐</span>
            </div>
          </div>

          <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:1.05rem; color:var(--text-main, #0f172a);">⚖️ أصول الفقه (المرحلة الأولى)</span>
              <span style="background:#eff6ff; color:#1d4ed8; font-size:0.75rem; font-weight:700; padding:3px 10px; border-radius:999px;">متاح للتقديم الآن</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted, #64748b); margin-bottom:12px;">
              <span>الامتحان الشهري الثاني • 20 سؤالاً</span>
              <span>المدة: 30 دقيقة</span>
            </div>
            <button style="width:100%; padding:10px; background:#0284c7; color:#fff; border:none; border-radius:8px; font-weight:700; font-size:0.95rem; cursor:pointer;">
              بدء الامتحان الآن ✍️
            </button>
          </div>

          <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:1.05rem; color:var(--text-main, #0f172a);">🕌 العقائد الإسلامية ومباحث التوحيد</span>
              <span style="background:#ecfdf5; color:#065f46; font-size:0.75rem; font-weight:700; padding:3px 10px; border-radius:999px;">تم التسليم بنجاح</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted, #64748b);">
              <span>المرحلة الأولى • منتصف الفصل</span>
              <span style="color:#0284c7; font-weight:700; font-size:0.95rem;">الدرجة: 95 / 100 ⭐</span>
            </div>
          </div>
        `;
      }
    }
  });
  await page.waitForTimeout(600);
  const p2 = path.join(OUT_DIR, '02_exams_portal.png');
  await page.screenshot({ path: p2 });
  console.log(`Saved: ${p2}`);

  // --------------------------------------------------------------------------
  // SCREEN 3: Interactive Exam Session
  // --------------------------------------------------------------------------
  console.log('Capturing Screen 3: Interactive Exam Session...');
  await page.evaluate(() => {
    if (window.app) {
      window.app.switchView('view-exam-taker', false);
      const container = document.getElementById('taker-container');
      if (container) {
        container.innerHTML = `
          <div style="background:var(--card-bg, #ffffff); border:1px solid var(--border-color, #e2e8f0); border-radius:16px; padding:20px; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
            <!-- Header bar with timer and progress -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border-color, #e2e8f0);">
              <div>
                <span style="font-size:0.85rem; color:var(--text-muted, #64748b);">امتحان أصول الفقه</span>
                <div style="font-weight:700; color:var(--text-main, #0f172a); font-size:1.05rem;">السؤال 4 من 15</div>
              </div>
              <div style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:6px 14px; border-radius:999px; font-weight:700; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                <span>⏱️</span>
                <span>24:35 دقيقة</span>
              </div>
            </div>

            <!-- Progress bar -->
            <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; margin-bottom:20px; overflow:hidden;">
              <div style="width:26%; height:100%; background:#0284c7; border-radius:3px;"></div>
            </div>

            <!-- Question body -->
            <div style="margin-bottom:20px;">
              <h3 style="font-size:1.15rem; color:var(--text-main, #0f172a); line-height:1.6; margin:0 0 10px 0;">
                ما هو التعريف الدقيق للحكم الشرعي في الاصطلاح الأصولي؟
              </h3>
              <p style="font-size:0.85rem; color:var(--text-muted, #64748b); margin:0;">اختر إجابة واحدة صحيحة من الخيارات الآتية:</p>
            </div>

            <!-- Multiple choice options -->
            <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
              <div style="border:2px solid #0284c7; background:#f0f9ff; border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                <div style="width:22px; height:22px; border-radius:50%; background:#0284c7; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold;">✓</div>
                <div style="font-size:0.95rem; font-weight:600; color:#0369a1;">هو الخطاب الإلهي المتعلق بأفعال المكلفين اقتضاءً أو تخييراً أو وضعاً.</div>
              </div>

              <div style="border:1px solid var(--border-color, #e2e8f0); background:var(--card-bg, #fff); border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                <div style="width:22px; height:22px; border-radius:50%; border:2px solid #cbd5e1;"></div>
                <div style="font-size:0.95rem; color:var(--text-main, #334155);">هو الدليل العقلي المجرد المستنبط من القواعد اللغوية فقط.</div>
              </div>

              <div style="border:1px solid var(--border-color, #e2e8f0); background:var(--card-bg, #fff); border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer;">
                <div style="width:22px; height:22px; border-radius:50%; border:2px solid #cbd5e1;"></div>
                <div style="font-size:0.95rem; color:var(--text-main, #334155);">هو اجتهاد الفقيه الشخصي في المسائل المستحدثة دون نص.</div>
              </div>
            </div>

            <!-- Action buttons -->
            <div style="display:flex; justify-content:space-between; gap:12px;">
              <button style="padding:12px 20px; background:#f1f5f9; color:#475569; border:none; border-radius:10px; font-weight:600; font-size:0.95rem; cursor:pointer;">
                السابق
              </button>
              <button style="flex:1; padding:12px 20px; background:#0284c7; color:#ffffff; border:none; border-radius:10px; font-weight:700; font-size:0.95rem; cursor:pointer;">
                السؤال التالي ⟵
              </button>
            </div>
          </div>
        `;
      }
    }
  });
  await page.waitForTimeout(600);
  const p3 = path.join(OUT_DIR, '03_exam_session.png');
  await page.screenshot({ path: p3 });
  console.log(`Saved: ${p3}`);

  // --------------------------------------------------------------------------
  // SCREEN 4: Attendance & Commitment Log
  // --------------------------------------------------------------------------
  console.log('Capturing Screen 4: Attendance & Commitment Log...');
  await page.evaluate(() => {
    if (window.app) {
      window.app.switchView('view-student-entry', false);
      window.app.showStudentCard('student-exams-list-card', false);

      const container = document.getElementById('student-attendance-container');
      if (container) {
        container.style.display = 'block';
        container.innerHTML = `
          <div style="background:var(--card-bg, #ffffff); border:1px solid var(--border-color, #e2e8f0); border-radius:16px; padding:20px; box-shadow:0 4px 6px rgba(0,0,0,0.05); margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <span style="font-size:0.85rem; color:var(--text-muted, #64748b);">نظام تسجيل الحضور اليومي</span>
                <h3 style="margin:4px 0 0 0; color:var(--text-main, #0f172a); font-size:1.15rem;">سجل الحضور والالتزام الأكاديمي</h3>
              </div>
              <span style="background:#ecfdf5; color:#065f46; font-size:0.8rem; font-weight:700; padding:4px 12px; border-radius:999px;">
                🟢 البوابة مفتوحة
              </span>
            </div>

            <!-- Stats grid -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:18px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 8px; text-align:center;">
                <div style="font-size:1.2rem; font-weight:800; color:#0284c7;">45</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">أيام الدوام</div>
              </div>
              <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 8px; text-align:center;">
                <div style="font-size:1.2rem; font-weight:800; color:#16a34a;">44</div>
                <div style="font-size:0.75rem; color:#15803d; margin-top:2px;">أيام الحضور</div>
              </div>
              <div style="background:#fefce8; border:1px solid #fef08a; border-radius:10px; padding:12px 8px; text-align:center;">
                <div style="font-size:1.2rem; font-weight:800; color:#ca8a04;">98%</div>
                <div style="font-size:0.75rem; color:#854d0e; margin-top:2px;">نسبة الالتزام</div>
              </div>
            </div>

            <!-- One click attendance button -->
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:14px; text-align:center; margin-bottom:16px;">
              <div style="color:#065f46; font-weight:700; font-size:0.95rem; margin-bottom:6px;">
                ✓ تم تسجيل حضورك اليوم بنجاح
              </div>
              <div style="color:#047857; font-size:0.8rem;">
                تاريخ التسجيل: اليوم • الساعة 08:30 صباحاً
              </div>
            </div>

            <!-- Attendance log summary -->
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-main, #334155); margin-bottom:10px;">
              آخر الجلسات المسجلة:
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f8fafc; border-radius:8px; font-size:0.85rem;">
                <span style="color:#334155;">جلسة اليوم (فقه وعقائد)</span>
                <span style="color:#16a34a; font-weight:700;">حاضر 🟢</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f8fafc; border-radius:8px; font-size:0.85rem;">
                <span style="color:#334155;">أمس (أصول ونحو)</span>
                <span style="color:#16a34a; font-weight:700;">حاضر 🟢</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f8fafc; border-radius:8px; font-size:0.85rem;">
                <span style="color:#334155;">الأحد (تلاوة وقرآن)</span>
                <span style="color:#16a34a; font-weight:700;">حاضر 🟢</span>
              </div>
            </div>
          </div>
        `;
      }
    }
  });
  await page.waitForTimeout(600);
  const p4 = path.join(OUT_DIR, '04_attendance.png');
  await page.screenshot({ path: p4 });
  console.log(`Saved: ${p4}`);

  await browser.close();
  server.close();
  console.log('All 4 screenshots generated successfully in 1080x1920 ratio 9:16.');
}

run().catch((err) => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
