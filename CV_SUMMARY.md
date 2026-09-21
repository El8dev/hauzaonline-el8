# HauzaOnline (حوزة أم البنين النسوية الإلكترونية)
A full-featured digital academy management and academic examination platform designed for Islamic seminary education, handling student enrollment, gradebook computation, exam administration, and automated graduation certificate generation.

## Role & timeline
- **My role:** Project Manager & Lead Engineer (60% core code ownership; managed client stakeholder relations, negotiated and closed the commercial contract, and led the production deployment).
- **Start and end dates:** July 31, 2026 – August 18, 2026 (Production deployed & active).
- **Team size:** 1 primary git committer / repository manager (`Entity-8`), executed with team collaboration.

## Problem solved
Traditional religious seminaries and specialized academic institutions often struggle with manual grading overhead, paper-based exam submissions, and fragmented student tracking. HauzaOnline replaced manual administrative processes with a unified zero-overhead digital academy, automating complex multi-semester grading equations, preventing exam retake cheating, and generating high-resolution verified graduation certificates instantly.

## Tech stack
- **Languages:** JavaScript (~49%), CSS (~29%), HTML (~20%), Python / SQL (~2%).
- **Frameworks & Libraries:** Vanilla ES6+ JavaScript (Zero-framework SPA), Vite, Supabase JS Client (`@supabase/supabase-js`), Python Pillow (`PIL`), Puppeteer / Node.js.
- **Databases & Cloud Infrastructure:** Supabase (PostgreSQL, GoTrue Auth, Realtime listeners, Row Level Security), Production web hosting on custom domain (`hawza.app` / `hawzw.app`).
- **Testing Tools:** Vitest, JSDOM (`tests/SubmitExamUseCase.test.js`).

## Key features
- **Dynamic Academic Hierarchy Engine:** Fully customizable academic architecture where stages, subjects, and section groups are dynamically managed via Supabase `structure_settings` with HTML5 drag-and-drop re-ordering.
- **Midterm/Final "50+50" Grading Algorithm:** Mathematical calculation engine grouping Midterm (max 50) and Final (max 50) tests with automated thresholds for passing grades and conditional promotions.
- **Secure Exam Delivery & Anti-Cheating Controls:** Exam submission workflow featuring automatic retake prevention, time window enforcement, anti-duplication exam creation validation, and question randomization.
- **Custom Client-Side Hash Router:** Framework-free Single Page Application (SPA) routing engine integrating native History API (`popstate` / `hashchange`) with modal and deep-link state preservation across browser refreshes.
- **Bilingual RTL Glassmorphic UI:** Modern dark/light theme design built completely in pure CSS with fluid `clamp()` typography, frosted glass styling, and native Arabic Right-to-Left alignment.
- **Automated Certificate Generation Pipeline:** High-resolution graphics pipeline using Python Pillow (`generate_cert.py`) and Puppeteer (`screenshot.js`) with complex Arabic bidirectional font shaping.
- **Role-Based Portals (Admin, Teacher, Student):** Specialized dashboards for student lesson review and testing, teacher gradebook entry, and administrative curriculum control.

## Technical highlights
- **Framework-Free Clean Architecture:** Structured the entire frontend using Domain-Driven Design (DDD) in pure JavaScript (`src/main.js` and `src_old/`), decoupling use-cases (`SubmitExamUseCase`, `ApproveStudentUseCase`) from data sources via injectable Supabase repository adapters.
- **PostgreSQL Row Level Security (RLS) Upgrades:** Engineered fine-grained database access rules in `supabase_schema.sql` and `supabase_security_upgrade.sql` to isolate student records, prevent unauthorized grade tampering, and automatically terminate expired JWT sessions.
- **Arabic Typography Shaping on Canvas/Pillow:** Solved complex Arabic connected glyph and bidi layout challenges in backend automated image rendering, outputting print-ready graduation certificates with dynamic names and dates.
- **Domain Commercialization & Delivery:** Owned the client lifecycle end-to-end: gathered institutional requirements, negotiated commercial terms, and delivered the production rollout to `hawza.app`.

## Scale & metrics
- **Lines of Code:** ~10,000+ lines of application code (~4,778 lines of core JavaScript in `src/main.js`, ~2,940 lines of CSS in `style.css`, ~1,992 lines of HTML, ~301 lines of SQL).
- **Commits count:** 24 production git commits.
- **Architecture Modules:** Complete domain use-case suite, repository pattern abstractions, automated test suite (`vitest`), and twin certificate rendering engines (Python Pillow + Node.js Puppeteer).

## Status & links
- **Production URL:** [hawza.app](https://hawza.app) / [hawzw.app](https://hawzw.app)
- **Repository URL:** https://github.com/El8dev/hauzaonline-el8
- **Documentation:** Complete architectural guide in `README.md`, schema migrations in `supabase_schema.sql`, and dev changelogs in `agent_dev_log.md`.

## Suggested CV bullets
- Led product management and engineering for a full-stack digital academy platform (hawza.app), managing the client relationship and commercial delivery end-to-end.
- Engineered 60% of the core architecture using Vanilla JavaScript and Clean Architecture (DDD), delivering a high-performance framework-free SPA with custom hash routing.
- Built an automated graduation certificate generation engine combining Python Pillow and Puppeteer with bidirectional Arabic typography shaping.
- Designed PostgreSQL Row Level Security (RLS) policies and academic evaluation algorithms supporting 50+50 midterm/final grading equations and automated student promotions.
