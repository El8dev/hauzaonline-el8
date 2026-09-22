# 🎓 MZMZ App (HauzaOnline) - Complete Digital Academy Management System

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

HauzaOnline (حوزة أم البنين النسوية الإلكترونية) is a highly scalable, full-stack educational management platform engineered from the ground up to handle student enrollment, dynamic academic hierarchies, complex grading algorithms, secure exam administration, and automated certificate generation.

Built completely without heavy frontend frameworks like React or Vue, this project stands as a testament to deep DOM manipulation, custom SPA routing, and rigorous software architecture (Clean Architecture) using pure Vanilla JavaScript and CSS.

---

## 🚀 Technical Highlights & System Capabilities

### 1. Custom Client-Side Hash Router (SPA)
Instead of relying on `react-router`, the system features a bespoke, highly optimized hash-based router. 
- **History API Integration:** Intercepts `popstate` and `hashchange` events to provide native browser back/forward (`🔙/🔜`) button support.
- **State Persistence:** Preserves the exact application state and active modal upon page reloads (`F5`) or direct deep-link sharing.

### 2. Clean Architecture & Domain-Driven Design (DDD)
The codebase strictly adheres to Clean Architecture principles, ensuring the business logic is entirely decoupled from the UI and Database layers.
- **Use Cases:** Encapsulated business rules (`SubmitExamUseCase`, `ApproveStudentUseCase`, etc.).
- **Repositories Interfaces:** Abstract data contracts (`IExamRepository`, `IStudentRepository`).
- **Concrete Implementations:** Swappable Supabase adapters allowing the backend to be entirely replaced without touching frontend logic.

### 3. State-of-the-Art (SOTA) Mobile-First & Web UX Engineering
- **Dual Responsive Shell:** Seamlessly transitions between an enterprise desktop web dashboard (`> 768px`) and a native-feeling mobile app shell (`<= 768px`) packaged via Capacitor for Android.
- **Dual-Role Thumb-Zone Bottom Navigation:** Dedicated context-aware mobile bottom bar (`#mobile-bottom-nav`) that automatically swaps views:
  - **Student / Public Role:** Instant single-tap routing between Home (الرئيسية), My Exams (امتحاناتي), Attendance (الحضور), and Student Profile/Card (العضوية).
  - **Administrator Role:** Seamless supervisor navigation across Published Exams (الامتحانات), Create Exam (إنشاء), Student Registry (الطلاب), Attendance Records (الحضور), and Cumulative Registry (السجل).
- **Persistent Student & Admin Sessions:** Session retention prevents premature sign-in popups when navigating across tabs or reloading views.
- **High-Contrast Dark/Light Notification System:** Strict color tokens and dark slate toasts (`#0f172a`) guaranteeing crisp legibility in both light and dark themes.
- **Mobile Bottom Sheets:** Responsive modal architecture converting desktop popups into smooth slide-up bottom sheets with touch drag handles and safe-area inset protection.
- **Natural Reading Flow & Step Progress:** Replaced nested scrollboxes in student onboarding with an interactive 4-step progress indicator (`#onboard-indicators`).
- **WebView Performance & GPU Optimization:** Removed heavy `backdrop-filter` blur bottlenecks on repeated cards to ensure smooth 60fps scrolling on budget/midrange mobile devices.
- **Google Search Favicon Suite & Web Branding:** Multi-resolution branding assets (`favicon-48x48.png` for Google Search crawler, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`, and OpenGraph tags) eliminating generic fallback globes on search engine results.
- **Dynamic RTL Arabic Design System:** Deep Islamic blue (`#1b3d8c`) with warm gold accents (`#c5a04f`), crisp typography (Cairo / Inter), and instant dark mode switching.

### 4. Advanced Business Logic & Grading Algorithms
- **The 50+50 Ecosystem:** A custom grading engine that mathematically groups Midterm (50) and Final (50) exams to calculate a cumulative success score.
- **Intelligent Promotion Engine:** Algorithms that evaluate a student's total score and academic stage, seamlessly promoting passing students to the next logical stage.
- **Dynamic Database-Driven Structure:** Stages, subjects, and sections are not hardcoded; they are dynamically fetched and managed via a global Supabase `structure_settings` table.

### 5. Enterprise-Grade Security & Validation
- **Row Level Security (RLS):** Backend data is secured via Supabase PostgreSQL RLS policies, ensuring students can only view their own grades and cannot elevate their privileges.
- **Anti-Duplication Guards:** Pre-submission backend checks prevent administrators from accidentally creating multiple Final or Midterm exams for the same subject/section.
- **Re-Take Prevention Guard:** Cryptographically verifies student submissions on exam load, blocking retakes.

### 6. 📜 Automated Certificate Generation Pipeline
- **Dynamic Graphics Rendering:** Integrated Python scripts (`generate_cert.py` using Pillow) and Node.js Headless Browser scripts (`screenshot.js` using Puppeteer) to automatically generate, render, and export high-resolution graduation certificates.
- **RTL Font Shaping:** Handles complex Arabic text layout and bidi text shaping directly onto the certificate image canvas.

### 7. Automated Testing Infrastructure
- **Vitest & JSDOM:** Integrated a robust testing suite targeting the core domain use cases. 
- **Mocked Dependencies:** Utilizes dependency injection to mock backend repositories, ensuring business logic is thoroughly tested in isolation without polluting the production database.

### 8. 📅 Cloud-Synchronized Attendance & Absence Engine
- **Supabase Cloud Tables (`attendance_settings` & `attendance_records`):** Replaced isolated client-side localStorage with real-time PostgreSQL tables.
- **Automated Time & Day Guards:** Configurable central rules enforcing active attendance days and precise start/end time windows.
- **Dual Administrator Views:** Supports date-specific Daily View (with supervisor manual mark/delete overrides) and Cumulative View (total absences, attendances, and adherence rate).
- **Zero-Duplication Guarantee:** Enforces unique constraint `UNIQUE(student_phone, date)` at the database engine level to block duplicate daily entries.

---

## 🛠 Tech Stack

- **Frontend Core:** Vanilla ES6+ JavaScript, HTML5, Vanilla CSS3 (Custom Properties & Flexbox/Grid).
- **Backend as a Service (BaaS):** Supabase (PostgreSQL, Authentication, Realtime subscriptions).
- **Tooling & Build:** Vite (Hot Module Replacement and Rollup bundling).
- **Microservices/Scripts:** Python (Pillow) & Node.js (Puppeteer) for certificate generation.
- **Testing:** Vitest, JSDOM.

---

## 📦 Setup & Installation

To run this project locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/El8dev/HauzaOnline.git
   cd HauzaOnline
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Copy the example environment file and insert your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to include `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.*

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **Run the Automated Test Suite:**
   ```bash
   npm run test
   ```

6. **Build Android App Bundle (.aab) for Google Play Store:**
   ```bash
   npm run build:android
   ```
   *The signed `.aab` will be generated at `android/app/build/outputs/bundle/release/app-release.aab`.*

7. **Build Debug Android APK:**
   ```bash
   npm run build:apk
   ```
   *The debug `.apk` will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`.*

---

## 🌟 Developed by El8

**MZMZ App (HauzaOnline)** is proudly designed and developed by **El8**, a premier **Arabic Iraqi dev tech** team specializing in modern software architecture, scalable web platforms, and advanced **AI/data engineering solutions**. 

We build resilient, high-performance systems tailored for the education sector and beyond, leveraging cutting-edge web technologies and a deep understanding of domain-driven design. 

**This platform was architected using rapid prototyping and AI-assisted "Vibe Coding", allowing our lean startup team to deliver enterprise-grade performance and security.**

*Architected and engineered to handle high-concurrency educational workloads with zero external UI libraries.*
