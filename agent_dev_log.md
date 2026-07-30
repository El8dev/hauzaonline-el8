# Development Log - MZMZ App

## Summary of Recent Changes

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
- **Verification**: Built and verified production bundle with `npm run build`.
