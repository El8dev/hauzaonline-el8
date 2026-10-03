import * as Grading from "./grading.js";
window.Grading = Grading;

import "../src_old/domain/entities/Exam.js";
import "../src_old/domain/entities/Question.js";
import "../src_old/domain/entities/Submission.js";
import "../src_old/domain/entities/Student.js";

import "../src_old/domain/repositories/IExamRepository.js";
import "../src_old/domain/repositories/ISubmissionRepository.js";
import "../src_old/domain/repositories/IStudentRepository.js";

import "../src_old/domain/usecases/CreateExamUseCase.js";
import "../src_old/domain/usecases/GetExamUseCase.js";
import "../src_old/domain/usecases/SubmitExamUseCase.js";
import "../src_old/domain/usecases/GetSubmissionsUseCase.js";
import "../src_old/domain/usecases/SubmitMembershipUseCase.js";
import "../src_old/domain/usecases/ApproveStudentUseCase.js";
import "../src_old/domain/usecases/VerifyStudentUseCase.js";

import "../src_old/data/datasources/supabase.js";
import "../src_old/data/repositories/SupabaseExamRepository.js";
import "../src_old/data/repositories/SupabaseSubmissionRepository.js";
import "../src_old/data/repositories/SupabaseStudentRepository.js";

import "../src_old/presentation/controllers/AuthController.js";
import "../src_old/presentation/controllers/ExamCreatorController.js";
import "../src_old/presentation/controllers/ExamTakerController.js";

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { createClient } from "@supabase/supabase-js";

// نستخدم نسخة المكتبة المضمّنة في الحزمة دائماً (تعمل بدون إنترنت خارجي وبإصدار ثابت)
if (typeof window !== "undefined") {
  window.supabase = { createClient };
}

const {
  normalizeArabic,
  toLatinDigits,
  formatScore,
  examType,
  examTargetsStudent,
  computeStageResults,
  isSecondSessionEligible,
  nextStageOf,
  findStageIndex,
  sectionForNextStage,
  splitEvenly,
  gradeAnswer,
  correctIndices,
  selectedIndices,
  optionText,
  percentOf,
  gradeWord,
  OVERALL_LABELS,
  SUBJECT_STATUS_LABELS,
  GRADED_TYPES,
  COMPONENT_MAX,
} = Grading;

const BAGHDAD_TZ = "Asia/Baghdad";

// التاريخ والوقت بتوقيت بغداد (مطابق لتحقق السيرفر من الحضور)
function baghdadNow() {
  const parts = {};
  try {
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BAGHDAD_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(new Date())
      .forEach((p) => (parts[p.type] = p.value));
  } catch (e) {
    const d = new Date();
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      dow: d.getDay(),
    };
  }
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    dow: dowMap[parts.weekday] ?? new Date().getDay(),
  };
}

function formatIsoDate(date) {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function shiftIsoDate(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatIsoDate(dt);
}

// View Manager
class AppViewManager {
  constructor() {
    this.currentUserId = null;
    this.currentExamId = null;
    this.currentStudent = null;

    // Bind global app instance and override native alert dialogs
    window.appController = this;
    window.alert = (msg) => {
      if (this && typeof this.showToast === "function") {
        this.showToast(String(msg), "info", 4000);
      }
    };

    // Repositories & Use Cases (Loaded from window object)
    this.studentRepository = new window.SupabaseStudentRepository();
    this.submitMembershipUseCase = new window.SubmitMembershipUseCase(
      this.studentRepository,
    );
    this.approveStudentUseCase = new window.ApproveStudentUseCase(
      this.studentRepository,
    );
    this.verifyStudentUseCase = new window.VerifyStudentUseCase(
      this.studentRepository,
    );

    // Core Controllers
    this.authController = new window.AuthController(this);
    this.creatorController = new window.ExamCreatorController(this);
    this.takerController = new window.ExamTakerController(this);

    this.initEventListeners();
    this.initRouting();
    // this.initDropdownMenu();
    this.updateTeacherMenuVisibility();
    this.populateBirthdateSelectors();
    this.fetchStructureSettings();

    // تصدير ميثودز الكلاس للنطاق العام لاستخدامها بـ HTML
    window.toggleCreatorCustomSubject = (val) =>
      this.toggleCreatorCustomSubject(val);
    window.closeExamDetailsModal = () => this.closeExamDetailsModal();
    window.openExamDetails = (examId, phone, name) =>
      this.openExamDetails(examId, phone, name);
    window.renderStudentsCumulativeRegistry = () =>
      this.renderStudentsCumulativeRegistry();
    window.startExamFromList = (examId) => this.startExamFromList(examId);

    this.initNativeAppListeners();
  }

  initNativeAppListeners() {
    try {
      if (Capacitor && Capacitor.isNativePlatform()) {
        App.addListener("backButton", ({ canGoBack }) => {
          // 1. Close admin login/settings modal if open
          const adminModal = document.getElementById("admin-modal");
          if (adminModal && (adminModal.style.display === "flex" || adminModal.style.display === "block")) {
            adminModal.style.display = "none";
            return;
          }

          // 2. Close exam details modal if open
          const detailsModal = document.getElementById("student-exam-details-modal");
          if (detailsModal && detailsModal.classList.contains("active")) {
            window.closeExamDetailsModal();
            return;
          }

          // 3. Close generic modals if any are visible
          const genericModal = document.querySelector(".modal[style*='display: flex'], .modal[style*='display: block']");
          if (genericModal) {
            genericModal.style.display = "none";
            document.body.classList.remove("printing-modal");
            return;
          }

          // 4. If viewing inside a sub-route/portal, navigate backward in history
          const hash = window.location.hash;
          if (hash && hash !== "#view-role-selection" && hash !== "#" && hash !== "") {
            window.history.back();
          } else {
            // 5. Exit application cleanly when at root view
            App.exitApp();
          }
        });
      }
    } catch (e) {
      console.warn("Capacitor native listeners initialization skipped:", e);
    }
  }

  // ملء خيارات تاريخ الميلاد يدوياً لضمان واقعية السنة
  populateBirthdateSelectors() {
    const daySelect = document.getElementById("req-student-birth-day");
    const monthSelect = document.getElementById("req-student-birth-month");
    const yearSelect = document.getElementById("req-student-birth-year");

    if (daySelect && monthSelect && yearSelect) {
      yearSelect.innerHTML = '<option value="">السنة (واقعية)</option>';

      for (let i = 1; i <= 31; i++) {
        daySelect.options.add(new Option(i, i));
      }
      for (let i = 1; i <= 12; i++) {
        monthSelect.options.add(new Option(i, i));
      }
      for (let i = 2026; i >= 1950; i--) {
        yearSelect.options.add(new Option(i, i));
      }
    }
  }

  async fetchStructureSettings(force = false) {
    if (this._cachedStructureSettings && !force) {
      return this._cachedStructureSettings;
    }
    
    const defaults = {
      stages: ["المرحلة الأولى", "المرحلة الثانية", "المرحلة الثالثة", "المرحلة الرابعة", "المرحلة الخامسة", "المرحلة السادسة"],
      subjects: ["التلاوة", "الفقه", "العقائد", "النحو", "المنطق", "علوم القران", "التفسر", "السيرة", "الأخلاق", "التنمية البشرية", "بلاغة", "الاسرة و الطفل"],
      sections: {},
      stage_subjects: {}
    };

    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) {
        if (!this._cachedStructureSettings) this._cachedStructureSettings = defaults;
        return this._cachedStructureSettings;
      }
      const { data, error } = await supabase
        .from('structure_settings')
        .select('*')
        .eq('id', 'global')
        .maybeSingle();
        
      if (error) {
        console.error("Supabase fetch error:", error);
      }
      
      if (data) {
        this._cachedStructureSettings = {
          stages: data.stages || defaults.stages,
          subjects: data.subjects || defaults.subjects,
          sections: data.sections || defaults.sections,
          stage_subjects: data.stage_subjects || defaults.stage_subjects
        };
      } else {
        this._cachedStructureSettings = defaults;
      }
    } catch (err) {
      console.error(err);
      this._cachedStructureSettings = defaults;
    }
    
    return this._cachedStructureSettings;
  }

  async saveStructureSettingsToSupabase() {
    if (!this._cachedStructureSettings) return;
    this.showLoading();
    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) throw new Error("لم يتم الاتصال بقاعدة البيانات. تأكد من إعدادات Supabase.");
      
      const { error } = await supabase
        .from('structure_settings')
        .upsert({
          id: 'global',
          stages: this._cachedStructureSettings.stages,
          subjects: this._cachedStructureSettings.subjects,
          sections: this._cachedStructureSettings.sections,
          stage_subjects: this._cachedStructureSettings.stage_subjects,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      this.showToast("تم حفظ الهيكلية بنجاح في السحابة", "success");
      this.loadAdminStructureSettings();
    } catch (err) {
      console.error(err);
      const errMsg = err.message || JSON.stringify(err);
      if (errMsg.includes('row-level security') || errMsg.includes('JWT') || errMsg.includes('expired')) {
        alert("جلستك انتهت أو غير مصرح لك. سيتم توجيهك لتسجيل الدخول من جديد.");
        if (this.authController && this.authController.signOut) {
          this.authController.signOut();
        }
        document.getElementById("global-nav").style.display = "none";
        this.switchView("view-role-selection");
        const adminModal = document.getElementById("admin-modal");
        if (adminModal) adminModal.style.display = "flex";
        return;
      }
      alert("فشل الحفظ: " + errMsg);
      this.showToast("حدث خطأ: " + (err.message || "فشل غير معروف"), "error");
    } finally {
      this.hideLoading();
    }
  }

  async fetchAttendanceSettings(force = false) {
    if (this._cachedAttendanceSettings && !force) {
      return this._cachedAttendanceSettings;
    }

    const defaults = {
      active: true,
      mode: 'all',
      selected_days: [],
      time_mode: 'customtime',
      start_time: '20:00', // 8:00 PM
      end_time: '23:59',   // 12:00 PM (Midnight)
    };

    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) {
        if (!this._cachedAttendanceSettings) this._cachedAttendanceSettings = defaults;
        return this._cachedAttendanceSettings;
      }
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('id', 'global')
        .maybeSingle();

      if (error) {
        console.error("Supabase attendance_settings fetch error:", error);
      }

      if (data) {
        this._cachedAttendanceSettings = {
          active: data.active ?? defaults.active,
          mode: data.mode || defaults.mode,
          selected_days: Array.isArray(data.selected_days) ? data.selected_days : defaults.selected_days,
          time_mode: data.time_mode || defaults.time_mode,
          start_time: data.start_time || defaults.start_time,
          end_time: data.end_time || defaults.end_time,
        };
      } else {
        this._cachedAttendanceSettings = defaults;
      }
    } catch (err) {
      console.error("Error fetching attendance settings:", err);
      this._cachedAttendanceSettings = defaults;
    }

    return this._cachedAttendanceSettings;
  }

  async saveAttendanceSettingsToSupabase() {
    this.showLoading();
    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) throw new Error("لم يتم الاتصال بقاعدة البيانات. تأكد من إعدادات Supabase.");

      const active = document.getElementById("admin-attendance-active")?.checked ?? false;
      const mode = document.getElementById("admin-attendance-mode")?.value || "all";
      const selected_days = [];
      if (mode === "custom") {
        document.querySelectorAll(".attendance-day-cb:checked").forEach((cb) => {
          selected_days.push(parseInt(cb.value));
        });
      }
      const time_mode = document.getElementById("admin-attendance-time-mode")?.value || "allday";
      const start_time = document.getElementById("admin-attendance-start-time")?.value || "20:00";
      const end_time = document.getElementById("admin-attendance-end-time")?.value || "23:59";

      const payload = {
        id: 'global',
        active,
        mode,
        selected_days,
        time_mode,
        start_time,
        end_time,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('attendance_settings')
        .upsert(payload);

      if (error) throw error;

      this._cachedAttendanceSettings = payload;
      this.showToast("تم حفظ إعدادات الحضور والغياب بنجاح في السحابة ✅", "success");
      await this.loadAdminAttendanceSettings();
      await this.loadAdminAttendanceTable();
    } catch (err) {
      console.error("Error saving attendance settings:", err);
      this.showError("حدث خطأ أثناء حفظ إعدادات الحضور: " + (err.message || err));
    } finally {
      this.hideLoading();
    }
  }


  getSectionsForStage(stageName) {
    if (!stageName || !this._cachedStructureSettings) return [];
    const sections = this._cachedStructureSettings.sections || {};
    if (Object.prototype.hasOwnProperty.call(sections, stageName)) {
      return sections[stageName];
    }
    const key = normalizeArabic(stageName);
    const found = Object.keys(sections).find((k) => normalizeArabic(k) === key);
    if (found) return sections[found];
    return ["أ", "ب", "ج", "د"];
  }

  saveSectionsForStage(stageName, sectionsArray) {
    if (!stageName || !this._cachedStructureSettings) return;
    this._cachedStructureSettings.sections[stageName] = sectionsArray;
    // We don't save to supabase automatically, wait for manual save
  }

  async populateTargetDropdowns(selectedStageForCheckboxes = null) {
    await this.fetchStructureSettings();
    
    const stageSelect = document.getElementById("creator-target-stage");
    const checkboxesContainer = document.getElementById(
      "creator-target-section-checkboxes",
    );
    const subjectSelect = document.getElementById("creator-subject");

    const allStages = this._cachedStructureSettings.stages;
    const allSubjects = this._cachedStructureSettings.subjects;
    const stageSubjects = this._cachedStructureSettings.stage_subjects;

    if (stageSelect) {
      // إعادة بناء الخيارات دائماً (قد تتغير المراحل من إدارة الهيكلية) مع الحفاظ على الاختيار الحالي
      const previousStage = stageSelect.value;
      stageSelect.innerHTML =
        `<option value="" disabled>-- اختر المرحلة --</option>` +
        allStages
          .map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
          )
          .join("");
      stageSelect.value = previousStage && allStages.includes(previousStage) ? previousStage : "";

      // نستخدم onchange (وليس addEventListener مرة واحدة) حتى يبقى الحدث مربوطاً دائماً بالعنصر الحالي
      stageSelect.onchange = (e) => {
        this.populateTargetDropdowns(e.target.value);
      };
    }

    if (subjectSelect) {
      const currentStage = stageSelect ? stageSelect.value : null;
      const previousSubject = subjectSelect.value;

      if (!currentStage) {
        subjectSelect.innerHTML = `<option value="" disabled selected>-- يرجى اختيار المرحلة أولاً --</option>`;
        subjectSelect.disabled = true;
      } else {
        subjectSelect.disabled = false;
        let availableSubjects = allSubjects;
        const assigned = this.getStageSubjects(currentStage);
        if (assigned.length > 0) {
          availableSubjects = assigned;
        }

        subjectSelect.innerHTML =
          `<option value="" disabled>-- اختر المادة --</option>` +
          availableSubjects
            .map(
              (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
            )
            .join("");
        subjectSelect.value = availableSubjects.includes(previousSubject) ? previousSubject : "";
      }
    }

    let targetStageForSections = selectedStageForCheckboxes;
    if (!targetStageForSections && stageSelect && stageSelect.value) {
      targetStageForSections = stageSelect.value;
    }

    if (checkboxesContainer && targetStageForSections) {
      // نحتفظ بالشعب المختارة فقط إذا لم تتغير المرحلة
      const previouslyChecked = new Set(
        checkboxesContainer.dataset.stage === targetStageForSections
          ? Array.from(checkboxesContainer.querySelectorAll(".creator-target-section-cb:checked")).map((cb) => cb.value)
          : [],
      );
      checkboxesContainer.dataset.stage = targetStageForSections;
      const stageSections = this.getSectionsForStage(
        targetStageForSections,
      );
      if (stageSections.length === 0) {
        checkboxesContainer.innerHTML = '<span class="text-danger" style="font-size:0.85rem;">لا توجد شعب مسجلة لهذه المرحلة. يرجى إضافتها من إدارة الهيكلية.</span>';
      } else {
        checkboxesContainer.innerHTML = stageSections
          .map(
            (s) => `
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" value="${escapeHtml(s)}" class="creator-target-section-cb" ${previouslyChecked.has(s) ? "checked" : ""}> ${escapeHtml(s)}
              </label>
            `,
          )
          .join("") +
          `<small class="text-muted" style="width:100%; font-size:0.78rem;">إذا لم تحدد أي شعبة سيُوجَّه الامتحان لكل شعب المرحلة.</small>`;
      }
    } else if (checkboxesContainer) {
      checkboxesContainer.dataset.stage = "";
      checkboxesContainer.innerHTML =
        '<span class="text-muted" style="font-size:0.85rem;">يرجى اختيار المرحلة أولاً لعرض الشعب.</span>';
    }
  }

  // مواد المرحلة المعيّنة من إدارة الهيكلية (مع تطابق مرن لكتابة اسم المرحلة)
  getStageSubjects(stageName) {
    const map = (this._cachedStructureSettings && this._cachedStructureSettings.stage_subjects) || {};
    if (Array.isArray(map[stageName]) && map[stageName].length > 0) return map[stageName];
    const key = normalizeArabic(stageName);
    const found = Object.keys(map).find((k) => normalizeArabic(k) === key);
    return found && Array.isArray(map[found]) ? map[found] : [];
  }

  async loadAdminStructureSettings() {
    await this.fetchStructureSettings();
    
    const subjectsList = document.getElementById("admin-subjects-list");
    const stagesList = document.getElementById("admin-stages-list");
    const sectionsList = document.getElementById("admin-sections-list");
    const stageFilter = document.getElementById("admin-section-stage-filter");
    const subjectStageFilter = document.getElementById("admin-subject-stage-filter");
    const stageSubjectsContainer = document.getElementById("admin-stage-subjects-container");
    const saveBtn = document.getElementById("btn-admin-save-structure");

    if (saveBtn && !saveBtn.dataset.listenerAttached) {
      saveBtn.addEventListener("click", () => this.saveStructureSettingsToSupabase());
      saveBtn.dataset.listenerAttached = "true";
    }

    const allStages = this._cachedStructureSettings.stages;
    const allSubjects = this._cachedStructureSettings.subjects;
    const stageSubjects = this._cachedStructureSettings.stage_subjects;

    const createListItem = (name, type, extraData = null) => {
      let extraAttr = extraData ? `data-ext="${escapeHtml(extraData)}"` : "";
      let dragAttr =
        type === "stage"
          ? `draggable="true" data-index="${allStages.indexOf(name)}"`
          : "";
      let dragStyle = type === "stage" ? "cursor: grab;" : "";
      return `<li ${dragAttr} class="struct-list-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.03); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); ${dragStyle}">
            <span>${type === "stage" ? "↕️ " : ""}${escapeHtml(name)}</span>
            <button class="btn-danger btn-delete-struct" data-type="${type}" data-name="${escapeHtml(name)}" ${extraAttr} style="padding: 4px 8px; font-size: 0.8rem;">حذف 🗑️</button>
          </li>`;
    };

    if (subjectsList)
      subjectsList.innerHTML = allSubjects
        .map((s) => createListItem(s, "subject"))
        .join("");
    if (stagesList) {
      stagesList.innerHTML = allStages
        .map((s) => createListItem(s, "stage"))
        .join("");
      this.attachDragAndDropToStages(stagesList, allStages);
    }

    // Handle Sections
    if (stageFilter) {
      const currentSelection = stageFilter.value;
      stageFilter.innerHTML =
        `<option value="" disabled selected>-- اختر المرحلة لعرض شعبها --</option>` +
        allStages
          .map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
          )
          .join("");
      if (currentSelection && allStages.includes(currentSelection)) {
        stageFilter.value = currentSelection;
      }

      const renderSectionsList = () => {
        const selectedStage = stageFilter.value;
        if (!selectedStage) {
          if (sectionsList)
            sectionsList.innerHTML =
              '<li class="text-muted" style="font-size:0.85rem;">يرجى اختيار المرحلة أولاً لعرض الشعب.</li>';
          return;
        }
        const stageSections = this.getSectionsForStage(selectedStage);
        if (sectionsList)
          sectionsList.innerHTML = stageSections
            .map((s) => createListItem(s, "section", selectedStage))
            .join("");

        attachDeleteListeners();
      };

      if (!stageFilter.dataset.listenerAttached) {
        stageFilter.addEventListener("change", renderSectionsList);
        stageFilter.dataset.listenerAttached = "true";
      }
      renderSectionsList();
    }
    
    // Handle Subject assignments to Stages
    if (subjectStageFilter) {
      const currentSelection = subjectStageFilter.value;
      subjectStageFilter.innerHTML =
        `<option value="" disabled selected>-- اختر المرحلة لتعيين المواد لها --</option>` +
        allStages
          .map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
          )
          .join("");
      if (currentSelection && allStages.includes(currentSelection)) {
        subjectStageFilter.value = currentSelection;
      }
      
      const renderStageSubjectsList = () => {
        const selectedStage = subjectStageFilter.value;
        if (!selectedStage) {
          if (stageSubjectsContainer)
            stageSubjectsContainer.innerHTML =
              '<span class="text-muted" style="font-size:0.85rem;">يرجى اختيار المرحلة أولاً لعرض موادها.</span>';
          return;
        }
        
        const currentAssigned = stageSubjects[selectedStage] || [];
        
        if (stageSubjectsContainer) {
          stageSubjectsContainer.innerHTML = allSubjects.map(subject => {
            const isChecked = currentAssigned.includes(subject) ? 'checked' : '';
            return `
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" value="${escapeHtml(subject)}" class="assign-subject-cb" data-stage="${escapeHtml(selectedStage)}" ${isChecked}> 
                ${escapeHtml(subject)}
              </label>
            `;
          }).join("");
          
          // Attach listeners to checkboxes
          document.querySelectorAll('.assign-subject-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
              const stage = e.target.getAttribute('data-stage');
              const subject = e.target.value;
              const isChecked = e.target.checked;
              
              if (!this._cachedStructureSettings.stage_subjects[stage]) {
                this._cachedStructureSettings.stage_subjects[stage] = [];
              }
              
              if (isChecked && !this._cachedStructureSettings.stage_subjects[stage].includes(subject)) {
                this._cachedStructureSettings.stage_subjects[stage].push(subject);
              } else if (!isChecked) {
                this._cachedStructureSettings.stage_subjects[stage] = this._cachedStructureSettings.stage_subjects[stage].filter(s => s !== subject);
              }
            });
          });
        }
      };
      
      if (!subjectStageFilter.dataset.listenerAttached) {
        subjectStageFilter.addEventListener("change", renderStageSubjectsList);
        subjectStageFilter.dataset.listenerAttached = "true";
      }
      renderStageSubjectsList();
    }

    const attachDeleteListeners = () => {
      document.querySelectorAll(".btn-delete-struct").forEach((btn) => {
        btn.onclick = (e) => {
          const type = e.target.getAttribute("data-type");
          const name = e.target.getAttribute("data-name");
          const ext = e.target.getAttribute("data-ext");
          if (confirm(`هل أنت متأكد من حذف ${name}؟`)) {
            this.deleteStructureItem(type, name, ext);
          }
        };
      });
    };

    attachDeleteListeners();
  }

  attachDragAndDropToStages(listElement, allStages) {
    let draggedIndex = -1;
    const items = listElement.querySelectorAll('li[draggable="true"]');
    items.forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        draggedIndex = parseInt(item.getAttribute("data-index"));
        e.dataTransfer.effectAllowed = "move";
        item.style.opacity = "0.5";
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const targetIndex = parseInt(item.getAttribute("data-index"));
        if (
          draggedIndex !== targetIndex &&
          draggedIndex > -1 &&
          targetIndex > -1
        ) {
          const draggedStage = allStages.splice(draggedIndex, 1)[0];
          allStages.splice(targetIndex, 0, draggedStage);
          this._cachedStructureSettings.stages = allStages;
          this.loadAdminStructureSettings();
          this.populateTargetDropdowns();
        }
      });
      item.addEventListener("dragend", () => {
        item.style.opacity = "1";
      });
    });
  }

  deleteStructureItem(type, name, extraData = null) {
    if (!this._cachedStructureSettings) return;
    
    if (type === "section") {
      const stageName = extraData;
      if (!stageName) return;

      let stageSections = this.getSectionsForStage(stageName);
      stageSections = stageSections.filter((x) => x !== name);
      this.saveSectionsForStage(stageName, stageSections);
      this.loadAdminStructureSettings();
      this.populateTargetDropdowns();
      return;
    }

    if (type === "subject") {
      this._cachedStructureSettings.subjects = this._cachedStructureSettings.subjects.filter(x => x !== name);
      // Clean up assignments
      for (const stage in this._cachedStructureSettings.stage_subjects) {
        this._cachedStructureSettings.stage_subjects[stage] = this._cachedStructureSettings.stage_subjects[stage].filter(x => x !== name);
      }
    } else if (type === "stage") {
      this._cachedStructureSettings.stages = this._cachedStructureSettings.stages.filter(x => x !== name);
    }
    
    this.loadAdminStructureSettings();
    this.populateTargetDropdowns();
  }

  addStructureItem(type, name, extraData = null) {
    if (!name || name.trim() === "" || !this._cachedStructureSettings) return;
    name = name.trim();

    if (type === "section") {
      const stageName = extraData;
      if (!stageName) {
        alert("يرجى اختيار المرحلة أولاً لإضافة شعبة لها.");
        return;
      }
      let stageSections = this.getSectionsForStage(stageName);
      if (!stageSections.includes(name)) {
        stageSections.push(name);
        this.saveSectionsForStage(stageName, stageSections);
        this.loadAdminStructureSettings();
        this.populateTargetDropdowns();
      }
      return;
    }

    if (type === "subject") {
      if (!this._cachedStructureSettings.subjects.includes(name)) {
        this._cachedStructureSettings.subjects.push(name);
      }
    } else if (type === "stage") {
      if (!this._cachedStructureSettings.stages.includes(name)) {
        this._cachedStructureSettings.stages.push(name);
      }
    }
    
    this.loadAdminStructureSettings();
    this.populateTargetDropdowns();
  }

  showLoading() {
    document.getElementById("loading-overlay").style.display = "flex";
  }

  hideLoading() {
    document.getElementById("loading-overlay").style.display = "none";
  }

  showToast(msg, type = "success", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) {
      console.warn("Toast container missing:", msg);
      return;
    }

    const icons = {
      success: "✅",
      error: "❌",
      info: "ℹ️",
    };
    const icon = icons[type] || "🔔";

    const toast = document.createElement("div");
    toast.className = `app-toast app-toast-${type}`;
    // نص فقط (textContent) لأن الرسائل قد تحتوي أسماء أدخلها الزوار أو نصوص أخطاء
    toast.innerHTML = `
          <span class="app-toast-icon">${icon}</span>
          <span class="app-toast-message" style="white-space: pre-line;"></span>
          <button class="app-toast-close" title="إغلاق">✕</button>
        `;
    toast.querySelector(".app-toast-message").textContent = String(msg ?? "");

    const closeBtn = toast.querySelector(".app-toast-close");
    const removeToast = () => {
      if (toast.classList.contains("app-toast-hiding")) return;
      toast.classList.add("app-toast-hiding");
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener("click", removeToast);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  }

  showNotificationModal({
    title = "إشعار",
    message = "",
    type = "success",
    copyText = null,
    badgeValue = null,
    onConfirm = null,
  }) {
    const modal = document.getElementById("app-notification-modal");
    if (!modal) {
      this.showToast(message, type);
      return;
    }

    const iconEl = document.getElementById("notif-modal-icon");
    const titleEl = document.getElementById("notif-modal-title");
    const bodyEl = document.getElementById("notif-modal-body");
    const badgeBox = document.getElementById("notif-modal-badge-container");
    const badgeValEl = document.getElementById("notif-modal-badge-val");
    const copyBtn = document.getElementById("notif-modal-copy-btn");
    const confirmBtn = document.getElementById("notif-modal-confirm-btn");

    if (type === "error") {
      iconEl.className = "notif-modal-header-icon icon-error";
      iconEl.textContent = "❌";
    } else if (type === "info") {
      iconEl.className = "notif-modal-header-icon icon-info";
      iconEl.textContent = "ℹ️";
    } else {
      iconEl.className = "notif-modal-header-icon";
      iconEl.textContent = "🎉";
    }

    titleEl.textContent = title;
    bodyEl.innerHTML = message;

    const valToCopy = copyText || badgeValue;
    if (valToCopy) {
      badgeBox.style.display = "block";
      badgeValEl.textContent = valToCopy;
      copyBtn.onclick = () => {
        window.copyTextSafe(String(valToCopy)).then((ok) => {
          if (ok) this.showToast("📋 تم النسخ بنجاح!", "success", 2500);
          else this.showToast("فشل النسخ تلقائياً، انسخه يدوياً.", "error");
        });
      };
    } else {
      badgeBox.style.display = "none";
    }

    modal.style.display = "flex";

    confirmBtn.onclick = () => {
      modal.style.display = "none";
      if (typeof onConfirm === "function") onConfirm();
    };
  }

  showError(msg) {
    if (typeof this.hideLoading === "function") {
      this.hideLoading();
    }
    this.showToast(msg, "error", 4500);
  }

  updateOnboardSteps() {
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`onboard-step-${i}`);
      if (stepEl) {
        if (i === this.currentOnboardStep) {
          stepEl.style.display = "block";
          stepEl.style.animation = "none";
          // Trigger reflow to restart animation
          stepEl.offsetHeight;
          stepEl.style.animation = "slideInRight 0.4s ease forwards";
        } else {
          stepEl.style.display = "none";
        }
      }

      const dotEl = document.getElementById(`onboard-dot-${i}`);
      if (dotEl) {
        if (i === this.currentOnboardStep) {
          dotEl.classList.add("active");
        } else {
          dotEl.classList.remove("active");
        }
      }
    }

    const backBtn = document.getElementById("onboard-back-btn");
    const nextBtn = document.getElementById("onboard-next-btn");

    if (this.currentOnboardStep === 1) {
      backBtn.style.display = "none";
    } else {
      backBtn.style.display = "inline-flex";
    }

    if (this.currentOnboardStep === 4) {
      nextBtn.innerHTML = "البدء بالتسجيل 🚀";
    } else {
      nextBtn.innerHTML = "التالي ➡️";
    }
  }

  switchView(viewId, updateHash = true) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    document.querySelectorAll(".view-container").forEach((view) => {
      view.style.display = "none";
    });
    viewElement.style.display = "block";

    const creatorsBtn = document.getElementById("top-right-creators-btn");
    const globalBackBtn = document.getElementById("global-back-btn");
    const isMainScreen = viewId === "view-role-selection";

    if (creatorsBtn) {
      creatorsBtn.style.display = isMainScreen ? "inline-flex" : "none";
    }

    if (globalBackBtn) {
      globalBackBtn.style.display = isMainScreen ? "none" : "inline-block";
    }

    const globalNav = document.getElementById("global-nav");
    if (globalNav && viewId === "view-role-selection") {
      globalNav.style.display = "none";
    }

    if (updateHash && window.location.hash !== `#${viewId}`) {
      if (window.history && window.history.pushState) {
        window.history.pushState(null, "", `#${viewId}`);
      } else {
        window.location.hash = viewId;
      }
    }

    window.scrollTo(0, 0);
    this.updateMobileNavActiveState();
  }

  showStudentCard(cardId, updateHash = true) {
    const cards = [
      "student-onboarding-card",
      "student-request-card",
      "student-verify-card",
      "student-exams-list-card",
    ];
    cards.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = id === cardId ? "block" : "none";
      }
    });

    if (updateHash) {
      const currentView = "view-student-entry";
      const newHash = `#${currentView}:${cardId}`;
      if (window.location.hash !== newHash) {
        if (window.history && window.history.pushState) {
          window.history.pushState(null, "", newHash);
        } else {
          window.location.hash = newHash;
        }
      }
    }
    this.updateMobileNavActiveState();
  }

  handleHashChange() {
    const rawHash = window.location.hash.replace("#", "").trim();
    if (!rawHash) {
      this.restoreDefaultView(false);
      return;
    }
    this.navigateToHash(rawHash);
  }

  // التوجيه حسب الرابط مع حماية الشاشات التي تحتاج جلسة (المشرف/الطالبة)
  async navigateToHash(rawHash) {
    const [viewId, cardId] = rawHash.split(":");
    const targetView = document.getElementById(viewId);
    if (!targetView || !targetView.classList.contains("view-container")) {
      this.restoreDefaultView(true);
      return;
    }

    const adminViews = ["view-dashboard", "view-exam-results"];
    if (adminViews.includes(viewId)) {
      if (this.currentUserId) {
        this.switchView(viewId, false);
      } else {
        document.getElementById("global-nav").style.display = "flex";
        await this.authController.checkSession();
      }
      return;
    }

    // شاشات مؤقتة لا معنى لها بعد إعادة التحميل: نعيد الطالبة لبوابتها
    const transientStudentViews = ["view-exam-taker", "view-success", "view-exam-message"];
    if (transientStudentViews.includes(viewId) || (viewId === "view-student-entry" && cardId === "student-exams-list-card")) {
      if (viewId === "view-exam-taker" && this.examInProgress) {
        this.switchView(viewId, false);
        return;
      }
      this.switchView("view-student-entry", false);
      if (await this.ensureStudentLoggedIn()) {
        this.showStudentCard("student-exams-list-card", viewId !== "view-student-entry");
      } else {
        this.showStudentCard("student-verify-card", true);
      }
      return;
    }

    this.switchView(viewId, false);
    if (cardId) {
      this.showStudentCard(cardId, false);
    }
  }

  // تعيين الطالبة الحالية: نحتفظ بالاسم والرقم كما أدخلتهما لأنهما هويتها عند السيرفر
  setCurrentStudent(student, loginName, loginNumber) {
    this.currentStudent = {
      id: student.id,
      studentName: student.student_name || student.studentName,
      studentPhone: student.student_phone || student.studentPhone,
      memberNumber: student.member_number || student.hawza_number || student.memberNumber || Number(loginNumber),
      stage: student.stage,
      qualification: student.qualification,
      loginName: loginName || student.student_name,
    };
  }

  // استعادة جلسة الطالبة المحفوظة (إن وجدت) دون فتح البوابة
  async restoreStudentSession() {
    if (this.currentStudent) return true;
    const saved = localStorage.getItem("MZMZ_STUDENT_SESSION");
    if (!saved) return false;
    try {
      const sessionData = JSON.parse(saved);
      if (!sessionData || !sessionData.name || !sessionData.id) {
        localStorage.removeItem("MZMZ_STUDENT_SESSION");
        return false;
      }
      const student = await this.studentRepository.loginStudent(sessionData.name, sessionData.id);
      if (student) {
        this.setCurrentStudent(student, sessionData.name, sessionData.id);
        return true;
      }
      // الحساب لم يعد صالحاً (حُذف أو تغير الرقم)
      localStorage.removeItem("MZMZ_STUDENT_SESSION");
    } catch (e) {
      // خطأ شبكة: لا نحذف الجلسة حتى تحاول الطالبة مجدداً
      console.error("Auto login failed:", e);
    }
    return false;
  }

  async ensureStudentLoggedIn() {
    if (this.currentStudent) return true;
    if (!localStorage.getItem("MZMZ_STUDENT_SESSION")) return false;
    this.showLoading();
    try {
      if (await this.restoreStudentSession()) {
        await this.loadStudentExamsPortal();
        return true;
      }
      return false;
    } finally {
      this.hideLoading();
    }
  }

  initMobileNavigation() {
    const navItems = document.querySelectorAll(".mobile-nav-item");
    if (!navItems.length) return;

    navItems.forEach((btn) => {
      btn.addEventListener("click", async () => {
        // 1. Admin Tab Navigation
        const adminTabId = btn.dataset.adminTab;
        if (adminTabId) {
          const targetTabBtn = document.getElementById(adminTabId);
          if (targetTabBtn) {
            targetTabBtn.click();
          }
          this.updateMobileNavActiveState();
          return;
        }

        // 2. View Navigation (e.g. Home)
        const targetView = btn.dataset.view;
        if (targetView) {
          this.switchView(targetView);
          this.updateMobileNavActiveState();
          return;
        }

        // 3. Student Action Navigation
        const studentAction = btn.dataset.studentAction;
        if (studentAction) {
          const loggedIn = await this.ensureStudentLoggedIn();

          if (studentAction === "attendance") {
            if (loggedIn) {
              this.switchView("view-student-entry");
              this.showStudentCard("student-exams-list-card");
              setTimeout(() => {
                const attendanceContainer = document.getElementById(
                  "student-attendance-container"
                );
                if (attendanceContainer) {
                  attendanceContainer.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }, 150);
            } else {
              this.switchView("view-student-entry");
              this.showStudentCard("student-verify-card");
              this.showToast(
                "يرجى إدخال اسمك ورقمك الحوزوي للوصول إلى الحضور",
                "info",
                3500
              );
            }
          } else if (studentAction === "exams") {
            if (loggedIn) {
              this.switchView("view-student-entry");
              this.showStudentCard("student-exams-list-card");
            } else {
              this.switchView("view-student-entry");
              this.showStudentCard("student-verify-card");
              this.showToast(
                "يرجى إدخال اسمك ورقمك الحوزوي لعرض امتحاناتك",
                "info",
                3500
              );
            }
          } else if (studentAction === "profile") {
            if (loggedIn) {
              this.switchView("view-student-entry");
              this.showStudentCard("student-exams-list-card");
              this.showToast(
                `أهلاً بكِ الطالبة: ${this.currentStudent.studentName}`,
                "info",
                3500
              );
            } else {
              this.switchView("view-student-entry");
              this.showStudentCard("student-verify-card");
            }
          }
        }
        this.updateMobileNavActiveState();
      });
    });
  }

  updateMobileNavActiveState() {
    const studentGroup = document.getElementById("mob-nav-student-group");
    const adminGroup = document.getElementById("mob-nav-admin-group");

    const activeView = document.querySelector(
      ".view-container[style*='display: block']"
    );
    const activeViewId = activeView ? activeView.id : "";

    if (activeViewId === "view-dashboard") {
      if (studentGroup) studentGroup.style.display = "none";
      if (adminGroup) adminGroup.style.display = "flex";

      // Highlight active admin tab in bottom nav
      const activeAdminTab = document.querySelector(
        ".admin-nav-tabs .tab-btn.active"
      );
      const activeAdminTabId = activeAdminTab
        ? activeAdminTab.id
        : "tab-exams-btn";

      if (adminGroup) {
        adminGroup.querySelectorAll(".mobile-nav-item").forEach((btn) => {
          if (btn.dataset.adminTab === activeAdminTabId) {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });
      }
    } else {
      if (adminGroup) adminGroup.style.display = "none";
      if (studentGroup) studentGroup.style.display = "flex";

      if (studentGroup) {
        studentGroup.querySelectorAll(".mobile-nav-item").forEach((btn) => {
          btn.classList.remove("active");
        });
        const navHome = document.getElementById("mob-nav-home");
        const navExams = document.getElementById("mob-nav-exams");
        const navProfile = document.getElementById("mob-nav-profile");

        if (activeViewId === "view-role-selection" || !activeViewId) {
          if (navHome) navHome.classList.add("active");
        } else if (activeViewId === "view-student-entry") {
          const activeCard = document.querySelector(
            "#view-student-entry .form-card[style*='display: block']"
          );
          const activeCardId = activeCard ? activeCard.id : "";
          if (activeCardId === "student-exams-list-card") {
            if (navExams) navExams.classList.add("active");
          } else if (activeCardId === "student-verify-card") {
            if (navProfile) navProfile.classList.add("active");
          } else {
            if (navHome) navHome.classList.add("active");
          }
        }
      }
    }
  }

  updateTeacherMenuVisibility() {
    const authorized = localStorage.getItem("mzmz_admin_authorized") === "true";
    const menuItem = document.getElementById("menu-item-teacher");
    if (menuItem) {
      menuItem.style.display = authorized ? "block" : "none";
    }

    const teacherCard = document.getElementById("role-teacher-card");
    if (teacherCard) {
      teacherCard.style.display = authorized ? "block" : "none";
    }

    const backHomeBtn = document.getElementById("student-back-home");
    if (backHomeBtn) {
      backHomeBtn.style.display = authorized ? "block" : "none";
    }

    const btnAdminGateTrigger = document.getElementById(
      "btn-admin-gate-trigger",
    );
    if (btnAdminGateTrigger) {
      btnAdminGateTrigger.style.display = authorized ? "none" : "block";
    }
  }

  initDropdownMenu() {
    const menuBtn = document.getElementById("menu-dots-btn");
    const dropdown = document.getElementById("menu-dropdown-content");

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display =
        dropdown.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", () => {
      dropdown.style.display = "none";
    });

    const aboutModal = document.getElementById("about-modal");
    document
      .getElementById("menu-item-about")
      .addEventListener("click", (e) => {
        e.preventDefault();
        aboutModal.style.display = "flex";
      });
    document.getElementById("about-close-btn").addEventListener("click", () => {
      aboutModal.style.display = "none";
    });

    window.triggerSecretAdmin = (e) => {
      if (e) e.stopPropagation();
      const aboutModal = document.getElementById("about-modal");
      if (aboutModal) aboutModal.style.display = "none";

      document.getElementById("admin-gate-id").value = "";
      document.getElementById("admin-gate-password").value = "";
      document.getElementById("admin-auth-modal").style.display = "flex";
    };

    document
      .getElementById("menu-item-teacher")
      .addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("global-nav").style.display = "flex";
        this.authController.checkSession();
      });

    const appsModal = document.getElementById("apps-modal");
    document.getElementById("menu-item-apps").addEventListener("click", (e) => {
      e.preventDefault();
      appsModal.style.display = "flex";
    });
    document.getElementById("apps-close-btn").addEventListener("click", () => {
      appsModal.style.display = "none";
    });
    document.getElementById("apps-web-run").addEventListener("click", (e) => {
      e.preventDefault();
      appsModal.style.display = "none";
    });

    const creatorsModal = document.getElementById("creators-modal");
    if (creatorsModal && document.getElementById("menu-item-creators")) {
      document
        .getElementById("menu-item-creators")
        .addEventListener("click", (e) => {
          e.preventDefault();
          creatorsModal.style.display = "flex";
        });
    }
  }

  initEventListeners() {
    this.initMobileNavigation();
    this.updateMobileNavActiveState();

    // التحكم بواجهة النخبة (Elite Galaxy Modal) - من قام بصنع التطبيق
    const eliteModal =
      document.getElementById("elite-galaxy-modal") ||
      document.getElementById("creators-modal");
    const openEliteModal = (e) => {
      if (e) e.preventDefault();
      if (eliteModal) {
        eliteModal.setAttribute("aria-hidden", "false");
        eliteModal.style.display = "flex";
        document.body.style.overflow = "hidden";
      }
    };
    const closeEliteModal = (e) => {
      if (e) e.preventDefault();
      if (eliteModal) {
        eliteModal.setAttribute("aria-hidden", "true");
        eliteModal.style.display = "none";
        document.body.style.overflow = "";
      }
    };

    const topBtn = document.getElementById("top-right-creators-btn");
    if (topBtn) {
      topBtn.addEventListener("click", openEliteModal);
    }

    const menuBtnCreators = document.getElementById("menu-item-creators");
    if (menuBtnCreators) {
      menuBtnCreators.addEventListener("click", openEliteModal);
    }

    const closeBtnCreators = document.getElementById("creators-close-btn");
    if (closeBtnCreators) {
      closeBtnCreators.addEventListener("click", closeEliteModal);
    }

    if (eliteModal) {
      eliteModal.addEventListener("click", (event) => {
        if (event.target === eliteModal) closeEliteModal(event);
      });
      document.addEventListener("keydown", (event) => {
        if (
          event.key === "Escape" &&
          (eliteModal.getAttribute("aria-hidden") === "false" ||
            eliteModal.style.display === "flex")
        ) {
          closeEliteModal(event);
        }
      });
    }

    // إعداد وإدارة النبذة الثابتة أعلى الامتحانات من داخل التطبيق
    const defaultMotto =
      "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۞ حَوّْزَةُ أُمِّ الْبَنِين (عَلَيْهَا السَّلَام) ۞ «طَلَبُ الْعِلْمِ فَرِيضَةٌ»";
    const mottoInput = document.getElementById("admin-exam-motto-input");
    const saveMottoBtn = document.getElementById("btn-save-exam-motto");
    const resetMottoBtn = document.getElementById("btn-reset-exam-motto");

    if (mottoInput) {
      mottoInput.value =
        localStorage.getItem("mzmz_exam_header_motto") || defaultMotto;
    }
    if (saveMottoBtn) {
      saveMottoBtn.addEventListener("click", () => {
        if (mottoInput && mottoInput.value.trim() !== "") {
          localStorage.setItem(
            "mzmz_exam_header_motto",
            mottoInput.value.trim(),
          );
          alert(
            "✅ تم حفظ وتطبيق النبذة بنجاح! ستظهر الآن بثبات أعلى جميع اختبارات الطلاب.",
          );
        } else {
          alert("⚠️ الرجاء كتابة عبارة قبل الحفظ.");
        }
      });
    }
    if (resetMottoBtn) {
      resetMottoBtn.addEventListener("click", () => {
        localStorage.setItem("mzmz_exam_header_motto", defaultMotto);
        if (mottoInput) mottoInput.value = defaultMotto;
        alert("↺ تم استعادة النبذة الافتراضية بنجاح.");
      });
    }

    // Theme toggle logic
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      // Check saved preference
      if (localStorage.getItem("mzmz_theme") === "dark") {
        document.body.classList.add("dark-theme");
        themeBtn.innerText = "☀️";
      }

      themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark-theme");
        const isDark = document.body.classList.contains("dark-theme");
        themeBtn.innerText = isDark ? "☀️" : "🌙";
        localStorage.setItem("mzmz_theme", isDark ? "dark" : "light");
      });
    }

    const adminModal = document.getElementById("admin-auth-modal");

    // Show modal when clicking "دخول المشرف"
    const adminGateTrigger = document.getElementById("btn-admin-gate-trigger");
    if (adminGateTrigger) {
      adminGateTrigger.addEventListener("click", () => {
        // في الوضع المتصل بالسحابة (Supabase)، يتم توجيه المشرف مباشرة للمصادقة السحابية الآمنة
        if (window.getSupabaseClient()) {
          document.getElementById("global-nav").style.display = "flex";
          this.authController.checkSession();
          return;
        }
        document.getElementById("admin-gate-id").value = "";
        document.getElementById("admin-gate-password").value = "";
        adminModal.style.display = "flex";
      });
    }

    // Close modal when clicking cancel
    const adminGateCancel = document.getElementById("admin-gate-cancel-btn");
    if (adminGateCancel) {
      adminGateCancel.addEventListener("click", () => {
        adminModal.style.display = "none";
      });
    }

    // Handle login form submission
    const adminGateForm = document.getElementById("admin-gate-form");
    if (adminGateForm) {
      adminGateForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("admin-gate-id").value.trim();
        const password = document
          .getElementById("admin-gate-password")
          .value.trim();

        if (window.getSupabaseClient()) {
          adminModal.style.display = "none";
          document.getElementById("global-nav").style.display = "flex";
          const authEmail = id.includes("@") ? id : `${id}@hawza.local`;
          this.authController.signIn(authEmail, password);
        } else {
          alert("❌ يرجى تهيئة الاتصال بـ Supabase أولاً.");
        }
      });
    }

    // Handle secure teacher login submission (Email-based)
    const authLoginForm = document.getElementById("auth-login-form");
    if (authLoginForm) {
      authLoginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("auth-email")?.value.trim() || "";
        const password =
          document.getElementById("auth-password")?.value.trim() || "";

        if (email && password) {
          const authEmail = email.includes("@")
            ? email
            : `${email}@hawza.local`;
          this.authController.signIn(authEmail, password);
        } else {
          alert("يرجى إدخال البريد الإلكتروني وكلمة المرور.");
        }
      });
    }

    // أحداث شاشة اختيار الدور (طالب / معلم) - مقتبس من haz.1
    document
      .getElementById("role-student-card")
      .addEventListener("click", async () => {
        this.switchView("view-student-entry");
        if (await this.ensureStudentLoggedIn()) {
          this.showStudentCard("student-exams-list-card");
          return;
        }
        this.showStudentCard("student-verify-card");
      });

    // Onboarding logic
    document
      .getElementById("onboard-next-btn")
      .addEventListener("click", () => {
        if (this.currentOnboardStep < 4) {
          this.currentOnboardStep++;
          this.updateOnboardSteps();
        } else {
          this.showStudentCard("student-request-card");
        }
      });

    document
      .getElementById("onboard-back-btn")
      .addEventListener("click", () => {
        if (this.currentOnboardStep > 1) {
          this.currentOnboardStep--;
          this.updateOnboardSteps();
        }
      });

    document
      .getElementById("go-to-verify-membership-onboard-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.showStudentCard("student-verify-card");
      });

    document
      .getElementById("role-teacher-card")
      .addEventListener("click", () => {
        document.getElementById("global-nav").style.display = "flex";
        this.authController.checkSession();
      });

    document
      .getElementById("student-back-home")
      .addEventListener("click", () => {
        this.switchView("view-role-selection");
      });

    // Logout
    document.getElementById("nav-logout").addEventListener("click", async () => {
      localStorage.removeItem("mzmz_admin_authorized");
      this.updateTeacherMenuVisibility();
      await this.authController.signOut();
      this.currentUserId = null;
      this.academicCache = null;
      this.currentRegistry = null;
      document.getElementById("global-nav").style.display = "none";
      this.switchView("view-role-selection");
    });

    // Dashboard Tabs Routing (مقتبس من haz.1)
    const switchAdminTab = (activeTabId, activeBtnId) => {
      // إخفاء جميع الأقسام
      document.getElementById("tab-exams-content").style.display = "none";
      document.getElementById("tab-create-content").style.display = "none";
      document.getElementById("tab-students-content").style.display = "none";
      document.getElementById("tab-registry-content").style.display = "none";
      document.getElementById("tab-attendance-content").style.display = "none";
      document.getElementById("tab-structure-content").style.display = "none";

      // إظهار القسم النشط
      document.getElementById(activeTabId).style.display = "block";

      // إزالة الفئة النشطة من جميع الأزرار
      document
        .querySelectorAll(".tab-btn")
        .forEach((btn) => btn.classList.remove("active"));

      // إضافة الفئة النشطة للزر المحدد
      document.getElementById(activeBtnId).classList.add("active");
      this.updateMobileNavActiveState();
    };

    document.getElementById("tab-exams-btn").addEventListener("click", () => {
      switchAdminTab("tab-exams-content", "tab-exams-btn");
      this.creatorController.loadMyExams();
    });

    document.getElementById("tab-create-btn").addEventListener("click", () => {
      switchAdminTab("tab-create-content", "tab-create-btn");
      this.renderExamCreator();
    });

    document
      .getElementById("tab-students-btn")
      .addEventListener("click", () => {
        switchAdminTab("tab-students-content", "tab-students-btn");
        this.loadStudentsList();
      });

    // أحداث أزرار فرز الطلاب
    document.querySelectorAll(".sort-student-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const sortType = e.target.getAttribute("data-sort");
        const currentSort = this.currentStudentSort || {
          by: "date",
          order: "desc",
        };
        const order =
          currentSort.by === sortType && currentSort.order === "asc"
            ? "desc"
            : "asc";
        this.currentStudentSort = { by: sortType, order };

        document.querySelectorAll(".sort-student-btn").forEach((b) => {
          b.style.fontWeight = "normal";
          b.style.border = "1px solid var(--border-color)";
        });
        e.target.style.fontWeight = "bold";
        e.target.style.border = "2px solid var(--primary-color)";

        this.loadStudentsList();
      });
    });

    document
      .getElementById("tab-registry-btn")
      .addEventListener("click", () => {
        switchAdminTab("tab-registry-content", "tab-registry-btn");
        // بطاقة "إدارة بيانات الأعضاء" (الترقية وتعديل المراحل) موجودة داخل تبويب السجل
        this.renderStudentsCumulativeRegistry();
        this.loadStudentsList();
      });

    document
      .getElementById("tab-attendance-btn")
      .addEventListener("click", () => {
        switchAdminTab("tab-attendance-content", "tab-attendance-btn");
        this.loadAdminAttendanceSettings();
        this.loadAdminAttendanceTable();
      });

    document
      .getElementById("tab-structure-btn")
      ?.addEventListener("click", () => {
        switchAdminTab("tab-structure-content", "tab-structure-btn");
        this.loadAdminStructureSettings();
      });

    document
      .getElementById("btn-admin-add-subject")
      ?.addEventListener("click", () => {
        const input = document.getElementById("admin-new-subject");
        this.addStructureItem("subject", input.value);
        input.value = "";
      });

    document
      .getElementById("btn-admin-add-stage")
      ?.addEventListener("click", () => {
        const input = document.getElementById("admin-new-stage");
        this.addStructureItem("stage", input.value);
        input.value = "";
      });

    document
      .getElementById("btn-admin-add-section")
      ?.addEventListener("click", () => {
        const input = document.getElementById("admin-new-section");
        const stageFilter = document.getElementById(
          "admin-section-stage-filter",
        );
        const selectedStage = stageFilter ? stageFilter.value : null;

        this.addStructureItem("section", input.value, selectedStage);
        input.value = "";
      });

    // Attendance Admin Settings Listeners
    const attendanceActiveCb = document.getElementById(
      "admin-attendance-active",
    );

    const attendanceModeSelect = document.getElementById(
      "admin-attendance-mode",
    );
    const attendanceCustomDays = document.getElementById(
      "admin-attendance-custom-days",
    );
    const btnSaveAttendance = document.getElementById(
      "btn-save-attendance-settings",
    );

    const attendanceTimeModeSelect = document.getElementById(
      "admin-attendance-time-mode",
    );
    const attendanceCustomTime = document.getElementById(
      "admin-attendance-custom-time",
    );

    if (attendanceModeSelect) {
      attendanceModeSelect.addEventListener("change", (e) => {
        if (e.target.value === "custom") {
          attendanceCustomDays.style.display = "flex";
        } else {
          attendanceCustomDays.style.display = "none";
        }
      });
    }

    if (attendanceTimeModeSelect) {
      attendanceTimeModeSelect.addEventListener("change", (e) => {
        if (e.target.value === "customtime") {
          attendanceCustomTime.style.display = "flex";
        } else {
          attendanceCustomTime.style.display = "none";
        }
      });
    }

    if (btnSaveAttendance) {
      btnSaveAttendance.addEventListener("click", () => {
        this.saveAttendanceSettingsToSupabase();
      });
    }

    const btnViewDaily = document.getElementById("btn-attendance-view-daily");
    const btnViewSummary = document.getElementById("btn-attendance-view-summary");
    const dateContainer = document.getElementById("admin-attendance-date-container");

    if (btnViewDaily && btnViewSummary) {
      btnViewDaily.addEventListener("click", () => {
        this.attendanceViewMode = "daily";
        btnViewDaily.className = "btn-primary";
        btnViewSummary.className = "btn-secondary";
        if (dateContainer) dateContainer.style.display = "block";
        this.loadAdminAttendanceTable();
      });

      btnViewSummary.addEventListener("click", () => {
        this.attendanceViewMode = "summary";
        btnViewSummary.className = "btn-primary";
        btnViewDaily.className = "btn-secondary";
        if (dateContainer) dateContainer.style.display = "none";
        this.loadAdminAttendanceTable();
      });
    }

    const datePicker = document.getElementById("admin-attendance-date");
    if (datePicker) {
      // تاريخ اليوم بتوقيت بغداد (نفس تاريخ تسجيل الطالبات)
      datePicker.value = baghdadNow().date;

      datePicker.addEventListener("change", () => {
        this.loadAdminAttendanceTable();
      });

      document.getElementById("btn-prev-day")?.addEventListener("click", () => {
        if (!datePicker.value) return;
        datePicker.value = shiftIsoDate(datePicker.value, -1);
        this.loadAdminAttendanceTable();
      });

      document.getElementById("btn-next-day")?.addEventListener("click", () => {
        if (!datePicker.value) return;
        datePicker.value = shiftIsoDate(datePicker.value, 1);
        this.loadAdminAttendanceTable();
      });

      document
        .getElementById("btn-today-day")
        ?.addEventListener("click", () => {
          datePicker.value = baghdadNow().date;
          this.loadAdminAttendanceTable();
        });
    }

    const stageFilter = document.getElementById("admin-attendance-filter-stage");
    if (stageFilter) {
      stageFilter.addEventListener("change", () => {
        this.loadAdminAttendanceTable();
      });
    }

    const sectionFilter = document.getElementById("admin-attendance-filter-section");
    if (sectionFilter) {
      sectionFilter.addEventListener("change", () => {
        this.loadAdminAttendanceTable();
      });
    }

    const btnLoadAttendance = document.getElementById("btn-load-attendance");
    if (btnLoadAttendance) {
      btnLoadAttendance.addEventListener("click", () => {
        this.loadAdminAttendanceTable();
      });
    }


    document
      .getElementById("results-back-btn")
      .addEventListener("click", () => {
        this.switchView("view-dashboard");
        document.getElementById("tab-exams-btn").click();
      });

    // Student Membership views toggle
    document
      .getElementById("go-to-register-membership-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.showStudentCard("student-onboarding-card");
        this.currentOnboardStep = 1;
        this.updateOnboardSteps();
      });

    document
      .getElementById("go-to-verify-membership-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.showStudentCard("student-verify-card");
      });

    // Conditional visibility for new Academic and Hawza fields
    const academicStudySelect = document.getElementById("req-academic-study");
    const academicDeptContainer = document.getElementById(
      "req-academic-dept-container",
    );
    if (academicStudySelect && academicDeptContainer) {
      academicStudySelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "بكالوريوس" || val === "ماجستير" || val === "دكتوراه") {
          academicDeptContainer.style.display = "block";
        } else {
          academicDeptContainer.style.display = "none";
        }
      });
    }

    const hawzaStudySelect = document.getElementById("req-hawza-study");
    const hawzaDescContainer = document.getElementById(
      "req-hawza-desc-container",
    );
    if (hawzaStudySelect && hawzaDescContainer) {
      hawzaStudySelect.addEventListener("change", (e) => {
        if (e.target.value === "نعم") {
          hawzaDescContainer.style.display = "block";
        } else {
          hawzaDescContainer.style.display = "none";
        }
      });
    }

    // Student Request Submission
    document
      .getElementById("student-request-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const firstName = document
          .getElementById("req-student-first-name")
          .value.trim();
        const fatherName = document
          .getElementById("req-student-father-name")
          .value.trim();
        const grandName = document
          .getElementById("req-student-grand-name")
          .value.trim();
        const name = `${firstName} ${fatherName} ${grandName}`.trim();

        const surname = document
          .getElementById("req-student-surname")
          .value.trim();
        const birthdate = document
          .getElementById("req-student-birth")
          .value.trim();
        const province = document
          .getElementById("req-student-province")
          .value.trim();
        const phone = document.getElementById("req-student-phone").value.trim();
        const telegramUser = document
          .getElementById("req-telegram-user")
          .value.trim();
        const socialStatus = document.getElementById(
          "req-student-social-status",
        ).value;

        const academicStudy =
          document.getElementById("req-academic-study").value;
        const academicDept = document
          .getElementById("req-academic-dept")
          .value.trim();
        const hawzaStudy = document.getElementById("req-hawza-study").value;
        const hawzaDesc = document
          .getElementById("req-hawza-desc")
          .value.trim();

        if (this._registering) return; // منع الإرسال المزدوج
        this._registering = true;
        this.showLoading();
        try {
          await this.submitMembershipUseCase.execute({
            studentName: name,
            surname: surname,
            birthdate: birthdate,
            province: province,
            studentPhone: phone,
            socialStatus: socialStatus,
            academicStudy: academicStudy,
            academicDept: academicDept,
            hawzaStudy: hawzaStudy,
            hawzaDesc: hawzaDesc,
            telegramUser: telegramUser,
          });
          this.hideLoading();
          alert(
            "✉️ تم تقديم طلبك التحاقك بنجاح! يرجى الانتظار حتى تقوم الإدارة بقبول الطلب وتزويدك بالرقم الحوزوي.",
          );
          document.getElementById("student-request-form").reset();
          this.showStudentCard("student-verify-card");
        } catch (error) {
          this.showError(error.message);
        } finally {
          this._registering = false;
        }
      });

    // Student Verify Submission
    document
      .getElementById("student-verify-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document
          .getElementById("student-verify-name")
          .value.trim()
          .replace(/\s+/g, " ");
        // الطالبات قد يكتبن الرقم بالأرقام العربية (١٢٣٤٥)
        const studentId = toLatinDigits(
          document.getElementById("student-verify-id").value,
        ).replace(/\D/g, "");

        if (!name || !studentId) {
          this.showError("يرجى إدخال الاسم والرقم الحوزوي.");
          return;
        }

        this.showLoading();
        try {
          // 1. التحقق من بيانات الطالب
          const student = await this.studentRepository.loginStudent(
            name,
            studentId,
          );
          if (!student) {
            throw new Error(
              "بيانات الطالب (الاسم أو العضوية) غير صحيحة أو غير معتمدة.",
            );
          }

          // 2. توجيه الطالب إلى بوابة الامتحانات
          this.setCurrentStudent(student, name, studentId);

          // Save session to localStorage
          localStorage.setItem(
            "MZMZ_STUDENT_SESSION",
            JSON.stringify({ name: name, id: studentId }),
          );

          if (this.currentExamId) {
            await this.takerController.loadExam(this.currentExamId);
          } else {
            await this.loadStudentExamsPortal();
            this.showStudentCard("student-exams-list-card");
          }
          this.hideLoading();
        } catch (error) {
          this.showError(error.message);
        }
      });

    // Student Logout from Exams Portal
    const studentExamsLogout = document.getElementById(
      "student-logout-from-exams",
    );
    if (studentExamsLogout) {
      studentExamsLogout.addEventListener("click", () => {
        this.currentStudent = null;
        this.currentExamId = null;
        this.studentPortalCache = null;
        localStorage.removeItem("MZMZ_STUDENT_SESSION"); // Clear the persistent token
        this.showStudentCard("student-verify-card");
        document.getElementById("student-verify-form").reset();
      });
    }

    // زر العودة من شاشة رسائل الامتحان (لم يبدأ / انتهى / غير مسموح / تم أداؤه)
    const examMessageBackBtn = document.getElementById("exam-message-back-btn");
    if (examMessageBackBtn) {
      examMessageBackBtn.addEventListener("click", async () => {
        this.currentExamId = null;
        if (window.location.search && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
        }
        this.switchView("view-student-entry");
        if (this.currentStudent || (await this.ensureStudentLoggedIn())) {
          this.showStudentCard("student-exams-list-card");
          await this.loadStudentExamsPortal();
        } else {
          this.showStudentCard("student-verify-card");
        }
      });
    }

    // Success page back button
    const successBackBtn = document.getElementById(
      "success-back-to-portal-btn",
    );
    if (successBackBtn) {
      successBackBtn.addEventListener("click", async () => {
        if (this.currentStudent) {
          this.switchView("view-student-entry");
          this.showStudentCard("student-exams-list-card");
          await this.loadStudentExamsPortal();
        } else {
          this.restoreDefaultView(true);
        }
      });
    }
  }

  restoreDefaultView(updateHash = true) {
    const authorized = localStorage.getItem("mzmz_admin_authorized") === "true";
    if (authorized) {
      // المعلم المرخص يرى شاشة اختيار الدور (البوابتين معاً)
      this.switchView("view-role-selection", updateHash);
    } else {
      // الطالب غير المرخص يذهب مباشرة لبوابة الطلاب ويرى شاشة الترحيب
      this.switchView("view-student-entry", updateHash);
      this.showStudentCard("student-verify-card", updateHash);
    }
  }

  async initRouting() {
    this.updateTeacherMenuVisibility();

    if (!this._hashListenerAttached) {
      window.addEventListener("hashchange", () => this.handleHashChange());
      window.addEventListener("popstate", () => this.handleHashChange());
      this._hashListenerAttached = true;
    }

    const params = new URLSearchParams(window.location.search);
    const examId = params.get("examId") || params.get("exam");

    if (examId) {
      this.currentExamId = examId;
      document.getElementById("global-nav").style.display = "none";

      this.showLoading();
      try {
        const repo = this.takerController.examRepository;
        const examData = await repo.getExamById(examId);
        if (!examData) {
          this.onExamNotFound();
          return;
        }
        document.getElementById("entry-exam-title").textContent =
          "امتحان: " + examData.title;
        document.getElementById("entry-exam-desc").textContent =
          examData.description || "أدخل رقم عضويتك المعتمد لحل الأسئلة.";

        this.switchView("view-student-entry", false);

        if (await this.restoreStudentSession()) {
          await this.takerController.loadExam(this.currentExamId);
          return;
        }

        this.hideLoading();
        this.showStudentCard("student-verify-card", false);
      } catch (e) {
        this.showError(e.message);
      }
    } else {
      const rawHash = window.location.hash.replace("#", "").trim();
      if (rawHash) {
        await this.navigateToHash(rawHash);
        return;
      }

      this.restoreDefaultView(true);
    }
  }

  onAuthenticated(user) {
    this.hideLoading();
    this.currentUserId = user.id;
    this.academicCache = null;
    document.getElementById("nav-logout").style.display = "block";
    document.getElementById("global-nav").style.display = "flex";

    this.switchView("view-dashboard");
    document.getElementById("tab-exams-btn").click();
  }

  async loadAdminAttendanceSettings() {
    const settings = await this.fetchAttendanceSettings(true);

    const cbActive = document.getElementById("admin-attendance-active");
    if (cbActive) cbActive.checked = !!settings.active;

    const selMode = document.getElementById("admin-attendance-mode");
    if (selMode) selMode.value = settings.mode || "all";

    const customDiv = document.getElementById("admin-attendance-custom-days");
    if (customDiv) {
      customDiv.style.display = selMode && selMode.value === "custom" ? "flex" : "none";
      document.querySelectorAll(".attendance-day-cb").forEach((cb) => {
        cb.checked =
          settings.selected_days &&
          settings.selected_days.includes(parseInt(cb.value));
      });
    }

    const selTimeMode = document.getElementById("admin-attendance-time-mode");
    if (selTimeMode) selTimeMode.value = settings.time_mode || "allday";

    const customTimeDiv = document.getElementById(
      "admin-attendance-custom-time",
    );
    if (customTimeDiv) {
      customTimeDiv.style.display =
        selTimeMode && selTimeMode.value === "customtime" ? "flex" : "none";
    }

    const startTimeInput = document.getElementById(
      "admin-attendance-start-time",
    );
    if (startTimeInput) startTimeInput.value = settings.start_time || "20:00";

    const endTimeInput = document.getElementById("admin-attendance-end-time");
    if (endTimeInput) endTimeInput.value = settings.end_time || "23:59";

    const badge = document.getElementById("attendance-active-badge");
    if (badge) {
      if (settings.active) {
        badge.innerHTML = `<span style="color: #16a34a; background: rgba(22, 163, 74, 0.1); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(22, 163, 74, 0.3);">🟢 نظام الحضور مفعّل سحابياً</span>`;
      } else {
        badge.innerHTML = `<span style="color: #64748b; background: rgba(100, 116, 139, 0.1); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(100, 116, 139, 0.2);">⚪ نظام الحضور معطّل حالياً</span>`;
      }
    }
  }

  async loadAdminAttendanceTable() {
    const tbody = document.getElementById("admin-attendance-tbody");
    if (!tbody) return;

    const thead = document.getElementById("admin-attendance-thead");
    const viewMode = this.attendanceViewMode || "daily";

    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem;">جاري تحميل سجل الحضور من السحابة... ⏳</td></tr>`;

    try {
      const supabase = window.getSupabaseClient();
      const studentsList = await this.studentRepository.listAllStudents();
      const approvedStudents = studentsList.filter(
        (s) => s.status === "approved",
      );

      if (approvedStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">لا يوجد طالبات معتمدات حالياً.</td></tr>`;
        return;
      }

      // Populate stage & section filters if not populated
      const stageFilter = document.getElementById(
        "admin-attendance-filter-stage",
      );
      const sectionFilter = document.getElementById(
        "admin-attendance-filter-section",
      );

      // إعادة بناء خيارات التصفية في كل تحميل (طالبات جديدات أو مراحل جديدة) مع الحفاظ على الاختيار
      const rebuildFilter = (select, values) => {
        if (!select) return;
        const prev = select.value || "الكل";
        select.innerHTML = `<option value="الكل">الكل</option>` +
          values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
        select.value = values.includes(prev) ? prev : "الكل";
      };
      rebuildFilter(stageFilter, [...new Set(approvedStudents.map((s) => s.stage).filter(Boolean))]);
      rebuildFilter(sectionFilter, [...new Set(approvedStudents.map((s) => s.qualification).filter(Boolean))]);

      const selectedStage = stageFilter ? stageFilter.value : "الكل";
      const selectedSection = sectionFilter ? sectionFilter.value : "الكل";

      // Apply filters
      const filteredStudents = approvedStudents.filter((student) => {
        const matchStage =
          selectedStage === "الكل" || student.stage === selectedStage;
        const matchSection =
          selectedSection === "الكل" ||
          student.qualification === selectedSection;
        return matchStage && matchSection;
      });

      if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">لا توجد نتائج تطابق الفلاتر المحددة.</td></tr>`;
        return;
      }

      const datePicker = document.getElementById("admin-attendance-date");
      if (datePicker && !datePicker.value) {
        datePicker.value = baghdadNow().date;
      }
      const selectedDate = datePicker?.value || baghdadNow().date;
      const settings = await this.fetchAttendanceSettings();

      // Update badge in Admin view with active status + holiday indicator
      const badge = document.getElementById("attendance-active-badge");
      if (badge) {
        let badgeHtml = settings.active
          ? `<span style="color: #16a34a; background: rgba(22, 163, 74, 0.1); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(22, 163, 74, 0.3);">🟢 مفعّل سحابياً</span>`
          : `<span style="color: #64748b; background: rgba(100, 116, 139, 0.1); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(100, 116, 139, 0.2);">⚪ معطّل حالياً</span>`;

        if (viewMode === "daily" && settings.mode === "custom") {
          const selDateParts = selectedDate.split("-");
          const selDateObj = new Date(
            parseInt(selDateParts[0]),
            parseInt(selDateParts[1]) - 1,
            parseInt(selDateParts[2]),
          );
          const selDayOfWeek = selDateObj.getDay();
          const isWorkDay =
            Array.isArray(settings.selected_days) &&
            settings.selected_days.includes(selDayOfWeek);
          if (!isWorkDay) {
            badgeHtml += ` <span style="color: #d97706; background: rgba(217, 119, 6, 0.12); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(217, 119, 6, 0.3);">🌴 التاريخ المحدد عطلة رسمية</span>`;
          }
        }
        badge.innerHTML = badgeHtml;
      }

      if (viewMode === "daily") {
        if (thead) {
          thead.innerHTML = `
            <tr>
              <th>اسم الطالبة</th>
              <th>الرقم الحوزوي</th>
              <th>المرحلة والقسم</th>
              <th style="text-align: center;">الحالة</th>
              <th style="text-align: center;">وقت التحضير</th>
              <th style="text-align: center;">إجراء يدوي</th>
            </tr>
          `;
        }

        // Fetch attendance records from Supabase for this specific date
        let records = [];
        if (supabase) {
          const { data, error } = await supabase
            .from("attendance_records")
            .select("*")
            .eq("date", selectedDate);
          // لا نعرض الجميع "غائبات" عند فشل الجلب
          if (error) throw new Error(error.message);
          records = data || [];
        }

        let html = "";
        filteredStudents.forEach((student) => {
          const phone = student.student_phone || student.phone;
          const hawzaNumber =
            student.member_number || student.hawza_number || "غير محدد";
          const stageText = escapeHtml(student.stage || "غير محدد");
          const sectionText = escapeHtml(student.qualification || "غير محدد");
          const studentFullName = `${student.student_name} ${student.surname || ""}`.trim();

          const rec = records.find(
            (r) =>
              r.student_phone === phone ||
              (student.id && r.student_id === student.id),
          );

          if (rec) {
            let timeStr = "مسجلة";
            if (rec.created_at) {
              const dt = new Date(rec.created_at);
              timeStr = dt.toLocaleTimeString("ar-EG", {
                hour: "2-digit",
                minute: "2-digit",
              });
            }
            html += `
              <tr style="background: rgba(22, 163, 74, 0.03);">
                <td><strong>${escapeHtml(studentFullName)}</strong></td>
                <td><span style="font-family: monospace; font-weight: bold;">${escapeHtml(hawzaNumber)}</span></td>
                <td>${stageText} - ${sectionText}</td>
                <td style="text-align: center;"><span class="badge success" style="padding: 4px 12px; font-weight: bold;">حاضرة ✅</span></td>
                <td style="text-align: center; color: #15803d; font-weight: 600;">${timeStr}</td>
                <td style="text-align: center;">
                  <button class="btn-secondary" style="padding: 3px 10px; font-size: 0.8rem; color: #dc2626; border-color: #fca5a5;" onclick="window.app.deleteAttendanceRecord(${jsArg(rec.id)}, ${jsArg(selectedDate)})">❌ إلغاء التحضير</button>
                </td>
              </tr>
            `;
          } else {
            html += `
              <tr>
                <td><strong>${escapeHtml(studentFullName)}</strong></td>
                <td><span style="font-family: monospace; font-weight: bold;">${escapeHtml(hawzaNumber)}</span></td>
                <td>${stageText} - ${sectionText}</td>
                <td style="text-align: center;"><span class="badge danger" style="padding: 4px 12px; font-weight: bold;">غائبة ❌</span></td>
                <td style="text-align: center; color: #94a3b8;">-</td>
                <td style="text-align: center;">
                  <button class="btn-primary" style="padding: 3px 10px; font-size: 0.8rem; background: #16a34a; border-color: #16a34a;" onclick="window.app.markManualAttendance(${jsArg(phone)}, ${jsArg(student.student_name)}, ${jsArg(student.id)}, ${jsArg(selectedDate)})">✅ تسجيل حضور</button>
                </td>
              </tr>
            `;
          }
        });

        tbody.innerHTML = html;
      } else {
        // SUMMARY VIEW (الملخص التراكمي)
        if (thead) {
          thead.innerHTML = `
            <tr>
              <th>اسم الطالبة</th>
              <th>الرقم الحوزوي</th>
              <th>المرحلة والقسم</th>
              <th style="text-align: center;">أيام الحضور</th>
              <th style="text-align: center;">أيام الغياب</th>
              <th style="text-align: center;">نسبة الالتزام</th>
            </tr>
          `;
        }

        let allRecords = [];
        if (supabase) {
          const { data, error } = await supabase
            .from("attendance_records")
            .select("*");
          if (error) throw new Error(error.message);
          allRecords = data || [];
        }

        const distinctDates = [...new Set(allRecords.map((r) => r.date))];
        const totalSessionDays = distinctDates.length;

        let html = "";
        filteredStudents.forEach((student) => {
          const phone = student.student_phone || student.phone;
          const hawzaNumber =
            student.member_number || student.hawza_number || "غير محدد";
          const stageText = escapeHtml(student.stage || "غير محدد");
          const sectionText = escapeHtml(student.qualification || "غير محدد");
          const studentFullName = `${student.student_name} ${student.surname || ""}`.trim();

          const studentPresences = allRecords.filter(
            (r) =>
              r.student_phone === phone ||
              (student.id && r.student_id === student.id),
          ).length;

          const absences = Math.max(0, totalSessionDays - studentPresences);
          const commitmentRate =
            totalSessionDays > 0
              ? Math.round((studentPresences / totalSessionDays) * 100)
              : 100;

          html += `
            <tr>
              <td><strong>${escapeHtml(studentFullName)}</strong></td>
              <td><span style="font-family: monospace; font-weight: bold;">${escapeHtml(hawzaNumber)}</span></td>
              <td>${stageText} - ${sectionText}</td>
              <td style="text-align: center;"><span class="badge success" style="font-size: 0.95rem; font-weight: bold;">${studentPresences}</span></td>
              <td style="text-align: center;"><span class="badge ${absences > 0 ? "danger" : "secondary"}" style="font-size: 0.95rem; font-weight: bold;">${absences}</span></td>
              <td style="text-align: center;">
                <span style="font-weight: 800; color: ${commitmentRate >= 80 ? "#15803d" : commitmentRate >= 50 ? "#d97706" : "#dc2626"};">${commitmentRate}%</span>
              </td>
            </tr>
          `;
        });

        tbody.innerHTML = html;
      }
    } catch (e) {
      console.error("Error loading attendance table", e);
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 2rem;">حدث خطأ أثناء تحميل البيانات: ${escapeHtml(e.message || String(e))}</td></tr>`;
    }
  }

  async markManualAttendance(phone, name, studentId, date) {
    if (!phone || !date) return;
    this.showLoading();
    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) throw new Error("قاعدة البيانات غير متصلة.");

      const { error } = await supabase.from("attendance_records").upsert(
        {
          student_id: studentId || null,
          student_phone: phone,
          student_name: name,
          date: date,
          status: "present",
          created_at: new Date().toISOString(),
        },
        { onConflict: "student_phone,date" },
      );

      if (error) throw error;
      this.showToast(`تم تسجيل حضور الطالبة (${name}) بنجاح ✅`, "success");
      await this.loadAdminAttendanceTable();
    } catch (err) {
      console.error("Error marking manual attendance:", err);
      this.showError("فشل تسجيل الحضور: " + (err.message || err));
    } finally {
      this.hideLoading();
    }
  }

  async deleteAttendanceRecord(recordId, date) {
    if (!recordId) return;
    if (!confirm("هل أنتِ متأكدة من إلغاء تحضير هذه الطالبة لهذا اليوم؟")) return;
    this.showLoading();
    try {
      const supabase = window.getSupabaseClient();
      if (!supabase) throw new Error("قاعدة البيانات غير متصلة.");

      const { error } = await supabase
        .from("attendance_records")
        .delete()
        .eq("id", recordId);

      if (error) throw error;
      this.showToast("تم إلغاء التحضير بنجاح", "info");
      await this.loadAdminAttendanceTable();
    } catch (err) {
      console.error("Error deleting attendance record:", err);
      this.showError("فشل إلغاء التحضير: " + (err.message || err));
    } finally {
      this.hideLoading();
    }
  }


  onUnauthenticated() {
    this.hideLoading();
    this.currentUserId = null;
    document.getElementById("nav-logout").style.display = "none";
    this.switchView("view-auth");
  }

  onSupabaseNotConfigured() {
    this.hideLoading();
    this.currentUserId = null;
    document.getElementById("nav-logout").style.display = "none";
    alert(
      "لم يتم الاتصال بقاعدة البيانات (Supabase). يرجى التأكد من إضافة الرابط والمفتاح في الإعدادات البرمجية.",
    );
    this.switchView("view-auth");
  }

  // ===================== بوابة الطالبة =====================

  studentCredentials() {
    const s = this.currentStudent || {};
    return { name: s.loginName || s.studentName, number: s.memberNumber, phone: s.studentPhone };
  }

  async getStudentAttendanceToday() {
    const supabase = window.getSupabaseClient();
    const creds = this.studentCredentials();
    const { data, error } = await supabase.rpc("rpc_attendance_today", {
      p_name: creds.name,
      p_number: Number(creds.number),
    });
    if (!error) return data;
    if (!window.isMissingRpcError(error)) throw new Error(window.translateRpcError(error));

    // قبل تشغيل ملف التحديث SQL
    const now = baghdadNow();
    const { data: rec } = await supabase
      .from("attendance_records")
      .select("id, created_at")
      .eq("student_phone", creds.phone)
      .eq("date", now.date)
      .maybeSingle();
    return { date: now.date, time: now.time, dow: now.dow, signed: Boolean(rec), signed_at: rec ? rec.created_at : null };
  }

  async markStudentAttendance() {
    const supabase = window.getSupabaseClient();
    const creds = this.studentCredentials();
    const { data, error } = await supabase.rpc("rpc_mark_attendance", {
      p_name: creds.name,
      p_number: Number(creds.number),
    });
    if (!error) return data;
    if (!window.isMissingRpcError(error)) throw new Error(window.translateRpcError(error));

    const now = baghdadNow();
    const student = this.currentStudent;
    const ins = await supabase.from("attendance_records").insert({
      student_id: student.id || null,
      student_phone: student.studentPhone,
      student_name: student.studentName,
      date: now.date,
      status: "present",
    });
    if (ins.error && !/duplicate|unique/i.test(ins.error.message || "")) {
      throw new Error(ins.error.message);
    }
    return { date: now.date, signed: true, signed_at: new Date().toISOString() };
  }

  formatBaghdadTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: BAGHDAD_TZ });
    } catch (e) {
      return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    }
  }

  async renderStudentAttendanceBox() {
    const container = document.getElementById("student-attendance-container");
    if (!container) return;
    const banner = document.getElementById("student-attendance-banner");
    const success = document.getElementById("student-attendance-success");
    const closed = document.getElementById("student-attendance-closed");
    const closedIcon = document.getElementById("student-attendance-closed-icon");
    const closedTitle = document.getElementById("student-attendance-closed-title");
    const closedDesc = document.getElementById("student-attendance-closed-desc");
    const closedBadge = document.getElementById("student-attendance-closed-badge");
    const timeTag = document.getElementById("student-attendance-time-tag");

    const settings = await this.fetchAttendanceSettings(true);
    if (!settings || settings.active === false) {
      container.style.display = "none";
      return;
    }
    container.style.display = "block";
    [banner, success, closed].forEach((el) => el && (el.style.display = "none"));

    const showSigned = (signedAt) => {
      if (banner) banner.style.display = "none";
      if (closed) closed.style.display = "none";
      if (success) success.style.display = "flex";
      if (timeTag) {
        const t = this.formatBaghdadTime(signedAt || new Date().toISOString());
        timeTag.textContent = `تم تسجيل الحضور اليوم في تمام الساعة ${t} ✅`;
      }
    };

    let status;
    try {
      status = await this.getStudentAttendanceToday();
    } catch (e) {
      console.warn("Attendance status failed:", e);
      container.style.display = "none";
      return;
    }

    if (status && status.signed) {
      showSigned(status.signed_at);
      return;
    }

    const now = baghdadNow();
    const dow = status && Number.isInteger(status.dow) ? status.dow : now.dow;
    const time = (status && status.time) || now.time;
    const isWorkDay =
      settings.mode !== "custom" ||
      (Array.isArray(settings.selected_days) && settings.selected_days.map(Number).includes(dow));

    if (!isWorkDay) {
      if (closed) {
        closed.style.display = "flex";
        if (closedIcon) closedIcon.textContent = "🌴";
        if (closedTitle) closedTitle.textContent = "اليوم عطلة رسمية";
        if (closedDesc) closedDesc.textContent = "لا يتطلب تسجيل الحضور لهذا اليوم وفق جدول الدوام المعتمد.";
        if (closedBadge) {
          closedBadge.textContent = "عطلة";
          closedBadge.style.background = "rgba(16, 185, 129, 0.15)";
          closedBadge.style.color = "#047857";
        }
      }
      return;
    }

    const startTime = settings.start_time || "20:00";
    const endTime = settings.end_time || "23:59";
    const isWithinTime = settings.time_mode === "allday" || (time >= startTime && time <= endTime);

    if (!isWithinTime) {
      if (closed) {
        closed.style.display = "flex";
        if (closedIcon) closedIcon.textContent = "⏳";
        if (closedTitle) closedTitle.textContent = "موعد تسجيل الحضور اليومي";
        if (closedDesc) {
          closedDesc.innerHTML = `يفتح باب الحضور اليوم من الساعة <strong>${escapeHtml(startTime)}</strong> حتى <strong>${escapeHtml(endTime)}</strong> (بتوقيت بغداد)`;
        }
        if (closedBadge) {
          closedBadge.textContent = "مغلق حالياً";
          closedBadge.style.background = "rgba(100, 116, 139, 0.15)";
          closedBadge.style.color = "var(--text-muted)";
        }
      }
      return;
    }

    if (banner) banner.style.display = "flex";
    const btnReg = document.getElementById("btn-register-attendance");
    if (btnReg) {
      btnReg.disabled = false;
      btnReg.textContent = "✋ تسجيل حضوري لليوم";
      btnReg.onclick = async () => {
        btnReg.disabled = true;
        btnReg.textContent = "جاري التسجيل في السحابة... ⏳";
        try {
          const res = await this.markStudentAttendance();
          showSigned(res && res.signed_at);
          this.showToast("تم تسجيل حضوركِ بنجاح بارك الله فيكِ 🌸", "success");
        } catch (regErr) {
          console.error("Attendance registration failed:", regErr);
          this.showError("حدث خطأ أثناء تسجيل الحضور: " + (regErr.message || regErr));
          btnReg.disabled = false;
          btnReg.textContent = "✋ تسجيل حضوري لليوم";
        }
      };
    }
  }

  async loadStudentExamsPortal() {
    const student = this.currentStudent;
    if (!student) return;
    this.showLoading();
    try {
      document.getElementById("student-list-name").textContent = student.studentName;
      await this.fetchStructureSettings();

      try {
        await this.renderStudentAttendanceBox();
      } catch (attErr) {
        console.warn("Attendance box failed:", attErr);
      }

      const allExams = await this.creatorController.examRepository.listAllExams();
      const submissions = await this.takerController.submissionRepository.getMySubmissions(this.studentCredentials());
      this.studentPortalCache = { exams: allExams, submissions };

      const submittedIds = new Set(submissions.map((s) => s.exam_id));
      const maxScores = {};
      submissions.forEach((s) => {
        if (s.max_score !== undefined && s.max_score !== null) maxScores[s.exam_id] = Number(s.max_score);
      });
      const ctx = { exams: allExams, submissions, stage: student.stage, section: student.qualification, maxScores };

      const targeted = allExams.filter(
        (exam) => !submittedIds.has(exam.id) && examTargetsStudent(exam, student.stage, student.qualification),
      );
      const eligible = (exam) => examType(exam) !== "second_session" || isSecondSessionEligible(exam, ctx);
      const byStart = (a, b) => (a.startTime ? a.startTime.getTime() : 0) - (b.startTime ? b.startTime.getTime() : 0);

      const availableExams = targeted.filter((exam) => exam.isActive() && eligible(exam)).sort(byStart);
      const upcomingExams = targeted.filter((exam) => !exam.isStarted() && eligible(exam)).sort(byStart);
      const completedExams = allExams.filter((exam) => submittedIds.has(exam.id));

      const container = document.getElementById("student-exams-list-container");
      const completedContainer = document.getElementById("completed-exams-list-container");
      const subjectTag = (exam) =>
        exam.subject && exam.subject !== "غير محدد"
          ? `<span class="badge primary" style="font-size: 0.75rem; margin-inline-start: 0.5rem; vertical-align: middle;">📚 ${escapeHtml(exam.subject)}</span>`
          : "";
      const typeTag = (exam) =>
        examType(exam) === "second_session"
          ? `<span class="badge" style="background-color: #fef3c7; color: #92400e; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 6px;">🔄 دور ثانٍ</span>`
          : "";

      if (container) {
        let html = "";
        if (availableExams.length === 0) {
          html += `
                <div style="text-align: center; padding: 2.5rem; background: var(--card-bg, #f8f9fa); border-radius: 12px; margin-top: 1rem; border: 1px dashed #ccc;">
                  <div style="font-size: 2.5rem; margin-bottom: 1rem;">📅</div>
                  <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">لا توجد امتحانات متاحة حالياً</h3>
                  <p style="color: var(--text-muted);">لقد أتممت جميع الامتحانات المطلوبة أو أنه لا يوجد امتحان مخصص لك في الوقت الحالي.</p>
                </div>
              `;
        } else {
          html += availableExams
            .map((exam) => {
              const ends = exam.endTime ? exam.endTime.toLocaleString("ar") : "";
              return `
              <div class="form-card" style="margin-bottom: 0.5rem; border-right: 4px solid var(--primary-color); padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h3 style="margin: 0; margin-bottom: 0.4rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span>${escapeHtml(exam.title)}</span>
                    ${subjectTag(exam)}
                  </h3>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.6rem;">${escapeHtml(exam.description || "")}</p>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                    <span class="badge" style="background-color: #dbeafe; color: #1e40af; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 6px;">نشط ومتاح 📝</span>
                    ${typeTag(exam)}
                    ${ends ? `<span style="font-size: 0.78rem; color: var(--text-muted);">⏰ ينتهي: ${escapeHtml(ends)}</span>` : ""}
                  </div>
                </div>
                <div>
                  <button class="btn-primary" style="padding: 0.5rem 1.25rem; font-weight: bold;" onclick="window.startExamFromList(${jsArg(exam.id)})">دخول الامتحان 🚀</button>
                </div>
              </div>
            `;
            })
            .join("");
        }

        if (upcomingExams.length > 0) {
          html += `<h4 style="margin: 1.25rem 0 0.5rem; color: var(--text-muted);">🗓️ امتحانات قادمة</h4>` +
            upcomingExams
              .map((exam) => `
              <div class="form-card" style="margin-bottom: 0.5rem; border-right: 4px solid #94a3b8; padding: 1rem; opacity: 0.9;">
                <div style="font-weight: 700; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">${escapeHtml(exam.title)} ${subjectTag(exam)} ${typeTag(exam)}</div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.35rem;">⏰ يبدأ: ${escapeHtml(exam.startTime ? exam.startTime.toLocaleString("ar") : "")}</div>
              </div>`)
              .join("");
        }
        container.innerHTML = html;
      }

      if (completedContainer) {
        if (completedExams.length === 0) {
          completedContainer.innerHTML = `<p class="text-muted text-center">لا توجد امتحانات منجزة حتى الآن.</p>`;
        } else {
          completedContainer.innerHTML = completedExams
            .map((exam) => `
                  <div class="form-card" style="margin-bottom: 0.5rem; border-right: 4px solid #10b981; padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; opacity: 0.9;">
                    <div>
                      <h3 style="margin: 0; margin-bottom: 0.4rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span style="text-decoration: line-through; color: var(--text-muted);">${escapeHtml(exam.title)}</span>
                        ${subjectTag(exam)}
                      </h3>
                      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="badge" style="background-color: #d1fae5; color: #065f46; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 6px;">تم الإنجاز ✅</span>
                      </div>
                    </div>
                  </div>
                `)
            .join("");
        }
      }
    } catch (error) {
      this.showError("فشل تحميل بوابة الامتحانات: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  startExamFromList(examId) {
    this.currentExamId = examId;
    this.takerController.loadExam(examId);
  }

  // هل يحق للطالبة دخول هذا الامتحان (للروابط المباشرة أيضاً)؟
  async checkExamAccess(exam, mySubs) {
    const s = this.currentStudent;
    if (!examTargetsStudent(exam, s.stage, s.qualification)) {
      return { allowed: false, reason: "هذا الامتحان غير موجّه لمرحلتكِ أو شعبتكِ الدراسية." };
    }
    if (examType(exam) === "second_session") {
      const exams = await this.creatorController.examRepository.listAllExams();
      const maxScores = {};
      (mySubs || []).forEach((sub) => {
        if (sub.max_score !== undefined && sub.max_score !== null) maxScores[sub.exam_id] = Number(sub.max_score);
      });
      const ok = isSecondSessionEligible(exam, {
        exams,
        submissions: mySubs || [],
        stage: s.stage,
        section: s.qualification,
        maxScores,
      });
      if (!ok) {
        return {
          allowed: false,
          reason: "امتحان الدور الثاني متاح فقط للطالبات اللواتي لم يجتزن هذه المادة في (نصف السنة + النهائي) بعد صدور نتيجة النهائي.",
        };
      }
    }
    return { allowed: true };
  }

  onExamNotAllowed(exam, reason) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent = "لا يمكن دخول هذا الامتحان";
    document.getElementById("exam-message-body").textContent = reason;
  }

  renderExamsList(exams) {
    this.hideLoading();
    this.switchView("view-dashboard");

    const container = document.getElementById("exams-list-container");
    if (exams.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 2rem 0;">لا توجد امتحانات مضافة بعد. اضغط على تبويب "إنشاء" للبدء.</p>`;
      return;
    }

    const typeInfo = {
      half: ["half", "⏳ نصف السنة (50)"],
      final: ["final", "🎓 النهائي (50)"],
      second_session: ["warning", "🔄 الدور الثاني (50)"],
      quiz: ["quiz", "📝 اختبار قصير (Quiz)"],
    };

    container.innerHTML = exams
      .map((exam) => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?examId=${exam.id}`;
        const subjectTag =
          exam.subject && exam.subject !== "غير محدد"
            ? `<span class="badge primary" style="font-size: 0.75rem; margin-inline-start: 0.5rem; vertical-align: middle;">📚 ${escapeHtml(exam.subject)}</span>`
            : "";
        const [badgeClass, label] = typeInfo[examType(exam)] || typeInfo.quiz;
        const state = exam.isEnded()
          ? `<span class="badge" style="background:#e2e8f0; color:#475569;">منتهي</span>`
          : exam.isStarted()
            ? `<span class="badge" style="background:#dcfce7; color:#166534;">جارٍ الآن</span>`
            : `<span class="badge" style="background:#e0e7ff; color:#3730a3;">قادم</span>`;

        return `
            <div class="form-card" style="margin-bottom: 1rem; border-right: 4px solid var(--primary-color);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                <h3 style="margin: 0; display: inline-block;">${escapeHtml(exam.title)}</h3>
                <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                  ${state}
                  <span class="test-type-badge ${badgeClass}" title="يظهر للمشرف فقط">👑 ${label}</span>
                  ${subjectTag}
                </div>
              </div>
              <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 0.75rem;">${escapeHtml(exam.description || "لا يوجد وصف")}</p>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.8;">
                📅 <strong>البدء:</strong> ${escapeHtml(exam.startTime ? exam.startTime.toLocaleString("ar") : "—")} |
                <strong>الانتهاء:</strong> ${escapeHtml(exam.endTime ? exam.endTime.toLocaleString("ar") : "—")}<br>
                🎯 <strong>الاستهداف:</strong> <span style="font-weight: bold; color: var(--primary-color); background: var(--bg-hover); padding: 0.1rem 0.5rem; border-radius: 4px;">مرحلة: ${escapeHtml(exam.target_stage || exam.targetStage || "الكل")} | شعبة: ${escapeHtml((exam.targetSections || []).join("، ") || "الكل")}</span>
              </div>
              <div class="button-bar" style="flex-wrap: wrap;">
                <button onclick="window.copyToClipboard(${jsArg(shareUrl)})" class="btn-secondary" style="font-size: 0.85rem;">🔗 نسخ الرابط</button>
                <button data-exam-results="${escapeHtml(exam.id)}" class="btn-secondary" style="font-size: 0.85rem;">📊 عرض النتائج</button>
                <button data-exam-delete="${escapeHtml(exam.id)}" class="btn-danger" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; margin-inline-start: auto;">🗑️ حذف</button>
              </div>
            </div>
          `;
      })
      .join("");

    const byId = new Map(exams.map((e) => [e.id, e]));
    container.querySelectorAll("[data-exam-results]").forEach((btn) => {
      btn.addEventListener("click", () => this.creatorController.loadExamResults(btn.dataset.examResults));
    });
    container.querySelectorAll("[data-exam-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const exam = byId.get(btn.dataset.examDelete);
        if (exam) this.creatorController.deleteExam(exam);
      });
    });
  }

  // ===================== البيانات الأكاديمية للمشرف =====================

  async loadAcademicData(force = false) {
    if (!force && this.academicCache && Date.now() - this.academicCache.at < 10000) {
      return this.academicCache;
    }
    if (!force && this._academicLoading) return this._academicLoading;
    this._academicLoading = this.fetchAcademicData().finally(() => {
      this._academicLoading = null;
    });
    return this._academicLoading;
  }

  async fetchAcademicData() {
    await this.fetchStructureSettings();
    const [students, exams, submissions, maxScores] = await Promise.all([
      this.studentRepository.listAllStudents(),
      this.creatorController.examRepository.listAllExams(),
      this.creatorController.submissionRepository.listAllSubmissions(),
      this.creatorController.examRepository.getMaxScoresByExam(),
    ]);
    const subsByPhone = new Map();
    submissions.forEach((s) => {
      const key = s.student_phone || "";
      if (!subsByPhone.has(key)) subsByPhone.set(key, []);
      subsByPhone.get(key).push(s);
    });
    this.academicCache = { at: Date.now(), students, exams, submissions, maxScores, subsByPhone };
    return this.academicCache;
  }

  invalidateAcademicData() {
    this.academicCache = null;
  }

  studentResults(student, stage) {
    const data = this.academicCache;
    if (!data) return null;
    const targetStage = stage || student.stage;
    return computeStageResults({
      exams: data.exams,
      submissions: data.subsByPhone.get(student.student_phone || student.phone) || [],
      stage: targetStage,
      section: student.qualification,
      requiredSubjects: this.getStageSubjects(targetStage),
      maxScores: data.maxScores,
    });
  }

  overallBadge(results) {
    if (!results) return "";
    const colors = {
      pass: ["#dcfce7", "#166534"],
      retake: ["#fef3c7", "#92400e"],
      fail: ["#fee2e2", "#991b1b"],
      pending: ["#e0e7ff", "#3730a3"],
      none: ["#f1f5f9", "#475569"],
    };
    const [bg, fg] = colors[results.overall] || colors.none;
    const avg = results.average !== null ? ` (${formatScore(results.average)})` : "";
    return `<span style="background:${bg}; color:${fg}; padding:2px 8px; border-radius:12px; font-size:0.78rem; font-weight:700; white-space:nowrap;">${escapeHtml(OVERALL_LABELS[results.overall])}${avg}</span>`;
  }

  describeResultsProblem(results) {
    if (!results || results.requiredCount === 0) {
      return "لا توجد مواد مقيّمة لهذه المرحلة بعد (يجب إنشاء امتحانات نصف السنة والنهائي، أو تعيين مواد المرحلة من إدارة الهيكلية).";
    }
    const list = (st) => results.subjects.filter((s) => s.status === st).map((s) => s.subject).join("، ");
    const parts = [];
    if (results.failed) parts.push(`راسبة في: ${list("fail")}`);
    if (results.retake) parts.push(`مكملة (دور ثانٍ) في: ${list("retake")}`);
    if (results.pending) parts.push(`بانتظار امتحانات: ${list("pending")}`);
    return parts.join(" | ");
  }


  // ===================== تبويب الطلاب والطلبات =====================

  async loadStudentsList() {
    this.showLoading();
    try {
      const data = await this.loadAcademicData();
      const list = data.students.map((s) => ({ ...s }));
      const allStages = (this._cachedStructureSettings && this._cachedStructureSettings.stages) || [];

      list.forEach((student) => {
        if (student.status !== "approved") return;
        student.results = this.studentResults(student);
        student.avg_score = student.results && student.results.average !== null ? student.results.average : -1;
        student.nextStage = nextStageOf(allStages, student.stage);
        student.canPromote = Boolean(student.results && student.results.allPassed && student.nextStage);
      });

      const currentSort = this.currentStudentSort || {
        by: "date",
        order: "desc",
      };
      list.sort((a, b) => {
        let valA, valB;
        switch (currentSort.by) {
          case "name":
            valA = a.student_name || "";
            valB = b.student_name || "";
            break;
          case "hawza_number":
            valA = a.member_number || a.hawza_number || 0;
            valB = b.member_number || b.hawza_number || 0;
            break;
          case "stage":
            valA = a.stage || "";
            valB = b.stage || "";
            break;
          case "status":
            valA = a.status || "";
            valB = b.status || "";
            break;
          case "avg_score":
            valA = a.avg_score ?? -1;
            valB = b.avg_score ?? -1;
            break;
          case "date":
          default:
            valA = new Date(a.created_at).getTime();
            valB = new Date(b.created_at).getTime();
            break;
        }
        if (typeof valA === "string" && typeof valB === "string") {
          const c = valA.localeCompare(valB, "ar");
          return currentSort.order === "asc" ? c : -c;
        }
        if (valA < valB) return currentSort.order === "asc" ? -1 : 1;
        if (valA > valB) return currentSort.order === "asc" ? 1 : -1;
        return 0;
      });

      const pendContainer = document.getElementById("pending-requests-container");
      const appContainer = document.getElementById("approved-students-container");

      const pending = list.filter((s) => s.status === "pending");
      const approved = list.filter((s) => s.status === "approved");
      this.pendingStudents = pending;

      const stageOptions = (selected) => {
        const stages = [...allStages];
        if (selected && !stages.includes(selected)) stages.unshift(selected); // لا نغيّر مرحلة الطالبة بصمت
        return stages
          .map((s) => `<option value="${escapeHtml(s)}"${s === selected ? " selected" : ""}>${escapeHtml(s)}</option>`)
          .join("");
      };

      const getSectionOpts = (stageName, selectedSec = "") => {
        const stageSections = [...this.getSectionsForStage(stageName)];
        if (selectedSec && !stageSections.includes(selectedSec)) stageSections.unshift(selectedSec);
        return stageSections
          .map((s) => `<option value="${escapeHtml(s)}"${selectedSec === s ? " selected" : ""}>${escapeHtml(s)}</option>`)
          .join("");
      };

      const afterMutation = async () => {
        this.invalidateAcademicData();
        await this.loadStudentsList();
      };

      if (pending.length === 0) {
        pendContainer.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا توجد طلبات التحاق معلقة حالياً.</p>`;
      } else {
        pendContainer.innerHTML = pending
          .map(
            (p) => `
              <div class="form-card" style="margin-bottom: 1rem; border-right: 4px solid var(--warning-color);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
                  <div>
                    <h4 style="margin: 0 0 0.5rem 0;">${escapeHtml(p.student_name)} ${escapeHtml(p.surname || "")}</h4>
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">
                      رقم الهاتف: ${escapeHtml(p.student_phone)} | المحافظة: ${escapeHtml(p.province || p.city || "—")}
                    </p>
                    <div style="margin-top: 1rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                       <label style="font-size: 0.85rem; font-weight: bold;">المرحلة:</label>
                       <select data-pending-stage="${escapeHtml(p.id)}" class="text-input" style="padding: 4px; font-size: 0.85rem; width: 140px;">
                          ${stageOptions(allStages[0])}
                       </select>
                       <label style="font-size: 0.85rem; font-weight: bold;">الشعبة:</label>
                       <select data-pending-sec="${escapeHtml(p.id)}" class="text-input" style="padding: 4px; font-size: 0.85rem; width: 100px;">
                          ${getSectionOpts(allStages[0])}
                       </select>
                       <label style="font-size: 0.85rem; font-weight: bold;">الرقم الحوزوي:</label>
                       <input type="text" inputmode="numeric" data-pending-hawza="${escapeHtml(p.id)}" class="text-input" style="padding: 4px; font-size: 0.85rem; width: 100px;" placeholder="تلقائي">
                    </div>
                  </div>
                  <div style="display: flex; gap: 0.5rem;">
                    <button data-approve="${escapeHtml(p.id)}" class="btn-primary" style="font-size: 0.85rem;">✅ قبول</button>
                    <button data-reject="${escapeHtml(p.id)}" class="btn-danger" style="font-size: 0.85rem; border: none;">❌ رفض</button>
                  </div>
                </div>
              </div>
            `,
          )
          .join("");

        pending.forEach((p) => {
          const q = (attr) => pendContainer.querySelector(`[${attr}="${CSS.escape(p.id)}"]`);
          const stageSel = q("data-pending-stage");
          const secSel = q("data-pending-sec");
          stageSel.addEventListener("change", () => {
            secSel.innerHTML = getSectionOpts(stageSel.value);
          });

          q("data-approve").addEventListener("click", async () => {
            const cleanStage = (stageSel.value || "").trim();
            const cleanSection = (secSel.value || "").trim();
            const cleanHawza = q("data-pending-hawza").value.trim() || null;
            if (!cleanStage || !cleanSection) {
              this.showError("يرجى اختيار المرحلة والشعبة قبل القبول.");
              return;
            }

            this.showLoading();
            try {
              const approvedStudent = await this.studentRepository.approveStudent(p.id, cleanStage, cleanSection, cleanHawza);
              this.hideLoading();
              const hawzaNum = approvedStudent.member_number || approvedStudent.hawza_number;
              this.showNotificationModal({
                title: "تم قبول الطالب بنجاح! 🎉",
                message: `تم قبول الطالب <strong>${escapeHtml(p.student_name || "")}</strong> بنجاح وتعيين الرقم الحوزوي.`,
                type: "success",
                badgeValue: hawzaNum,
                copyText: hawzaNum,
              });
              await afterMutation();
            } catch (e) {
              this.showError(e.message);
            }
          });

          q("data-reject").addEventListener("click", async () => {
            if (!confirm("هل أنت متأكد من رفض طلب هذا الطالب؟")) return;
            this.showLoading();
            try {
              await this.studentRepository.rejectStudent(p.id);
              await afterMutation();
            } catch (e) {
              this.showError(e.message);
            }
          });
        });
      }

      if (approved.length === 0) {
        appContainer.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا يوجد طلاب معتمدين بعد.</p>`;
      } else {
        const promoteTitle = (a) => {
          if (a.canPromote) return `ترقية الطالبة إلى ${a.nextStage}`;
          if (!a.nextStage) return "الطالبة في المرحلة الأخيرة أو مرحلتها غير موجودة في الهيكلية";
          return "غير مؤهلة: " + this.describeResultsProblem(a.results);
        };

        const rows = approved
          .map(
            (a) => `
              <tr data-student-row="${escapeHtml(a.id)}">
                <td>
                  <strong>${escapeHtml(a.member_number || a.hawza_number || "-")}</strong>
                  <button data-edit-hawza class="btn-secondary" style="padding: 0.1rem 0.3rem; font-size: 0.7rem; margin-inline-start: 0.5rem; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color);">✏️</button>
                </td>
                <td>${escapeHtml(a.student_name)} ${escapeHtml(a.surname || "")}</td>
                <td>${escapeHtml(a.student_phone)}</td>
                <td>${escapeHtml(a.province || a.city || "—")}</td>
                <td>${escapeHtml(a.birthdate || "—")}</td>
                <td>${escapeHtml(a.social_status || "—")}</td>
                <td>${escapeHtml(a.study_type || "—")}</td>
                <td>${escapeHtml(a.is_student || "—")}</td>
                <td>
                   <div style="display:flex; flex-direction:column; gap:4px;">
                     <select data-edit-stage class="text-input" style="padding:2px 4px; font-size:0.75rem; width:120px;" title="تغيير المرحلة">
                        ${stageOptions(a.stage)}
                     </select>
                     <select data-edit-sec class="text-input" style="padding:2px 4px; font-size:0.75rem; width:120px;" title="تغيير الشعبة">
                        ${getSectionOpts(a.stage, a.qualification)}
                     </select>
                     <button data-save-sec class="btn-primary" style="padding:2px 4px; font-size:0.7rem; width:120px;">💾 حفظ</button>
                   </div>
                </td>
                <td>${escapeHtml(new Date(a.created_at).toLocaleDateString("ar"))}</td>
                <td>${this.overallBadge(a.results)}</td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    <button data-promote class="btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; border: none; background-color: ${a.canPromote ? "#10b981" : "#9ca3af"}; opacity: ${a.canPromote ? "1" : "0.6"}; cursor: ${a.canPromote ? "pointer" : "not-allowed"};" ${a.canPromote ? "" : "disabled"} title="${escapeHtml(promoteTitle(a))}">ترقية 🔼</button>
                    <button data-delete-student class="btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; border: none;">حذف 🗑️</button>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("");

        const eligibleCount = approved.filter((a) => a.canPromote).length;
        appContainer.innerHTML = `
              <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <h4 style="margin: 0; color: var(--primary-color);">قائمة الطلاب المعتمدين (${approved.length})</h4>
                <button id="btn-promote-all-successful" class="btn-primary" style="padding: 0.5rem 1.25rem; font-weight: 800; background-color: #10b981; border: none;" ${eligibleCount ? "" : "disabled"}>
                  ترقية جميع الناجحين 🔼 (${eligibleCount})
                </button>
              </div>
              <p class="text-muted" style="font-size:0.8rem; margin: 0 0 0.75rem;">الترقية متاحة فقط للطالبة الناجحة في جميع مواد مرحلتها (نصف السنة + النهائي ≥ 50 لكل مادة، أو بعد الدور الثاني).</p>
              <div style="overflow-x:auto;">
              <table class="results-table">
                <thead>
                  <tr>
                    <th>الرقم الحوزوي</th>
                    <th>الاسم</th>
                    <th>رقم الواتساب</th>
                    <th>المحافظة</th>
                    <th>المواليد</th>
                    <th>الحالة الاجتماعية</th>
                    <th>الدراسة</th>
                    <th>طالبة؟</th>
                    <th>الشعبة / المرحلة</th>
                    <th>تاريخ التسجيل</th>
                    <th>نتيجة المرحلة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
              </div>
            `;

        const promote = async (a) => {
          const nextSection = sectionForNextStage(this.getSectionsForStage(a.nextStage), a.qualification);
          await this.studentRepository.updateStudentStageAndSection(a.id, a.nextStage, nextSection);
        };

        const promoteAllBtn = document.getElementById("btn-promote-all-successful");
        if (promoteAllBtn) {
          promoteAllBtn.addEventListener("click", async () => {
            const eligible = approved.filter((a) => a.canPromote);
            if (eligible.length === 0) {
              this.showToast("لا يوجد طلاب ناجحين ومستوفين لشروط الترقية حالياً.", "info");
              return;
            }
            if (!confirm(`هل أنت متأكد من ترقية جميع الطلاب الناجحين وعددهم (${eligible.length}) إلى مراحلهم التالية؟`)) return;

            this.showLoading();
            let successCount = 0;
            const failures = [];
            for (const a of eligible) {
              try {
                await promote(a);
                successCount++;
              } catch (e) {
                failures.push(`${a.student_name}: ${e.message}`);
              }
            }
            this.hideLoading();
            this.showNotificationModal({
              title: failures.length ? "اكتملت الترقية مع بعض الأخطاء" : "تمت الترقية الجماعية بنجاح! 🎉",
              message: `تم ترقية <strong>${successCount}</strong> طالب إلى مرحلتهم التالية.` +
                (failures.length ? `<br><br>تعذرت ترقية:<br>${failures.map(escapeHtml).join("<br>")}` : ""),
              type: failures.length ? "info" : "success",
            });
            await afterMutation();
          });
        }

        approved.forEach((a) => {
          const row = appContainer.querySelector(`[data-student-row="${CSS.escape(a.id)}"]`);
          if (!row) return;
          const stageSel = row.querySelector("[data-edit-stage]");
          const secSel = row.querySelector("[data-edit-sec]");

          stageSel.addEventListener("change", () => {
            secSel.innerHTML = getSectionOpts(stageSel.value);
          });

          row.querySelector("[data-promote]").addEventListener("click", async () => {
            if (!a.canPromote) return;
            if (!confirm(`هل أنت متأكد من ترقية الطالبة من '${a.stage}' إلى '${a.nextStage}'؟`)) return;
            this.showLoading();
            try {
              await promote(a);
              this.hideLoading();
              this.showNotificationModal({
                title: "تمت الترقية بنجاح! 🎉",
                message: `تم ترقية الطالبة <strong>${escapeHtml(a.student_name)}</strong> إلى <strong>${escapeHtml(a.nextStage)}</strong>.`,
                type: "success",
              });
              await afterMutation();
            } catch (e) {
              this.showError(e.message);
            }
          });

          row.querySelector("[data-delete-student]").addEventListener("click", async () => {
            if (!confirm(`هل أنت متأكد من حذف عضوية الطالبة "${a.student_name}"؟ سيُحذف سجل حضورها، وتبقى نتائج امتحاناتها محفوظة.`)) return;
            this.showLoading();
            try {
              await this.studentRepository.deleteStudent(a.id);
              await afterMutation();
            } catch (e) {
              this.showError(e.message);
            }
          });

          row.querySelector("[data-edit-hawza]").addEventListener("click", async () => {
            const newNum = prompt("أدخل الرقم الحوزوي الجديد:", a.member_number || a.hawza_number || "");
            if (newNum === null || newNum.trim() === "") return;
            this.showLoading();
            try {
              await this.studentRepository.updateStudentMemberNumber(a.id, newNum.trim());
              await afterMutation();
            } catch (e) {
              this.showError(e.message);
            }
          });

          row.querySelector("[data-save-sec]").addEventListener("click", async () => {
            this.showLoading();
            try {
              await this.studentRepository.updateStudentStageAndSection(a.id, stageSel.value, secSel.value);
              this.hideLoading();
              this.showToast("تم حفظ المرحلة والشعبة بنجاح!", "success");
              this.invalidateAcademicData();
            } catch (e) {
              this.showError(e.message);
            }
          });
        });
      }
    } catch (e) {
      this.showError(e.message);
    } finally {
      this.hideLoading();
    }
  }


  // ===================== إنشاء الامتحان =====================

  async renderExamCreator() {
    const form = document.getElementById("exam-creator-form");

    // ربط الأحداث مرة واحدة فقط (كان استنساخ النموذج يُفقد حدث تغيير المرحلة ويكرر حقول التاريخ)
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.submitCreatedExam();
      });
      document.getElementById("creator-add-question-btn").addEventListener("click", () => {
        this.addCreatorQuestionBox();
        this.recalculateCreatorGrades();
      });
      document.getElementById("creator-total-grade")?.addEventListener("input", () => this.recalculateCreatorGrades());
      document.querySelectorAll('input[name="grade_distribution"]').forEach((radio) => {
        radio.addEventListener("change", () => this.recalculateCreatorGrades());
      });
      document.getElementById("creator-test-type")?.addEventListener("change", () => this.applyTestTypeGradeRules());
      document.getElementById("creator-cancel-btn").addEventListener("click", () => {
        document.getElementById("tab-exams-btn").click();
      });
      document.getElementById("creator-questions-container").addEventListener("input", (e) => {
        if (e.target.classList.contains("q-points-input")) this.updateCreatorGradeHint();
      });
    }

    form.reset();
    document.getElementById("creator-questions-container").innerHTML = "";
    const stageSelect = document.getElementById("creator-target-stage");
    if (stageSelect) stageSelect.value = "";
    const sectionsBox = document.getElementById("creator-target-section-checkboxes");
    if (sectionsBox) sectionsBox.dataset.stage = "";
    const subjectSelect = document.getElementById("creator-subject");
    if (subjectSelect) subjectSelect.value = "";

    await this.populateTargetDropdowns();

    const now = new Date();
    const dateInput = document.getElementById("creator-date");
    const startTimeInput = document.getElementById("creator-start-time");
    const endTimeInput = document.getElementById("creator-end-time");
    dateInput.value = formatIsoDate(now);
    startTimeInput.value = "20:00";
    endTimeInput.value = "23:59";

    if (typeof window.flatpickr !== "undefined") {
      if (!dateInput._flatpickr) {
        window.flatpickr(dateInput, { locale: "ar", disableMobile: true, altInput: true, altFormat: "F j, Y", dateFormat: "Y-m-d" });
        window.flatpickr(startTimeInput, { enableTime: true, noCalendar: true, dateFormat: "H:i", locale: "ar", disableMobile: true, time_24hr: false });
        window.flatpickr(endTimeInput, { enableTime: true, noCalendar: true, dateFormat: "H:i", locale: "ar", disableMobile: true, time_24hr: false });
      }
      dateInput._flatpickr && dateInput._flatpickr.setDate(dateInput.value, false);
      startTimeInput._flatpickr && startTimeInput._flatpickr.setDate(startTimeInput.value, false);
      endTimeInput._flatpickr && endTimeInput._flatpickr.setDate(endTimeInput.value, false);
    }

    const shuffle = document.getElementById("creator-shuffle-order");
    if (shuffle) shuffle.checked = true;

    this.addCreatorQuestionBox();
    this.applyTestTypeGradeRules();
  }

  isGradedType(type) {
    return GRADED_TYPES.includes(type);
  }

  // امتحانات نصف السنة والنهائي والدور الثاني من 50 درجة دائماً
  applyTestTypeGradeRules() {
    const type = document.getElementById("creator-test-type")?.value || "quiz";
    const totalInput = document.getElementById("creator-total-grade");
    if (totalInput) {
      if (this.isGradedType(type)) {
        totalInput.value = String(COMPONENT_MAX);
        totalInput.readOnly = true;
        totalInput.title = "امتحانات نصف السنة والنهائي والدور الثاني من 50 درجة";
      } else {
        if (totalInput.readOnly) totalInput.value = "100";
        totalInput.readOnly = false;
        totalInput.title = "";
      }
    }
    this.recalculateCreatorGrades();
  }

  creatorTotalGrade() {
    const type = document.getElementById("creator-test-type")?.value || "quiz";
    if (this.isGradedType(type)) return COMPONENT_MAX;
    const v = parseFloat(toLatinDigits(document.getElementById("creator-total-grade")?.value));
    return v > 0 ? v : 100;
  }

  updateCreatorGradeHint() {
    const hint = document.getElementById("grade-dist-hint");
    if (!hint) return;
    const total = this.creatorTotalGrade();
    const sum = Array.from(document.querySelectorAll(".q-points-input")).reduce(
      (acc, input) => acc + (parseFloat(toLatinDigits(input.value)) || 0),
      0,
    );
    const type = document.getElementById("creator-test-type")?.value || "quiz";
    const mustMatch = this.isGradedType(type);
    const ok = Math.abs(sum - total) < 0.01;
    hint.textContent =
      `مجموع درجات الأسئلة: ${formatScore(sum)} من ${formatScore(total)}` +
      (mustMatch ? " (يجب أن يساوي 50 بالضبط لامتحانات نصف السنة والنهائي والدور الثاني)" : "");
    hint.style.color = mustMatch && !ok ? "#dc2626" : "var(--text-muted)";
  }

  addCreatorQuestionBox() {
    const container = document.getElementById("creator-questions-container");
    const idx = container.children.length;

    const box = document.createElement("div");
    box.className = "form-card creator-question-box";
    box.dataset.index = idx;
    box.innerHTML = `
          <div class="form-group">
            <label style="font-weight: 600; color: var(--primary-color);">السؤال رقم ${idx + 1}</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" class="text-input q-text-input" placeholder="أدخل نص السؤال هنا" required style="flex: 1;">
              <input type="number" class="text-input q-points-input" value="1" min="0.01" step="any" style="width: 90px;" placeholder="الدرجة" title="درجة السؤال">
            </div>
            <small class="text-muted" style="font-size:0.75rem;">✔️ ضع علامة على الإجابة الصحيحة (يمكن تحديد أكثر من إجابة صحيحة)</small>
          </div>
          <div class="options-creation-list">
            <div class="option-row">
              <input type="checkbox" class="q-correct-checkbox" name="correct-for-${idx}" value="0" checked title="إجابة صحيحة">
              <input type="text" class="text-input q-option-input" placeholder="الخيار الأول (صحيح)" required>
            </div>
            <div class="option-row">
              <input type="checkbox" class="q-correct-checkbox" name="correct-for-${idx}" value="1" title="إجابة صحيحة">
              <input type="text" class="text-input q-option-input" placeholder="الخيار الثاني" required>
            </div>
          </div>
          <div class="button-bar" style="margin-top: 1rem; font-size: 0.85rem;">
            <button type="button" class="btn-secondary add-opt-btn" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;">➕ إضافة خيار</button>
            <button type="button" class="btn-danger delete-q-btn" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; margin-inline-start: auto; border: none;">🗑️ حذف السؤال</button>
          </div>
        `;

    container.appendChild(box);

    box.querySelector(".delete-q-btn").addEventListener("click", () => {
      if (container.children.length > 1) {
        box.remove();
        this.reindexCreatorQuestions();
        this.recalculateCreatorGrades();
      } else {
        this.showToast("يجب إبقاء سؤال واحد على الأقل.", "info");
      }
    });

    box.querySelector(".add-opt-btn").addEventListener("click", () => {
      const optList = box.querySelector(".options-creation-list");
      const optIdx = optList.children.length;
      const optRow = document.createElement("div");
      optRow.className = "option-row";
      optRow.innerHTML = `
            <input type="checkbox" class="q-correct-checkbox" name="correct-for-${box.dataset.index}" value="${optIdx}" title="إجابة صحيحة">
            <input type="text" class="text-input q-option-input" placeholder="الخيار رقم ${optIdx + 1}" required>
            <button type="button" class="remove-btn">✖</button>
          `;
      optList.appendChild(optRow);

      optRow.querySelector(".remove-btn").addEventListener("click", () => {
        if (optList.children.length > 2) {
          optRow.remove();
          optList.querySelectorAll(".option-row").forEach((row, rIdx) => {
            row.querySelector('input[type="checkbox"]').value = rIdx;
          });
        } else {
          this.showToast("يجب توفير خيارين على الأقل.", "info");
        }
      });
    });
  }

  recalculateCreatorGrades() {
    const distMode =
      document.querySelector('input[name="grade_distribution"]:checked')?.value || "equal";
    const gradeInputs = document.querySelectorAll(".q-points-input");
    const totalGrade = this.creatorTotalGrade();

    if (distMode === "equal") {
      // توزيع دقيق بحيث يكون المجموع مساوياً للدرجة الكلية تماماً (مثلاً 16.67 + 16.67 + 16.66 = 50)
      const parts = splitEvenly(totalGrade, gradeInputs.length);
      gradeInputs.forEach((input, i) => {
        input.value = parts[i];
        input.readOnly = true;
        input.style.backgroundColor = "var(--bg-hover, rgba(0,0,0,0.05))";
        input.style.cursor = "not-allowed";
      });
    } else {
      gradeInputs.forEach((input) => {
        input.readOnly = false;
        input.style.backgroundColor = "";
        input.style.cursor = "text";
      });
    }
    this.updateCreatorGradeHint();
  }

  reindexCreatorQuestions() {
    const container = document.getElementById("creator-questions-container");
    Array.from(container.children).forEach((box, idx) => {
      box.dataset.index = idx;
      box.querySelector("label").textContent = `السؤال رقم ${idx + 1}`;
      box
        .querySelectorAll('input[type="checkbox"].q-correct-checkbox')
        .forEach((chk) => {
          chk.name = `correct-for-${idx}`;
        });
    });
  }

  async submitCreatedExam() {
    if (this._creatingExam) return; // منع الحفظ المزدوج
    const title = document.getElementById("creator-title").value.trim();
    const description = document.getElementById("creator-desc").value.trim();

    let startTime, endTime;
    try {
      const dateVal = document.getElementById("creator-date").value;
      const startVal = document.getElementById("creator-start-time").value;
      const endVal = document.getElementById("creator-end-time").value;

      if (!dateVal || !startVal || !endVal) {
        throw new Error("يجب ملء حقول تاريخ ووقت الامتحان.");
      }

      const startDateTime = new Date(`${dateVal}T${startVal}`);
      let endDateTime = new Date(`${dateVal}T${endVal}`);
      if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
        throw new Error("صيغة التاريخ أو الوقت غير صحيحة.");
      }

      // If end time is earlier than start time, assume it ends the next day
      if (endDateTime <= startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      startTime = startDateTime.toISOString();
      endTime = endDateTime.toISOString();
    } catch (e) {
      this.showError("🚨 خطأ في التواريخ: " + e.message);
      return;
    }

    if (!title) {
      this.showError("عنوان الامتحان مطلوب.");
      return;
    }

    let subject = document.getElementById("creator-subject").value.trim();
    if (!subject) subject = "غير محدد";

    const targetStage = document.getElementById("creator-target-stage").value.trim();
    let targetSections = [];
    document.querySelectorAll(".creator-target-section-cb:checked").forEach((cb) => targetSections.push(cb.value));

    if (!targetStage) {
      this.showError("🚨 يجب تحديد المرحلة المستهدفة للامتحان.");
      return;
    }
    if (targetSections.length === 0) {
      targetSections = ["الكل"];
    }

    const testType = document.getElementById("creator-test-type")?.value || "quiz";
    if (this.isGradedType(testType) && subject === "غير محدد") {
      this.showError("🚨 يجب اختيار المادة لامتحانات نصف السنة والنهائي والدور الثاني (تُحسب النتيجة لكل مادة).");
      return;
    }

    const questions = [];
    let errorMsg = null;

    document.querySelectorAll(".creator-question-box").forEach((box, qIdx) => {
      if (errorMsg) return;
      const questionText = box.querySelector(".q-text-input").value.trim();
      const points = Math.round((parseFloat(toLatinDigits(box.querySelector(".q-points-input").value)) || 0) * 100) / 100;
      if (!(points > 0)) {
        errorMsg = `درجة السؤال رقم ${qIdx + 1} يجب أن تكون أكبر من صفر.`;
        return;
      }

      const optionInputs = box.querySelectorAll(".q-option-input");
      const correctCheckboxes = box.querySelectorAll("input.q-correct-checkbox:checked");
      if (correctCheckboxes.length === 0) {
        errorMsg = `السؤال رقم ${qIdx + 1} لا يحتوي على أي إجابة صحيحة محددة.`;
        return;
      }

      const correctIndicesList = Array.from(correctCheckboxes).map((chk) => parseInt(chk.value, 10));
      const scorePerOption = Math.round((points / correctIndicesList.length) * 10000) / 10000;
      const stamp = Date.now();

      const options = Array.from(optionInputs).map((inp, oIdx) => ({
        id: `opt_${stamp}_${qIdx}_${oIdx}`,
        text: inp.value.trim(),
        isCorrect: correctIndicesList.includes(oIdx),
        score: correctIndicesList.includes(oIdx) ? scorePerOption : 0,
      }));

      questions.push({
        questionText,
        options,
        correctOptionIndex: correctIndicesList[0],
        points,
      });
    });

    if (errorMsg) {
      this.showError(errorMsg);
      return;
    }

    const totalPoints = Math.round(questions.reduce((a, q) => a + q.points, 0) * 100) / 100;
    if (this.isGradedType(testType) && Math.abs(totalPoints - COMPONENT_MAX) > 0.01) {
      this.showError(`🚨 مجموع درجات الأسئلة ${formatScore(totalPoints)} ويجب أن يكون 50 بالضبط لهذا النوع من الامتحانات.`);
      return;
    }

    const shuffleOrder = document.getElementById("creator-shuffle-order")
      ? document.getElementById("creator-shuffle-order").checked
      : true;

    this._creatingExam = true;
    try {
      if (this.isGradedType(testType)) {
        this.showLoading();
        const allExams = await this.creatorController.examRepository.listAllExams();
        this.hideLoading();

        const duplicate = allExams.find((exam) => {
          if (examType(exam) !== testType) return false;
          if (normalizeArabic(exam.subject) !== normalizeArabic(subject)) return false;
          const st = normalizeArabic(exam.target_stage || exam.targetStage);
          if (st !== normalizeArabic(targetStage) && st !== normalizeArabic("الكل")) return false;
          const existingSections = (exam.targetSections || ["الكل"]).map(normalizeArabic);
          const newSections = targetSections.map(normalizeArabic);
          return (
            existingSections.includes(normalizeArabic("الكل")) ||
            newSections.includes(normalizeArabic("الكل")) ||
            existingSections.some((s) => newSections.includes(s))
          );
        });

        if (duplicate) {
          const typeLabel = testType === "final" ? "نهائي" : testType === "half" ? "نصف السنة" : "دور ثانٍ";
          const when = duplicate.startTime ? duplicate.startTime.toLocaleDateString("ar") : "";
          // تنبيه وليس منعاً: في السنة الدراسية التالية يجب السماح بامتحان جديد لنفس المادة.
          if (!confirm(`يوجد امتحان (${typeLabel}) سابق لنفس المادة والمرحلة: "${duplicate.title}" ${when}.\n\nعند احتساب النتائج يُعتمد الامتحان الأحدث فقط. هل تريد إنشاء الامتحان الجديد؟`)) {
            return;
          }
        }
      }

      let createdBy = this.currentUserId;
      if (!createdBy) {
        try {
          const { data } = await window.getSupabaseClient().auth.getUser();
          createdBy = data && data.user ? data.user.id : null;
          this.currentUserId = createdBy;
        } catch (e) {
          createdBy = null;
        }
      }

      await this.creatorController.createNewExam({
        title,
        description,
        start_time: startTime,
        end_time: endTime,
        created_by: createdBy,
        questions,
        subject,
        target_stage: targetStage,
        target_sections: targetSections,
        shuffle_order: shuffleOrder,
        test_type: testType,
      });
    } finally {
      this._creatingExam = false;
      this.hideLoading();
    }
  }

  onExamCreated(exam) {
    this.hideLoading();
    this.invalidateAcademicData();
    const shareUrl = `${window.location.origin}${window.location.pathname}?examId=${exam.id}`;
    this.showNotificationModal({
      title: "🎉 تم إنشاء ونشر الامتحان بنجاح!",
      message: `تم حفظ الامتحان <strong>${escapeHtml(exam.title || "")}</strong> ونشره بنجاح. يمكنك إرسال الرابط المباشر للطلاب:`,
      type: "success",
      badgeValue: shareUrl,
      copyText: shareUrl,
      onConfirm: () => {
        document.getElementById("tab-exams-btn").click();
      },
    });
  }

  // ===================== حل الامتحان =====================

  examAnswersKey(examId) {
    return `mzmz_answers_${examId}_${this.currentStudent ? this.currentStudent.studentPhone : ""}`;
  }

  stopExamTimer() {
    if (this._examTimer) {
      clearInterval(this._examTimer);
      this._examTimer = null;
    }
  }

  renderExamTaker({ exam, questions }) {
    this.hideLoading();
    this.stopExamTimer();
    this.examInProgress = exam.id;
    this.switchView("view-exam-taker");

    const defaultMotto =
      "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۞ حَوّْزَةُ أُمِّ الْبَنِين (عَلَيْهَا السَّلَام) ۞ «طَلَبُ الْعِلْمِ فَرِيضَةٌ»";
    const customMotto = localStorage.getItem("mzmz_exam_header_motto") || defaultMotto;
    const mottoTextEl = document.getElementById("taker-exam-motto-text");
    if (mottoTextEl) mottoTextEl.textContent = customMotto;

    document.getElementById("taker-exam-title").textContent = exam.title;
    document.getElementById("taker-exam-desc").textContent = exam.description || "يرجى الإجابة بدقة.";

    const totalPoints = Math.round(questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0) * 100) / 100;
    const headerBadge = document.getElementById("taker-student-badge");
    headerBadge.textContent = `الطالب: ${this.currentStudent.studentName} (عضو رقم: ${this.currentStudent.memberNumber || ""})`;
    const totalSpan = document.createElement("span");
    totalSpan.style.cssText = "margin-right:15px; color:#10b981;";
    totalSpan.textContent = ` | الدرجة الكلية: ${formatScore(totalPoints)}`;
    headerBadge.appendChild(totalSpan);

    // ترتيب عشوائي ثابت لكل محاولة (لا يتغير عند إعادة تحميل الصفحة)
    const attemptKey = `mzmz_attempt_${exam.id}_${this.currentStudent.studentPhone}`;
    let attemptId = sessionStorage.getItem(attemptKey);
    if (!attemptId) {
      attemptId = "attempt_" + Math.random().toString(36).substring(2);
      sessionStorage.setItem(attemptKey, attemptId);
    }
    const hashString = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
      }
      return hash;
    };
    const mulberry32 = (a) => () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randomFunc = mulberry32(hashString(attemptId));
    const shuffleArray = (array) => {
      const arr = [...array];
      for (let cur = arr.length - 1; cur > 0; cur--) {
        const r = Math.floor(randomFunc() * (cur + 1));
        [arr[cur], arr[r]] = [arr[r], arr[cur]];
      }
      return arr;
    };

    const shouldShuffle = exam.shuffleOrder !== false && exam.shuffle_order !== false;
    const displayedQuestions = shouldShuffle ? shuffleArray(questions) : [...questions];

    // استعادة الإجابات المحفوظة محلياً (في حال انقطاع الإنترنت أو إعادة تحميل الصفحة)
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(this.examAnswersKey(exam.id)) || "{}") || {};
    } catch (e) {
      saved = {};
    }

    // استنساخ النموذج أولاً لإزالة أحداث الامتحانات السابقة، ثم العمل على العناصر الجديدة فقط
    const oldForm = document.getElementById("exam-taker-form");
    const newForm = oldForm.cloneNode(true);
    oldForm.replaceWith(newForm);
    const container = newForm.querySelector("#taker-questions-container");
    container.innerHTML = displayedQuestions
      .map((q, idx) => {
        const inputType = q.multi ? "checkbox" : "radio";
        const indexed = q.options.map((opt, originalIndex) => ({ opt, originalIndex }));
        const displayedOptions = shouldShuffle ? shuffleArray(indexed) : indexed;
        const savedSel = selectedIndices(saved[q.id]);

        return `
            <div class="form-card" style="margin-bottom: 1.5rem;">
              <h3 style="font-weight: 500; font-size: 1.15rem; margin-bottom: 1rem;">
                <span style="color: var(--primary-color); font-weight: 600;">س${idx + 1}:</span> ${escapeHtml(q.questionText)}
                <span style="font-size:0.8rem; color: var(--text-muted); font-weight:600;">(${formatScore(q.points)} درجة)</span>
              </h3>
              ${q.multi ? `<p style="margin:-0.5rem 0 0.75rem; font-size:0.85rem; color:#b45309; font-weight:600;">☑️ هذا السؤال له أكثر من إجابة صحيحة: اختاري كل الإجابات الصحيحة (اختيار إجابة خاطئة يلغي درجة السؤال).</p>` : ""}
              <div class="options-container" data-question-id="${escapeHtml(q.id)}">
                ${displayedOptions
                  .map(({ opt, originalIndex }) => {
                    const checked = savedSel.includes(originalIndex);
                    return `
                  <label class="option-choice${checked ? " selected" : ""}" data-choice="${escapeHtml(q.id)}-${originalIndex}">
                    <input type="${inputType}" name="answer-for-${escapeHtml(q.id)}" value="${originalIndex}"${checked ? " checked" : ""}>
                    <span>${escapeHtml(optionText(opt))}</span>
                  </label>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `;
      })
      .join("");

    const collectAnswers = () => {
      const answers = {};
      displayedQuestions.forEach((q) => {
        const checkedInputs = container.querySelectorAll(`input[name="answer-for-${CSS.escape(q.id)}"]:checked`);
        if (checkedInputs.length === 0) return;
        const values = Array.from(checkedInputs).map((inp) => parseInt(inp.value, 10));
        answers[q.id] = q.multi ? values : values[0];
      });
      return answers;
    };

    container.onchange = (e) => {
      const input = e.target;
      if (!input.name || !input.name.startsWith("answer-for-")) return;
      const group = input.closest(".options-container");
      group.querySelectorAll("label.option-choice").forEach((lbl) => {
        const inp = lbl.querySelector("input");
        lbl.classList.toggle("selected", inp.checked);
      });
      try {
        localStorage.setItem(this.examAnswersKey(exam.id), JSON.stringify(collectAnswers()));
      } catch (err) {
        console.warn("Could not save answers locally:", err);
      }
    };

    // عداد الوقت المتبقي والتسليم التلقائي عند انتهاء الوقت
    let countdown = newForm.querySelector("#taker-countdown");
    if (!countdown) {
      countdown = document.createElement("div");
      countdown.id = "taker-countdown";
      countdown.style.cssText =
        "position: sticky; top: 0; z-index: 50; margin-bottom: 1rem; padding: 0.6rem 1rem; border-radius: 10px; text-align: center; font-weight: 800; background: var(--primary-light); color: var(--primary-color); border: 1px solid var(--border-color);";
      container.parentNode.insertBefore(countdown, container);
    }

    const submitBtn = newForm.querySelector('button[type="submit"]');
    // النموذج المستنسخ يحمل حالة "معطّل" من تسليم الامتحان السابق
    if (submitBtn) submitBtn.disabled = false;
    let submitting = false;

    const doSubmit = async (auto = false) => {
      if (submitting) return;
      const answers = collectAnswers();
      if (!auto) {
        const unanswered = displayedQuestions.length - Object.keys(answers).length;
        if (unanswered > 0 && !confirm(`لم تُجيبي على ${unanswered} سؤال. هل تريدين تسليم الامتحان الآن؟`)) {
          return;
        }
      }
      submitting = true;
      if (submitBtn) submitBtn.disabled = true;
      const ok = await this.takerController.submitAnswers({
        examId: exam.id,
        studentName: this.currentStudent.studentName,
        studentPhone: this.currentStudent.studentPhone,
        studentNumber: this.currentStudent.memberNumber,
        loginName: this.currentStudent.loginName,
        answers,
      });
      if (!ok) {
        submitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    };

    newForm.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit(false);
    });

    const endMs = exam.endTime ? exam.endTime.getTime() : null;
    const tick = () => {
      if (!endMs) {
        countdown.style.display = "none";
        return;
      }
      countdown.style.display = "block";
      const left = endMs - Date.now();
      if (left <= 0) {
        countdown.textContent = "⏰ انتهى الوقت - جاري تسليم إجاباتك تلقائياً...";
        this.stopExamTimer();
        doSubmit(true);
        return;
      }
      const totalSec = Math.floor(left / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad = (n) => String(n).padStart(2, "0");
      countdown.textContent = `⏳ الوقت المتبقي: ${h > 0 ? pad(h) + ":" : ""}${pad(m)}:${pad(s)}`;
      countdown.style.background = left < 5 * 60 * 1000 ? "#fee2e2" : "var(--primary-light)";
      countdown.style.color = left < 5 * 60 * 1000 ? "#991b1b" : "var(--primary-color)";
    };
    tick();
    if (endMs) this._examTimer = setInterval(tick, 1000);
  }

  onExamSubmitted(examId) {
    this.hideLoading();
    this.stopExamTimer();
    this.examInProgress = null;
    try {
      localStorage.removeItem(this.examAnswersKey(examId));
    } catch (e) {
      /* ignore */
    }
    this.currentExamId = null;
    // إزالة رابط الامتحان من العنوان حتى لا يُعاد فتحه عند تحديث الصفحة
    if (window.location.search && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    this.switchView("view-success");
  }


  onExamNotStarted(exam) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "لم يبدأ الامتحان بعد";
    document.getElementById("exam-message-body").innerHTML = `
          عذراً، هذا الامتحان غير متاح للحل حالياً.<br>
          ⏰ سيبدأ في: <strong>${escapeHtml(exam.startTime ? exam.startTime.toLocaleString("ar") : "")}</strong>
        `;
  }

  onExamEnded(exam) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "انتهى وقت الامتحان";
    document.getElementById("exam-message-body").innerHTML = `
          عذراً، لقد انتهى الوقت المحدد لتقديم الإجابات لهذا الامتحان.<br>
          ⏰ انتهى في: <strong>${escapeHtml(exam.endTime ? exam.endTime.toLocaleString("ar") : "")}</strong>
        `;
  }

  onExamNotFound() {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "الامتحان غير موجود";
    document.getElementById("exam-message-body").textContent =
      "عذراً، الرابط غير صحيح أو تم حذف هذا الامتحان من قبل المسؤول.";
  }

  onExamAlreadyTaken(exam, existingSub) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "⚠️ تم أداء هذا الامتحان مسبقاً";
    const studentName = this.currentStudent
      ? this.currentStudent.studentName
      : "";
    document.getElementById("exam-message-body").innerHTML = `
          <div style="text-align: center; padding: 1rem 0;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
            <h3 style="color: var(--primary-color); margin: 0 0 0.5rem 0;">أهلاً بك ${escapeHtml(studentName)}!</h3>
            <p style="font-size: 1.05rem; color: var(--text-main); margin-bottom: 1rem;">
              لقد قمت بأداء وتسليم إجابات امتحان <strong>"${escapeHtml(exam.title)}"</strong> بنجاح مسبقاً.
            </p>
            <div style="background: var(--primary-light); border: 2px solid var(--primary-color); border-radius: 12px; padding: 1rem; margin: 1rem 0; box-shadow: var(--shadow-sm);">
              <div style="font-size: 1.1rem; color: var(--primary-color); font-weight: bold; margin-bottom: 8px;">تم استلام إجاباتك بنجاح ✅</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">📅 تاريخ التسليم: ${escapeHtml(existingSub.submitted_at ? new Date(existingSub.submitted_at).toLocaleString("ar") : "—")}</div>
            </div>
            <p style="font-size: 0.85rem; color: #dc2626; font-weight: bold; margin-top: 1rem;">
              🔒 تنبيه: لا يُسمح بإعادة تقديم أو تكرار الإجابات للامتحان نفسه.
            </p>
          </div>
        `;
  }

  // ===================== نتائج امتحان =====================

  populateStageSectionFilters(stageSelectId, sectionSelectId) {
    const stages = [...((this._cachedStructureSettings && this._cachedStructureSettings.stages) || [])];
    const students = (this.academicCache && this.academicCache.students) || [];
    students.forEach((s) => {
      if (s.status === "approved" && s.stage && !stages.includes(s.stage)) stages.push(s.stage);
    });
    const sections = [];
    const addSection = (sec) => {
      if (sec && !sections.includes(sec)) sections.push(sec);
    };
    stages.forEach((st) => this.getSectionsForStage(st).forEach(addSection));
    students.forEach((s) => s.status === "approved" && addSection(s.qualification));

    const fill = (id, values, allLabel, labelFn) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = `<option value="">${allLabel}</option>` +
        values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(labelFn(v))}</option>`).join("");
      sel.value = values.includes(prev) ? prev : "";
    };
    fill(stageSelectId, stages, "جميع المراحل", (v) => v);
    fill(sectionSelectId, sections, "جميع الشعب", (v) => `شعبة ${v}`);
  }

  async renderExamResults({ exam, questions, submissions }) {
    try {
      await this.loadAcademicData();
    } catch (e) {
      console.warn("Could not load students for results filters:", e);
    }
    this.hideLoading();
    this.switchView("view-exam-results");
    document.getElementById("results-exam-title").textContent = `نتائج: ${exam.title}`;
    this.populateStageSectionFilters("results-stage-filter", "results-qual-filter");

    this.currentExamViewData = { exam, questions, submissions };
    this.renderFilteredExamResults();
  }

  renderFilteredExamResults() {
    const data = this.currentExamViewData;
    if (!data) return;
    const { exam, questions, submissions } = data;
    const container = document.getElementById("results-table-container");

    const stageFilter = document.getElementById("results-stage-filter")?.value || "";
    const qualFilter = document.getElementById("results-qual-filter")?.value || "";
    const students = (this.academicCache && this.academicCache.students) || [];
    const findStudent = (sub) =>
      students.find((s) => s.student_phone && s.student_phone === sub.studentPhone) ||
      (!sub.studentPhone ? students.find((s) => s.student_name === sub.studentName) : null);

    let filteredSubmissions = submissions.map((sub) => ({ sub, student: findStudent(sub) }));
    if (stageFilter || qualFilter) {
      filteredSubmissions = filteredSubmissions.filter(({ student }) => {
        if (!student) return false;
        if (stageFilter && normalizeArabic(student.stage) !== normalizeArabic(stageFilter)) return false;
        if (qualFilter && normalizeArabic(student.qualification) !== normalizeArabic(qualFilter)) return false;
        return true;
      });
    }

    filteredSubmissions.sort((a, b) => {
      const stageA = a.student?.stage || "";
      const stageB = b.student?.stage || "";
      if (stageA !== stageB) return stageA.localeCompare(stageB, "ar");
      const qualA = a.student?.qualification || "";
      const qualB = b.student?.qualification || "";
      if (qualA !== qualB) return qualA.localeCompare(qualB, "ar");
      return (a.sub.studentName || "").localeCompare(b.sub.studentName || "", "ar");
    });

    if (filteredSubmissions.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 2rem 0;">لا توجد تسليمات مسجلة بهذه الفلاتر.</p>`;
      return;
    }

    const totalPoints = Math.round(questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0) * 100) / 100;
    const questionHeaders = questions.map((q, idx) => `<th>س${idx + 1}</th>`).join("");
    const rows = filteredSubmissions
      .map(({ sub, student }) => {
        const dateStr = sub.submittedAt ? sub.submittedAt.toLocaleString("ar") : "—";
        const answersCells = questions
          .map((q) => {
            const ans = sub.answers ? sub.answers[q.id] : undefined;
            if (selectedIndices(ans).length === 0) return `<td style="color: var(--text-muted);">-</td>`;
            const earned = gradeAnswer(q, ans);
            const full = earned >= (Number(q.points) || 1) - 0.001;
            const icon = full ? "✅" : earned > 0 ? "◐" : "❌";
            const color = full ? "green" : earned > 0 ? "#d97706" : "red";
            return `<td style="color: ${color}; font-weight: bold;" title="${formatScore(earned)} / ${formatScore(q.points)}">${icon}</td>`;
          })
          .join("");
        const where = student ? `${student.stage || ""} / ${student.qualification || ""}` : "—";

        return `
            <tr>
              <td><strong>${escapeHtml(sub.studentName)}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(where)}</div></td>
              <td>${escapeHtml(sub.studentPhone || "-")}</td>
              <td style="font-weight: bold; color: var(--primary-color); white-space: nowrap;">${formatScore(sub.score)} / ${formatScore(totalPoints)}</td>
              ${answersCells}
              <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(dateStr)}</td>
              <td class="no-print">
                <button onclick="window.openExamDetails(${jsArg(exam.id)}, ${jsArg(sub.studentPhone || "")}, ${jsArg(sub.studentName || "")})" class="btn-primary" style="padding: 0.3rem 0.5rem; font-size: 0.8rem; margin-left: 0.5rem;">مراجعة الورقة</button>
                <button onclick="window.app.creatorController.deleteExamResult(${jsArg(sub.id)}, ${jsArg(exam.id)})" class="btn-danger" style="padding: 0.3rem 0.5rem; font-size: 0.8rem;">حذف</button>
              </td>
            </tr>
          `;
      })
      .join("");

    container.innerHTML = `
          <p class="text-muted" style="font-size:0.85rem;">عدد التسليمات: ${filteredSubmissions.length} | ✅ صحيحة، ◐ صحيحة جزئياً، ❌ خاطئة، - بدون إجابة</p>
          <table class="results-table">
            <thead>
              <tr>
                <th>اسم الطالب</th>
                <th>رقم الهاتف</th>
                <th>النتيجة</th>
                ${questionHeaders}
                <th>وقت التسليم</th>
                <th class="no-print">إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
  }

  toggleCreatorCustomSubject(val) {
    const el = document.getElementById("creator-custom-subject-group");
    if (el) el.style.display = val === "custom" ? "block" : "none";
  }

  closeExamDetailsModal() {
    document.getElementById("student-exam-details-modal").classList.remove("active");
  }

  // ورقة الإجابة التفصيلية للمشرف
  async openExamDetails(examId, studentPhone, studentName) {
    this.showLoading();
    try {
      const repo = this.creatorController.examRepository;
      const subRepo = this.creatorController.submissionRepository;

      const exam = await repo.getExamById(examId);
      const questions = (await repo.getAdminExamQuestions(examId)).map((q) => new window.Question(q));
      const submissions = await subRepo.getSubmissionsByExam(examId);

      const phone = (studentPhone || "").trim();
      const sub = phone
        ? submissions.find((s) => (s.student_phone || "").trim() === phone)
        : submissions.find((s) => (s.student_name || "").trim() === (studentName || "").trim());

      this.hideLoading();

      if (!exam || !sub) {
        this.showError("عذراً، لم يتم العثور على ورقة الإجابة التفصيلية.");
        return;
      }

      document.getElementById("details-student-name").textContent = sub.student_name || studentName;
      document.getElementById("details-student-phone").textContent = sub.student_phone || "غير متوفر";
      document.getElementById("details-exam-title").textContent = exam.title;

      const totalPoints = Math.round(questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0) * 100) / 100;
      const scorePercent = totalPoints > 0 ? Math.round((Number(sub.score) / totalPoints) * 100) : 0;
      document.getElementById("details-score-badge").innerHTML =
        `<span style="color:var(--primary-color);">${formatScore(sub.score)} / ${formatScore(totalPoints)}</span> (${scorePercent}%)`;

      const container = document.getElementById("details-questions-container");
      container.innerHTML = "";
      const answers = sub.answers || {};

      questions.forEach((q, qIdx) => {
        const selected = selectedIndices(answers[q.id]);
        const correct = correctIndices(q);
        const earned = gradeAnswer(q, answers[q.id]);
        const full = earned >= (Number(q.points) || 1) - 0.001;
        const stateColor = full ? "#2e7d32" : earned > 0 ? "#b45309" : "#c62828";

        const card = document.createElement("div");
        card.className = "review-q-card";
        card.style.borderRight = `4px solid ${full ? "#4caf50" : earned > 0 ? "#f59e0b" : "#f44336"}`;

        card.innerHTML = `
            <div style="font-weight:600; margin-bottom:0.75rem;">
              <span style="color:${stateColor}">السؤال ${qIdx + 1}: </span> ${escapeHtml(q.questionText)}
              <span style="font-size:0.8rem; color:${stateColor};">(${formatScore(earned)} / ${formatScore(q.points)})</span>
              ${selected.length === 0 ? `<span class="badge danger" style="font-size:10px;">بدون إجابة</span>` : ""}
            </div>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              ${q.options
                .map((opt, oIdx) => {
                  let borderStyle = "1px solid var(--border-color)";
                  let bgColor = "transparent";
                  let badge = "";
                  const isSelected = selected.includes(oIdx);
                  const isModel = correct.includes(oIdx);

                  if (isModel) {
                    borderStyle = "2px dashed #4caf50";
                    badge = ` <span style="font-size:11px; font-weight:700; color:#2e7d32; margin-inline-start:auto;">🎯 إجابة نموذجية</span>`;
                  }
                  if (isSelected) {
                    if (isModel) {
                      bgColor = "#e8f5e9";
                      borderStyle = "1px solid #4caf50";
                      badge += ` <span class="badge success" style="font-size:9px; margin-inline-start:0.5rem;">إجابتها ✅</span>`;
                    } else {
                      bgColor = "#ffebee";
                      borderStyle = "1px solid #f44336";
                      badge += ` <span class="badge danger" style="font-size:9px; margin-inline-start:0.5rem;">إجابتها ❌</span>`;
                    }
                  }

                  return `
                  <div class="review-option-row" style="background:${bgColor}; border:${borderStyle}; font-weight:${isSelected ? "600" : "normal"};">
                    <span style="width:20px; height:20px; border-radius:50%; border:1px solid var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:11px; background:${isSelected ? "var(--primary-color)" : "#fff"}; color:${isSelected ? "#fff" : "#111"};">
                      ${String.fromCharCode(65 + oIdx)}
                    </span>
                    <span>${escapeHtml(optionText(opt))}</span>
                    ${badge}
                  </div>
                `;
                })
                .join("")}
            </div>
          `;
        container.appendChild(card);
      });

      document.getElementById("student-exam-details-modal").classList.add("active");
    } catch (e) {
      this.hideLoading();
      this.showError("فشل فتح تفاصيل ورقة الإجابة: " + e.message);
    }
  }

  // ===================== السجل التراكمي =====================

  async renderStudentsCumulativeRegistry() {
    const container = document.getElementById("students-cumulative-registry-container");
    this.showLoading();

    try {
      const data = await this.loadAcademicData();
      const approvedStudents = data.students.filter((s) => s.status === "approved");
      this.populateStageSectionFilters("registry-stage-filter", "registry-qual-filter");

      if (approvedStudents.length === 0) {
        this.currentRegistry = {};
        container.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا يوجد طلاب معتمدين بعد.</p>`;
        return;
      }

      const registry = {};
      const examsById = new Map(data.exams.map((e) => [e.id, e]));

      approvedStudents.forEach((stud) => {
        const subs = data.subsByPhone.get(stud.student_phone) || [];
        const submittedIds = new Set(subs.map((s) => s.exam_id));
        const history = [];

        subs.forEach((sub) => {
          const exam = examsById.get(sub.exam_id);
          const max = data.maxScores[sub.exam_id];
          history.push({
            examId: sub.exam_id,
            examTitle: exam ? exam.title : sub.examTitle || "امتحان محذوف",
            subject: exam ? exam.subject || "غير محدد" : sub.subject || "غير محدد",
            testType: exam ? examType(exam) : "quiz",
            score: Number(sub.score) || 0,
            max: max || null,
            pct: percentOf(sub.score, max),
            status: "present",
            submittedAt: sub.submitted_at,
          });
        });

        // الغياب: امتحانات منتهية موجهة للطالبة ولم تسلمها (الدور الثاني اختياري حسب الأهلية فلا يُحسب غياباً)
        data.exams.forEach((exam) => {
          if (submittedIds.has(exam.id) || examType(exam) === "second_session") return;
          if (!exam.isEnded() || !examTargetsStudent(exam, stud.stage, stud.qualification)) return;
          history.push({
            examId: exam.id,
            examTitle: exam.title,
            subject: exam.subject || "غير محدد",
            testType: examType(exam),
            score: 0,
            max: data.maxScores[exam.id] || null,
            pct: 0,
            status: "absent",
            submittedAt: null,
          });
        });

        history.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

        registry[stud.student_phone] = {
          id: stud.id,
          raw: stud,
          name: stud.student_name,
          surname: stud.surname || "",
          phone: stud.student_phone,
          hawza_number: stud.member_number || stud.hawza_number || "غير محدد",
          city: stud.province || stud.city || "—",
          qualification: stud.qualification || "",
          birthdate: stud.birthdate || "—",
          telegram: stud.telegram_user || "—",
          stage: stud.stage || "",
          social_status: stud.social_status || "—",
          study_type: stud.study_type || "—",
          is_student: stud.is_student || "—",
          submissions: history,
          results: this.studentResults(stud),
        };
      });

      this.currentRegistry = registry;
      this.filterRegistry();
    } catch (e) {
      this.showError("حدث خطأ أثناء تحميل السجل التراكمي: " + e.message);
    } finally {
      this.hideLoading();
    }
  }

  renderFilteredRegistry(students) {
    const container = document.getElementById("students-cumulative-registry-container");
    if (!container) return;

    if (students.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا توجد بيانات مطابقة.</p>`;
      return;
    }

    container.innerHTML = students
      .map((student) => {
        const subs = student.submissions;
        const r = student.results;
        const avatarColor = subs.length > 0 ? "var(--primary-color)" : "var(--text-muted)";
        const passed = r && r.overall === "pass";
        const scoreClass = passed ? "compact-stat-pass" : "compact-stat-fail";
        const scoreIcon = passed ? "⭐" : r && r.overall === "pending" ? "⏳" : "⚠️";
        const scoreText = r
          ? `${OVERALL_LABELS[r.overall]}${r.average !== null ? ` ${formatScore(r.average)}` : ""}`
          : "—";

        const stageLabel = student.stage || "المرحلة غير محددة";
        const qualLabel = student.qualification ? `شعبة ${student.qualification}` : "";
        const hawzaPill =
          student.hawza_number && student.hawza_number !== "غير محدد"
            ? `<span class="compact-pill compact-pill-gold">#${escapeHtml(student.hawza_number)}</span>`
            : "";
        const telegramPill =
          student.telegram && student.telegram !== "—"
            ? `<span class="compact-pill" title="تليجرام">✈️ ${escapeHtml(student.telegram)}</span>`
            : "";

        return `
          <div class="compact-student-card" style="border-right: 4px solid ${avatarColor};">
            <div class="compact-card-header">
              <div class="compact-card-user">
                <div class="compact-avatar" style="background:${avatarColor};">
                  ${escapeHtml((student.name || "?").charAt(0))}
                </div>
                <div class="compact-card-name-group">
                  <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                    <span class="compact-card-name">👤 ${escapeHtml(student.name)}</span>
                    ${hawzaPill}
                  </div>
                  <div class="compact-pills-row" style="margin-top:2px;">
                    <span class="compact-pill">🏛️ ${escapeHtml(stageLabel)}</span>
                    ${qualLabel ? `<span class="compact-pill">🔖 ${escapeHtml(qualLabel)}</span>` : ""}
                  </div>
                </div>
              </div>

              <div class="compact-stats-row">
                <span class="compact-stat-chip compact-stat-neutral" title="عدد الامتحانات">
                  📝 ${subs.length}
                </span>
                <span class="compact-stat-chip ${scoreClass}" title="نتيجة المرحلة الحالية (معدل المواد من 100)">
                  ${scoreIcon} ${escapeHtml(scoreText)}
                </span>
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.4rem; font-size:0.75rem; color:var(--text-muted); padding:0 2px;">
              <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span>📞 <a href="tel:${escapeHtml(student.phone)}" style="color:inherit; text-decoration:none; font-weight:600;">${escapeHtml(student.phone)}</a></span>
                ${telegramPill}
              </div>
              ${r && r.requiredCount ? `<span style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">المواد المجتازة: ${r.passed}/${r.requiredCount}</span>` : ""}
            </div>

            <div class="compact-card-actions">
              <button onclick="window.app.openStudentProfile(${jsArg(student.phone)})" class="btn-primary compact-action-btn">
                📖 الملف
              </button>
              <button onclick="window.app.showStudentAttendance(${jsArg(student.id)}, ${jsArg(student.name)}, ${jsArg(student.phone)})" class="btn-secondary compact-action-btn">
                📅 الحضور
              </button>
              <button onclick="window.app.openCertificateModal(${jsArg(student.phone)})" class="btn-primary compact-action-btn" style="background: linear-gradient(135deg, #d97706, #b45309); border: none; font-weight: 700;">
                🎓 الشهادة
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  getFilteredRegistryStudents() {
    const searchQuery = normalizeArabic(document.getElementById("registry-search-input")?.value || "");
    const stageFilter = document.getElementById("registry-stage-filter")?.value || "";
    const qualFilter = document.getElementById("registry-qual-filter")?.value || "";

    let students = Object.values(this.currentRegistry || {});
    if (searchQuery) {
      const digits = toLatinDigits(searchQuery);
      students = students.filter(
        (s) =>
          normalizeArabic(`${s.name} ${s.surname || ""}`).includes(searchQuery) ||
          (s.phone || "").includes(digits) ||
          String(s.hawza_number).includes(digits),
      );
    }
    if (stageFilter) {
      students = students.filter((s) => normalizeArabic(s.stage) === normalizeArabic(stageFilter));
    }
    if (qualFilter) {
      students = students.filter((s) => normalizeArabic(s.qualification) === normalizeArabic(qualFilter));
    }
    return students;
  }

  filterRegistry() {
    if (!this.currentRegistry) return;
    const students = this.getFilteredRegistryStudents();
    students.sort((a, b) => b.submissions.length - a.submissions.length);
    this.renderFilteredRegistry(students);
  }

  exportRegistryToCSV() {
    if (!this.currentRegistry) {
      this.showError("لا توجد بيانات للتصدير.");
      return;
    }

    const students = this.getFilteredRegistryStudents();
    if (students.length === 0) {
      this.showError("لا توجد بيانات للتصدير.");
      return;
    }

    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    let csvContent = "﻿"; // UTF-8 BOM لضمان عمل اللغة العربية في الإكسل
    csvContent += ["الاسم", "الرقم الحوزوي", "رقم الهاتف", "المرحلة", "الشعبة", "عدد الامتحانات", "المواد المجتازة", "عدد المواد", "معدل المواد (100)", "النتيجة"]
      .map(cell)
      .join(",") + "\n";

    students.forEach((s) => {
      const r = s.results;
      csvContent += [
        `${s.name} ${s.surname || ""}`.trim(),
        s.hawza_number,
        s.phone,
        s.stage,
        s.qualification,
        s.submissions.filter((x) => x.status === "present").length,
        r ? r.passed : "",
        r ? r.requiredCount : "",
        r && r.average !== null ? formatScore(r.average) : "",
        r ? OVERALL_LABELS[r.overall] : "",
      ].map(cell).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `سجل_الطلاب_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async showStudentAttendance(studentId, studentName, studentPhone = null) {
    this.showLoading();
    try {
      const supabase = window.getSupabaseClient();
      let query = supabase.from("attendance_records").select("*");
      if (studentPhone && /^\d+$/.test(studentPhone)) {
        query = query.or(`student_phone.eq.${studentPhone},student_id.eq.${studentId}`);
      } else {
        query = query.eq("student_id", studentId);
      }
      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw new Error(error.message);
      const studentRecords = data || [];

      const totalDays = studentRecords.length;
      const lastDays = studentRecords.slice(0, 10).map((r) => escapeHtml(r.date)).join(" ، ");

      this.hideLoading();
      this.showNotificationModal({
        title: `سجل الحضور: ${studentName}`,
        type: "info",
        message: `✅ عدد أيام الحضور المسجلة: <strong>${totalDays}</strong> يوم` +
          (totalDays > 0
            ? `<br><br>📅 آخر التواريخ المسجلة:<br>${lastDays}`
            : `<br><br>❌ لم يتم تسجيل أي حضور لهذه الطالبة بعد.`),
      });
    } catch (e) {
      console.error(e);
      this.showError("تعذر جلب سجل الحضور للطالبة: " + (e.message || e));
    } finally {
      this.hideLoading();
    }
  }

  // ===================== ملف الطالبة =====================

  renderSubjectResultsTable(results) {
    if (!results || results.requiredCount === 0) {
      return `<p class="text-muted" style="margin:0;">لا توجد مواد مقيّمة لهذه المرحلة بعد (امتحانات نصف السنة والنهائي).</p>`;
    }
    const comp = (c) => {
      if (c.state === "done") return formatScore(c.score);
      if (c.state === "absent") return `<span style="color:#dc2626;">غائبة (0)</span>`;
      if (c.state === "upcoming") return `<span class="text-muted">لم يُعقد بعد</span>`;
      return `<span class="text-muted">—</span>`;
    };
    const statusColor = { pass: "#15803d", retake: "#b45309", fail: "#dc2626", pending: "#4f46e5" };
    return `
      <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; text-align:center; font-size:0.9rem;">
        <thead>
          <tr style="background: var(--bg-hover);">
            <th style="padding:0.5rem; text-align:right;">المادة</th>
            <th style="padding:0.5rem;">نصف السنة /50</th>
            <th style="padding:0.5rem;">النهائي /50</th>
            <th style="padding:0.5rem;">الدور الثاني /50</th>
            <th style="padding:0.5rem;">المجموع /100</th>
            <th style="padding:0.5rem;">الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${results.subjects
            .map(
              (s) => `
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.5rem; text-align:right; font-weight:700;">${escapeHtml(s.subject)}</td>
              <td style="padding:0.5rem;">${comp(s.half)}</td>
              <td style="padding:0.5rem;">${comp(s.final)}</td>
              <td style="padding:0.5rem;">${s.second.state === "none" ? "—" : comp(s.second)}</td>
              <td style="padding:0.5rem; font-weight:800;">${s.total === null ? "—" : formatScore(s.total)}</td>
              <td style="padding:0.5rem; font-weight:700; color:${statusColor[s.status] || "inherit"};">${escapeHtml(SUBJECT_STATUS_LABELS[s.status] || s.status)}${s.viaSecond ? " (بالدور الثاني)" : ""}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      </div>`;
  }

  openStudentProfile(phone) {
    if (!this.currentRegistry || !this.currentRegistry[phone]) {
      this.showError("لم يتم العثور على بيانات الطالب.");
      return;
    }

    const student = this.currentRegistry[phone];
    this.currentProfilePhone = phone;
    const subs = student.submissions;
    const results = student.results;
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText("sp-avatar", (student.name || "?").charAt(0));
    setText("sp-name", `${student.name} ${student.surname || ""}`.trim());
    setText("sp-stage", `🏛️ المرحلة: ${student.stage || "—"}`);
    setText("sp-qual", `🔖 الشعبة: ${student.qualification || "—"}`);
    setText("sp-phone", `🔢 الرقم الحوزوي: ${student.hawza_number || "—"}`);
    setText("sp-whatsapp", `📞 واتساب: ${student.phone}`);
    setText("sp-city", `📍 المدينة: ${student.city || "—"}`);
    setText("sp-birthdate", `🎂 المواليد: ${student.birthdate || "—"}`);
    setText("sp-marital", `💍 الحالة: ${student.social_status || "—"}`);
    setText("sp-study", `📚 الدراسة: ${student.study_type || "—"}`);
    setText("sp-isstudent", `🎓 طالبة: ${student.is_student || "—"}`);

    const present = subs.filter((s) => s.status === "present");
    setText("sp-total-exams", String(present.length));
    const pcts = subs.map((s) => s.pct).filter((p) => p !== null && p !== undefined);
    setText("sp-avg-score", pcts.length ? `${formatScore(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%` : "—");

    const tableBox = document.getElementById("sp-subject-results");
    if (tableBox) tableBox.innerHTML = this.renderSubjectResultsTable(results);
    setText("sp-success-score", results && results.average !== null ? formatScore(results.average) : "—");

    const elStatus = document.getElementById("sp-success-status");
    if (elStatus) {
      const bg = { pass: "#10b981", retake: "#d97706", fail: "#ef4444", pending: "var(--accent-gold)", none: "#64748b" };
      const overall = results ? results.overall : "none";
      elStatus.style.background = bg[overall];
      elStatus.textContent = OVERALL_LABELS[overall];
    }

    const subjects = [...new Set(subs.map((s) => s.subject).filter((s) => s && s !== "غير محدد"))];
    const subjectsEl = document.getElementById("sp-subjects");
    if (subjectsEl) {
      subjectsEl.innerHTML =
        subjects
          .map(
            (s) =>
              `<span style="background:var(--primary-light); color:var(--primary-color); font-size:0.85rem; font-weight:700; padding:4px 12px; border-radius:20px; border:1.5px solid var(--primary-color);">${escapeHtml(s)}</span>`,
          )
          .join(" ") || '<span class="text-muted">لم يدرس أي مادة بعد</span>';
    }

    const typeBadge = {
      quiz: ["quiz", "📝 كويز"],
      half: ["half", "⏳ نصف السنة"],
      final: ["final", "🎓 النهائي"],
      second_session: ["warning", "🔄 الدور الثاني"],
    };
    const tbody = document.getElementById("sp-exams-table-body");
    if (subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem;" class="text-muted">لم تؤدِّ هذه الطالبة أي امتحان بعد.</td></tr>`;
    } else {
      tbody.innerHTML = subs
        .map((r) => {
          const dateStr = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("ar") : "—";
          const isAbsent = r.status === "absent";
          const [badgeClass, badgeText] = typeBadge[r.testType] || typeBadge.quiz;
          const scoreText = `${formatScore(r.score)}${r.max ? ` / ${formatScore(r.max)}` : ""}`;

          return `
            <tr style="border-bottom: 1px solid var(--border-color); ${isAbsent ? "background-color: rgba(239, 68, 68, 0.08);" : ""}">
              <td style="padding: 1rem; text-align: right;">
                <div style="font-weight: bold;">${escapeHtml(r.examTitle)} ${isAbsent ? '<span style="color:red; font-size:0.8rem;">(غائبة)</span>' : ""}</div>
                <span class="test-type-badge ${badgeClass}" style="font-size: 0.72rem; margin-top: 4px; display: inline-block;">${badgeText}</span>
              </td>
              <td style="padding: 1rem; text-align: right;">${escapeHtml(r.subject)}</td>
              <td style="padding: 1rem; text-align: center; font-weight: bold; color: ${isAbsent ? "red" : "var(--primary-color)"}; font-size: 1.05rem; white-space:nowrap;">${scoreText}</td>
              <td style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(dateStr)}</td>
              <td class="no-print" style="padding: 1rem; text-align: center;">
                ${
                  isAbsent
                    ? `<span class="text-muted" style="font-size:0.85rem;">لا توجد ورقة إجابة</span>`
                    : `<button class="btn-secondary" style="padding: 4px 10px; font-size: 0.85rem;" onclick="document.getElementById('student-profile-modal').style.display='none'; document.body.classList.remove('printing-modal'); window.openExamDetails(${jsArg(r.examId)}, ${jsArg(student.phone)}, ${jsArg(student.name)})">👁️ ورقة الإجابة</button>`
                }
              </td>
            </tr>
          `;
        })
        .join("");
    }

    document.body.classList.add("printing-modal");
    document.getElementById("student-profile-modal").style.display = "flex";
  }

  // ===================== الشهادة =====================

  openCertificateModalFromProfile() {
    if (this.currentProfilePhone) {
      document.getElementById("student-profile-modal").style.display = "none";
      this.openCertificateModal(this.currentProfilePhone);
    } else {
      this.showError("يرجى تحديد الطالب أولاً.");
    }
  }

  // تُصدر الشهادة فقط لمرحلة نجحت فيها الطالبة بجميع موادها (بعد الترقية تبقى شهادة المرحلة السابقة متاحة)
  openCertificateModal(phone, stageOverride = null) {
    if (!this.currentRegistry || !this.currentRegistry[phone] || !this.academicCache) {
      this.showError("بيانات الطالب غير متاحة. افتح السجل التراكمي أولاً.");
      return false;
    }
    const student = this.currentRegistry[phone];
    const stages = (this._cachedStructureSettings && this._cachedStructureSettings.stages) || [];

    let stage = stageOverride;
    if (!stage) {
      const current = this.studentResults(student.raw, student.stage);
      if (current && current.allPassed) {
        stage = student.stage;
      } else {
        const idx = findStageIndex(stages, student.stage);
        for (let i = (idx === -1 ? stages.length : idx) - 1; i >= 0; i--) {
          const r = this.studentResults(student.raw, stages[i]);
          if (r && r.allPassed) {
            stage = stages[i];
            break;
          }
        }
        if (!stage) stage = student.stage;
      }
    }

    const results = this.studentResults(student.raw, stage);
    if (!results || !results.allPassed) {
      this.showError(`لا يمكن إصدار شهادة (${stage || "المرحلة غير محددة"}): ${this.describeResultsProblem(results)}`);
      return false;
    }

    this.currentCertStudent = student;
    this.currentCertStage = stage;
    this.renderCertificateForStage(stage, results);

    const elName = document.getElementById("cert-stud-name");
    if (elName) elName.textContent = `${student.name} ${student.surname || ""}`.trim();

    const btnBox = document.getElementById("cert-stage-buttons");
    if (btnBox) {
      btnBox.innerHTML = stages
        .map(
          (st) =>
            `<button onclick="window.app.switchCertStagePreview(${jsArg(st)})" class="btn-secondary stage-btn" style="padding: 4px 10px; font-weight: bold;${st === stage ? " background:#d97706; color:#fff;" : ""}">${escapeHtml(st)}</button>`,
        )
        .join("");
    }

    this.loadCertImageFromStorage();
    document.body.classList.add("printing-modal");
    document.getElementById("certificate-modal").style.display = "flex";
    return true;
  }

  renderCertificateForStage(stageName, results) {
    const elStage = document.getElementById("cert-stud-stage");
    if (elStage) elStage.textContent = stageName;

    const tbody = document.getElementById("cert-official-table-tbody");
    if (tbody) {
      const arabicNumerals = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١", "١٢", "١٣", "١٤", "١٥"];
      tbody.innerHTML = results.subjects
        .map(
          (s, idx) => `
          <tr>
            <td class="col-num">${arabicNumerals[idx] || idx + 1}</td>
            <td class="col-subj">${escapeHtml(s.subject)}</td>
            <td class="col-grade">${formatScore(s.total)}</td>
          </tr>
        `,
        )
        .join("");
    }

    const elFinal = document.getElementById("cert-final-status");
    if (elFinal) elFinal.textContent = "ناجحـــــة";
  }

  // أزرار المراحل في نافذة الشهادة: إصدار شهادة نفس الطالبة لمرحلة أخرى (بدرجاتها الحقيقية فقط)
  switchCertStagePreview(stageName) {
    if (!this.currentCertStudent) return;
    if (this.openCertificateModal(this.currentCertStudent.phone, stageName)) {
      this.showToast(`✨ شهادة ${stageName}`, "info", 2000);
    }
  }

  loadCertImageFromStorage() {
    const savedImg = localStorage.getItem("mzmz_custom_cert_image");
    const certArea = document.getElementById("cert-print-area");
    if (savedImg && certArea) {
      certArea.style.backgroundImage = `url('${savedImg}')`;
    } else if (certArea) {
      certArea.style.backgroundImage = "url('/cert_template_clean_bg.png')";
    }
  }

  async downloadCertAsImage() {
    const certArea = document.getElementById("cert-print-area");
    if (!certArea) return;

    this.showToast("⏳ جاري تجهيز صورة الشهادة عالية الدقة...", "info");

    try {
      if (typeof window.html2canvas === "undefined") {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const canvas = await window.html2canvas(certArea, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#fff7ec",
      });

      const studentName = this.currentCertStudent?.name || "شهادة";
      const fileName = `شهادة_${studentName.replace(/\s+/g, "_")}_${(this.currentCertStage || "").replace(/\s+/g, "_")}.png`;

      const link = document.createElement("a");
      link.download = fileName;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.showToast("✅ تم تنزيل الشهادة كصورة عالية الدقة بنجاح!", "success");
    } catch (err) {
      console.error("Error generating certificate image:", err);
      this.showError("حدث خطأ أثناء تنزيل الشهادة كصورة. تحقق من الاتصال بالإنترنت أو استخدم زر الطباعة / PDF.");
    }
  }

  handleCustomCertImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      let stored = true;
      try {
        localStorage.setItem("mzmz_custom_cert_image", base64);
      } catch (err) {
        stored = false;
        console.warn("Could not store image in localStorage due to size limit:", err);
      }
      const certArea = document.getElementById("cert-print-area");
      if (certArea) {
        certArea.style.backgroundImage = `url('${base64}')`;
      }
      this.showToast(
        stored ? "✅ تم حفظ صورتك كخلفية رسمية للشهادة!" : "⚠️ تم تطبيق الصورة مؤقتاً فقط لأن حجمها كبير جداً للحفظ. استخدم صورة أصغر.",
        stored ? "success" : "info",
      );
    };
    reader.readAsDataURL(file);
  }

  adjustCertFontSize(step) {
    const layer = document.querySelector(".cert-official-dynamic-body");
    if (!layer) return;
    let curr = parseFloat(layer.style.zoom || 1);
    curr += step * 0.05;
    if (curr < 0.6) curr = 0.6;
    if (curr > 1.6) curr = 1.6;
    layer.style.zoom = curr;
  }

  resetCertBg() {
    localStorage.removeItem("mzmz_custom_cert_image");
    const certArea = document.getElementById("cert-print-area");
    if (certArea) {
      certArea.style.backgroundImage = "url('/cert_template_clean_bg.png')";
    }
    const input = document.getElementById("custom-cert-file-input");
    if (input) input.value = "";
    this.showToast("↻ تم إرجاع الإطار الرسمي المعتمد للشهادة.", "info");
  }

  // ===================== كشف الدرجات للنشر =====================

  generateMasterGradesReport() {
    if (!this.currentRegistry || Object.keys(this.currentRegistry).length === 0) {
      this.showError("لا توجد طالبات في السجل لإصدار الكشف.");
      return;
    }

    const stageFilter = document.getElementById("registry-stage-filter")?.value || "";
    const qualFilter = document.getElementById("registry-qual-filter")?.value || "";
    const students = this.getFilteredRegistryStudents();
    students.sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText("mr-stage-info", `المرحلة: ${stageFilter || "جميع المراحل"}`);
    setText("mr-group-info", `الشعبة: ${qualFilter ? "شعبة " + qualFilter : "جميع الشعب"}`);
    setText("mr-date-info", `تاريخ الرصد: ${new Date().toLocaleDateString("ar-EG")}`);
    setText("mr-count-info", `العدد الكلي: ${students.length} طالبة`);

    // عند اختيار مرحلة: عمود لكل مادة. بدون اختيار: ملخص لكل طالبة
    let subjectCols = [];
    if (stageFilter) {
      subjectCols = [...this.getStageSubjects(stageFilter)];
      students.forEach((s) =>
        (s.results ? s.results.subjects : []).forEach((sub) => {
          if (!subjectCols.some((c) => normalizeArabic(c) === normalizeArabic(sub.subject))) subjectCols.push(sub.subject);
        }),
      );
    }

    const th = (t, extra = "") => `<th style="border: 1px solid #000; padding: 0.6rem;${extra}">${t}</th>`;
    const thead = document.getElementById("master-report-thead");
    if (thead) {
      thead.innerHTML = `<tr style="background-color: #f0f0f0; font-weight: bold; border-bottom: 2px solid #000;">
        ${th("#")}
        ${th("الاسم الرباعي واللقب", " text-align: right;")}
        ${th("الرقم الحوزوي")}
        ${th(stageFilter ? "الشعبة" : "المرحلة / الشعبة")}
        ${stageFilter ? subjectCols.map((c) => th(escapeHtml(c) + "<br><small>(100)</small>")).join("") : th("المواد المجتازة")}
        ${th("المعدل (100)")}
        ${th("النتيجة")}
      </tr>`;
    }

    const tbody = document.getElementById("master-report-table-body");
    if (!tbody) return;
    const colCount = 6 + (stageFilter ? subjectCols.length : 1);

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="padding: 1.5rem; text-align: center;">لا توجد نتائج مطابقة لهذه التصفية.</td></tr>`;
    } else {
      const td = (content, extra = "") => `<td style="border: 1px solid #000; padding: 0.5rem;${extra}">${content}</td>`;
      const overallColor = { pass: "darkgreen", retake: "#b45309", fail: "red", pending: "#4338ca", none: "#475569" };
      tbody.innerHTML = students
        .map((s, idx) => {
          const r = s.results;
          const overall = r ? r.overall : "none";
          let resultText = OVERALL_LABELS[overall];
          if (overall === "pass" && r.average !== null) resultText += ` - ${gradeWord(r.average)}`;
          const subjectCells = stageFilter
            ? subjectCols
                .map((c) => {
                  const sub = r && r.subjects.find((x) => normalizeArabic(x.subject) === normalizeArabic(c));
                  if (!sub || sub.total === null) return td("—");
                  const color = sub.status === "pass" ? "#000" : sub.status === "pending" ? "#4338ca" : "#dc2626";
                  const mark = sub.status === "retake" ? "<br><small>(دور ثانٍ)</small>" : sub.viaSecond ? "<br><small>(د2)</small>" : "";
                  return td(`<span style="color:${color}; font-weight:700;">${formatScore(sub.total)}</span>${mark}`);
                })
                .join("")
            : td(r && r.requiredCount ? `${r.passed} / ${r.requiredCount}` : "—");

          return `
            <tr style="border-bottom: 1px solid #000; background: ${idx % 2 === 0 ? "#fff" : "#f9f9f9"};">
              ${td(idx + 1, " font-weight: bold;")}
              ${td(escapeHtml(`${s.name} ${s.surname || ""}`.trim()), " text-align: right; font-weight: bold;")}
              ${td("#" + escapeHtml(s.hawza_number || "—"))}
              ${td(escapeHtml(stageFilter ? s.qualification || "—" : `${s.stage || "—"} / ${s.qualification ? "شعبة " + s.qualification : "—"}`))}
              ${subjectCells}
              ${td(r && r.average !== null ? formatScore(r.average) : "—", " font-weight: 900; color: #111;")}
              ${td(escapeHtml(resultText), ` font-weight: bold; color: ${overallColor[overall]};`)}
            </tr>
          `;
        })
        .join("");
    }

    document.body.classList.add("printing-modal");
    document.getElementById("master-report-modal").style.display = "flex";
  }
}


// Helpers
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// قيمة نصية آمنة داخل onclick="..." (تمنع حقن الشيفرة عبر الأسماء التي يكتبها الزوار)
function jsArg(value) {
  return escapeHtml(JSON.stringify(value === undefined ? null : value));
}

function toLocalDatetimeString(date) {
  const tzoffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzoffset)
    .toISOString()
    .slice(0, 16);
  return localISOTime;
}

function copyTextFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

window.copyTextSafe = function (text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => copyTextFallback(text));
  }
  return Promise.resolve(copyTextFallback(text));
};

window.copyToClipboard = function (text) {
  window.copyTextSafe(text).then((ok) => {
    alert(ok ? "📋 تم نسخ الرابط المباشر للامتحان بنجاح! شاركه مع طلابك الآن." : "تعذر النسخ تلقائياً، انسخ الرابط يدوياً: " + text);
  });
};

document.addEventListener("DOMContentLoaded", () => {
  window.app = new AppViewManager();
});
