const fs = require('fs');

const file = 'src/main.js';
let content = fs.readFileSync(file, 'utf8');

const regex1 = /const matchStage = !exam\.targetStage \|\| exam\.targetStage === "الكل" \|\| exam\.targetStage\.trim\(\) === student\.stage\?\.trim\(\);/g;
const regex2 = /const matchSection = !exam\.targetSections \|\| exam\.targetSections\.includes\("الكل"\) \|\| exam\.targetSections\.includes\(student\.qualification\?\.trim\(\)\);/g;

const replacement1 = `
                   const normStr = (str) => {
                     if (!str) return "";
                     return str.trim().replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ي$/g, 'ى');
                   };
                   const studentStage = normStr(student.stage);
                   const studentQual = normStr(student.qualification);
                   const examStage = normStr(exam.targetStage);
                   const matchStage = !examStage || examStage === normStr("الكل") || (examStage === studentStage && studentStage !== "");`;
                   
const replacement2 = `                   let matchSection = false;
                   if (!exam.targetSections || (Array.isArray(exam.targetSections) && exam.targetSections.some(s => normStr(s) === normStr("الكل"))) || (typeof exam.targetSections === 'string' && normStr(exam.targetSections).includes(normStr("الكل")))) {
                     matchSection = true;
                   } else if (Array.isArray(exam.targetSections)) {
                     matchSection = exam.targetSections.some(sec => normStr(sec) === studentQual && studentQual !== "");
                   } else if (typeof exam.targetSections === 'string') {
                     matchSection = normStr(exam.targetSections).includes(studentQual) && studentQual !== "";
                   }`;

// We have this pattern in two places: line 1488 and 2495.
// I will just use string replacement or regex replacement.

content = content.replace(/const matchStage = !exam\.targetStage \|\| exam\.targetStage === "الكل" \|\| exam\.targetStage\.trim\(\) === (student|stud)\.stage(\?)?\.trim\(\);[\s\S]*?const matchSection = !exam\.targetSections \|\| exam\.targetSections\.includes\("الكل"\) \|\| exam\.targetSections\.includes\((student|stud)\.qualification(\?)?\.trim\(\)\);/g, (match, p1) => {
  return `
                   const normStr2 = (str) => {
                     if (!str) return "";
                     return str.trim().replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ي$/g, 'ى');
                   };
                   const studentStage = normStr2(${p1}.stage);
                   const studentQual = normStr2(${p1}.qualification);
                   const examStage = normStr2(exam.targetStage);
                   const matchStage = !examStage || examStage === normStr2("الكل") || (examStage === studentStage && studentStage !== "");
                   let matchSection = false;
                   if (!exam.targetSections || (Array.isArray(exam.targetSections) && exam.targetSections.some(s => normStr2(s) === normStr2("الكل"))) || (typeof exam.targetSections === 'string' && normStr2(exam.targetSections).includes(normStr2("الكل")))) {
                     matchSection = true;
                   } else if (Array.isArray(exam.targetSections)) {
                     matchSection = exam.targetSections.some(sec => normStr2(sec) === studentQual && studentQual !== "");
                   } else if (typeof exam.targetSections === 'string') {
                     matchSection = normStr2(exam.targetSections).includes(studentQual) && studentQual !== "";
                   }
  `;
});

fs.writeFileSync(file, content);
console.log("Done 2");
