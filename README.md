# 🎓 MZMZ App (HauzaOnline) - Complete Digital Academy Management System

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

HauzaOnline is a highly scalable, full-stack educational management platform engineered from the ground up to handle student enrollment, dynamic academic hierarchies, complex grading algorithms, and secure exam administration. 

Built completely without heavy frontend frameworks like React or Vue, this project stands as a testament to deep DOM manipulation, custom SPA routing, and rigorous software architecture (Clean Architecture) using pure Vanilla JavaScript.

---

## 🚀 Technical Highlights & System Capabilities

### 1. Custom Client-Side Hash Router (SPA)
Instead of relying on `react-router`, the system features a bespoke, highly optimized hash-based router. 
- **History API Integration:** Intercepts `popstate` and `hashchange` events to provide native browser back/forward (`🔙/🔜`) button support.
- **State Persistence:** Preserves the exact application state and active modal upon page reloads (`F5`) or direct deep-link sharing.
- **Micro-transitions:** Handles DOM teardown and setup smoothly during view switching.

### 2. Clean Architecture & Domain-Driven Design (DDD)
The codebase strictly adheres to Clean Architecture principles, ensuring the business logic is entirely decoupled from the UI and Database layers.
- **Use Cases:** Encapsulated business rules (`SubmitExamUseCase`, `ApproveStudentUseCase`, etc.).
- **Repositories Interfaces:** Abstract data contracts (`IExamRepository`, `IStudentRepository`).
- **Concrete Implementations:** Swappable Supabase adapters (`SupabaseExamRepository`) allowing the backend to be entirely replaced without touching frontend logic.

### 3. State-of-the-Art (SOTA) UI & UX Engineering
- **Mobile-First Responsive Design System:** Complete mobile responsive layout engine supporting viewport breakpoints (`< 768px`, `< 480px`), fluid `clamp()` typography, compact header navigation controls, touch-friendly min targets (`44px`), and `.table-responsive` touch scrolling.
- **Hybrid In-App Notification System:** Replaced all native browser blocking alerts (`window.alert`) with a custom-built, glassmorphic toast notification queue and modal system. Supports keyframe slide/fade animations and 1-click clipboard actions.
- **Dynamic RTL Layout:** Fully localized for Arabic (Right-to-Left) with pixel-perfect responsive design across all mobile, tablet, and desktop devices.
- **Drag-and-Drop Hierarchy Engine:** Implemented native HTML5 Drag-and-Drop API to allow administrators to visually re-sort academic stages and class hierarchies dynamically.

### 4. Advanced Business Logic & Grading Algorithms
- **The 50+50 Ecosystem:** A custom grading engine that mathematically groups Midterm (50) and Final (50) exams to calculate a cumulative success score, ignoring standalone quizzes.
- **Intelligent Promotion Engine:** Algorithms that evaluate a student's total score and academic stage, allowing administrators to seamlessly promote passing students to the next logical stage in the curriculum.
- **Second Session (Retake) Gateway:** A guarded portal that calculates a student's final standing and *only* injects Retake Exams into the DOM if the student failed to meet the 50% threshold.

### 5. Enterprise-Grade Security & Validation
- **Row Level Security (RLS):** Backend data is secured via Supabase RLS policies, ensuring students can only view their own grades and cannot elevate their privileges.
- **Anti-Duplication Guards:** Pre-submission backend checks prevent administrators from accidentally creating multiple Final or Midterm exams for the same subject/section.
- **Re-Take Prevention Guard:** Cryptographically verifies student submissions on exam load. If an exam was previously completed, the UI renders a localized "Already Taken" security screen and destroys the exam form DOM.

### 6. Automated Testing Infrastructure
- **Vitest & JSDOM:** Integrated a robust testing suite targeting the core domain use cases. 
- **Mocked Dependencies:** Utilizes dependency injection to mock backend repositories, ensuring business logic (like exam validation and student promotion) is thoroughly tested in isolation without polluting the production database.

---

## 🛠 Tech Stack

- **Frontend Core:** Vanilla ES6+ JavaScript, HTML5, Vanilla CSS3 (Custom Properties & Flexbox/Grid).
- **Build Tool:** Vite (Ultra-fast Hot Module Replacement and Rollup bundling).
- **Backend as a Service (BaaS):** Supabase (PostgreSQL, Authentication, Realtime subscriptions).
- **Testing:** Vitest, JSDOM.
- **Version Control:** Git & GitHub.

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

6. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 🌟 Developed by El8

**MZMZ App (HauzaOnline)** is proudly designed and developed by **El8**, a premier **Arabic Iraqi dev tech** team specializing in modern software architecture, scalable web platforms, and advanced **AI/data engineering solutions**. 

We build resilient, high-performance systems tailored for the education sector and beyond, leveraging cutting-edge web technologies and a deep understanding of domain-driven design.

---

*Architected and engineered to handle high-concurrency educational workloads with zero external UI libraries.*
