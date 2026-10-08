/**
 * TCIS Entrance Examination Portal - Examination Builder & Session Controller
 */

window.TCISExam = (function () {
    function getAllExams() {
        return window.TCISDB.getCollection('examinations');
    }

    function getExamById(id) {
        return window.TCISDB.getItem('examinations', 'id', id);
    }

    function createExam(examData) {
        const id = examData.id || window.TCISUtils.generateUniqueId('EXAM');
        const admin = window.TCISAuth.getCurrentAdmin();

        const newExam = {
            id: id,
            title: examData.title.trim(),
            code: examData.code ? examData.code.trim() : `TCIS-${Date.now().toString().slice(-4)}`,
            description: examData.description || '',
            subject: examData.subject || 'Multiple Subjects',
            instructions: examData.instructions || 'Read all questions carefully before answering.',
            durationMinutes: parseInt(examData.durationMinutes) || 60,
            startDate: examData.startDate || new Date().toISOString().split('T')[0],
            startTime: examData.startTime || '08:00',
            endDate: examData.endDate || '2027-12-31',
            endTime: examData.endTime || '23:59',
            totalMarks: parseFloat(examData.totalMarks) || 0,
            passMark: parseFloat(examData.passMark) || 50,
            maxAttempts: parseInt(examData.maxAttempts) || 1,
            resultVisibility: examData.resultVisibility || 'Immediately',
            cameraMonitoring: !!examData.cameraMonitoring,
            autoSubmit: !!examData.autoSubmit,
            randomizeQuestions: !!examData.randomizeQuestions,
            randomizeOptions: !!examData.randomizeOptions,
            allowBackwardNav: !!examData.allowBackwardNav,
            allowReview: !!examData.allowReview,
            status: examData.status || 'Draft',
            questionIds: examData.questionIds || [],
            createdAt: new Date().toISOString()
        };

        window.TCISDB.upsertItem('examinations', 'id', newExam);

        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Create Examination', `Created examination ${newExam.title} (ID: ${id}).`);
        }

        return newExam;
    }

    function updateExam(id, fields) {
        const existing = getExamById(id);
        if (!existing) return null;

        const updated = { ...existing, ...fields };
        window.TCISDB.upsertItem('examinations', 'id', updated);

        const admin = window.TCISAuth.getCurrentAdmin();
        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Update Examination', `Updated examination settings for ${id}.`);
        }

        return updated;
    }

    function deleteExam(id) {
        window.TCISDB.deleteItem('examinations', 'id', id);

        const admin = window.TCISAuth.getCurrentAdmin();
        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Delete Examination', `Deleted examination ID: ${id}.`);
        }
    }

    /**
     * Active Exam Session Heartbeat & Auto-Save Manager
     */
    function getActiveSession(studentId, examId) {
        const key = `tcis_session_${studentId}_${examId}`;
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    function saveActiveSessionAnswers(studentId, examId, answersMap, currentQIndex = 0, flaggedArray = [], startTime = null) {
        const key = `tcis_session_${studentId}_${examId}`;

        // Preserve existing startTime if not provided
        if (!startTime) {
            try {
                const existing = localStorage.getItem(key);
                if (existing) {
                    const parsed = JSON.parse(existing);
                    startTime = parsed.startTime || null;
                }
            } catch (e) { /* ignore */ }
        }

        const sessionData = {
            studentId: studentId,
            examId: examId,
            answers: answersMap,
            currentQuestionIndex: currentQIndex,
            flagged: flaggedArray,
            startTime: startTime,
            lastSaved: new Date().toISOString()
        };

        localStorage.setItem(key, JSON.stringify(sessionData));

        // Sync to store (upsertItem takes 3 args: collection, idKey, itemData)
        const sessionRecord = { ...sessionData, id: `${studentId}_${examId}` };
        window.TCISDB.upsertItem('examSessions', 'id', sessionRecord);
    }

    function clearActiveSession(studentId, examId) {
        const key = `tcis_session_${studentId}_${examId}`;
        localStorage.removeItem(key);
    }

    /**
     * Multi-device session guard check
     */
    function checkMultiDeviceActiveSession(studentId, examId) {
        const sessions = window.TCISDB.getCollection('examSessions');
        const existing = sessions.find(s => s.studentId === studentId && s.examId === examId && s.status === 'Active');

        if (existing) {
            // Check if active within last 2 minutes
            const lastActive = new Date(existing.lastSaved).getTime();
            if (Date.now() - lastActive < 120000) {
                return { isBlocked: true, message: 'An active examination session already exists on another browser or device.' };
            }
        }
        return { isBlocked: false };
    }

    return {
        getAllExams,
        getExamById,
        createExam,
        updateExam,
        deleteExam,
        getActiveSession,
        saveActiveSessionAnswers,
        clearActiveSession,
        checkMultiDeviceActiveSession
    };
})();
