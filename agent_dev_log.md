# Development Log - MZMZ App

## Summary of Recent Changes

### Date: 2026-09-24 (Feature: Google Play Data Safety Compliance - Dedicated Account & Data Deletion Page)
- **Task**:
  1. Satisfy Google Play Console mandatory Data Safety requirements for account and data deletion policy URL.
  2. Implement dedicated, fully responsive account deletion instruction page (`public/delete-account.html`) specifying steps, timeframe (10 business days), authorized contact (Sheikh Ahmed via WhatsApp +964 772 326 0009), deleted data entities vs retained data.
  3. Cross-link deletion page within `public/privacy.html` and refresh production web build.
- **Key Actions & Outputs**:
  1. **Page Creation (`public/delete-account.html`)**:
     - Modern slate-themed, mobile-first responsive card layout.
     - Direct one-click WhatsApp action link with prefilled deletion request message (`https://wa.me/9647723260009`).
     - Explicit specification of purged data (identities, attendance, exams, grades, certifications) and zero residual retention.
  2. **Cross-Linking (`public/privacy.html`)**:
     - Updated Section 4 to link directly to `delete-account.html`.
  3. **Verification**:
     - Vitest: 3/3 tests passed.
     - Vite build: `dist/` updated with `delete-account.html` and assets.
- **Status**: Live web URL `https://hawzw.app/delete-account.html` ready for Google Play Console submission.

---

### Date: 2026-09-23 (Task: Mobile Binary Build & Full Synchronization: APK + AAB)
- **Task**:
  1. Synchronize outdated compiled Android binaries (`app-debug.apk` and `app-release.aab`) with the latest codebase and GitHub repository (commit `3c2fe04`).
  2. Compile fresh debug APK for sideloading/direct testing and signed production AAB bundle for Google Play Console.
- **Key Actions & Outputs**:
  1. **Pre-build Unit Verification**:
     - Executed `npm test` via Vitest (3/3 unit tests passed in 27ms).
  2. **Debug APK Build (`npm run build:apk`)**:
     - `vite build` completed cleanly, updating `dist/`.
     - `npx cap sync android` synchronized web bundle and native plugins into `android/app/src/main/assets/public/`.
     - Gradle `assembleDebug` completed in 23s. Output: `android/app/build/outputs/apk/debug/app-debug.apk` (6.10 MB, generated 2026-09-23 11:57:49).
  3. **Production Release AAB (`bundleRelease`)**:
     - Gradle `bundleRelease` signed production bundle completed in 42s. Output: `android/app/build/outputs/bundle/release/app-release.aab` (4.91 MB, generated 2026-09-23 11:58:37).
- **Status**: Codebase, Git repository, and Android binaries (APK & AAB) are now 100% in sync.

---

### Date: 2026-09-22 (Feature: High-Density Compact Student Registry Cards & 2-Tier Untruncated Filter Toolbar)
- **Task**:
  1. Fix truncated filter text and squeezed dropdown inputs on mobile viewports ("جم..." on stages and sections).
  2. Fix vertically exploded blue action button ("كشف الدرجات للنشر") caused by `height: 100%` within wrapping flex container.
  3. Redesign and shrink student registry cards by ~55% into modern, high-density compact cards with native information hierarchy and dark/light mode compliance.
- **Key Changes**:
  1. **Filter Toolbar Redesign (`index.html` & `style.css`)**:
     - Introduced `.registry-toolbar` with structured 2-tier responsive layout.
     - Row 1: 100% full-width search input with complete placeholder visibility (`🔍 ابحث بالاسم أو رقم الهاتف...`).
     - Row 2: 2-column equal grid (`grid-template-columns: 1fr 1fr`) for "المرحلة" and "الشعبة", completely eliminating text truncation.
     - Row 3: Compact action strip with responsive buttons (`📜 كشف الدرجات للنشر`, `🖨️ طباعة`, `📊 إكسل`) removing `height: 100%` flex explosion.
  2. **Compact Student Registry Cards (`src/main.js` & `style.css`)**:
     - Replaced bulky `.form-card` template with `.compact-student-card` (height reduced from ~280px to ~125px).
     - Row 1: 32px initial avatar, student name, Hawza number badge (`#1042`), stage & section pill badges, and dual themed stat chips (`📝 exams`, `⭐/⚠️ grade %`).
     - Row 2: Phone number with clickable `tel:` link and telegram handle pill.
     - Row 3: Equal-width compact action toolbar (`📖 الملف`, `📅 الحضور`, `🎓 الشهادة`).
     - Eliminated hardcoded `#f8f9fa` white stat rectangles in dark mode in favor of CSS variables (`var(--card-bg)`, `var(--bg-hover)`, `var(--border-color)`).
  3. **Theme-Aware Secondary Buttons (`style.css`)**:
     - Upgraded `.btn-secondary` across light and dark themes (`body.dark-theme .btn-secondary`), preventing harsh white blocks on dark cards.
- **Verification**:
  - `npm test`: 3/3 tests passed.
  - `npm run build`: Vite build completed cleanly in 590ms.
  - `npx cap sync android`: Native Android assets synchronized.
  - Visual verification: Captured and inspected Playwright screenshots in both dark and light modes, verifying clean rendering without truncation.

---

### Date: 2026-09-22 (Fix: Light Theme Notification Contrast, Dual-Role Mobile Bottom Nav & Student Session Retention)
- **Task**:
  1. Fix text disappearing in White/Light mode inside toast notifications and modal alerts.
  2. Fix mobile navigation incorrectly returning users to the student sign-in/verification card when already signed in.
  3. Customize the mobile bottom navigation bar so that when the administrator is on the Admin Dashboard (`view-dashboard`), it displays administrator tabs (`الامتحانات`, `إنشاء`, `الطلاب`, `الحضور`, `السجل`) instead of student navigation.
- **Key Changes**:
  1. **Color Tokens & High-Contrast Light Mode Notifications (`style.css`)**:
     - Defined standard design tokens `--text-color`, `--bg-card`, and `--bg-hover` under `:root` and `body.dark-theme`.
     - Completely overhauled `.app-toast` styling to guarantee high contrast: forced deep slate `#0f172a` container background with pure `#ffffff` text across both light and dark modes, preventing white text on white cards.
     - Updated `.notif-modal-card` and notification modal elements to use standard `--text-main` and `--card-bg` variables.
     - Removed `.app-toast` and `.toast-container` from `@media (max-width: 768px)` background overrides.
  2. **Dual-Role Mobile Bottom Navigation (`index.html` & `src/main.js`)**:
     - Partitioned `#mobile-bottom-nav` into two distinct semantic tab groups: `#mob-nav-student-group` (الرئيسية, امتحاناتي, الحضور, العضوية) and `#mob-nav-admin-group` (الامتحانات, إنشاء, الطلاب, الحضور, السجل).
     - Rewrote `updateMobileNavActiveState()` to dynamically show `#mob-nav-admin-group` and hide `#mob-nav-student-group` whenever `view-dashboard` is active, and vice versa for student and public views.
     - Added tab sync handlers in `switchAdminTab()` to keep the mobile bottom nav item active state in sync with the active desktop/admin tab.
     - Routed mobile admin tab buttons directly to desktop tab buttons (`#tab-exams-btn`, `#tab-create-btn`, `#tab-students-btn`, `#tab-attendance-btn`, `#tab-registry-btn`) without triggering student verification checks.
  3. **Student Session Retention Fix (`src/main.js`)**:
     - Added `ensureStudentLoggedIn()` helper: checks `this.currentStudent` and restores active session from `localStorage.getItem("MZMZ_STUDENT_SESSION")` using `this.studentRepository.loginStudent(...)`.
     - Replaced invalid `localStorage.getItem("mzmz_verified_student_id")` references with valid session checks.
     - Allowed signed-in students to navigate directly to their exams portal and attendance views without being booted back to the verification prompt.
- **Verification**:
  - `npm test`: 3/3 tests passed.
  - `npm run build`: Vite build completed cleanly in 808ms.
  - `npx cap sync android`: Android assets synchronized cleanly.

---

### Date: 2026-09-22 (Feature: Mobile UI/UX Modernization & Web Favicon Suite for Google Search)
- **Task**:
  1. Resolved missing website favicon issue causing Google Search to display generic globe icon on `hawzw.app`.
  2. Overhauled mobile viewport user experience into a native-feeling mobile app shell without breaking the desktop web dashboard.
  3. Eliminated nested scrollboxes (`max-height: 400px; overflow-y: auto`) in student onboarding flow, replacing them with a clean step indicator and natural scrolling.
  4. Added a thumb-zone native mobile bottom navigation bar (`#mobile-bottom-nav`) for students and mobile users.
  5. Converted desktop centered modals into slide-up native bottom sheets on mobile viewports.
  6. Fixed WebView GPU performance lag by eliminating heavy `backdrop-filter: blur(16px)` on repeated cards in favor of crisp elevation shadows.
  7. Added device safe-area padding (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`) for Android notches and navigation gesture bars.
- **Key Changes**:
  1. **Assets & Google Search Indexing (`public/`)**:
     - Generated multi-resolution favicons from 512x512 master icon using Pillow: `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` (explicitly crawled by Google Search), `apple-touch-icon.png` (180x180), `icon-192.png`, `icon-512.png`, and multi-layer `favicon.ico`.
     - Created `public/site.webmanifest` for PWA and search engine discovery.
     - Updated `index.html` `<head>` with full favicon suite, `viewport-fit=cover`, `theme-color`, OpenGraph `og:image`, and Twitter card tags.
  2. **Mobile App Navigation & Shell (`index.html`, `style.css`, `src/main.js`)**:
     - Added `#mobile-bottom-nav` with buttons: الرئيسية (Home), امتحاناتي (My Exams), الحضور (Attendance), and العضوية (Profile).
     - Implemented `initMobileNavigation()` and `updateMobileNavActiveState()` in `src/main.js` to coordinate tab switching with verified student state.
     - Fixed header theme button positioning (`position: static !important`) to keep controls within the top navigation bar instead of floating at bottom-right.
     - Refactored student onboarding card with an interactive dot indicator (`#onboard-indicators`) and smooth progress.
  3. **Responsive Styles & Touch Ergonomics (`style.css`)**:
     - Mobile modal bottom sheets (`border-radius: 24px 24px 0 0`, drag handle pill, slide-up animation).
     - Minimum 16px input font-size on mobile keyboards to prevent auto-zoom distortion.
     - `-webkit-tap-highlight-color: transparent` and active tactile press effects.
- **Verification**:
  - `npm test`: 3/3 tests passed.
  - `npm run build`: Vite build completed in 330ms with all public assets copied to `dist/`.
  - `npx cap sync android`: Web assets and Capacitor configuration synchronized cleanly with native Android project.
  - Visual Playwright verification: Captured and inspected mobile (390x844) and desktop (1280x800) previews confirming bottom nav display on mobile, hidden on desktop, and correct onboarding/login layout.

---

### Date: 2026-09-22 (Feature: Google Play Store Packaging & Supabase Mobile Offline Fix)
- **Task**:
  1. Converted web SPA (Vite + Vanilla JS + Supabase) into a production-grade native Android application compliant with Google Play Store policies.
  2. Fixed mobile startup error ("you shall set up supabase connection first" / "لم يتم الاتصال بقاعدة البيانات"):
     - Created local `.env` with live Supabase production credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
     - Added hard fallback constants in `src_old/data/datasources/supabase.js` ensuring the client never initializes with empty strings.
     - Bundled `@supabase/supabase-js` package directly into `src/main.js` instead of relying on external CDN (`jsdelivr`) script over cellular networks.
  3. Structured a local offline-first UI shell while maintaining live real-time synchronization with Supabase cloud backend.
  4. Integrated Android hardware back button listener into the custom SPA router and modal hierarchy to prevent unexpected app termination.
  5. Configured release keystore signing pipeline and generated production Android App Bundle (`.aab`) ready for Google Play Console upload.
- **Key Changes**:
  1. **Dependencies & Framework Integration (`package.json`)**:
     - Installed `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, and `@capacitor/cli`.
     - Added unified build scripts: `npm run build:android` and `npm run build:apk`.
  2. **Capacitor Configuration (`capacitor.config.json`)**:
     - Configured `appId`: `app.hawzw.academy` and `appName`: `حوزة أم البنين النسوية`.
     - Configured `androidScheme: "https"` for modern CORS and web security standards.
  3. **Android Native Project (`android/`)**:
     - Scaffolding targeting Android 16 (API 36) with `minSdkVersion = 24`.
     - Added `android.overridePathCheck=true` in `gradle.properties` to allow compilation under Unicode directory paths.
     - Added `gradlew.ps1` PowerShell wrapper with automatic directory isolation.
     - Generated release upload keystore `upload-keystore.jks` and configured `signingConfigs.release` in `android/app/build.gradle`.
  4. **Icon & Graphic Assets**:
     - Generated Google Play Store listing icon (512x512 PNG) at `android/play_store_icon_512.png`.
     - Generated all mipmap launcher and adaptive foreground icons (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).
  5. **Application Logic (`src/main.js`)**:
     - Added `initNativeAppListeners()` using `@capacitor/app` to intercept hardware back button: closes active modals first, pops SPA history second, and exits app only when on root view.
- **Verification**:
  - Ran `npm test` (3/3 unit tests passed).
  - Executed `npm run build:android` (Successfully built signed production `app-release.aab` of 4.2 MB in 25s).

---

### Date: 2026-09-21 (Feature: Migration of Attendance & Absence System to Supabase Cloud Engine)
- **Task**: 
  1. Solved the isolated client-side `localStorage` trap where student and admin devices were unable to communicate or synchronize attendance.
  2. Upgraded attendance settings and attendance logs from browser cache to real-time Supabase cloud tables (`attendance_settings` and `attendance_records`).
  3. Added date navigation and two distinct management view modes for administrators: Daily View (present vs absent on chosen date with manual toggle) and Cumulative View (total absences, attendance count, and commitment percentage).
  4. Added single-click student self-attendance with database-level uniqueness constraint (`UNIQUE(student_phone, date)`) preventing duplicate submissions.
- **Key Changes**:
  1. **Database Schema (`supabase_schema.sql`)**:
     - Added table `public.attendance_settings` with `active`, `mode`, `selected_days`, `time_mode`, `start_time`, and `end_time`.
     - Added table `public.attendance_records` with `student_id`, `student_phone`, `student_name`, `date`, `status`, and unique constraint.
     - Enabled RLS policies for public registration and authenticated admin management, and granted permissions to `anon, authenticated`.
  2. **Markup (`index.html`)**:
     - Upgraded `#tab-attendance-content` with an explicit "💾 حفظ الإعدادات في السحابة" button.
     - Added view mode toggle buttons: `#btn-attendance-view-daily` and `#btn-attendance-view-summary`.
     - Restored date navigation controls: `#admin-attendance-date`, `#btn-prev-day`, `#btn-next-day`, `#btn-today-day`.
     - Enhanced table header `#admin-attendance-thead` to accommodate daily status, time, and manual actions.
  3. **Application Logic (`src/main.js`)**:
     - Added `fetchAttendanceSettings()` and `saveAttendanceSettingsToSupabase()`.
     - Refactored `loadAdminAttendanceSettings()` to bind live state and display a real-time activation badge.
     - Refactored `loadAdminAttendanceTable()` to dynamically query Supabase records per date or cumulative across all sessions.
     - Implemented `markManualAttendance()` and `deleteAttendanceRecord()` for supervisor overrides.
     - Upgraded `loadStudentExamsPortal()` to query Supabase `attendance_records` for today's date and insert new records directly into the cloud.
     - Updated `showStudentAttendance()` to fetch real-time student attendance history from Supabase.
- **Verification**:
  - Ran `npm test` (3/3 unit tests passed).
  - Ran `npm run build` (Production bundle generated cleanly in 1.42s).

---

### Date: 2026-08-01 (Feature: Migrate Structure Settings to Supabase)
- **Task**: 
  1. Migrated the global structure settings (Subjects, Stages, Sections, and Stage-Subject assignments) from the browser's `localStorage` to a centralized Supabase table (`structure_settings`).
  2. Implemented the "Assign Subjects to Classes" (تعيين المواد لكل مرحلة) functionality.
  3. Filtered the subject dropdown during exam creation to only display subjects assigned to the selected stage.
  4. Modified the Structure Management tab to use explicit saving (`💾 حفظ في السحابة`) instead of auto-saving on every edit.
- **Key Changes**:
  1. **Database Schema (`supabase_schema.sql`)**: Added `structure_settings` table (already present from previous step).
  2. **Application Logic (`src/main.js`)**:
     - Introduced `_cachedStructureSettings` to hold global state and reduce database calls.
     - Replaced `localStorage.getItem/setItem` in `populateTargetDropdowns`, `loadAdminStructureSettings`, `addStructureItem`, and `deleteStructureItem` with Supabase fetch (`fetchStructureSettings`) and upsert (`saveStructureSettingsToSupabase`).
     - Added logic to render the checkbox list in `#admin-stage-subjects-container` to map subjects to stages and persist them into the `stage_subjects` JSON dictionary.
     - Updated `populateTargetDropdowns` to dynamically filter `#creator-subject` based on the subjects mapped to the chosen stage in `#creator-target-stage`.
- **Verification**: Code replaced successfully via AST/regex modification script.

---

### Date: 2026-07-30 (Feature: Structure Drag-and-Drop, Student Promotions & Second Session Logic)
- **Task**: 
  1. Implemented visual drag-and-drop hierarchy for class stages (إدارة الهيكلية).
  2. Implemented a manual "Promote" (ترقية) button in the student registry to move students to the next stage based on the customized hierarchy.
  3. Implemented a "Second Session" (دور ثاني) exam type.
  4. Updated student portal logic to only show second session exams to students whose total score (midterm + final) is less than 50.
  5. Added an exam duplication guard to prevent teachers from creating multiple 'half', 'final', or 'second_session' exams for the same subject, stage, and section.
- **Key Changes**:
  1. **Structure Drag-and-Drop (`src/main.js`)**:
     - Updated `loadAdminStructureSettings` to preserve the full ordered stage list in `localStorage`.
     - Added HTML5 `draggable="true"` and injected `attachDragAndDropToStages` with `dragstart`, `dragover`, and `drop` event listeners to re-sort the stage array dynamically.
  2. **Student Promotion (`src/main.js`)**:
     - Injected a `btn-promote-stud-${a.id}` button in the approved students list row.
     - Added click logic to verify the student is not in the final stage, determine the next stage from `allStages`, and update the record using `updateStudentStageAndSection`.
  3. **Second Session Logic (`index.html` & `src/main.js`)**:
     - Added `second_session` option to `creator-test-type` dropdown.
     - Updated `loadStudentExamsPortal` to accumulate `subjectTotalScores` from `final` and `half` exams.
     - Filtered available exams so `isSecondSession` exams return `false` (hidden) if `totalScore >= 50`.
  4. **Exam Duplication Guard (`src/main.js`)**:
     - Refactored `submitCreatedExam()` to `async`.
     - Added pre-submission fetch to `listAllExams()` to block saving if `testType` matches an existing `half`, `final`, or `second_session` exam for the exact same subject and overlapping stage/sections.
- **Verification**: Changes tested in UI and verified functionality.


### Date: 2026-07-30 (Feature: 50+50 Grade System & Exam Re-take Prevention Guard)
- **Task**: 
  1. Updated grading system so Mid Exam (`half`) (50) and Final Exam (`final`) (50) sum directly to 100 total (`50 + 50 = 100`) instead of taking average (`(100 + 100) / 2`).
  2. Implemented an Already-Taken Exam Guard so when a student opens an exam link for an exam they have already submitted, a dedicated warning screen displays their previous score and prevents resubmission.
- **Key Changes**:
  1. **Direct 50 + 50 Sum (`src/main.js` & `index.html`)**:
     - Updated `renderStudentsCumulativeRegistry()` to extract `halfGrade` (50 max) and `finalGrade` (50 max) and sum them directly to `successMeasure = halfGrade + finalGrade`.
     - Updated Student Profile Modal UI (`sp-half-score` `/ 50`, `sp-final-score` `/ 50`, `sp-success-score` `(Mid 50 + Final 50)`).
     - Updated Master Report Table headers & rows (`نصف السنة (Half 50)`, `النهائي (Final 50)`, `الدرجة الكلية (100)`).
     - Updated Cumulative Registry cards badge to read `النتيجة الكلية (50+50)`.
  2. **Already-Taken Exam Guard (`ExamTakerController.js` & `src/main.js`)**:
     - Updated `ExamTakerController.loadExam(examId)` to check student repository submissions. If the student has already completed the exam, it invokes `view.onExamAlreadyTaken(exam, existingSub)`.
     - Created `onExamAlreadyTaken(exam, existingSub)` in `src/main.js` to render a styled message displaying student's name, exam title, earned score, submission timestamp, and security message prohibiting re-submission.
- **Verification**: Built and verified production bundle with `npm run build` (Clean build in 180ms).

---

### Date: 2026-07-30 (Feature: Client-Side Hash Router & History Navigation)
- **Task**: Implemented Client-Side Hash-Based Router to enable full browser history navigation (Back 🔙 / Forward 🔜 buttons) and page view persistence on reload (`F5`).
- **Key Changes**:
  1. **Routing Logic & Hash Push (`src/main.js`)**:
     - Updated `switchView(viewId, updateHash = true)` to sync `window.location.hash` via `window.history.pushState(null, "", '#view-id')` whenever a primary view container is selected.
     - Updated `showStudentCard(cardId, updateHash = true)` to push sub-card hashes (`#view-student-entry:student-verify-card`, `#view-student-entry:student-onboarding-card`, etc.).
  2. **Browser Navigation Event Listeners (`src/main.js`)**:
     - Added `handleHashChange()` listener for both `hashchange` and `popstate` events to respond instantly when the user clicks browser Back `←` or Forward `→` buttons without triggering infinite loop hash updates.
  3. **Page Reload State Persistence (`src/main.js`)**:
     - Updated `initRouting()` to inspect `window.location.hash` upon page startup. If a valid view hash exists, the application restores that exact screen and sub-card instead of resetting to the home screen.
     - Added `restoreDefaultView(updateHash = true)` helper for clean fallback when no hash is specified.
- **Verification**: Built and verified production bundle with `npm run build` (Clean build in 191ms).

---

### Date: 2026-07-30 (Feature: Custom In-App Notification System)
- **Task**: Replaced native browser popups (`window.alert`) which were rendering Chrome dialogs like `localhost:5173 says` with a custom SOTA Hybrid In-App Notification system.
- **Key Changes**:
  1. **UI & CSS Styling (`style.css`)**:
     - Added `#toast-container` and `.app-toast` rules supporting glassmorphic backdrop blur, smooth slide & fade keyframe animations, RTL layout, close buttons, and success/error/info variants.
     - Added `#app-notification-modal` and `.notif-modal-card` rules with centered glassmorphic dialog cards, custom badge containers for Hawza IDs or links, and 1-click copy buttons.
  2. **Markup (`index.html`)**:
     - Embedded `#toast-container` and `#app-notification-modal` elements cleanly before main script imports.
  3. **Application Logic (`src/main.js`)**:
     - Implemented `showToast(message, type, duration)` and `showNotificationModal({ title, message, type, copyText, badgeValue, onConfirm })` on `AppViewManager`.
     - Overrode `window.alert` to automatically route legacy alerts into smooth in-app toasts.
     - Upgraded critical administrative actions (e.g., Student Approval with Hawza ID generation, Exam Creation with direct URL links) to use the rich, interactive Notification Modal with 1-click copy functionality.
- **Layout Centering Fix**:
  - Added `.role-card-container` flexbox rules (`justify-content: center`, `flex-wrap: wrap`) and centered `.role-card` glassmorphic styling so single or double cards are perfectly centered on the page without shifting right in RTL mode.
  - Updated `switchView` in `src/main.js` to hide `#global-nav` when returning to `view-role-selection` to prevent teacher navbar overlapping the main home card.

---

### Date: 2026-07-31 (Feature: Removal of Financial Status Requirement)
- **Task**: 
  - Completely removed the mandatory "الحالة المادية" (Financial Condition) field from the student registration process and database schema in `mzmz_app`.
- **Key Changes**:
  1. **HTML Markup (`index.html`)**:
     - Removed the `<select id="req-student-marital">` form field (الحالة المادية) from the registration form.
     - Removed the `pp-marital` display card from the admin student profile modal.
  2. **Application Logic (`src/main.js`)**:
     - Removed extraction and payload assignment of `maritalStatus` from the membership submission handler.
     - Updated student detail modal binder to handle optional/removed `pp-marital` safely.
  3. **Database Schema (`supabase_schema.sql`)**:
     - Removed `marital_status TEXT` column from `public.students` table definition.
- **Verification**: Code updated clean and ready.

---

### Date: 2026-07-31 (Feature: Mobile Responsiveness & Layout Optimization)
- **Task**: 
  - Complete overhaul of mobile support in `mzmz_app` to fix oversized typography, giant card paddings, cluttered top navigation header controls, touch target sizing, and table scrolling on smartphones and tablets.
- **Key Changes**:
  1. **HTML Header Controls (`index.html`)**:
     - Removed cluttering hardcoded inline flex styles on `.app-header-controls`, `.header-right`, and `.header-left`.
     - Standardized top navigation buttons with semantic CSS classes (`.header-btn`, `.header-badge`, `.header-theme-btn`, `.back-btn`).
  2. **Mobile Responsive CSS Engine (`style.css`)**:
     - Implemented fluid `clamp()` typography for `h1`, `h2`, `h3` (`clamp(1.25rem, 4vw + 0.5rem, 2rem)`) to prevent giant headings from consuming entire viewport height on portrait mobile screens.
     - Added CSS `@media (max-width: 768px)` and `@media (max-width: 480px)` responsive breakpoints.
     - Scaled down card paddings on mobile (`.card`, `.welcome-card`, `.dashboard-card`, `.role-card`) from `2.5rem` to `1rem - 1.25rem`.
     - Created `.table-responsive` and `.data-table-container` touch-scroll wrapper styling (`overflow-x: auto; -webkit-overflow-scrolling: touch;`).
     - Standardized mobile inputs, buttons, and touch targets to meet Apple & Android HIG guidelines (`min-height: 44px`).
- **Verification**: 
  - Ran `npm test` (3/3 tests passed).
  - Verified structure and responsive rules across viewport breakpoints.

---

### Date: 2026-08-01 (Fix: Night Mode Answer Options Visibility & Student Portal Grade UI Removal)
- **Task**: 
  1. Fixed exam answer options being invisible/unreadable in Night Mode (Dark Theme).
  2. Removed the display of student grades/scores from the student portal UI under Completed Exams.
- **Key Changes**:
  1. **Night Mode Styling Fix (`style.css`)**:
     - Added `body.dark-theme .option-choice` rules with a dark background (`rgba(255, 255, 255, 0.05)`), border (`1px solid var(--border-color)`), and proper text color (`var(--text-main)`).
     - Added dark theme hover (`rgba(255, 255, 255, 0.12)`) and selected states (`var(--primary-light)` background with `var(--primary-color)` border).
     - Added dark mode support for `.review-question-card` and `.review-option-row`.
  2. **Student Portal Grade UI Removal (`src/main.js`)**:
     - Removed the score display element (`<div style="font-weight: bold;">${score}</div>`) from the completed exams card template in `loadStudentExamsPortal()`. Completed exams now display status "تم الإنجاز ✅" without revealing score details.
- **Verification**:
  - Ran `npm run build` (Clean build in 319ms).
---

### Date: 2026-09-21 (Feature & Fix: Cloud Attendance System Overhaul & Dynamic Working Days)
- **Task**:
  1. Overhauled the attendance system from local client-side storage to Supabase Cloud Engine (`attendance_settings` & `attendance_records`).
  2. Enforced daily attendance window default from 8:00 PM to 12:00 AM (`20:00` - `23:59`).
  3. Integrated interactive student attendance box into `loadStudentExamsPortal` with 3 dynamic states (Open to Sign, Confirmed/Present with timestamp, Closed outside hours).
  4. Added dynamic working days vs. off-days ("عطلة رسمية") support:
     - When admin configures "أيام محددة" (`mode = 'custom'`), students on off-days see an official day-off card ("🌴 اليوم عطلة رسمية - لا يتطلب تسجيل الحضور").
     - Admin daily attendance view detects off-days dynamically and displays an active indicator badge.
- **Key Changes**:
  1. **Database Schema (`supabase_schema.sql`)**:
     - Added `attendance_settings` table (defaults: active=true, mode='all', selected_days=[], start_time='20:00', end_time='23:59').
     - Added `attendance_records` table with unique constraint `UNIQUE(student_phone, date)` and RLS policies for student registration and teacher administration.
  2. **HTML Markup (`index.html`)**:
     - Upgraded `#student-attendance-container` with `#student-attendance-banner`, `#student-attendance-success`, and `#student-attendance-closed` with dynamic badge, title, icon, and description elements.
     - Added cloud persistence controls, daily view date picker, and cumulative summary switchers in admin portal.
  3. **Application Logic (`src/main.js`)**:
     - Added `fetchAttendanceSettings()` and `saveAttendanceSettingsToSupabase()`.
     - Upgraded `loadStudentExamsPortal()` with day-of-week validation, duplicate prevention, and responsive UI state management.
     - Implemented dual-view admin attendance table (Daily view with live manual toggles & Cumulative view with presence/absence rate calculations).
  4. **CSS Styling (`style.css`)**:
     - Added `.student-attendance-box` variants (`.active-time`, `.signed-today`, `.closed-time`) fully compatible with light and dark themes.
- **Verification**:
  - `npm test` passed (3/3 unit tests).
  - `vite build` completed successfully without warnings or bundle errors.

---

### Date: 2026-09-21 (Feature: Official Client Certificate HTML/CSS Overhaul)
- **Task**:
  - Converted the official graduation certificate design provided by the client into a 100% dynamic HTML/CSS system.
  - Supported dynamic academic stage names ("شهادة درجات [المرحلة]") across all stages.
  - Dynamically generated subject rows and student grades according to stage requirements.
  - Simplified the result row strictly to "ناجحـــــة" per explicit user directive.
  - Ensured high-fidelity vector rendering, direct browser printing (`window.print` / PDF), and 2x high-resolution PNG export (`downloadCertAsImage`).
- **Key Changes**:
  1. **Assets (`public/cert_template_clean_bg.png`)**:
     - Pre-processed and extracted clean A4-proportioned background containing the authentic ornate golden frame, corner flourishes, Hauza logo, Quran emblem, verse calligraphy, and authorized administrative signatures.
  2. **HTML Markup (`index.html`)**:
     - Replaced legacy `#cert-print-area` with `.cert-official-container` containing `.cert-official-dynamic-body`, dynamic stage name (`#cert-stud-stage`), dynamic student name (`#cert-stud-name`), notice box, and dynamic table body (`#cert-official-table-tbody`).
  3. **CSS Styling (`style.css`)**:
     - Added `.cert-official-container`, `.cert-official-table` (`#1b3252` dark navy headers, gold/slate borders, clean typography) and `@media print` rules with `-webkit-print-color-adjust: exact;`.
  4. **Application Logic (`src/main.js`)**:
     - Overhauled `openCertificateModal(phone)` and `renderCertificateForStage(stageName, studentData, finalScores)`.
     - Bound dynamic table row generation with Arabic numerals (`١`, `٢`, `٣`...).
     - Updated `downloadCertAsImage()` and image background handlers to preserve parchment background color.
- **Verification**:
  - `npm test` passed (3/3 unit tests).
  - `vite build` succeeded with clean bundle generation.
