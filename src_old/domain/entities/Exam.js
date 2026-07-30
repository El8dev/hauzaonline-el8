// src/domain/entities/Exam.js
window.Exam = class Exam {
  constructor(data) {
    Object.assign(this, data);
    const { id, title, description, start_time, end_time, created_by, created_at, subject, target_stage, target_sections, target_section, shuffle_order } = data;
    this.id = id;
    this.title = title;
    this.description = description;
    this.startTime = start_time ? new Date(start_time) : null;
    this.endTime = end_time ? new Date(end_time) : null;
    this.createdBy = created_by;
    this.createdAt = created_at ? new Date(created_at) : null;
    this.subject = subject || "غير محدد";
    this.targetStage = target_stage || "الكل";
    this.shuffleOrder = shuffle_order !== undefined ? shuffle_order : true;
    
    // Support new array format and fallback to old string format
    if (target_sections && Array.isArray(target_sections)) {
      this.targetSections = target_sections;
    } else if (target_sections && typeof target_sections === 'string') {
      try { this.targetSections = JSON.parse(target_sections); } catch(e) { this.targetSections = [target_sections]; }
    } else if (target_section) {
      this.targetSections = [target_section];
    } else {
      this.targetSections = ["الكل"];
    }
  }

  isActive() {
    const now = new Date();
    if (this.startTime && now < this.startTime) return false;
    if (this.endTime && now > this.endTime) return false;
    return true;
  }

  isStarted() {
    const now = new Date();
    return !this.startTime || now >= this.startTime;
  }

  isEnded() {
    const now = new Date();
    return this.endTime && now > this.endTime;
  }
}
