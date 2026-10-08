/**
 * TCIS Entrance Examination Portal - Result Engine & Grading System
 */

window.TCISResults = (function () {
    /**
     * Compute and save exam results upon student submission
     * @param {string} studentId
     * @param {string} examId
     * @param {Object} studentAnswersMap
     * @param {Object} [examMeta] - Optional metadata: { durationSeconds, tabSwitchCount, violationCount, snapshotCount, flaggedCount }
     */
    async function computeAndSaveExamResult(studentId, examId, studentAnswersMap, examMeta = {}) {
        const exam = window.TCISDB.getItem('examinations', 'id', examId);
        const student = window.TCISDB.getItem('students', 'studentId', studentId);

        if (!exam || !student) return null;

        // Fetch question bank — refresh from Firestore if local cache is empty
        let allQuestions = window.TCISDB.getCollection('questionBank');
        if (allQuestions.length === 0 && window.TCISFirestoreInstance) {
            try {
                const snapshot = await window.TCISFirestoreInstance.collection('questionBank').get();
                const docs = [];
                snapshot.forEach(doc => docs.push(doc.data()));
                if (docs.length > 0) {
                    const store = window.TCISDB.getStore();
                    store.questionBank = docs;
                    window.TCISDB.saveStore(store);
                    allQuestions = docs;
                }
            } catch (e) {
                console.warn('Could not fetch questionBank from Firestore for grading:', e);
            }
        }

        // Fetch target questions for this exam
        const examQuestions = allQuestions.filter(q => (exam.questionIds || []).includes(q.id));

        let totalMarks = 0;
        let marksObtained = 0;
        let attemptedCount = 0;
        let requiresEssayGrading = false;
        const gradedAnswers = [];

        examQuestions.forEach(question => {
            const qMarks = parseFloat(question.marks) || 1;
            totalMarks += qMarks;

            const studentAns = studentAnswersMap[question.id];
            if (studentAns !== undefined && studentAns !== null && studentAns !== '' &&
                !(Array.isArray(studentAns) && studentAns.length === 0)) {
                attemptedCount++;
            }

            const gradeResult = window.TCISQuestions.gradeQuestion(question, studentAns);

            if (gradeResult.requiresManualGrading) {
                requiresEssayGrading = true;
            } else {
                marksObtained += gradeResult.marksAwarded;
            }

            gradedAnswers.push({
                questionId: question.id,
                questionText: question.questionText,
                type: question.type,
                subject: question.subject || '',
                maxMarks: qMarks,
                studentAnswer: studentAns,
                correctAnswer: gradeResult.correctAnswer,
                marksAwarded: gradeResult.marksAwarded,
                isCorrect: gradeResult.isCorrect,
                feedback: gradeResult.feedback,
                explanation: question.explanation || '',
                requiresManualGrading: gradeResult.requiresManualGrading
            });
        });

        // Calculate percentage and letter grade
        const percentage = totalMarks > 0 ? (marksObtained / totalMarks) * 100 : 0;
        const gradeInfo = evaluateGrade(percentage);

        // Determine result visibility based on exam settings
        // settings is stored as a plain object (not array) in the store
        const rawSettings = window.TCISDB.getCollection('settings');
        const settings = Array.isArray(rawSettings) ? (rawSettings[0] || {}) : (rawSettings || {});
        const defaultVisibility = exam.resultVisibility || settings.resultVisibility || 'Immediately';
        const isReleased = defaultVisibility === 'Immediately' && !requiresEssayGrading;

        const resultId = `RES-${studentId.replace('TCIS-STU-', '')}-${examId.replace('EXAM-', '')}`;
        const unansweredCount = examQuestions.length - attemptedCount;

        const resultRecord = {
            id: resultId,
            examId: examId,
            studentId: studentId,
            studentName: `${student.firstName} ${student.lastName}`,
            examTitle: exam.title,
            subject: exam.subject,
            totalQuestions: examQuestions.length,
            attemptedCount: attemptedCount,
            unansweredCount: unansweredCount,
            flaggedCount: examMeta.flaggedCount || 0,
            totalMarks: totalMarks,
            marksObtained: Math.round(marksObtained * 100) / 100,
            percentage: Math.round(percentage * 10) / 10,
            grade: gradeInfo.grade,
            passStatus: percentage >= (exam.passMark || 50) ? 'PASS' : 'FAIL',
            submittedAt: new Date().toISOString(),
            durationSeconds: examMeta.durationSeconds || null,
            tabSwitchCount: examMeta.tabSwitchCount || 0,
            violationCount: examMeta.violationCount || 0,
            snapshotCount: examMeta.snapshotCount || 0,
            isEssayGraded: !requiresEssayGrading,
            status: isReleased ? 'Released' : 'Pending Review',
            answers: gradedAnswers
        };

        window.TCISDB.upsertItem('results', 'id', resultRecord);

        // Update student status
        window.TCISStudent.updateStudent(studentId, { examStatus: 'Completed' });

        return resultRecord;
    }

    /**
     * Map Percentage to Letter Grade & Pass/Fail using settings grading scale
     */
    function evaluateGrade(percentage) {
        // settings may be stored as a plain object or as an array in different contexts
        const rawSettings = window.TCISDB.getCollection('settings');
        const settings = Array.isArray(rawSettings) ? (rawSettings[0] || {}) : (rawSettings || {});
        const scale = settings.gradingScale || [
            { minScore: 80, maxScore: 100, grade: 'A', status: 'PASS' },
            { minScore: 70, maxScore: 79, grade: 'B', status: 'PASS' },
            { minScore: 60, maxScore: 69, grade: 'C', status: 'PASS' },
            { minScore: 50, maxScore: 59, grade: 'D', status: 'PASS' },
            { minScore: 0, maxScore: 49, grade: 'F', status: 'FAIL' }
        ];

        for (let rule of scale) {
            if (percentage >= rule.minScore && percentage <= rule.maxScore) {
                return rule;
            }
        }
        return { grade: 'F', status: 'FAIL' };
    }

    /**
     * Manual Essay Grading Handler
     */
    function gradeEssayAnswer(resultId, questionId, awardedMarks, teacherComments) {
        const result = window.TCISDB.getItem('results', 'id', resultId);
        if (!result) return null;

        let totalMarksObtained = 0;
        let allEssaysGraded = true;

        result.answers.forEach(ans => {
            if (ans.questionId === questionId) {
                ans.marksAwarded = parseFloat(awardedMarks) || 0;
                ans.teacherComments = teacherComments || '';
                ans.requiresManualGrading = false;
                ans.isCorrect = ans.marksAwarded > 0;
            }
            if (ans.requiresManualGrading) {
                allEssaysGraded = false;
            }
            totalMarksObtained += ans.marksAwarded;
        });

        const percentage = result.totalMarks > 0 ? (totalMarksObtained / result.totalMarks) * 100 : 0;
        const gradeInfo = evaluateGrade(percentage);

        result.marksObtained = Math.round(totalMarksObtained * 100) / 100;
        result.percentage = Math.round(percentage * 10) / 10;
        result.grade = gradeInfo.grade;
        result.passStatus = result.percentage >= 50 ? 'PASS' : 'FAIL';
        result.isEssayGraded = allEssaysGraded;

        window.TCISDB.upsertItem('results', 'id', result);

        const admin = window.TCISAuth.getCurrentAdmin();
        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Grade Essay', `Graded essay for result ID: ${resultId} (Awarded: ${awardedMarks} marks).`);
        }

        return result;
    }

    /**
     * Release Result to Student
     */
    function releaseResult(resultId) {
        const result = window.TCISDB.getItem('results', 'id', resultId);
        if (result) {
            result.status = 'Released';
            window.TCISDB.upsertItem('results', 'id', result);

            const admin = window.TCISAuth.getCurrentAdmin();
            if (admin) {
                window.TCISAuth.logAudit(admin.name, 'Release Result', `Released examination result ${resultId} to student.`);
            }
        }
    }

    return {
        computeAndSaveExamResult,
        evaluateGrade,
        gradeEssayAnswer,
        releaseResult
    };
})();
