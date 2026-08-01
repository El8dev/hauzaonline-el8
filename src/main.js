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
    window.openExamDetails = (examId, name, phone) =>
      this.openExamDetails(examId, name, phone);
    window.renderStudentsCumulativeRegistry = () =>
      this.renderStudentsCumulativeRegistry();
    window.startExamFromList = (examId) => this.startExamFromList(examId);
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
      stages: ["مرحلة اولى", "مرحلة ثانية", "مرحلة ثالثة", "مرحلة رابعة"],
      subjects: ["العقائد", "الفقه", "المنطق", "الأخلاق", "النحو"],
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
    } catch (err) {
      console.error(err);
      this.showToast("حدث خطأ أثناء حفظ الهيكلية", "error");
    } finally {
      this.hideLoading();
    }
  }

  getSectionsForStage(stageName) {
    if (!stageName || !this._cachedStructureSettings) return [];
    if (this._cachedStructureSettings.sections.hasOwnProperty(stageName)) {
      return this._cachedStructureSettings.sections[stageName];
    }
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

    if (stageSelect && stageSelect.options.length <= 1) {
      stageSelect.innerHTML =
        `<option value="" disabled selected>-- اختر المرحلة --</option>` +
        allStages
          .map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
          )
          .join("");

      stageSelect.addEventListener("change", (e) => {
        this.populateTargetDropdowns(e.target.value);
      });
    }

    if (subjectSelect) {
      // Filter subjects based on selected stage
      const currentStage = stageSelect ? stageSelect.value : null;
      let availableSubjects = allSubjects;
      
      // If a stage is selected and it has assigned subjects, restrict the dropdown to only those subjects
      if (currentStage && stageSubjects[currentStage] && stageSubjects[currentStage].length > 0) {
        availableSubjects = stageSubjects[currentStage];
      }

      subjectSelect.innerHTML =
        `<option value="" disabled selected>-- اختر المادة --</option>` +
        availableSubjects
          .map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
          )
          .join("");
    }

    if (checkboxesContainer && selectedStageForCheckboxes) {
      const stageSections = this.getSectionsForStage(
        selectedStageForCheckboxes,
      );
      checkboxesContainer.innerHTML = stageSections
        .map(
          (s) => `
            <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
              <input type="checkbox" value="${escapeHtml(s)}" class="creator-target-section-cb"> ${escapeHtml(s)}
            </label>
          `,
        )
        .join("");
    } else if (checkboxesContainer) {
      checkboxesContainer.innerHTML =
        '<span class="text-muted" style="font-size:0.85rem;">يرجى اختيار المرحلة أولاً لعرض الشعب.</span>';
    }
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
    toast.innerHTML = `
          <span class="app-toast-icon">${icon}</span>
          <span class="app-toast-message">${msg}</span>
          <button class="app-toast-close" title="إغلاق">✕</button>
        `;

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
        navigator.clipboard
          .writeText(String(valToCopy))
          .then(() => {
            this.showToast("📋 تم نسخ الرقم بنجاح!", "success", 2500);
          })
          .catch(() => {
            this.showToast("فشل النسخ تلقائياً", "error");
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
  }

  handleHashChange() {
    const rawHash = window.location.hash.replace("#", "").trim();
    if (!rawHash) {
      this.restoreDefaultView(false);
      return;
    }

    const [viewId, cardId] = rawHash.split(":");
    const targetView = document.getElementById(viewId);
    if (targetView && targetView.classList.contains("view-container")) {
      this.switchView(viewId, false);
      if (cardId) {
        this.showStudentCard(cardId, false);
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

        const savedSession = localStorage.getItem("MZMZ_STUDENT_SESSION");
        if (savedSession) {
          try {
            const sessionData = JSON.parse(savedSession);
            this.showLoading();
            // Verify the student still exists in db
            const student = await this.studentRepository.loginStudent(
              sessionData.name,
              sessionData.id,
            );
            if (student) {
              this.currentStudent = {
                id: student.id,
                studentName: student.student_name || student.studentName,
                studentPhone: student.student_phone || student.studentPhone,
                memberNumber: student.member_number || student.memberNumber,
                stage: student.stage,
                qualification: student.qualification,
              };
              await this.loadStudentExamsPortal();
              this.showStudentCard("student-exams-list-card");
              this.hideLoading();
              return; // Exit early since they are logged in
            }
            this.hideLoading();
          } catch (e) {
            console.error("Auto login failed:", e);
            this.hideLoading();
          }
          // If failed, clear bad token and proceed normally
          localStorage.removeItem("MZMZ_STUDENT_SESSION");
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
    document.getElementById("nav-logout").addEventListener("click", () => {
      localStorage.removeItem("mzmz_admin_authorized");
      this.updateTeacherMenuVisibility();
      this.authController.signOut();
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
    };

    document.getElementById("tab-exams-btn").addEventListener("click", () => {
      switchAdminTab("tab-exams-content", "tab-exams-btn");
      this.creatorController.loadMyExams(this.currentUserId);
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
        const active = attendanceActiveCb.checked;
        const mode = attendanceModeSelect.value;
        const selectedDays = [];
        if (mode === "custom") {
          document
            .querySelectorAll(".attendance-day-cb:checked")
            .forEach((cb) => {
              selectedDays.push(parseInt(cb.value));
            });
        }
        const timeMode = attendanceTimeModeSelect.value;
        const startTime =
          document.getElementById("admin-attendance-start-time")?.value || "";
        const endTime =
          document.getElementById("admin-attendance-end-time")?.value || "";
        const settings = {
          active,
          mode,
          selectedDays,
          timeMode,
          startTime,
          endTime,
        };
        localStorage.setItem(
          "mzmz_attendance_settings",
          JSON.stringify(settings),
        );
        alert("تم حفظ إعدادات الحضور والغياب بنجاح ✅");
        this.loadAdminAttendanceTable();
      });
    }

    const datePicker = document.getElementById("admin-attendance-date");
    if (datePicker) {
      const todayDate = new Date();
      const formatDate = (date) =>
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0");
      // Format as YYYY-MM-DD
      datePicker.value = formatDate(todayDate);

      datePicker.addEventListener("change", () => {
        this.loadAdminAttendanceTable();
      });

      document.getElementById("btn-prev-day")?.addEventListener("click", () => {
        if (!datePicker.value) return;
        const current = new Date(datePicker.value);
        current.setDate(current.getDate() - 1);
        datePicker.value = formatDate(current);
        this.loadAdminAttendanceTable();
      });

      document.getElementById("btn-next-day")?.addEventListener("click", () => {
        if (!datePicker.value) return;
        const current = new Date(datePicker.value);
        current.setDate(current.getDate() + 1);
        datePicker.value = formatDate(current);
        this.loadAdminAttendanceTable();
      });

      document
        .getElementById("btn-today-day")
        ?.addEventListener("click", () => {
          datePicker.value = formatDate(new Date());
          this.loadAdminAttendanceTable();
        });
    }

    const btnLoadAttendance = document.getElementById("btn-load-attendance");
    if (btnLoadAttendance) {
      btnLoadAttendance.addEventListener("click", () => {
        this.loadAdminAttendanceTable();
      });
    }

    // Student Attendance logic
    const btnRegisterAttendance = document.getElementById(
      "btn-register-attendance",
    );
    if (btnRegisterAttendance) {
      btnRegisterAttendance.addEventListener("click", () => {
        const todayDate = new Date();
        const today =
          todayDate.getFullYear() +
          "-" +
          String(todayDate.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(todayDate.getDate()).padStart(2, "0");
        const records = JSON.parse(
          localStorage.getItem("mzmz_attendance_records") || "[]",
        );

        // Add record if not exists
        const exists = records.find(
          (r) =>
            r.studentId === this.currentStudent.studentId && r.date === today,
        );
        if (!exists) {
          records.push({
            studentId: this.currentStudent.studentId,
            studentName: this.currentStudent.studentName,
            date: today,
            timestamp: Date.now(),
          });
          localStorage.setItem(
            "mzmz_attendance_records",
            JSON.stringify(records),
          );
        }

        document.getElementById("student-attendance-banner").style.display =
          "none";
        document.getElementById("student-attendance-success").style.display =
          "block";
      });
    }

    document
      .getElementById("results-back-btn")
      .addEventListener("click", () => {
        this.creatorController.loadMyExams(this.currentUserId);
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
        }
      });

    // Student Verify Submission
    document
      .getElementById("student-verify-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document
          .getElementById("student-verify-name")
          .value.trim();
        const studentId = document
          .getElementById("student-verify-id")
          .value.trim();

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
          this.currentStudent = {
            id: student.id,
            studentName: student.student_name || student.studentName,
            studentPhone: student.student_phone || student.studentPhone,
            memberNumber: student.member_number || student.memberNumber,
            stage: student.stage,
            qualification: student.qualification,
          };

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
        localStorage.removeItem("MZMZ_STUDENT_SESSION"); // Clear the persistent token
        this.showStudentCard("student-verify-card");
        document.getElementById("student-verify-form").reset();
      });
    }

    // Success page back button
    const successBackBtn = document.getElementById(
      "success-back-to-portal-btn",
    );
    if (successBackBtn) {
      successBackBtn.addEventListener("click", () => {
        if (this.currentStudent) {
          this.switchView("view-student-entry");
          document.getElementById("student-verify-card").style.display = "none";
          document.getElementById("student-exams-list-card").style.display =
            "block";
          this.loadStudentExamsPortal().catch((err) => {
            this.showError(err.message);
            this.currentStudent = null;
            document.getElementById("student-exams-list-card").style.display =
              "none";
            document.getElementById("student-verify-card").style.display =
              "block";
            document.getElementById("student-verify-form").reset();
          });
        } else {
          this.switchView("view-role-selection");
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

        const savedSession = localStorage.getItem("MZMZ_STUDENT_SESSION");
        if (savedSession) {
          try {
            const sessionData = JSON.parse(savedSession);
            const student = await this.studentRepository.loginStudent(
              sessionData.name,
              sessionData.id,
            );
            if (student) {
              this.currentStudent = {
                id: student.id,
                studentName: student.student_name || student.studentName,
                studentPhone: student.student_phone || student.studentPhone,
                memberNumber: student.member_number || student.memberNumber,
                stage: student.stage,
                qualification: student.qualification,
              };
              if (this.currentExamId) {
                await this.takerController.loadExam(this.currentExamId);
              } else {
                await this.loadStudentExamsPortal();
                this.showStudentCard("student-exams-list-card", false);
              }
              this.hideLoading();
              return;
            }
          } catch (e) {
            console.error("Auto login failed on exam link:", e);
            localStorage.removeItem("MZMZ_STUDENT_SESSION");
          }
        }

        this.hideLoading();
        this.showStudentCard("student-verify-card", false);
      } catch (e) {
        this.showError(e.message);
      }
    } else {
      const rawHash = window.location.hash.replace("#", "").trim();
      if (rawHash) {
        const [viewId, cardId] = rawHash.split(":");
        const targetView = document.getElementById(viewId);
        if (targetView && targetView.classList.contains("view-container")) {
          this.switchView(viewId, false);
          if (cardId) {
            this.showStudentCard(cardId, false);
          }
          return;
        }
      }

      this.restoreDefaultView(true);
    }
  }

  onAuthenticated(user) {
    this.hideLoading();
    this.currentUserId = user.id;
    document.getElementById("nav-logout").style.display = "block";
    document.getElementById("global-nav").style.display = "flex";

    this.switchView("view-dashboard");
    document.getElementById("tab-exams-btn").click();
  }

  loadAdminAttendanceSettings() {
    const settings = JSON.parse(
      localStorage.getItem("mzmz_attendance_settings") ||
        '{"active":false,"mode":"all","selectedDays":[]}',
    );

    const cbActive = document.getElementById("admin-attendance-active");
    if (cbActive) cbActive.checked = settings.active;

    const selMode = document.getElementById("admin-attendance-mode");
    if (selMode) selMode.value = settings.mode || "all";

    const customDiv = document.getElementById("admin-attendance-custom-days");
    if (customDiv) {
      customDiv.style.display = selMode.value === "custom" ? "flex" : "none";
      document.querySelectorAll(".attendance-day-cb").forEach((cb) => {
        cb.checked =
          settings.selectedDays &&
          settings.selectedDays.includes(parseInt(cb.value));
      });
    }

    const selTimeMode = document.getElementById("admin-attendance-time-mode");
    if (selTimeMode) selTimeMode.value = settings.timeMode || "allday";

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
    if (startTimeInput) startTimeInput.value = settings.startTime || "";

    const endTimeInput = document.getElementById("admin-attendance-end-time");
    if (endTimeInput) endTimeInput.value = settings.endTime || "";
  }

  async loadAdminAttendanceTable() {
    const tbody = document.getElementById("admin-attendance-tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" class="text-center">جاري تحميل السجل...</td></tr>`;

    try {
      const studentsList = await this.studentRepository.listAllStudents();
      const approvedStudents = studentsList.filter(
        (s) => s.status === "approved",
      );
      const records = JSON.parse(
        localStorage.getItem("mzmz_attendance_records") || "[]",
      );

      if (approvedStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">لا يوجد طلاب معتمدين حالياً.</td></tr>`;
        return;
      }

      // Populate filters if they only have the default option
      const stageFilter = document.getElementById(
        "admin-attendance-filter-stage",
      );
      const sectionFilter = document.getElementById(
        "admin-attendance-filter-section",
      );

      if (stageFilter && stageFilter.options.length <= 1) {
        const uniqueStages = [
          ...new Set(approvedStudents.map((s) => s.stage).filter(Boolean)),
        ];
        uniqueStages.forEach((stage) => {
          const option = document.createElement("option");
          option.value = stage;
          option.textContent = stage;
          stageFilter.appendChild(option);
        });
      }
      if (sectionFilter && sectionFilter.options.length <= 1) {
        const uniqueSections = [
          ...new Set(
            approvedStudents.map((s) => s.qualification).filter(Boolean),
          ),
        ];
        uniqueSections.forEach((section) => {
          const option = document.createElement("option");
          option.value = section;
          option.textContent = section;
          sectionFilter.appendChild(option);
        });
      }

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
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">لا توجد نتائج تطابق الفلاتر.</td></tr>`;
        return;
      }

      // Calculate unique active attendance days
      const uniqueDates = new Set(records.map((r) => r.date));
      const totalActiveDays = uniqueDates.size;

      let html = "";
      filteredStudents.forEach((student) => {
        // How many times was this student present?
        const presences = records.filter(
          (r) => r.studentId === student.id,
        ).length;
        const absences = Math.max(0, totalActiveDays - presences);

        const hawzaNumber =
          student.member_number || student.hawza_number || "غير محدد";
        const stageText = escapeHtml(student.stage || "غير محدد");
        const sectionText = escapeHtml(student.qualification || "غير محدد");

        html += `
              <tr>
                <td><strong>${escapeHtml(student.student_name)} ${escapeHtml(student.surname || "")}</strong></td>
                <td>${escapeHtml(hawzaNumber)}</td>
                <td>${stageText} - ${sectionText}</td>
                <td><span class="badge ${absences > 0 ? "danger" : "success"}">${absences}</span></td>
              </tr>
            `;
      });

      tbody.innerHTML = html;
    } catch (e) {
      console.error("Error loading attendance table", e);
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">حدث خطأ أثناء تحميل البيانات</td></tr>`;
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

  async loadStudentExamsPortal() {
    this.showLoading();
    try {
      const student = this.currentStudent;
      document.getElementById("student-list-name").textContent =
        student.studentName;

      // Attendance check logic
      const attendanceSettings = JSON.parse(
        localStorage.getItem("mzmz_attendance_settings") || '{"active":false}',
      );
      const studentBanner = document.getElementById(
        "student-attendance-banner",
      );
      const studentSuccess = document.getElementById(
        "student-attendance-success",
      );

      if (studentBanner && studentSuccess) {
        studentBanner.style.display = "none";
        studentSuccess.style.display = "none";

        if (attendanceSettings.active) {
          const todayDate = new Date();
          const todayStr =
            todayDate.getFullYear() +
            "-" +
            String(todayDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(todayDate.getDate()).padStart(2, "0");
          const todayDayOfWeek = todayDate.getDay(); // 0-6

          let isRequiredToday = false;
          if (attendanceSettings.mode === "all") {
            isRequiredToday = true;
          } else if (
            attendanceSettings.mode === "custom" &&
            attendanceSettings.selectedDays &&
            attendanceSettings.selectedDays.includes(todayDayOfWeek)
          ) {
            isRequiredToday = true;
          }

          if (isRequiredToday) {
            if (
              attendanceSettings.timeMode === "customtime" &&
              (attendanceSettings.startTime || attendanceSettings.endTime)
            ) {
              const nowStr =
                todayDate.getHours().toString().padStart(2, "0") +
                ":" +
                todayDate.getMinutes().toString().padStart(2, "0");
              if (
                attendanceSettings.startTime &&
                nowStr < attendanceSettings.startTime
              )
                isRequiredToday = false;
              if (
                attendanceSettings.endTime &&
                nowStr > attendanceSettings.endTime
              )
                isRequiredToday = false;
            }
          }

          if (isRequiredToday) {
            const records = JSON.parse(
              localStorage.getItem("mzmz_attendance_records") || "[]",
            );
            const hasAttended = records.some(
              (r) => r.studentId === student.studentId && r.date === todayStr,
            );

            if (hasAttended) {
              studentSuccess.style.display = "block";
            } else {
              studentBanner.style.display = "block";

              document.getElementById("btn-register-attendance").onclick =
                () => {
                  records.push({
                    studentId: student.studentId,
                    studentName: student.studentName,
                    date: todayStr,
                    time: new Date().toTimeString().substring(0, 5),
                  });
                  localStorage.setItem(
                    "mzmz_attendance_records",
                    JSON.stringify(records),
                  );

                  studentBanner.style.display = "none";
                  studentSuccess.style.display = "block";

                  // تشغيل تأثير احتفالي بسيط أو رسالة
                  const alertEl = document.createElement("div");
                  alertEl.innerHTML = `<div style="position:fixed; bottom:20px; right:20px; background:#10b981; color:white; padding:1rem 2rem; border-radius:8px; z-index:9999; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15);">تم تسجيل حضورك بنجاح! شكراً لكِ 🌹</div>`;
                  document.body.appendChild(alertEl);
                  setTimeout(() => alertEl.remove(), 4000);
                };
            }
          }
        }
      }

      // 1. Fetch all exams
      const allExams =
        await this.creatorController.examRepository.listAllExams();

      // 2. Fetch submissions of this student
      const subRepo = this.takerController.submissionRepository;
      const submissions = await subRepo.getSubmissionsByStudent(
        student.studentPhone,
        student.studentName,
      );

      // Map exam submissions
      const submittedExamIds = {};
      const examScores = {};
      const subjectTotalScores = {};

      submissions.forEach((sub) => {
        submittedExamIds[sub.exam_id] = true;
        examScores[sub.exam_id] = sub.score;

        const relatedExam = allExams.find((e) => e.id === sub.exam_id);
        if (relatedExam) {
          const type = relatedExam.test_type || relatedExam.testType;
          if (type === "final" || type === "half") {
            subjectTotalScores[relatedExam.subject] =
              (subjectTotalScores[relatedExam.subject] || 0) + sub.score;
          }
        }
      });

      // Filter exams based on targetStage, targetSection, active status, and not submitted

      const normStr = (str) => {
        if (!str) return "";
        return str
          .trim()
          .replace(/[أإآا]/g, "ا")
          .replace(/ة/g, "ه")
          .replace(/ي$/g, "ى");
      };

      const availableExams = allExams.filter((exam) => {
        const studentStage = normStr(student.stage);
        const studentQual = normStr(student.qualification);
        const examStage = normStr(exam.targetStage);

        const matchStage =
          !examStage ||
          examStage === normStr("الكل") ||
          (examStage === studentStage && studentStage !== "");

        let matchSection = false;
        if (
          !exam.targetSections ||
          (Array.isArray(exam.targetSections) &&
            exam.targetSections.some((s) => normStr(s) === normStr("الكل"))) ||
          (typeof exam.targetSections === "string" &&
            normStr(exam.targetSections).includes(normStr("الكل")))
        ) {
          matchSection = true;
        } else if (Array.isArray(exam.targetSections)) {
          matchSection = exam.targetSections.some(
            (sec) => normStr(sec) === studentQual && studentQual !== "",
          );
        } else if (typeof exam.targetSections === "string") {
          matchSection =
            normStr(exam.targetSections).includes(studentQual) &&
            studentQual !== "";
        }

        const isAvailable = exam.isActive();

        const notSubmitted = !submittedExamIds[exam.id];

        const isSecondSession =
          exam.test_type === "second_session" ||
          exam.testType === "second_session";
        if (isSecondSession) {
          const totalScore = subjectTotalScores[exam.subject] || 0;
          if (totalScore >= 50) {
            return false; // Passed, hide retake
          }
        }

        return matchStage && matchSection && isAvailable && notSubmitted;
      });

      const completedExams = allExams.filter(
        (exam) => submittedExamIds[exam.id],
      );

      const container = document.getElementById("student-exams-list-container");
      const completedContainer = document.getElementById(
        "completed-exams-list-container",
      );

      if (availableExams.length === 0) {
        if (container) {
          container.innerHTML = `
                <div style="text-align: center; padding: 2.5rem; background: var(--card-bg, #f8f9fa); border-radius: 12px; margin-top: 1rem; border: 1px dashed #ccc;">
                  <div style="font-size: 2.5rem; margin-bottom: 1rem;">📅</div>
                  <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">لا توجد امتحانات متاحة حالياً</h3>
                  <p style="color: var(--text-muted);">لقد أتممت جميع الامتحانات المطلوبة أو أنه لا يوجد امتحان مخصص لك في الوقت الحالي.</p>
                  <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem;">تأكد من تسجيل حضورك اليومي من الزر أعلاه إذا لزم الأمر.</p>
                </div>
              `;
        }
      } else {
        // Render targeted exams
        if (container) {
          container.innerHTML = availableExams
            .map((exam) => {
              const subjectTag =
                exam.subject && exam.subject !== "غير محدد"
                  ? `<span class="badge primary" style="font-size: 0.75rem; margin-inline-start: 0.5rem; vertical-align: middle;">📚 ${escapeHtml(exam.subject)}</span>`
                  : "";

              return `
              <div class="form-card" style="margin-bottom: 0.5rem; border-right: 4px solid var(--primary-color); padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h3 style="margin: 0; margin-bottom: 0.4rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>${escapeHtml(exam.title)}</span>
                    ${subjectTag}
                  </h3>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.6rem;">${escapeHtml(exam.description || "")}</p>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="badge" style="background-color: #dbeafe; color: #1e40af; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 6px;">نشط ومتاح 📝</span>
                  </div>
                </div>
                <div>
                  <button class="btn-primary" style="padding: 0.5rem 1.25rem; font-weight: bold;" onclick="window.startExamFromList('${exam.id}')">دخول الامتحان 🚀</button>
                </div>
              </div>
            `;
            })
            .join("");
        }
      }

      if (completedContainer) {
        if (completedExams.length === 0) {
          completedContainer.innerHTML = `<p class="text-muted text-center">لا توجد امتحانات منجزة حتى الآن.</p>`;
        } else {
          completedContainer.innerHTML = completedExams
            .map((exam) => {
              const subjectTag =
                exam.subject && exam.subject !== "غير محدد"
                  ? `<span class="badge primary" style="font-size: 0.75rem; margin-inline-start: 0.5rem; vertical-align: middle;">📚 ${escapeHtml(exam.subject)}</span>`
                  : "";
              const score = examScores[exam.id];

              return `
                  <div class="form-card" style="margin-bottom: 0.5rem; border-right: 4px solid #10b981; padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; opacity: 0.9;">
                    <div>
                      <h3 style="margin: 0; margin-bottom: 0.4rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="text-decoration: line-through; color: var(--text-muted);">${escapeHtml(exam.title)}</span>
                        ${subjectTag}
                      </h3>
                      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="badge" style="background-color: #d1fae5; color: #065f46; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 6px;">تم الإنجاز ✅</span>
                      </div>
                    </div>
                  </div>
                `;
            })
            .join("");
        }
      }

      this.hideLoading();
    } catch (error) {
      this.showError("فشل تحميل بوابة الامتحانات: " + error.message);
    }
  }

  startExamFromList(examId) {
    this.currentExamId = examId;
    this.takerController.loadExam(examId);
  }

  renderExamsList(exams) {
    this.hideLoading();
    this.switchView("view-dashboard");

    const container = document.getElementById("exams-list-container");
    if (exams.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 2rem 0;">لا توجد امتحانات مضافة بعد. اضغط على الزر أعلاه للبدء.</p>`;
      return;
    }

    container.innerHTML = exams
      .map((exam) => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?examId=${exam.id}`;
        const subjectTag =
          exam.subject && exam.subject !== "غير محدد"
            ? `<span class="badge primary" style="font-size: 0.75rem; margin-inline-start: 0.5rem; vertical-align: middle;">📚 ${escapeHtml(exam.subject)}</span>`
            : "";

        let testTypeBadgeClass = "quiz";
        let testTypeLabel = "📝 اختبار قصير (Quiz)";
        if ((exam.test_type || exam.testType) === "half") {
          testTypeBadgeClass = "half";
          testTypeLabel = "⏳ نصف السنة (Half Final)";
        } else if ((exam.test_type || exam.testType) === "final") {
          testTypeBadgeClass = "final";
          testTypeLabel = "🎓 النهائي (Final)";
        } else if ((exam.test_type || exam.testType) === "second_session") {
          testTypeBadgeClass = "warning";
          testTypeLabel = "🔄 الدور الثاني (Retake)";
        }
        const testTypeTag = `<span class="test-type-badge ${testTypeBadgeClass}" title="يظهر للمشرف فقط لتقييم النجاح">👑 ${testTypeLabel}</span>`;

        return `
            <div class="form-card" style="margin-bottom: 1rem; border-right: 4px solid var(--primary-color);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                <h3 style="margin: 0; display: inline-block;">${escapeHtml(exam.title)}</h3>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                  ${testTypeTag}
                  ${subjectTag}
                </div>
              </div>
              <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 0.75rem;">${escapeHtml(exam.description || "لا يوجد وصف")}</p>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.8;">
                📅 <strong>البدء:</strong> ${new Date(exam.start_time || exam.startTime).toLocaleString("ar")} | 
                <strong>الانتهاء:</strong> ${new Date(exam.end_time || exam.endTime).toLocaleString("ar")}<br>
                🎯 <strong>الاستهداف:</strong> <span style="font-weight: bold; color: var(--primary-color); background: var(--bg-hover); padding: 0.1rem 0.5rem; border-radius: 4px;">مرحلة: ${escapeHtml(exam.targetStage || exam.target_stage || "الكل")} | شعبة: ${escapeHtml((exam.targetSections || []).join("، ") || "الكل")}</span>
              </div>
              <div class="button-bar" style="flex-wrap: wrap;">
                <button onclick="window.copyToClipboard('${shareUrl}')" class="btn-secondary" style="font-size: 0.85rem;">🔗 نسخ الرابط</button>
                <button id="btn-results-${exam.id}" class="btn-secondary" style="font-size: 0.85rem;">📊 عرض النتائج</button>
                <button id="btn-delete-${exam.id}" class="btn-danger" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; margin-inline-start: auto;">🗑️ حذف</button>
              </div>
            </div>
          `;
      })
      .join("");

    exams.forEach((exam) => {
      document
        .getElementById(`btn-results-${exam.id}`)
        .addEventListener("click", () => {
          this.creatorController.loadExamResults(exam.id);
        });
      document
        .getElementById(`btn-delete-${exam.id}`)
        .addEventListener("click", () => {
          this.creatorController.deleteExam(exam.id, this.currentUserId);
        });
    });
  }

  async loadStudentsList() {
    this.showLoading();
    try {
      let list = await this.studentRepository.listAllStudents();

      // Fetch exams and submissions to calculate avg_score
      const exams =
        await this.creatorController.examRepository.listExamsByCreator(
          this.currentUserId,
        );
      const submissionsPromises = exams.map((exam) =>
        this.creatorController.submissionRepository.getSubmissionsByExam(
          exam.id,
        ),
      );
      const submissionsResults = await Promise.all(submissionsPromises);
      const allSubmissions = submissionsResults.flat();

      list.forEach((student) => {
        if (student.status !== "approved") {
          student.avg_score = 0;
          return;
        }

        let totalExamsForStudent = 0;
        let totalPointsForStudent = 0;

        // حساب التسليمات الفعلية
        let hasPassedFinal = false;
        const studentSubs = allSubmissions.filter(
          (sub) => sub.student_phone === student.student_phone,
        );
        studentSubs.forEach((sub) => {
          totalExamsForStudent++;
          totalPointsForStudent += sub.score;

          const relatedExam = exams.find((e) => e.id === sub.exam_id);
          if (
            relatedExam &&
            relatedExam.title &&
            (relatedExam.title.includes("نهائ") ||
              relatedExam.title.includes("ثاني"))
          ) {
            hasPassedFinal = true;
          }
        });

        const submittedExamIds = new Set(studentSubs.map((s) => s.exam_id));

        exams.forEach((exam) => {
          if (exam.isEnded && exam.isEnded()) {
            const normStr2 = (str) => {
              if (!str) return "";
              return str
                .trim()
                .replace(/[أإآا]/g, "ا")
                .replace(/ة/g, "ه")
                .replace(/ي$/g, "ى");
            };
            const studentStage = normStr2(student.stage);
            const studentQual = normStr2(student.qualification);
            const examStage = normStr2(exam.targetStage);
            const matchStage =
              !examStage ||
              examStage === normStr2("الكل") ||
              (examStage === studentStage && studentStage !== "");
            let matchSection = false;
            if (
              !exam.targetSections ||
              (Array.isArray(exam.targetSections) &&
                exam.targetSections.some(
                  (s) => normStr2(s) === normStr2("الكل"),
                )) ||
              (typeof exam.targetSections === "string" &&
                normStr2(exam.targetSections).includes(normStr2("الكل")))
            ) {
              matchSection = true;
            } else if (Array.isArray(exam.targetSections)) {
              matchSection = exam.targetSections.some(
                (sec) => normStr2(sec) === studentQual && studentQual !== "",
              );
            } else if (typeof exam.targetSections === "string") {
              matchSection =
                normStr2(exam.targetSections).includes(studentQual) &&
                studentQual !== "";
            }

            if (matchStage && matchSection && !submittedExamIds.has(exam.id)) {
              totalExamsForStudent++;
            }
          }
        });

        if (totalExamsForStudent > 0) {
          student.avg_score = totalPointsForStudent / totalExamsForStudent;
        } else {
          student.avg_score = 0;
        }
        student.canPromote = hasPassedFinal && student.avg_score >= 50;
      });

      const currentSort = this.currentStudentSort || {
        by: "date",
        order: "desc",
      };
      list.sort((a, b) => {
        let valA, valB;
        switch (currentSort.by) {
          case "name":
            valA = a.student_name;
            valB = b.student_name;
            break;
          case "hawza_number":
            valA = a.member_number || a.hawza_number || 0;
            valB = b.member_number || b.hawza_number || 0;
            break;
          case "stage":
            valA = a.stage;
            valB = b.stage;
            break;
          case "status":
            valA = a.status;
            valB = b.status;
            break;
          case "avg_score":
            valA = a.avg_score;
            valB = b.avg_score;
            break;
          case "date":
          default:
            valA = new Date(a.created_at).getTime();
            valB = new Date(b.created_at).getTime();
            break;
        }
        if (valA < valB) return currentSort.order === "asc" ? -1 : 1;
        if (valA > valB) return currentSort.order === "asc" ? 1 : -1;
        return 0;
      });

      this.hideLoading();

      const pendContainer = document.getElementById(
        "pending-requests-container",
      );
      const appContainer = document.getElementById(
        "approved-students-container",
      );

      const pending = list.filter((s) => s.status === "pending");
      const approved = list.filter((s) => s.status === "approved");
      this.pendingStudents = pending;

      const allStages = this._cachedStructureSettings ? this._cachedStructureSettings.stages : ["مرحلة اولى", "مرحلة ثانية", "مرحلة ثالثة", "مرحلة رابعة"];

      const stagesOpts = allStages
        .map(
          (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
        )
        .join("");

      const getSectionOpts = (stageName, selectedSec = "") => {
        const stageSections = this.getSectionsForStage(stageName);
        return stageSections
          .map((s) => {
            const isSelected = selectedSec === s ? " selected" : "";
            return `<option value="${escapeHtml(s)}"${isSelected}>${escapeHtml(s)}</option>`;
          })
          .join("");
      };

      if (pending.length === 0) {
        pendContainer.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا توجد طلبات التحاق معلقة حالياً.</p>`;
      } else {
        pendContainer.innerHTML = pending
          .map(
            (p) => `
              <div class="form-card" style="margin-bottom: 1rem; border-right: 4px solid var(--warning-color);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <h4 style="margin: 0 0 0.5rem 0;">${escapeHtml(p.student_name)} ${escapeHtml(p.surname || "")}</h4>
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">
                      رقم الهاتف: ${escapeHtml(p.student_phone)} | المحافظة: ${escapeHtml(p.province || p.city || "—")}
                    </p>
                    <div style="margin-top: 1rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                       <label style="font-size: 0.85rem; font-weight: bold;">المرحلة:</label>
                       <select id="sel-stage-${p.id}" class="sel-pending-stage text-input" data-id="${p.id}" style="padding: 4px; font-size: 0.85rem; width: 120px;">
                          ${stagesOpts}
                       </select>
                       <label style="font-size: 0.85rem; font-weight: bold;">الشعبة:</label>
                       <select id="sel-sec-${p.id}" class="text-input" style="padding: 4px; font-size: 0.85rem; width: 100px;">
                          ${getSectionOpts(allStages[0])}
                       </select>
                       <label style="font-size: 0.85rem; font-weight: bold;">الرقم الحوزوي:</label>
                       <input type="text" id="inp-hawza-${p.id}" class="text-input" style="padding: 4px; font-size: 0.85rem; width: 100px;" placeholder="تلقائي">
                    </div>
                  </div>
                  <div style="display: flex; gap: 0.5rem;">
                    <button id="btn-approve-${p.id}" class="btn-primary" style="font-size: 0.85rem;">✅ قبول</button>
                    <button id="btn-reject-${p.id}" class="btn-danger" style="font-size: 0.85rem; border: none;">❌ رفض</button>
                  </div>
                </div>
              </div>
            `,
          )
          .join("");

        pending.forEach((p) => {
          document
            .getElementById(`btn-approve-${p.id}`)
            .addEventListener("click", async () => {
              const stage = document.getElementById(`sel-stage-${p.id}`).value;
              const section = document.getElementById(`sel-sec-${p.id}`).value;
              const hawzaInput = document.getElementById(
                `inp-hawza-${p.id}`,
              ).value;

              const cleanStage = stage.trim() || "غير محدد";
              const cleanSection = section.trim() || "غير محدد";
              const cleanHawza = hawzaInput.trim() || null;

              this.showLoading();
              try {
                const approvedStudent =
                  await this.studentRepository.approveStudent(
                    p.id,
                    cleanStage,
                    cleanSection,
                    cleanHawza,
                  );
                this.hideLoading();
                const hawzaNum =
                  approvedStudent.member_number || approvedStudent.hawza_number;
                this.showNotificationModal({
                  title: "تم قبول الطالب بنجاح! 🎉",
                  message: `تم قبول الطالب <strong>${p.student_name || ""}</strong> بنجاح وتعيين الرقم الحوزوي.`,
                  type: "success",
                  badgeValue: hawzaNum,
                  copyText: hawzaNum,
                });
                this.loadStudentsList();
              } catch (e) {
                this.showError(e.message);
              }
            });

          document
            .getElementById(`btn-reject-${p.id}`)
            .addEventListener("click", async () => {
              if (!confirm("هل أنت متأكد من رفض طلب هذا الطالب؟")) return;
              this.showLoading();
              try {
                await this.studentRepository.rejectStudent(p.id);
                this.hideLoading();
                this.loadStudentsList();
              } catch (e) {
                this.showError(e.message);
              }
            });
        });
      }

      if (approved.length === 0) {
        appContainer.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا يوجد طلاب معتمدين بعد.</p>`;
      } else {
        const rows = approved
          .map(
            (a) => `
              <tr>
                <td>
                  <strong>${a.member_number || a.hawza_number || "-"}</strong>
                  <button id="btn-edit-hawza-${a.id}" class="btn-secondary" style="padding: 0.1rem 0.3rem; font-size: 0.7rem; margin-inline-start: 0.5rem; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color);">✏️</button>
                </td>
                <td>${escapeHtml(a.student_name)} ${escapeHtml(a.surname || "")}</td>
                <td>${escapeHtml(a.student_phone)}</td>
                <td>${escapeHtml(a.province || a.city || "—")}</td>
                <td>${escapeHtml(a.birthdate || "—")}</td>
                <td>${escapeHtml(a.marital_status || "—")}</td>
                <td>${escapeHtml(a.study_type || "—")}</td>
                <td>${escapeHtml(a.is_student || "—")}</td>
                <td>
                   <div style="display:flex; flex-direction:column; gap:4px;">
                     <select class="sel-edit-stage text-input" data-id="${a.id}" style="padding:2px 4px; font-size:0.75rem; width:90px;" title="تغيير المرحلة">
                        ${stagesOpts.replace(`value="${escapeHtml(a.stage)}"`, `value="${escapeHtml(a.stage)}" selected`)}
                     </select>
                     <select class="sel-edit-sec text-input" data-id="${a.id}" style="padding:2px 4px; font-size:0.75rem; width:90px;" title="تغيير الشعبة">
                        ${getSectionOpts(a.stage, a.qualification)}
                     </select>
                     <button id="btn-save-sec-${a.id}" class="btn-primary" style="padding:2px 4px; font-size:0.7rem; width:90px;">💾 حفظ</button>
                   </div>
                </td>
                <td>${new Date(a.created_at).toLocaleDateString("ar")}</td>
                <td style="font-weight:bold; color:var(--primary-color);">${Math.round(a.avg_score)}</td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    <button id="btn-promote-stud-${a.id}" class="btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; border: none; background-color: ${a.canPromote ? "#10b981" : "#9ca3af"}; opacity: ${a.canPromote ? "1" : "0.6"}; cursor: ${a.canPromote ? "pointer" : "not-allowed"};" ${a.canPromote ? "" : "disabled"} title="${a.canPromote ? "ترقية الطالب للمرحلة التالية" : "غير مؤهل: يجب أداء الامتحان النهائي/الدور الثاني والحصول على معدل 50% فأكثر"}">ترقية 🔼</button>
                    <button id="btn-del-stud-${a.id}" class="btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; border: none;">حذف 🗑️</button>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("");

        appContainer.innerHTML = `
              <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <h4 style="margin: 0; color: var(--primary-color);">قائمة الطلاب المعتمدين (${approved.length})</h4>
                <button id="btn-promote-all-successful" class="btn-primary" style="padding: 0.5rem 1.25rem; font-weight: 800; background-color: #10b981; border: none;">
                  ترقية جميع الناجحين 🔼 (${approved.filter((a) => a.canPromote).length})
                </button>
              </div>
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
                    <th>المعدل</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            `;

        const promoteAllBtn = document.getElementById(
          "btn-promote-all-successful",
        );
        if (promoteAllBtn) {
          promoteAllBtn.addEventListener("click", async () => {
            const eligible = approved.filter((a) => a.canPromote);
            if (eligible.length === 0) {
              alert("لا يوجد طلاب ناجحين ومستوفين لشروط الترقية حالياً.");
              return;
            }
            if (
              !confirm(
                `هل أنت متأكد من ترقية جميع الطلاب الناجحين وعددهم (${eligible.length}) طالب إلى مراحلهم التالية؟`,
              )
            )
              return;

            this.showLoading();
            let successCount = 0;
            try {
              for (const a of eligible) {
                const currentStageIdx = allStages.indexOf(a.stage);
                if (
                  currentStageIdx === -1 ||
                  currentStageIdx >= allStages.length - 1
                )
                  continue;
                const nextStage = allStages[currentStageIdx + 1];
                const stageSections = this.getSectionsForStage(nextStage);
                const nextSection =
                  stageSections.length > 0
                    ? stageSections[0]
                    : a.qualification || "";
                await this.studentRepository.updateStudentStageAndSection(
                  a.id,
                  nextStage,
                  nextSection,
                );
                successCount++;
              }
              this.hideLoading();
              this.showNotificationModal({
                title: "تمت الترقية الجماعية بنجاح! 🎉",
                message: `تم ترقية <strong>${successCount}</strong> طالب إلى مرحلتهم التالية.`,
                type: "success",
              });
              this.loadStudentsList();
            } catch (e) {
              this.hideLoading();
              this.showError(e.message);
            }
          });
        }

        approved.forEach((a) => {
          const promoteBtn = document.getElementById(
            `btn-promote-stud-${a.id}`,
          );
          if (promoteBtn) {
            promoteBtn.addEventListener("click", async () => {
              const currentStageIdx = allStages.indexOf(a.stage);
              if (
                currentStageIdx === -1 ||
                currentStageIdx >= allStages.length - 1
              ) {
                alert(
                  "الطالب في المرحلة النهائية أو مرحلته غير معروفة، لا يمكن ترقيته أكثر.",
                );
                return;
              }
              const nextStage = allStages[currentStageIdx + 1];
              const stageSections = this.getSectionsForStage(nextStage);
              const nextSection =
                stageSections.length > 0
                  ? stageSections[0]
                  : a.qualification || "";

              if (
                !confirm(
                  `هل أنت متأكد من ترقية الطالب من '${a.stage}' إلى '${nextStage}'؟`,
                )
              )
                return;

              this.showLoading();
              try {
                await this.studentRepository.updateStudentStageAndSection(
                  a.id,
                  nextStage,
                  nextSection,
                );
                this.hideLoading();
                this.showNotificationModal({
                  title: "تمت الترقية بنجاح! 🎉",
                  message: `تم ترقية الطالب <strong>${a.student_name}</strong> إلى <strong>${nextStage}</strong>.`,
                  type: "success",
                });
                this.loadStudentsList();
              } catch (e) {
                this.showError(e.message);
              }
            });
          }

          document
            .getElementById(`btn-del-stud-${a.id}`)
            .addEventListener("click", async () => {
              if (
                !confirm(
                  "هل أنت متأكد من حذف عضوية هذا الطالب؟ الرقم المخصص له سيبقى محجوزاً للتاريخ.",
                )
              )
                return;
              this.showLoading();
              try {
                await this.studentRepository.deleteStudent(a.id);
                this.hideLoading();
                this.loadStudentsList();
              } catch (e) {
                this.showError(e.message);
              }
            });

          document
            .getElementById(`btn-edit-hawza-${a.id}`)
            .addEventListener("click", async () => {
              const newNum = prompt(
                "أدخل الرقم الحوزوي الجديد:",
                a.member_number || a.hawza_number || "",
              );
              if (newNum === null || newNum.trim() === "") return;
              this.showLoading();
              try {
                await this.studentRepository.updateStudentMemberNumber(
                  a.id,
                  newNum.trim(),
                );
                this.hideLoading();
                this.loadStudentsList();
              } catch (e) {
                this.showError(e.message);
              }
            });

          document
            .getElementById(`btn-save-sec-${a.id}`)
            .addEventListener("click", async () => {
              const stage = document.querySelector(
                `.sel-edit-stage[data-id="${a.id}"]`,
              ).value;
              const sec = document.querySelector(
                `.sel-edit-sec[data-id="${a.id}"]`,
              ).value;
              this.showLoading();
              try {
                await this.studentRepository.updateStudentStageAndSection(
                  a.id,
                  stage,
                  sec,
                );
                this.hideLoading();
                alert("تم حفظ المرحلة والشعبة بنجاح!");
              } catch (e) {
                this.showError(e.message);
              }
            });
        });
      }

      // Add dynamic stage change listeners for pending students
      document.querySelectorAll(".sel-pending-stage").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const id = e.target.getAttribute("data-id");
          const newStage = e.target.value;
          const secDropdown = document.getElementById(`sel-sec-${id}`);
          if (secDropdown) {
            secDropdown.innerHTML = getSectionOpts(newStage);
          }
        });
      });

      // Add dynamic stage change listeners for approved students (to update their sections dropdown)
      document.querySelectorAll(".sel-edit-stage").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const row = e.target.closest("tr");
          const newStage = e.target.value;
          const secDropdown = row.querySelector(".sel-edit-sec");
          if (secDropdown) {
            secDropdown.innerHTML = getSectionOpts(newStage);
          }
        });
      });
    } catch (e) {
      this.showError(e.message);
    }
  }

  renderExamCreator() {
    // 1. استنساخ النموذج كلياً أولاً لتنظيف أحداث الإرسال السابقة
    const form = document.getElementById("exam-creator-form");
    const newForm = form.cloneNode(true);
    form.replaceWith(newForm);

    // 2. ربط حدث الإرسال بالنموذج الجديد
    newForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitCreatedExam();
    });

    // 3. ربط حدث إضافة سؤال جديد بالزر الجديد
    document
      .getElementById("creator-add-question-btn")
      .addEventListener("click", () => {
        this.addCreatorQuestionBox();
        this.recalculateCreatorGrades();
      });

    // 3.5. ربط أحداث توزيع الدرجات
    const totalGradeInput = document.getElementById("creator-total-grade");
    const distRadios = document.querySelectorAll(
      'input[name="grade_distribution"]',
    );
    if (totalGradeInput) {
      totalGradeInput.addEventListener("input", () =>
        this.recalculateCreatorGrades(),
      );
    }
    distRadios.forEach((radio) => {
      radio.addEventListener("change", () => this.recalculateCreatorGrades());
    });

    // 4. ربط حدث زر الإلغاء
    document
      .getElementById("creator-cancel-btn")
      .addEventListener("click", () => {
        document.getElementById("tab-exams-btn").click();
      });

    // 5. تصفير القيم الافتراضية
    document
      .querySelectorAll(".creator-question-box")
      .forEach((box) => box.remove());

    document
      .querySelectorAll(".creator-target-section-cb, .creator-section-cb")
      .forEach((cb) => (cb.checked = false));
    document.getElementById("creator-subject").value = "";
    // تعبئة خيارات المرحلة والشعبة وربط أزرار الإضافة
    this.populateTargetDropdowns();

    const stageSelect = document.getElementById("creator-target-stage");
    if (stageSelect && stageSelect.options.length > 0) {
      stageSelect.selectedIndex = 0;
    }

    const targetSectionEl = document.getElementById("creator-target-section");
    if (targetSectionEl) targetSectionEl.value = "الكل";
    const now = new Date();
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // Format YYYY-MM-DD
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    // Format HH:MM
    const startHH = "20";
    const startMM = "00";
    const endHH = "23";
    const endMM = "59";

    const dateInput = document.getElementById("creator-date");
    const startTimeInput = document.getElementById("creator-start-time");
    const endTimeInput = document.getElementById("creator-end-time");

    dateInput.value = `${yyyy}-${mm}-${dd}`;
    startTimeInput.value = `${startHH}:${startMM}`;
    endTimeInput.value = `${endHH}:${endMM}`;

    if (dateInput._flatpickr) dateInput._flatpickr.setDate(dateInput.value);
    if (startTimeInput._flatpickr)
      startTimeInput._flatpickr.setDate(startTimeInput.value);
    if (endTimeInput._flatpickr)
      endTimeInput._flatpickr.setDate(endTimeInput.value);
    if (document.getElementById("creator-shuffle-order")) {
      document.getElementById("creator-shuffle-order").checked = true;
    }

    // 6. تهيئة حاوية الأسئلة وبناء أول سؤال
    const container = document.getElementById("creator-questions-container");
    container.innerHTML = "";
    this.addCreatorQuestionBox();
    this.recalculateCreatorGrades();

    // 7. Initialize Flatpickr on the new cloned inputs
    if (typeof window.flatpickr !== "undefined") {
      window.flatpickr("#creator-date", {
        locale: "ar",
        disableMobile: true,
        altInput: true,
        altFormat: "F j, Y",
        dateFormat: "Y-m-d",
        defaultDate: dateInput.value,
      });
      window.flatpickr("#creator-start-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        locale: "ar",
        disableMobile: true,
        time_24hr: false,
        defaultDate: startTimeInput.value,
      });
      window.flatpickr("#creator-end-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        locale: "ar",
        disableMobile: true,
        time_24hr: false,
        defaultDate: endTimeInput.value,
      });
    }
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
              <input type="number" class="text-input q-points-input" value="1" min="1" step="0.5" style="width: 80px;" placeholder="الدرجة" title="درجة السؤال">
            </div>
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
        alert("يجب إبقاء سؤال واحد على الأقل.");
      }
    });

    box.querySelector(".add-opt-btn").addEventListener("click", () => {
      const optList = box.querySelector(".options-creation-list");
      const optIdx = optList.children.length;
      const optRow = document.createElement("div");
      optRow.className = "option-row";
      optRow.innerHTML = `
            <input type="checkbox" class="q-correct-checkbox" name="correct-for-${idx}" value="${optIdx}" title="إجابة صحيحة">
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
          alert("يجب توفير خيارين على الأقل.");
        }
      });
    });
  }
  recalculateCreatorGrades() {
    const distMode =
      document.querySelector('input[name="grade_distribution"]:checked')
        ?.value || "equal";
    const gradeInputs = document.querySelectorAll(".q-points-input");
    const totalGrade =
      parseFloat(document.getElementById("creator-total-grade")?.value) || 100;

    if (distMode === "equal") {
      const count = gradeInputs.length;
      const gradePerQuestion = count > 0 ? totalGrade / count : 0;
      // Format to max 1 decimal place to keep it clean (e.g. 11.1 instead of 11.11)
      const formattedGrade = Math.round(gradePerQuestion * 10) / 10;

      gradeInputs.forEach((input) => {
        input.value = formattedGrade;
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

      // If end time is earlier than start time, assume it ends the next day
      if (endDateTime < startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      startTime = startDateTime.toISOString();
      endTime = endDateTime.toISOString();
    } catch (e) {
      alert("🚨 خطأ في التواريخ: " + e.message);
      return;
    }

    // استخراج المادة الدراسية المحددة
    let subject = document.getElementById("creator-subject").value.trim();
    if (!subject) subject = "غير محدد";

    // استخراج المرحلة والشعبة المستهدفة
    let targetStage = document
      .getElementById("creator-target-stage")
      .value.trim();

    let targetSections = [];
    document
      .querySelectorAll(".creator-target-section-cb, .creator-section-cb")
      .forEach((cb) => {
        if (cb.checked) targetSections.push(cb.value);
      });

    if (!targetStage) {
      alert("🚨 يجب تحديد المرحلة المستهدفة للامتحان.");
      return;
    }
    if (targetSections.length === 0) {
      targetSections = ["الكل"]; // Fallback if none selected
    }

    const questions = [];
    let hasErrors = false;

    document.querySelectorAll(".creator-question-box").forEach((box, qIdx) => {
      const questionText = box.querySelector(".q-text-input").value.trim();
      const pointsVal = box.querySelector(".q-points-input").value;
      const points = parseFloat(pointsVal) || 1;

      const optionInputs = box.querySelectorAll(".q-option-input");
      const correctCheckboxes = box.querySelectorAll(
        "input.q-correct-checkbox:checked",
      );
      if (correctCheckboxes.length === 0) {
        alert(`السؤال رقم ${qIdx + 1} لا يحتوي على أي إجابة صحيحة محددة.`);
        hasErrors = true;
      }

      const scorePerOption = points / correctCheckboxes.length;
      const correctIndices = Array.from(correctCheckboxes).map((chk) =>
        parseInt(chk.value),
      );

      const options = Array.from(optionInputs).map((inp, oIdx) => ({
        id: `opt_${Date.now()}_${qIdx}_${oIdx}`,
        text: inp.value.trim(),
        isCorrect: correctIndices.includes(oIdx),
        score: correctIndices.includes(oIdx) ? scorePerOption : 0,
      }));

      questions.push({
        questionText,
        options,
        correctOptionIndex: correctIndices.length > 0 ? correctIndices[0] : 0, // Fallback for DB schema NOT NULL constraint
        points,
      });
    });

    if (hasErrors) return;

    const shuffleOrder = document.getElementById("creator-shuffle-order")
      ? document.getElementById("creator-shuffle-order").checked
      : true;
    const testType = document.getElementById("creator-test-type")
      ? document.getElementById("creator-test-type").value
      : "quiz";

    if (
      testType === "half" ||
      testType === "final" ||
      testType === "second_session"
    ) {
      this.showLoading();
      const allExams =
        await this.creatorController.examRepository.listAllExams();
      this.hideLoading();

      let isDuplicate = false;
      for (const exam of allExams) {
        const typeMatch =
          exam.test_type === testType || exam.testType === testType;
        const subjectMatch = exam.subject === subject;
        const stageMatch =
          exam.targetStage === targetStage || exam.targetStage === "الكل";

        if (!typeMatch || !subjectMatch || !stageMatch) continue;

        const existingSections = Array.isArray(exam.targetSections)
          ? exam.targetSections
          : typeof exam.targetSections === "string"
            ? JSON.parse(exam.targetSections || '["الكل"]')
            : ["الكل"];
        const hasOverlap =
          existingSections.includes("الكل") ||
          targetSections.includes("الكل") ||
          existingSections.some((s) => targetSections.includes(s));

        if (hasOverlap) {
          isDuplicate = true;
          break;
        }
      }

      if (isDuplicate) {
        const typeLabel =
          testType === "final"
            ? "نهائي"
            : testType === "half"
              ? "نصف السنة"
              : "دور ثاني";
        alert(
          `🚨 لا يمكن إنشاء أكثر من امتحان (${typeLabel}) لنفس المادة والمرحلة والشعبة.`,
        );
        return;
      }
    }

    this.creatorController.createNewExam({
      title,
      description,
      start_time: startTime,
      end_time: endTime,
      created_by: this.currentUserId,
      questions,
      subject,
      target_stage: targetStage,
      target_sections: targetSections,
      shuffle_order: shuffleOrder,
      test_type: testType,
    });
  }

  onExamCreated(exam) {
    this.hideLoading();
    const shareUrl = `${window.location.origin}${window.location.pathname}?examId=${exam.id}`;
    this.showNotificationModal({
      title: "🎉 تم إنشاء ونشر الامتحان بنجاح!",
      message: `تم حفظ الامتحان <strong>${exam.title || ""}</strong> ونشره بنجاح. يمكنك إرسال الرابط المباشر للطلاب:`,
      type: "success",
      badgeValue: shareUrl,
      copyText: shareUrl,
      onConfirm: () => {
        if (document.getElementById("creator-test-type"))
          document.getElementById("creator-test-type").value = "quiz";
        document.getElementById("tab-exams-btn").click();
      },
    });
  }

  renderExamTaker({ exam, questions }) {
    this.hideLoading();
    this.switchView("view-exam-taker");

    // جلب وعرض النبذة الثابتة أعلى الامتحان وقبل عنوان ومادة الامتحان
    const defaultMotto =
      "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۞ حَوّْزَةُ أُمِّ الْبَنِين (عَلَيْهَا السَّلَام) ۞ «طَلَبُ الْعِلْمِ فَرِيضَةٌ»";
    const customMotto =
      localStorage.getItem("mzmz_exam_header_motto") || defaultMotto;
    const mottoTextEl = document.getElementById("taker-exam-motto-text");
    if (mottoTextEl) mottoTextEl.textContent = customMotto;

    document.getElementById("taker-exam-title").textContent = exam.title;
    document.getElementById("taker-exam-desc").textContent =
      exam.description || "يرجى الإجابة بدقة.";
    document.getElementById("taker-student-badge").textContent =
      `الطالب: ${this.currentStudent.studentName} (عضو رقم: ${this.currentStudent.memberNumber || this.currentStudent.hawzaNumber || ""})`;

    // إنشاء attempt_id إذا لم يكن موجوداً لهذه الجلسة
    const attemptKey = `mzmz_attempt_${exam.id}_${this.currentStudent.studentPhone}`;
    let attemptId = sessionStorage.getItem(attemptKey);
    if (!attemptId) {
      attemptId = "attempt_" + Math.random().toString(36).substring(2);
      sessionStorage.setItem(attemptKey, attemptId);
    }

    // دالة التوليد العشوائي المبنية على Seed
    const hashString = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
      }
      return hash;
    };
    const mulberry32 = (a) => {
      return () => {
        var t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const randomFunc = mulberry32(hashString(attemptId));

    const shuffleArray = (array) => {
      let arr = [...array];
      let curId = arr.length;
      while (0 !== curId) {
        let randId = Math.floor(randomFunc() * curId);
        curId -= 1;
        let tmp = arr[curId];
        arr[curId] = arr[randId];
        arr[randId] = tmp;
      }
      return arr;
    };

    // ترتيب الأسئلة والخيارات عشوائياً إذا لم يقم المعلم بتعطيله
    const shouldShuffle =
      exam.shuffleOrder !== false && exam.shuffle_order !== false;
    const displayedQuestions = shouldShuffle
      ? shuffleArray(questions)
      : [...questions];

    // إظهار المجموع الكلي للدرجات
    const totalPoints = questions.reduce(
      (sum, q) => sum + (Number(q.points) || 1),
      0,
    );
    const headerBadge = document.getElementById("taker-student-badge");
    headerBadge.innerHTML += ` <span style="margin-right:15px; color:#10b981;">| الدرجة الكلية: ${totalPoints}</span>`;

    const container = document.getElementById("taker-questions-container");
    container.innerHTML = displayedQuestions
      .map((q, idx) => {
        const isMultiple = q.correctOptions && q.correctOptions.length > 1;
        const inputType = isMultiple ? "checkbox" : "radio";
        // ترتيب الخيارات عشوائياً
        const displayedOptions = shouldShuffle
          ? shuffleArray(q.options)
          : [...q.options];

        return `
            <div class="form-card" style="margin-bottom: 1.5rem;">
              <h3 style="font-weight: 500; font-size: 1.15rem; margin-bottom: 1rem;">
                <span style="color: var(--primary-color); font-weight: 600;">س${idx + 1}:</span> ${escapeHtml(q.questionText)}
              </h3>
              <div class="options-container" data-question-id="${q.id}">
                ${displayedOptions
                  .map((opt, oIdx) => {
                    const originalIndex = q.options.indexOf(opt);
                    return `
                  <label class="option-choice" id="choice-${q.id}-${originalIndex}">
                    <input type="${inputType}" name="answer-for-${q.id}" value="${originalIndex}">
                    <span>${escapeHtml(opt.text)}</span>
                  </label>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `;
      })
      .join("");

    displayedQuestions.forEach((q) => {
      document
        .querySelectorAll(`input[name="answer-for-${q.id}"]`)
        .forEach((input) => {
          input.addEventListener("change", (e) => {
            if (input.type === "radio") {
              document
                .querySelectorAll(`[id^="choice-${q.id}-"]`)
                .forEach((lbl) => {
                  lbl.classList.remove("selected");
                });
              if (e.target.checked) {
                document
                  .getElementById(`choice-${q.id}-${e.target.value}`)
                  .classList.add("selected");
              }
            } else {
              const lbl = document.getElementById(
                `choice-${q.id}-${e.target.value}`,
              );
              if (e.target.checked) {
                lbl.classList.add("selected");
              } else {
                lbl.classList.remove("selected");
              }
            }
          });
        });
    });

    const form = document.getElementById("exam-taker-form");
    form.replaceWith(form.cloneNode(true));
    document
      .getElementById("exam-taker-form")
      .addEventListener("submit", (e) => {
        e.preventDefault();

        const answers = {};
        displayedQuestions.forEach((q) => {
          const checkedInputs = document.querySelectorAll(
            `input[name="answer-for-${q.id}"]:checked`,
          );
          if (checkedInputs.length > 0) {
            if (checkedInputs[0].type === "radio") {
              answers[q.id] = parseInt(checkedInputs[0].value, 10);
            } else {
              answers[q.id] = Array.from(checkedInputs).map((inp) =>
                parseInt(inp.value, 10),
              );
            }
          }
        });

        this.takerController.submitAnswers({
          examId: exam.id,
          studentName: this.currentStudent.studentName,
          studentPhone: this.currentStudent.studentPhone,
          answers,
        });
      });
  }

  onExamSubmitted() {
    this.hideLoading();
    this.switchView("view-success");
  }

  onExamNotStarted(exam) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "لم يبدأ الامتحان بعد";
    document.getElementById("exam-message-body").innerHTML = `
          عذراً، هذا الامتحان غير متاح للحل حالياً.<br>
          ⏰ سيبدأ في: <strong>${new Date(exam.startTime).toLocaleString("ar")}</strong>
        `;
  }

  onExamEnded(exam) {
    this.hideLoading();
    this.switchView("view-exam-message");
    document.getElementById("exam-message-title").textContent =
      "انتهى وقت الامتحان";
    document.getElementById("exam-message-body").innerHTML = `
          عذراً، لقد انتهى الوقت المحدد لتقديم الإجابات لهذا الامتحان.<br>
          ⏰ انتهى في: <strong>${new Date(exam.endTime).toLocaleString("ar")}</strong>
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
              <div style="font-size: 0.8rem; color: var(--text-muted);">📅 تاريخ التسليم: ${existingSub.submitted_at ? new Date(existingSub.submitted_at).toLocaleString("ar") : "—"}</div>
            </div>
            <p style="font-size: 0.85rem; color: #dc2626; font-weight: bold; margin-top: 1rem;">
              🔒 تنبيه: لا يُسمح بإعادة تقديم أو تكرار الإجابات للامتحان نفسه.
            </p>
          </div>
        `;
  }

  renderExamResults({ exam, questions, submissions }) {
    this.hideLoading();
    this.switchView("view-exam-results");
    document.getElementById("results-exam-title").textContent =
      `نتائج: ${exam.title}`;

    // Store for filtering
    this.currentExamViewData = { exam, questions, submissions };
    this.renderFilteredExamResults();
  }

  renderFilteredExamResults() {
    const data = this.currentExamViewData;
    if (!data) return;
    const { exam, questions, submissions } = data;
    const container = document.getElementById("results-table-container");

    let filteredSubmissions = [...submissions];
    const stageFilter =
      document.getElementById("results-stage-filter")?.value || "";
    const qualFilter =
      document.getElementById("results-qual-filter")?.value || "";

    const students = Object.values(this.currentRegistry || {});

    if (stageFilter || qualFilter) {
      filteredSubmissions = filteredSubmissions.filter((sub) => {
        const student = students.find(
          (s) => s.phone === sub.studentPhone || s.name === sub.studentName,
        );
        if (!student) return true; // If not found, just include them (or maybe exclude? include is safer)
        if (stageFilter && student.stage !== stageFilter) return false;
        if (qualFilter && student.qualification !== qualFilter) return false;
        return true;
      });
    }

    // Sort results by Stage, then Section, then Name
    filteredSubmissions.sort((a, b) => {
      const studentA = students.find(
        (s) => s.phone === a.studentPhone || s.name === a.studentName,
      );
      const studentB = students.find(
        (s) => s.phone === b.studentPhone || s.name === b.studentName,
      );
      const stageA = studentA?.stage || "";
      const stageB = studentB?.stage || "";
      const qualA = studentA?.qualification || "";
      const qualB = studentB?.qualification || "";

      if (stageA !== stageB) return stageA.localeCompare(stageB, "ar");
      if (qualA !== qualB) return qualA.localeCompare(qualB, "ar");
      return a.studentName.localeCompare(b.studentName, "ar");
    });

    if (filteredSubmissions.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 2rem 0;">لا توجد تسليمات مسجلة بهذه الفلاتر.</p>`;
      return;
    }

    const questionHeaders = questions
      .map((q, idx) => `<th>س${idx + 1}</th>`)
      .join("");
    const rows = filteredSubmissions
      .map((sub) => {
        const dateStr = new Date(sub.submittedAt).toLocaleString("ar");
        const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

        const answersCells = questions
          .map((q) => {
            const studentAnsIdx = sub.answers[q.id];
            if (studentAnsIdx === undefined) return `<td>-</td>`;
            const isCorrect = Number(studentAnsIdx) === q.correctOptionIndex;
            return `<td style="color: ${isCorrect ? "green" : "red"}; font-weight: bold;">
              ${isCorrect ? "✅" : "❌"}
            </td>`;
          })
          .join("");

        return `
            <tr>
              <td><strong>${escapeHtml(sub.studentName)}</strong></td>
              <td>${escapeHtml(sub.studentPhone || "-")}</td>
              <td style="font-weight: bold; color: var(--primary-color);">${sub.score} / ${totalPoints}</td>
              ${answersCells}
              <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
              <td class="no-print">
                <button onclick="window.openExamDetails('${exam.id}', '${escapeHtml(sub.studentName)}', '${escapeHtml(sub.studentPhone || "")}')" class="btn-primary" style="padding: 0.3rem 0.5rem; font-size: 0.8rem; margin-left: 0.5rem;">مراجعة الورقة</button>
                <button onclick="window.app.creatorController.deleteExamResult('${sub.id}', '${exam.id}')" class="btn-danger" style="padding: 0.3rem 0.5rem; font-size: 0.8rem;">حذف</button>
              </td>
            </tr>
          `;
      })
      .join("");

    container.innerHTML = `
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

  // تبديل ظهور حقل كتابة المادة المخصصة
  toggleCreatorCustomSubject(val) {
    document.getElementById("creator-custom-subject-group").style.display =
      val === "custom" ? "block" : "none";
  }

  // إغلاق ورقة الإجابة
  closeExamDetailsModal() {
    document
      .getElementById("student-exam-details-modal")
      .classList.remove("active");
  }

  // فتح ورقة الإجابة التفصيلية ومعرفة الأخطاء
  async openExamDetails(examId, studentName, studentPhone) {
    this.showLoading();
    try {
      const repo = this.takerController.examRepository;
      const subRepo = this.creatorController.submissionRepository;

      const exam = await repo.getExamById(examId);
      const questions = await repo.getAdminExamQuestions(examId);
      const submissions = await subRepo.getSubmissionsByExam(examId);

      const sub = submissions.find(
        (s) =>
          s.student_name.trim() === studentName.trim() &&
          (s.student_phone || "").trim() === (studentPhone || "").trim(),
      );

      window.app.hideLoading();

      if (!exam || !sub) {
        alert("عذراً، لم يتم العثور على ورقة الإجابة التفصيلية.");
        return;
      }

      document.getElementById("details-student-name").textContent = studentName;
      document.getElementById("details-student-phone").textContent =
        studentPhone || "غير متوفر";
      document.getElementById("details-exam-title").textContent = exam.title;

      const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
      const scorePercent =
        totalPoints > 0 ? Math.round((sub.score / totalPoints) * 100) : 0;
      document.getElementById("details-score-badge").innerHTML =
        `<span style="color:var(--primary-color);">${sub.score} / ${totalPoints}</span> (${scorePercent}%)`;

      const container = document.getElementById("details-questions-container");
      container.innerHTML = "";

      questions.forEach((q, qIdx) => {
        const studentAnsIdx = sub.answers[q.id];
        const isCorrect =
          studentAnsIdx !== undefined &&
          Number(studentAnsIdx) === q.correctOptionIndex;

        const card = document.createElement("div");
        card.className = "review-q-card";
        if (isCorrect) {
          card.style.borderRight = "4px solid #4caf50";
        } else {
          card.style.borderRight = "4px solid #f44336";
        }

        card.innerHTML = `
            <div style="font-weight:600; margin-bottom:0.75rem;">
              <span style="color:${isCorrect ? "#2e7d32" : "#c62828"}">السؤال ${qIdx + 1}: </span> ${escapeHtml(q.questionText)}
            </div>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              ${q.options
                .map((opt, oIdx) => {
                  let borderStyle = "1px solid var(--border-color)";
                  let bgColor = "#ffffff";
                  let badge = "";

                  const isSelectedByStudent =
                    studentAnsIdx !== undefined &&
                    Number(studentAnsIdx) === oIdx;
                  const isModelAnswer = oIdx === q.correctOptionIndex;

                  if (isModelAnswer) {
                    borderStyle = "2px dashed #4caf50";
                    badge = ` <span style="font-size:11px; font-weight:700; color:#2e7d32; margin-inline-start:auto;">🎯 إجابة نموذجية</span>`;
                  }

                  if (isSelectedByStudent) {
                    if (isCorrect) {
                      bgColor = "#e8f5e9";
                      borderStyle = "1px solid #4caf50";
                      badge += ` <span class="badge success" style="font-size:9px; margin-inline-start:0.5rem;">إجابتك ✅</span>`;
                    } else {
                      bgColor = "#ffebee";
                      borderStyle = "1px solid #f44336";
                      badge += ` <span class="badge danger" style="font-size:9px; margin-inline-start:0.5rem;">إجابتك ❌</span>`;
                    }
                  }

                  return `
                  <div class="review-option-row" style="background:${bgColor}; border:${borderStyle}; font-weight:${isSelectedByStudent ? "600" : "normal"};">
                    <span style="width:20px; height:20px; border-radius:50%; border:1px solid var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:11px; background:${isSelectedByStudent ? "var(--primary-color)" : "#fff"}; color:${isSelectedByStudent ? "#fff" : "var(--text-main)"};">
                      ${String.fromCharCode(65 + oIdx)}
                    </span>
                    <span>${escapeHtml(opt)}</span>
                    ${badge}
                  </div>
                `;
                })
                .join("")}
            </div>
          `;
        container.appendChild(card);
      });

      document
        .getElementById("student-exam-details-modal")
        .classList.add("active");
    } catch (e) {
      window.app.hideLoading();
      window.app.showError("فشل فتح تفاصيل ورقة الإجابة: " + e.message);
    }
  }

  // تجميع سجل الطلاب ديناميكياً من كافة البيانات
  async renderStudentsCumulativeRegistry() {
    const container = document.getElementById(
      "students-cumulative-registry-container",
    );
    this.showLoading();

    try {
      const studentsList = await this.studentRepository.listAllStudents();
      const approvedStudents = studentsList.filter(
        (s) => s.status === "approved",
      );

      // جلب كل الامتحانات والتسليمات
      const exams =
        await this.creatorController.examRepository.listExamsByCreator(
          this.currentUserId,
        );

      // جلب جميع تسليمات كل الامتحانات بالتوازي
      const submissionsPromises = exams.map((exam) =>
        this.creatorController.submissionRepository.getSubmissionsByExam(
          exam.id,
        ),
      );
      const submissionsResults = await Promise.all(submissionsPromises);
      const allSubmissions = submissionsResults.flat();

      this.hideLoading();

      if (approvedStudents.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا يوجد طلاب معتمدين بعد.</p>`;
        return;
      }

      // بناء خارطة (Map) السجل لكل طالب بناءً على هاتفه واسمه
      const registry = {};

      approvedStudents.forEach((stud) => {
        registry[stud.student_phone] = {
          id: stud.id,
          name: stud.student_name,
          phone: stud.student_phone, // this is whatsapp
          hawza_number: stud.member_number || stud.hawza_number || "غير محدد",
          city: stud.province || stud.city || "—",
          qualification: stud.qualification || "—",
          birthdate: stud.birthdate || "—",
          telegram: stud.telegram_user || "—",
          stage: stud.stage || "—",
          marital_status: stud.marital_status || "—",
          study_type: stud.study_type || "—",
          is_student: stud.is_student || "—",
          submissions: [],
        };
      });

      // ربط التسليمات بالطلاب بناء على الهاتف
      allSubmissions.forEach((sub) => {
        const phone = sub.student_phone;
        if (registry[phone]) {
          // البحث عن الامتحان لمعرفة المادة والاسم
          const exam = exams.find((e) => e.id === sub.exam_id);
          if (exam) {
            registry[phone].submissions.push({
              examId: sub.exam_id,
              examTitle: exam.title,
              subject: exam.subject || "غير محدد",
              testType: exam.test_type || exam.testType || "quiz",
              score: sub.score,
              status: "present",
              submittedAt: sub.submitted_at,
            });
          }
        }
      });

      // إضافة الغيابات للامتحانات المنتهية التي لم يسلمها الطالب المعتمد
      approvedStudents.forEach((stud) => {
        const studSubs = registry[stud.student_phone].submissions;
        const submittedExamIds = new Set(studSubs.map((s) => s.examId));

        exams.forEach((exam) => {
          if (exam.isEnded()) {
            const normStr2 = (str) => {
              if (!str) return "";
              return str
                .trim()
                .replace(/[أإآا]/g, "ا")
                .replace(/ة/g, "ه")
                .replace(/ي$/g, "ى");
            };
            const studentStage = normStr2(stud.stage);
            const studentQual = normStr2(stud.qualification);
            const examStage = normStr2(exam.targetStage);
            const matchStage =
              !examStage ||
              examStage === normStr2("الكل") ||
              (examStage === studentStage && studentStage !== "");
            let matchSection = false;
            if (
              !exam.targetSections ||
              (Array.isArray(exam.targetSections) &&
                exam.targetSections.some(
                  (s) => normStr2(s) === normStr2("الكل"),
                )) ||
              (typeof exam.targetSections === "string" &&
                normStr2(exam.targetSections).includes(normStr2("الكل")))
            ) {
              matchSection = true;
            } else if (Array.isArray(exam.targetSections)) {
              matchSection = exam.targetSections.some(
                (sec) => normStr2(sec) === studentQual && studentQual !== "",
              );
            } else if (typeof exam.targetSections === "string") {
              matchSection =
                normStr2(exam.targetSections).includes(studentQual) &&
                studentQual !== "";
            }

            if (matchStage && matchSection && !submittedExamIds.has(exam.id)) {
              studSubs.push({
                examId: exam.id,
                examTitle: exam.title,
                subject: exam.subject || "غير محدد",
                testType: exam.test_type || exam.testType || "quiz",
                score: 0,
                status: "absent",
                submittedAt: null,
              });
            }
          }
        });
      });

      Object.values(registry).forEach((student) => {
        const subs = student.submissions;
        const halfSub = subs.find((s) => s.testType === "half");
        const finalSub = subs.find((s) => s.testType === "final");

        student.halfGrade = halfSub ? halfSub.score : 0;
        student.finalGrade = finalSub ? finalSub.score : 0;

        if (halfSub || finalSub) {
          student.successMeasure =
            (student.halfGrade || 0) + (student.finalGrade || 0);
          student.hasDualGrades = true;
        } else {
          const examsCount = subs.length;
          const totalScore = subs.reduce((acc, sub) => acc + sub.score, 0);
          student.successMeasure =
            examsCount > 0 ? Math.round(totalScore / examsCount) : 0;
          student.hasDualGrades = false;
        }
      });

      this.currentRegistry = registry;
      this.filterRegistry();
    } catch (e) {
      this.hideLoading();
      this.showError("حدث خطأ أثناء تحميل السجل التراكمي: " + e.message);
    }
  }

  renderFilteredRegistry(students) {
    const container = document.getElementById(
      "students-cumulative-registry-container",
    );
    if (!container) return;

    if (students.length === 0) {
      container.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا توجد بيانات مطابقة.</p>`;
      return;
    }

    container.innerHTML = students
      .map((student) => {
        const subs = student.submissions;
        const avatarColor =
          subs.length > 0 ? "var(--primary-color)" : "var(--text-muted)";

        return `
          <div class="form-card" style="margin-bottom:0.75rem; border-right:4px solid ${avatarColor}; padding:1.25rem 1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--primary-color); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:1.1rem;">
                  ${student.name.charAt(0)}
                </div>
                <div>
                  <strong style="font-size:1.05rem;">👤 ${escapeHtml(student.name)}</strong><br>
                  <small class="text-muted">📞 ${escapeHtml(student.phone)} | ✈️ تليجرام: ${escapeHtml(student.telegram)} | 🏛️ المرحلة: ${escapeHtml(student.stage || "—")} | 🔖 الشعبة: ${escapeHtml(student.qualification || "—")}</small>
                </div>
              </div>
              
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <div style="background:#f8f9fa; border-radius:var(--radius-sm); border:1px solid var(--border-color); padding:4px 10px; text-align:center; min-width:60px;">
                  <div style="font-size:1rem; font-weight:700; color:var(--primary-color);">${subs.length}</div>
                  <div style="font-size:9px; color:var(--text-muted);">امتحانات</div>
                </div>
                <div style="background:${student.hasDualGrades ? "var(--primary-light)" : "#f8f9fa"}; border-radius:var(--radius-sm); border:1px solid ${student.hasDualGrades ? "var(--primary-color)" : "var(--border-color)"}; padding:4px 12px; text-align:center; min-width:105px;">
                  <div style="font-size:1rem; font-weight:800; color:${student.hasDualGrades ? "var(--primary-color)" : "var(--text-muted)"};">${student.successMeasure}%</div>
                  <div style="font-size:9px; font-weight:700; color:var(--text-muted);">النتيجة الكلية (50+50)</div>
                </div>
              </div>
              </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
              <button onclick="window.app.openStudentProfile('${student.phone}')" class="btn-primary" style="flex: 1; min-width: 110px; padding: 0.6rem;">📖 ملف الطالب</button>
              <button onclick="window.app.showStudentAttendance('${student.id}', '${escapeHtml(student.name)}')" class="btn-secondary" style="flex: 1; min-width: 110px; padding: 0.6rem;">📅 سلوك الحضور</button>
              <button onclick="window.app.openCertificateModal('${student.phone}')" class="btn-primary" style="background: linear-gradient(135deg, #d97706, #b45309); border: none; flex: 1; min-width: 110px; padding: 0.6rem; font-weight: 800;">🎓 إصدار الشهادة</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  filterRegistry() {
    if (!this.currentRegistry) return;

    const searchQuery = (
      document.getElementById("registry-search-input")?.value || ""
    )
      .toLowerCase()
      .trim();
    const stageFilter =
      document.getElementById("registry-stage-filter")?.value || "";
    const qualFilter =
      document.getElementById("registry-qual-filter")?.value || "";

    let students = Object.values(this.currentRegistry);

    if (searchQuery) {
      students = students.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery) ||
          s.phone.includes(searchQuery),
      );
    }
    if (stageFilter) {
      students = students.filter((s) => s.stage === stageFilter);
    }
    if (qualFilter) {
      students = students.filter((s) => s.qualification === qualFilter);
    }

    // ترتيب تنازلي حسب عدد الامتحانات
    students.sort((a, b) => b.submissions.length - a.submissions.length);

    this.renderFilteredRegistry(students);
  }

  exportRegistryToCSV() {
    if (!this.currentRegistry) {
      this.showError("لا توجد بيانات للتصدير.");
      return;
    }

    const students = Object.values(this.currentRegistry);
    if (students.length === 0) return;

    // Header row
    let csvContent = "\uFEFF"; // UTF-8 BOM لضمان عمل اللغة العربية في الإكسل
    csvContent +=
      "الاسم,رقم الهاتف,المرحلة,الشعبة,عدد الامتحانات,متوسط الدرجة %\n";

    students.forEach((s) => {
      const examsCount = s.submissions.length;
      const avgPct =
        examsCount > 0
          ? Math.round(
              (s.submissions.reduce((acc, sub) => acc + sub.score, 0) /
                examsCount) *
                10,
            )
          : 0;

      // Escape quotes
      const name = `"${s.name.replace(/"/g, '""')}"`;
      const phone = `"${s.phone}"`;
      const stage = `"${s.stage || ""}"`;
      const qual = `"${s.qualification || ""}"`;

      csvContent += `${name},${phone},${stage},${qual},${examsCount},${avgPct}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `سجل_الطلاب_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async renderLeaderboard() {
    const podiumContainer = document.getElementById(
      "leaderboard-podium-container",
    );
    const listContainer = document.getElementById("leaderboard-list-container");

    if (!this.currentRegistry) {
      await this.renderStudentsCumulativeRegistry();
    }

    if (
      !this.currentRegistry ||
      Object.keys(this.currentRegistry).length === 0
    ) {
      podiumContainer.innerHTML = `<p class="text-muted text-center">لا توجد بيانات كافية لعرض لوحة الشرف.</p>`;
      listContainer.style.display = "none";
      return;
    }

    let students = Object.values(this.currentRegistry).filter(
      (s) => s.submissions.length > 0,
    );

    students.forEach((s) => {
      const totalScore = s.submissions.reduce((acc, sub) => acc + sub.score, 0);
      // Assuming max score is 10. Avg as a percentage or out of 10.
      // If exams are out of 10, the score is out of 10. Let's show average score out of 10.
      s.avgScore = totalScore / s.submissions.length;
    });

    students.sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.submissions.length - a.submissions.length;
    });

    if (students.length === 0) {
      podiumContainer.innerHTML = `<p class="text-muted text-center">لا توجد درجات حتى الآن.</p>`;
      listContainer.style.display = "none";
      return;
    }

    const top3 = students.slice(0, 3);
    const others = students.slice(3);

    let podiumHTML = '<div class="podium-container">';

    if (top3[1]) {
      podiumHTML += `
          <div class="podium-step podium-silver">
            <div class="podium-avatar">${top3[1].name.charAt(0)}</div>
            <div class="podium-name">${escapeHtml(top3[1].name.split(" ")[0])}</div>
            <div class="podium-score">${Math.round(top3[1].avgScore * 10)}%</div>
            <div class="podium-rank">2</div>
          </div>
        `;
    }

    if (top3[0]) {
      podiumHTML += `
          <div class="podium-step podium-gold">
            <div class="podium-avatar">${top3[0].name.charAt(0)}</div>
            <div class="podium-name">${escapeHtml(top3[0].name.split(" ")[0])}</div>
            <div class="podium-score">${Math.round(top3[0].avgScore * 10)}%</div>
            <div class="podium-rank">1</div>
          </div>
        `;
    }

    if (top3[2]) {
      podiumHTML += `
          <div class="podium-step podium-bronze">
            <div class="podium-avatar">${top3[2].name.charAt(0)}</div>
            <div class="podium-name">${escapeHtml(top3[2].name.split(" ")[0])}</div>
            <div class="podium-score">${Math.round(top3[2].avgScore * 10)}%</div>
            <div class="podium-rank">3</div>
          </div>
        `;
    }

    podiumHTML += "</div>";
    podiumContainer.innerHTML = podiumHTML;

    if (others.length > 0) {
      let listHTML = "";
      others.forEach((student, index) => {
        listHTML += `
            <div class="leaderboard-row">
              <div class="rank-circle">${index + 4}</div>
              <div style="flex: 1; margin-left: 1rem; margin-right: 1rem;">
                <strong style="font-size:1.1rem; color:var(--primary-color);">👤 ${escapeHtml(student.name)}</strong>
                <div style="font-size:0.85rem; color:var(--text-muted);">المرحلة: ${escapeHtml(student.stage)} | الشعبة: ${escapeHtml(student.qualification)} | ${student.submissions.length} امتحانات</div>
              </div>
              <div style="font-weight: bold; font-size: 1.2rem; color: #217346;">
                ${Math.round(student.avgScore * 10)}%
              </div>
            </div>
          `;
      });
      listContainer.innerHTML = listHTML;
      listContainer.style.display = "block";
    } else {
      listContainer.style.display = "none";
    }
  }

  openPendingProfile(id) {
    if (!this.pendingStudents) return;
    const p = this.pendingStudents.find((s) => s.id === id);
    if (!p) {
      this.showError("لم يتم العثور على بيانات الطلب.");
      return;
    }

    document.getElementById("pp-avatar").textContent = p.student_name.charAt(0);
    document.getElementById("pp-name").textContent =
      `${p.student_name} ${p.surname || ""}`;
    document.getElementById("pp-date").textContent =
      `📅 تاريخ التقديم: ${new Date(p.created_at).toLocaleDateString("ar")}`;

    document.getElementById("pp-phone").textContent = `📞 ${p.student_phone}`;
    document.getElementById("pp-city").textContent =
      `📍 ${p.province || p.city || "غير محدد"}`;
    document.getElementById("pp-birthdate").textContent =
      `🎂 ${p.birthdate || "غير محدد"}`;
    const elMarital = document.getElementById("pp-marital");
    if (elMarital)
      elMarital.textContent = `💰 ${p.marital_status || "غير محدد"}`;
    document.getElementById("pp-isstudent").textContent =
      `👩‍🎓 ${p.is_student || "غير محدد"}`;
    document.getElementById("pp-study").textContent =
      `📚 ${p.study_type || "غير محدد"}`;

    // Bind approve/reject buttons
    const btnApprove = document.getElementById("btn-pp-approve");
    const btnReject = document.getElementById("btn-pp-reject");

    // Remove old listeners by replacing the node
    const newBtnApprove = btnApprove.cloneNode(true);
    const newBtnReject = btnReject.cloneNode(true);
    btnApprove.replaceWith(newBtnApprove);
    btnReject.replaceWith(newBtnReject);

    newBtnApprove.addEventListener("click", async () => {
      const stage = prompt(
        "أدخل المرحلة الدراسية المخصصة للطالبة:",
        p.stage && p.stage !== "لم يتم التحديد بعد" ? p.stage : "",
      );
      if (stage === null) return;
      const cleanStage = stage.trim() || "غير محدد";

      const section = prompt(
        "أدخل الشعبة المخصصة للطالبة (مثال: أ، ب، ج):",
        p.qualification || "",
      );
      if (section === null) return;
      const cleanSection = section.trim() || "غير محدد";

      const hawzaInput = prompt(
        "أدخل الرقم الحوزوي (اختياري). إذا تُرك فارغاً سيتم توليد رقم تسلسلي تلقائياً:",
      );
      if (hawzaInput === null) return;
      const cleanHawza = hawzaInput.trim() || null;

      document.getElementById("pending-profile-modal").style.display = "none";
      await this.approveStudent(p.id, cleanStage, cleanSection, cleanHawza);
    });

    newBtnReject.addEventListener("click", async () => {
      if (confirm("هل أنت متأكد من رفض طلب هذه الطالبة؟")) {
        document.getElementById("pending-profile-modal").style.display = "none";
        await this.rejectStudent(p.id);
      }
    });

    document.getElementById("pending-profile-modal").style.display = "flex";
  }

  showStudentAttendance(studentId, studentName) {
    const records = JSON.parse(
      localStorage.getItem("mzmz_attendance_records") || "[]",
    );
    const studentRecords = records.filter((r) => r.studentId === studentId);
    const totalDays = studentRecords.length;
    let lastDays = studentRecords
      .slice(-3)
      .map((r) => r.date)
      .join(" , ");
    let msg = `سلوك الحضور للطالب/ة: ${studentName}\n\n✅ عدد أيام الحضور الكلي: ${totalDays} يوم`;
    if (totalDays > 0) {
      msg += `\n📅 آخر أيام الحضور: ${lastDays}`;
    } else {
      msg += `\n❌ لم يتم تسجيل أي حضور للطالب.`;
    }
    alert(msg);
  }

  openStudentProfile(phone) {
    if (!this.currentRegistry || !this.currentRegistry[phone]) {
      this.showError("لم يتم العثور على بيانات الطالب.");
      return;
    }

    const student = this.currentRegistry[phone];
    this.currentProfilePhone = phone;
    const subs = student.submissions;

    // Populate Header
    document.getElementById("sp-avatar").textContent = student.name.charAt(0);
    document.getElementById("sp-name").textContent = student.name;
    document.getElementById("sp-stage").textContent =
      `🏛️ المرحلة: ${student.stage || "—"}`;
    document.getElementById("sp-qual").textContent =
      `🔖 الشعبة: ${student.qualification || "—"}`;
    document.getElementById("sp-phone").textContent =
      `🔢 الرقم الحوزوي: ${student.hawza_number || "—"}`;

    const elWhatsapp = document.getElementById("sp-whatsapp");
    if (elWhatsapp) elWhatsapp.textContent = `📞 واتساب: ${student.phone}`;

    document.getElementById("sp-city").textContent =
      `📍 المدينة: ${student.city || "—"}`;

    const elBirth = document.getElementById("sp-birthdate");
    if (elBirth)
      elBirth.textContent = `🎂 المواليد: ${student.birthdate || "—"}`;

    const elMarital = document.getElementById("sp-marital");
    if (elMarital)
      elMarital.textContent = `💍 الحالة: ${student.marital_status || "—"}`;

    const elStudy = document.getElementById("sp-study");
    if (elStudy)
      elStudy.textContent = `📚 الدراسة: ${student.study_type || "—"}`;

    const elIsStudent = document.getElementById("sp-isstudent");
    if (elIsStudent)
      elIsStudent.textContent = `🎓 طالبة: ${student.is_student || "—"}`;

    // Populate Stats
    document.getElementById("sp-total-exams").textContent = subs.length;
    const avgPct =
      subs.length > 0
        ? Math.round(
            (subs.reduce((acc, sub) => acc + sub.score, 0) / subs.length) * 10,
          )
        : 0;
    document.getElementById("sp-avg-score").textContent = `${avgPct}%`;

    // Populate Dual Grades and Success Evaluation ((Half + Final) / 2 = 100)
    const elHalf = document.getElementById("sp-half-score");
    const elFinal = document.getElementById("sp-final-score");
    const elSuccess = document.getElementById("sp-success-score");
    const elStatus = document.getElementById("sp-success-status");

    if (elHalf) elHalf.textContent = `${student.halfGrade || 0} / 50`;
    if (elFinal) elFinal.textContent = `${student.finalGrade || 0} / 50`;
    if (elSuccess) elSuccess.textContent = `${student.successMeasure || 0}%`;

    if (elStatus) {
      if (student.hasDualGrades) {
        if ((student.successMeasure || 0) >= 50) {
          elStatus.style.background = "#10b981";
          elStatus.textContent = "✅ ناجح ومجتاز للتقييم";
        } else {
          elStatus.style.background = "#ef4444";
          elStatus.textContent = "⚠️ يحتاج متابعة وتحسين";
        }
      } else {
        elStatus.style.background = "var(--accent-gold)";
        elStatus.textContent = "⏳ بانتظار درجتي Half و Final";
      }
    }

    // Populate Subjects
    const subjects = [
      ...new Set(
        subs.map((s) => s.subject).filter((s) => s && s !== "غير محدد"),
      ),
    ];
    const subjectsHTML = subjects
      .map(
        (s) =>
          `<span style="background:var(--primary-light); color:var(--primary-color); font-size:0.85rem; font-weight:700; padding:4px 12px; border-radius:20px; border:1.5px solid var(--primary-color);">${s}</span>`,
      )
      .join(" ");
    document.getElementById("sp-subjects").innerHTML =
      subjectsHTML || '<span class="text-muted">لم يدرس أي مادة بعد</span>';

    // Populate Exams Table
    const tbody = document.getElementById("sp-exams-table-body");
    if (subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem;" class="text-muted">لم يقم هذا الطالب بأداء أي امتحان (أو غير مخصص له امتحانات منتهية).</td></tr>`;
    } else {
      tbody.innerHTML = subs
        .map((r) => {
          const dateStr = r.submittedAt
            ? new Date(r.submittedAt).toLocaleDateString("ar")
            : "—";
          const isAbsent = r.status === "absent";

          let badgeClass = "quiz";
          let badgeText = "📝 كويز";
          if (r.testType === "half") {
            badgeClass = "half";
            badgeText = "⏳ نصف السنة";
          } else if (r.testType === "final") {
            badgeClass = "final";
            badgeText = "🎓 النهائي";
          } else if (r.testType === "second_session") {
            badgeClass = "warning";
            badgeText = "🔄 الدور الثاني";
          }
          const testTypeSpan = `<span class="test-type-badge ${badgeClass}" style="font-size: 0.72rem; margin-top: 4px; display: inline-block;">${badgeText}</span>`;

          return `
            <tr style="border-bottom: 1px solid var(--border-color); ${isAbsent ? "background-color: #fee2e2;" : ""}">
              <td style="padding: 1rem; text-align: right;">
                <div style="font-weight: bold;">${escapeHtml(r.examTitle)} ${isAbsent ? '<span style="color:red; font-size:0.8rem;">(غائب)</span>' : ""}</div>
                ${testTypeSpan}
              </td>
              <td style="padding: 1rem; text-align: right;">${escapeHtml(r.subject)}</td>
              <td style="padding: 1rem; text-align: center; font-weight: bold; color: ${isAbsent ? "red" : "var(--primary-color)"}; font-size: 1.1rem;">${r.score}</td>
              <td style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">${dateStr}</td>
              <td class="no-print" style="padding: 1rem; text-align: center;">
                ${
                  isAbsent
                    ? `<span class="text-muted" style="font-size:0.85rem;">لا توجد ورقة إجابة</span>`
                    : `<button class="btn-secondary" style="padding: 4px 10px; font-size: 0.85rem;" onclick="document.getElementById('student-profile-modal').style.display='none'; window.openExamDetails('${r.examId}', '${student.name}', '${student.phone}')">👁️ ورقة الإجابة</button>`
                }
              </td>
            </tr>
          `;
        })
        .join("");
    }

    // Show Modal
    document.body.classList.add("printing-modal");
    document.getElementById("student-profile-modal").style.display = "flex";
  }

  openCertificateModalFromProfile() {
    if (this.currentProfilePhone) {
      document.getElementById("student-profile-modal").style.display = "none";
      this.openCertificateModal(this.currentProfilePhone);
    } else {
      this.showError("يرجى تحديد الطالب أولاً.");
    }
  }

  openCertificateModal(phone) {
    if (!this.currentRegistry || !this.currentRegistry[phone]) {
      this.showError("بيانات الطالب غير متاحة.");
      return;
    }
    const student = this.currentRegistry[phone];

    // Enforce mid and final exams requirement
    const subs = student.submissions || [];
    const hasMid = subs.some(
      (s) =>
        s.testType === "half" ||
        (s.examTitle &&
          (s.examTitle.includes("نصف") ||
            s.examTitle.toLowerCase().includes("mid"))),
    );
    const hasFinal = subs.some(
      (s) =>
        s.testType === "final" ||
        (s.examTitle &&
          (s.examTitle.includes("نهائ") ||
            s.examTitle.toLowerCase().includes("final"))),
    );

    if (!hasMid && !hasFinal && subs.length === 0) {
      this.showError(
        "لا يمكن إصدار شهادة للطالب إلا بعد اجتياز الامتحانات.",
      );
      return;
    }

    this.currentCertStudent = student;

    // Populate Data
    const elName = document.getElementById("cert-stud-name");
    const elHawza = document.getElementById("cert-stud-hawza");
    const elStage = document.getElementById("cert-stud-stage");
    const elGroup = document.getElementById("cert-stud-group");
    const elGrade = document.getElementById("cert-stud-grade-badge");
    const elDate = document.getElementById("cert-issue-date");

    if (elName) elName.textContent = student.name;
    if (elHawza) elHawza.textContent = `#${student.hawza_number || student.id}`;
    if (elStage) elStage.textContent = student.stage || "المرحلة الأكاديمية";
    if (elGroup)
      elGroup.textContent = student.qualification
        ? `شعبة ${student.qualification}`
        : "العامة";
    if (elDate)
      elDate.textContent = new Date().toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    // Calculate honorable grade rating based on successMeasure or avg
    const score =
      student.successMeasure !== undefined ? student.successMeasure : 0;
    let ratingText = "مقبول ومستوفي";
    let badgeColor = "#991b1b";
    let bgBadge = "#fef2f2";
    let borderBadge = "#b91c1c";

    if (score >= 90) {
      ratingText = `امتياز (${score}%)`;
    } else if (score >= 80) {
      ratingText = `جيد جداً (${score}%)`;
    } else if (score >= 70) {
      ratingText = `جيد (${score}%)`;
    } else {
      ratingText = `مقبول ومستوفي (${score}%)`;
    }

    if (elGrade) {
      elGrade.textContent = ratingText;
      elGrade.style.color = badgeColor;
      elGrade.style.background = bgBadge;
      elGrade.style.borderColor = borderBadge;
    }

    const subjMap = {
      "تلاوة": 1,
      "فقه": 2,
      "عقائد": 3,
      "منطق": 4,
      "نحو": 5,
      "سيرة": 6
    };
    let scores = {1: "", 2: "", 3: "", 4: "", 5: "", 6: ""};
    
    // Fill based on keywords
    subs.forEach(s => {
       for (let key in subjMap) {
         if (s.examTitle && s.examTitle.includes(key)) {
            if (!scores[subjMap[key]] || s.score > scores[subjMap[key]]) {
                scores[subjMap[key]] = s.score;
            }
         }
       }
    });

    // Fallback: If empty, just dump the first few scores we have
    let usedScores = Object.values(scores).filter(x => x !== "");
    if (usedScores.length === 0) {
       subs.slice(0, 6).forEach((s, idx) => {
          scores[idx + 1] = s.score;
       });
    }

    for (let i = 1; i <= 6; i++) {
      const elGradeObj = document.getElementById(`cert-grade-${i}`);
      if (elGradeObj) {
        elGradeObj.textContent = scores[i] !== undefined ? scores[i] : "";
      }
    }

    const elFinalGrade = document.getElementById("cert-grade-7");
    if (elFinalGrade) {
      elFinalGrade.textContent = ratingText;
    }

    // Restore custom cert image from localStorage if present
    this.loadCertImageFromStorage();

    document.body.classList.add("printing-modal");
    document.getElementById("certificate-modal").style.display = "flex";
  }

  loadCertImageFromStorage() {
    const savedImg = localStorage.getItem("mzmz_custom_cert_image");
    const imgEl = document.getElementById("cert-custom-bg-img");
    const defEl = document.getElementById("cert-default-bg");
    if (savedImg && imgEl) {
      imgEl.src = savedImg;
      imgEl.style.display = "block";
      if (defEl) defEl.style.display = "none";
    } else {
      if (imgEl) {
        imgEl.src = "5429417628490471165.jpg";
        imgEl.style.display = "block";
      }
      if (defEl) defEl.style.display = "none";
    }
  }

  handleCustomCertImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      try {
        localStorage.setItem("mzmz_custom_cert_image", base64);
      } catch (err) {
        console.warn(
          "Could not store image in localStorage due to size limit:",
          err,
        );
      }
      const imgEl = document.getElementById("cert-custom-bg-img");
      const defEl = document.getElementById("cert-default-bg");
      if (imgEl) {
        imgEl.src = base64;
        imgEl.style.display = "block";
      }
      if (defEl) defEl.style.display = "none";
      this.showToast("✅ تم حفظ صورتك كخلفية رسمية للشهادة!");
    };
    reader.readAsDataURL(file);
  }

  adjustCertFontSize(step) {
    const layer = document.getElementById("cert-content-layer");
    if (!layer) return;
    let curr = parseFloat(layer.style.zoom || 1);
    curr += step * 0.05;
    if (curr < 0.6) curr = 0.6;
    if (curr > 1.6) curr = 1.6;
    layer.style.zoom = curr;
  }

  toggleCertLayout() {
    const hSec = document.getElementById("cert-header-section");
    const fSec = document.getElementById("cert-signatures-section");
    const pPrayer = document.getElementById("cert-footer-prayer");
    const label = document.getElementById("cert-stud-title-label");

    if (!hSec) return;
    const isMinimized = hSec.style.display === "none";
    if (isMinimized) {
      hSec.style.display = "block";
      if (fSec) fSec.style.display = "flex";
      if (pPrayer) pPrayer.style.display = "block";
      if (label) label.style.display = "block";
      document.getElementById("cert-content-layer").style.background =
        "rgba(255, 255, 255, 0.88)";
    } else {
      hSec.style.display = "none";
      if (fSec) fSec.style.display = "none";
      if (pPrayer) pPrayer.style.display = "none";
      if (label) label.style.display = "none";
      document.getElementById("cert-content-layer").style.background =
        "rgba(255, 255, 255, 0.15)";
      this.showToast("🎛️ تم تحويل النص لوضع الطباعة فوق صورتك الجاهزة!");
    }
  }

  resetCertBg() {
    localStorage.removeItem("mzmz_custom_cert_image");
    const imgEl = document.getElementById("cert-custom-bg-img");
    const defEl = document.getElementById("cert-default-bg");
    if (imgEl) {
      imgEl.src = "";
      imgEl.style.display = "none";
    }
    if (defEl) defEl.style.display = "flex";
    const input = document.getElementById("custom-cert-file-input");
    if (input) input.value = "";
    this.showToast("↻ تم إرجاع الإطار الذهبي الافتراضي للشهادة.");
  }

  generateMasterGradesReport() {
    if (
      !this.currentRegistry ||
      Object.keys(this.currentRegistry).length === 0
    ) {
      this.showError("لا توجد طالبات في السجل لإصدار الكشف.");
      return;
    }

    const stageFilter =
      document.getElementById("registry-stage-filter")?.value || "";
    const qualFilter =
      document.getElementById("registry-qual-filter")?.value || "";

    let students = Object.values(this.currentRegistry);
    if (stageFilter) students = students.filter((s) => s.stage === stageFilter);
    if (qualFilter)
      students = students.filter((s) => s.qualification === qualFilter);

    students.sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const elStage = document.getElementById("mr-stage-info");
    const elGroup = document.getElementById("mr-group-info");
    const elDate = document.getElementById("mr-date-info");
    const elCount = document.getElementById("mr-count-info");

    if (elStage)
      elStage.textContent = `المرحلة: ${stageFilter ? stageFilter : "جميع المراحل"}`;
    if (elGroup)
      elGroup.textContent = `الشعبة: ${qualFilter ? "شعبة " + qualFilter : "جميع الشعب"}`;
    if (elDate)
      elDate.textContent = `تاريخ الرصد: ${new Date().toLocaleDateString("ar-EG")}`;
    if (elCount) elCount.textContent = `العدد الكلي: ${students.length} طالبة`;

    const tbody = document.getElementById("master-report-table-body");
    if (!tbody) return;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding: 1.5rem; text-align: center;">لا توجد نتائج مطابقة لهذه التصفية.</td></tr>`;
    } else {
      tbody.innerHTML = students
        .map((s, idx) => {
          const half = s.halfGrade || 0;
          const finalG = s.finalGrade || 0;
          const succ = s.successMeasure !== undefined ? s.successMeasure : 0;

          let gradeWord = "غير مجتاز";
          let gradeColor = "red";
          if (succ >= 90) {
            gradeWord = "امتياز 🌟";
            gradeColor = "darkgreen";
          } else if (succ >= 80) {
            gradeWord = "جيد جداً";
            gradeColor = "green";
          } else if (succ >= 70) {
            gradeWord = "جيد";
            gradeColor = "blue";
          } else if (succ >= 50 || s.submissions.length > 0) {
            gradeWord = "ناجح ومستوفي";
            gradeColor = "#0f766e";
          }

          return `
            <tr style="border-bottom: 1px solid #000; background: ${idx % 2 === 0 ? "#fff" : "#f9f9f9"};">
              <td style="border: 1px solid #000; padding: 0.5rem; font-weight: bold;">${idx + 1}</td>
              <td style="border: 1px solid #000; padding: 0.5rem; text-align: right; font-weight: bold;">${escapeHtml(s.name)}</td>
              <td style="border: 1px solid #000; padding: 0.5rem;">#${s.hawza_number || "—"}</td>
              <td style="border: 1px solid #000; padding: 0.5rem;">${s.stage || "—"} / ${s.qualification ? "شعبة " + s.qualification : "—"}</td>
              <td style="border: 1px solid #000; padding: 0.5rem;">${half} / 50</td>
              <td style="border: 1px solid #000; padding: 0.5rem;">${finalG} / 50</td>
              <td style="border: 1px solid #000; padding: 0.5rem; font-weight: 900; color: #111;">${succ}%</td>
              <td style="border: 1px solid #000; padding: 0.5rem; font-weight: bold; color: ${gradeColor};">${gradeWord}</td>
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
  if (!text) return "";
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toLocalDatetimeString(date) {
  const tzoffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzoffset)
    .toISOString()
    .slice(0, 16);
  return localISOTime;
}

window.copyToClipboard = function (text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("📋 تم نسخ الرابط المباشر للامتحان بنجاح! شاركه مع طلابك الآن.");
    })
    .catch((err) => {
      alert("فشل النسخ: " + err);
    });
};

document.addEventListener("DOMContentLoaded", () => {
  window.app = new AppViewManager();
});
