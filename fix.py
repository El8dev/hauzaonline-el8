import os
path = r'c:\Users\Al8\Desktop\zmzm\zmzm\zmzm\mzmz.10 (2)\mzmz.10\mzmz_app\src\main.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Insert closing div at line 2574 (index 2574)
lines.insert(2574, '              </div>\n')

# 2. Insert missing code at line 2547 (index 2546)
missing_code = """
                    if (matchStage && matchSection && !submittedExamIds.has(exam.id)) {
                      studSubs.push({
                        examId: exam.id,
                        examTitle: exam.title,
                        subject: exam.subject || "غير محدد",
                        testType: exam.test_type || exam.testType || "quiz",
                        score: 0,
                        status: 'absent',
                        submittedAt: null
                      });
                    }
                  }
                });
              });

              Object.values(registry).forEach(student => {
                const examsCount = student.submissions.length;
                const totalScore = student.submissions.reduce((acc, sub) => acc + sub.score, 0);
                student.successMeasure = examsCount > 0 ? Math.round(totalScore / examsCount) : 0;
                student.hasDualGrades = examsCount >= 2;
              });

              this.currentRegistry = registry;
              this.filterRegistry();
              
            } catch (e) {
              this.hideLoading();
              this.showError("حدث خطأ أثناء تحميل السجل التراكمي: " + e.message);
            }
          }

          renderFilteredRegistry(students) {
            const container = document.getElementById("students-cumulative-registry-container");
            if (!container) return;
            
            if (students.length === 0) {
              container.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">لا توجد بيانات مطابقة.</p>`;
              return;
            }
"""
lines.insert(2546, missing_code)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed!')
