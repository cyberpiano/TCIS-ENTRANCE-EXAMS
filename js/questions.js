/**
 * TCIS Entrance Examination Portal - Question Bank & Marking Engine
 */

window.TCISQuestions = (function () {
    function getAllQuestions() {
        return window.TCISDB.getCollection('questionBank');
    }

    function addQuestion(questionData) {
        const id = questionData.id || window.TCISUtils.generateUniqueId('QST');
        const admin = window.TCISAuth.getCurrentAdmin();

        const newQuestion = {
            id: id,
            subject: questionData.subject || 'General Knowledge',
            topic: questionData.topic || 'General',
            difficulty: questionData.difficulty || 'Medium',
            type: questionData.type || 'mcq',
            questionText: questionData.questionText.trim(),
            marks: parseFloat(questionData.marks) || 1,
            options: questionData.options || [],
            correctAnswer: questionData.correctAnswer,
            expectedAnswer: questionData.expectedAnswer || '',
            acceptableAnswers: questionData.acceptableAnswers || [],
            caseSensitive: !!questionData.caseSensitive,
            matchingPairs: questionData.matchingPairs || [],
            instructions: questionData.instructions || '',
            maxWords: questionData.maxWords ? parseInt(questionData.maxWords) : null,
            imageUrl: questionData.imageUrl || '',
            explanation: questionData.explanation || '',
            createdBy: admin ? admin.name : 'Admin',
            createdDate: new Date().toISOString().split('T')[0]
        };

        window.TCISDB.upsertItem('questionBank', 'id', newQuestion);

        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Add Question', `Added ${newQuestion.type} question in ${newQuestion.subject} (ID: ${id}).`);
        }

        return newQuestion;
    }

    function updateQuestion(questionId, fields) {
        const existing = window.TCISDB.getItem('questionBank', 'id', questionId);
        if (!existing) return null;

        const updated = { ...existing, ...fields };
        window.TCISDB.upsertItem('questionBank', 'id', updated);

        const admin = window.TCISAuth.getCurrentAdmin();
        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Update Question', `Updated question ID: ${questionId}.`);
        }

        return updated;
    }

    function deleteQuestion(questionId) {
        window.TCISDB.deleteItem('questionBank', 'id', questionId);

        const admin = window.TCISAuth.getCurrentAdmin();
        if (admin) {
            window.TCISAuth.logAudit(admin.name, 'Delete Question', `Deleted question ID: ${questionId}.`);
        }
    }

    /**
     * Automatic Marking Engine for Objective Question Types
     * @param {Object} question - Question definition object
     * @param {any} studentAnswer - Answer submitted by student
     * @returns {{ isCorrect: boolean, marksAwarded: number, feedback: string, requiresManualGrading: boolean, correctAnswer: any }}
     */
    function gradeQuestion(question, studentAnswer) {
        if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
            return {
                isCorrect: false,
                marksAwarded: 0,
                feedback: 'No answer submitted',
                requiresManualGrading: false,
                correctAnswer: _formatCorrectAnswer(question)
            };
        }

        const maxMarks = parseFloat(question.marks) || 1;

        switch (question.type) {
            case 'mcq': {
                const studentStr = String(studentAnswer).trim().toLowerCase();
                const correctStr = String(question.correctAnswer || '').trim().toLowerCase();
                const options = Array.isArray(question.options) ? question.options : [];
                const letterMap = ['a', 'b', 'c', 'd', 'e', 'f'];

                let isCorrect = (studentStr === correctStr);

                // If not direct match, check letter vs option text mappings
                if (!isCorrect && options.length > 0) {
                    // Check if question.correctAnswer is stored as a letter (e.g. 'A', 'Option A')
                    const cleanCorrectLetter = correctStr.replace(/^option\s+/i, '').trim();
                    const correctLetterIdx = letterMap.indexOf(cleanCorrectLetter);

                    // Check if student answer is stored as a letter (e.g. 'A', 'Option A')
                    const cleanStudentLetter = studentStr.replace(/^option\s+/i, '').trim();
                    const studentLetterIdx = letterMap.indexOf(cleanStudentLetter);

                    // 1. Correct Answer is Letter ('A') and Student answered Option Text ('Accra')
                    if (correctLetterIdx >= 0 && correctLetterIdx < options.length) {
                        const targetOptionText = String(options[correctLetterIdx] || '').trim().toLowerCase();
                        if (studentStr === targetOptionText || cleanStudentLetter === cleanCorrectLetter) {
                            isCorrect = true;
                        }
                    }

                    // 2. Correct Answer is Option Text ('Accra') and Student answered Letter ('A')
                    if (!isCorrect && studentLetterIdx >= 0 && studentLetterIdx < options.length) {
                        const targetOptionText = String(options[studentLetterIdx] || '').trim().toLowerCase();
                        if (correctStr === targetOptionText) {
                            isCorrect = true;
                        }
                    }

                    // 3. Match against option index if numeric string
                    if (!isCorrect && !isNaN(correctStr) && options[parseInt(correctStr)]) {
                        if (studentStr === String(options[parseInt(correctStr)]).trim().toLowerCase()) {
                            isCorrect = true;
                        }
                    }
                }

                // Determine best display text for correct answer
                const displayCorrect = _formatCorrectAnswer(question);

                return {
                    isCorrect,
                    marksAwarded: isCorrect ? maxMarks : 0,
                    feedback: isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${displayCorrect}`,
                    requiresManualGrading: false,
                    correctAnswer: displayCorrect
                };
            }

            case 'true_false': {
                const sAns = String(studentAnswer).trim().toLowerCase();
                const cAns = String(question.correctAnswer || '').trim().toLowerCase();
                const isCorrect = (sAns === cAns) ||
                                  (sAns === 't' && cAns === 'true') ||
                                  (sAns === 'true' && cAns === 't') ||
                                  (sAns === 'f' && cAns === 'false') ||
                                  (sAns === 'false' && cAns === 'f');

                const displayCorrect = question.correctAnswer ? (String(question.correctAnswer).toLowerCase() === 'true' ? 'True' : 'False') : 'True';

                return {
                    isCorrect,
                    marksAwarded: isCorrect ? maxMarks : 0,
                    feedback: isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${displayCorrect}`,
                    requiresManualGrading: false,
                    correctAnswer: displayCorrect
                };
            }

            case 'short_answer':
            case 'fill_blank': {
                const targetAnswers = [
                    question.correctAnswer || question.expectedAnswer,
                    ...(question.acceptableAnswers || [])
                ].filter(Boolean);

                // Normalize helper
                const normalize = (str) => {
                    let s = String(str).trim();
                    if (!question.caseSensitive) {
                        s = s.toLowerCase()
                            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
                            .replace(/\s{2,}/g, ' ');
                    }
                    return s;
                };

                const cleanStudent = normalize(studentAnswer);
                const isMatch = targetAnswers.some(ans => normalize(ans) === cleanStudent);

                // Build accepted display string
                const acceptedDisplay = targetAnswers.length > 1
                    ? `${targetAnswers[0]} (also: ${targetAnswers.slice(1).join(', ')})`
                    : String(targetAnswers[0] || '');

                return {
                    isCorrect: isMatch,
                    marksAwarded: isMatch ? maxMarks : 0,
                    feedback: isMatch ? 'Correct!' : `Expected: ${acceptedDisplay}`,
                    requiresManualGrading: false,
                    correctAnswer: acceptedDisplay
                };
            }

            case 'multi_select': {
                const rawCorrect = Array.isArray(question.correctAnswer) ? question.correctAnswer : (question.correctAnswer ? [question.correctAnswer] : []);
                const rawStudent = Array.isArray(studentAnswer) ? studentAnswer : (studentAnswer ? [studentAnswer] : []);
                const options = Array.isArray(question.options) ? question.options : [];
                const letterMap = ['a', 'b', 'c', 'd', 'e', 'f'];

                // Helper to normalize any item (letter or text) into standard text representation
                const normalizeOptionItem = (item) => {
                    const str = String(item).trim().toLowerCase();
                    const cleanLetter = str.replace(/^option\s+/i, '').trim();
                    const letterIdx = letterMap.indexOf(cleanLetter);
                    if (letterIdx >= 0 && letterIdx < options.length) {
                        return String(options[letterIdx] || '').trim().toLowerCase();
                    }
                    return str;
                };

                const correctSet = Array.from(new Set(rawCorrect.map(normalizeOptionItem))).filter(Boolean);
                const studentSet = Array.from(new Set(rawStudent.map(normalizeOptionItem))).filter(Boolean);

                if (correctSet.length === 0) {
                    return { isCorrect: false, marksAwarded: 0, feedback: 'Invalid question config', requiresManualGrading: false, correctAnswer: '—' };
                }

                const correctSelections = studentSet.filter(item => correctSet.includes(item)).length;
                const incorrectSelections = studentSet.filter(item => !correctSet.includes(item)).length;

                // Points per correct item, deduct for wrong selections (floor at 0)
                const pointsPerItem = maxMarks / correctSet.length;
                let calculatedMarks = Math.max(0, (correctSelections - incorrectSelections) * pointsPerItem);
                calculatedMarks = Math.round(calculatedMarks * 100) / 100;

                const isExactMatch = correctSelections === correctSet.length && incorrectSelections === 0;
                const displayCorrect = _formatCorrectAnswer(question);

                return {
                    isCorrect: isExactMatch,
                    marksAwarded: calculatedMarks,
                    feedback: isExactMatch ? 'All correct options selected!' : `Correct options: ${displayCorrect}`,
                    requiresManualGrading: false,
                    correctAnswer: displayCorrect
                };
            }

            case 'matching': {
                // studentAnswer format: { "Term": "Definition", ... }
                const pairs = question.matchingPairs || [];
                let correctPairsCount = 0;

                pairs.forEach(pair => {
                    if (studentAnswer && String(studentAnswer[pair.left] || '').trim().toLowerCase() === String(pair.right || '').trim().toLowerCase()) {
                        correctPairsCount++;
                    }
                });

                const isFullyCorrect = pairs.length > 0 && correctPairsCount === pairs.length;
                const partialMarks = pairs.length > 0 ? (correctPairsCount / pairs.length) * maxMarks : 0;
                const correctAnswerDisplay = pairs.map(p => `${p.left} → ${p.right}`).join(' | ');

                return {
                    isCorrect: isFullyCorrect,
                    marksAwarded: Math.round(partialMarks * 100) / 100,
                    feedback: `${correctPairsCount} of ${pairs.length} pairs matched correctly.`,
                    requiresManualGrading: false,
                    correctAnswer: correctAnswerDisplay
                };
            }

            case 'essay': {
                // Essays require manual evaluation by administrator
                return {
                    isCorrect: false,
                    marksAwarded: 0,
                    feedback: 'Pending manual grading by administrator.',
                    requiresManualGrading: true,
                    correctAnswer: question.expectedAnswer || null
                };
            }

            default:
                return { isCorrect: false, marksAwarded: 0, feedback: 'Unknown question type', requiresManualGrading: false, correctAnswer: null };
        }
    }

    /**
     * Format correct answer for display (used when student didn't answer or in results)
     * @private
     */
    function _formatCorrectAnswer(question) {
        if (!question) return '';
        switch (question.type) {
            case 'mcq': {
                const correctStr = String(question.correctAnswer || '').trim();
                const options = Array.isArray(question.options) ? question.options : [];
                const letterMap = ['A', 'B', 'C', 'D', 'E', 'F'];
                const cleanLetter = correctStr.toUpperCase().replace(/^OPTION\s+/i, '').trim();
                const letterIdx = letterMap.indexOf(cleanLetter);
                if (letterIdx >= 0 && letterIdx < options.length) {
                    return `Option ${cleanLetter} (${options[letterIdx]})`;
                }
                // If it already is an option text, find its letter if possible
                const optIdx = options.findIndex(opt => String(opt || '').trim().toLowerCase() === correctStr.toLowerCase());
                if (optIdx >= 0) {
                    return `Option ${letterMap[optIdx]} (${options[optIdx]})`;
                }
                return correctStr || '—';
            }
            case 'true_false':
                return String(question.correctAnswer || 'True');
            case 'short_answer':
            case 'fill_blank':
                return String(question.correctAnswer || question.expectedAnswer || '');
            case 'multi_select': {
                const rawCorrect = Array.isArray(question.correctAnswer) ? question.correctAnswer : (question.correctAnswer ? [question.correctAnswer] : []);
                const options = Array.isArray(question.options) ? question.options : [];
                const letterMap = ['A', 'B', 'C', 'D', 'E', 'F'];

                const formatted = rawCorrect.map(c => {
                    const cStr = String(c).trim();
                    const cleanLetter = cStr.toUpperCase().replace(/^OPTION\s+/i, '').trim();
                    const letterIdx = letterMap.indexOf(cleanLetter);
                    if (letterIdx >= 0 && letterIdx < options.length) {
                        return `${cleanLetter} (${options[letterIdx]})`;
                    }
                    const optIdx = options.findIndex(opt => String(opt || '').trim().toLowerCase() === cStr.toLowerCase());
                    if (optIdx >= 0) {
                        return `${letterMap[optIdx]} (${options[optIdx]})`;
                    }
                    return cStr;
                });
                return formatted.length > 0 ? formatted.join(', ') : '—';
            }
            case 'matching':
                return (question.matchingPairs || []).map(p => `${p.left} → ${p.right}`).join(' | ');
            case 'essay':
                return null;
            default:
                return null;
        }
    }

    /**
     * Download Question Bank Import CSV Template
     */
    function downloadQuestionBankCSVTemplate() {
        const template = [
            {
                Type: "mcq",
                Subject: "Mathematics",
                Topic: "Arithmetic",
                Difficulty: "Easy",
                Question: "What is 12 + 15?",
                Marks: "2",
                OptionA: "25",
                OptionB: "27",
                OptionC: "30",
                OptionD: "32",
                CorrectAnswer: "B",
                Explanation: "12 + 15 = 27 (Option B)"
            },
            {
                Type: "true_false",
                Subject: "Science",
                Topic: "Physics",
                Difficulty: "Easy",
                Question: "Light travels faster than sound.",
                Marks: "1",
                OptionA: "True",
                OptionB: "False",
                OptionC: "",
                OptionD: "",
                CorrectAnswer: "True",
                Explanation: "Speed of light is 300,000 km/s."
            }
        ];
        window.TCISUtils.exportToCSV("TCIS_Question_Bank_Template.csv", template);
    }

    /**
     * Parse Question Bank CSV
     */
    function importQuestionsFromCSV(csvArray) {
        let imported = 0;
        let errors = [];

        csvArray.forEach((row, idx) => {
            const rowNum = idx + 2;
            const qType = (row.Type || row.type || 'mcq').toLowerCase().trim();
            const questionText = row.Question || row['Question Text'] || row.questionText;

            if (!questionText) {
                errors.push(`Row ${rowNum}: Question text is empty.`);
                return;
            }

            const options = [];
            if (row.OptionA !== undefined && row.OptionA !== '') options.push(String(row.OptionA).trim());
            if (row.OptionB !== undefined && row.OptionB !== '') options.push(String(row.OptionB).trim());
            if (row.OptionC !== undefined && row.OptionC !== '') options.push(String(row.OptionC).trim());
            if (row.OptionD !== undefined && row.OptionD !== '') options.push(String(row.OptionD).trim());

            let rawCorrect = row.CorrectAnswer || row['Correct Answer'] || row.correctAnswer || '';
            rawCorrect = String(rawCorrect).trim();
            let finalCorrect = rawCorrect;

            // Normalize MCQ correct answer to option text if letter was given
            if (qType === 'mcq' && options.length > 0) {
                const letterMap = ['a', 'b', 'c', 'd', 'e', 'f'];
                const cleanLetter = rawCorrect.toLowerCase().replace(/^option\s+/i, '').trim();
                const letterIdx = letterMap.indexOf(cleanLetter);
                if (letterIdx >= 0 && letterIdx < options.length) {
                    finalCorrect = options[letterIdx];
                } else if (!rawCorrect) {
                    finalCorrect = options[0];
                }
            } else if (qType === 'true_false') {
                finalCorrect = (rawCorrect.toLowerCase() === 'false' || rawCorrect.toLowerCase() === 'f') ? 'False' : 'True';
            }

            addQuestion({
                type: qType,
                subject: row.Subject || 'General Knowledge',
                topic: row.Topic || 'General',
                difficulty: row.Difficulty || 'Medium',
                questionText: String(questionText).trim(),
                marks: parseFloat(row.Marks) || 1,
                options: options,
                correctAnswer: finalCorrect,
                explanation: row.Explanation || ''
            });

            imported++;
        });

        return { imported, errors };
    }

    return {
        getAllQuestions,
        addQuestion,
        updateQuestion,
        deleteQuestion,
        gradeQuestion,
        downloadQuestionBankCSVTemplate,
        importQuestionsFromCSV
    };
})();
