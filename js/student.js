/**
 * TCIS Entrance Examination Portal - Student Management JS
 */

window.TCISStudent = (function () {
    function getAllStudents() {
        return window.TCISDB.getCollection('students');
    }

    function generateNextStudentId() {
        const students = getAllStudents();
        let maxNum = 1000;
        students.forEach(s => {
            if (s.studentId) {
                const match = s.studentId.match(/TCIS-STU-(\d+)/i);
                if (match && match[1]) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            }
        });
        return `TCIS-STU-${maxNum + 1}`;
    }

    function addStudent(studentData) {
        const studentId = studentData.studentId || generateNextStudentId();
        const passkey = studentData.invitationPasskey || `PASS-${Math.floor(1000 + Math.random() * 9000)}`;

        let firstName = (studentData.firstName || '').trim();
        let lastName = (studentData.lastName || '').trim();

        if (!firstName && studentData.fullName) {
            const parts = studentData.fullName.trim().split(/\s+/);
            firstName = parts[0] || 'Student';
            lastName = parts.slice(1).join(' ') || '';
        }

        const newStudent = {
            studentId: studentId,
            firstName: firstName || 'Student',
            middleName: (studentData.middleName || '').trim(),
            lastName: lastName || '',
            email: (studentData.email || '').trim(),
            phone: studentData.phone ? studentData.phone.trim() : '',
            dob: studentData.dob || '',
            gender: studentData.gender || 'Not Specified',
            program: studentData.program || 'Grade 10 Admission',
            examStatus: studentData.assignedExamId ? 'Assigned' : 'Unassigned',
            assignedExamId: studentData.assignedExamId || '',
            examCode: studentData.examCode || '',
            registrationDate: new Date().toISOString().split('T')[0],
            status: studentData.status || 'Active',
            invitationPasskey: passkey
        };

        window.TCISDB.upsertItem('students', 'studentId', newStudent);

        const admin = window.TCISAuth ? window.TCISAuth.getCurrentAdmin() : null;
        if (window.TCISAuth && typeof window.TCISAuth.logAudit === 'function') {
            window.TCISAuth.logAudit(admin ? admin.name : 'Admin', 'Add Student', `Created student ${newStudent.firstName} ${newStudent.lastName} (${newStudent.studentId}).`);
        }

        return newStudent;
    }

    function updateStudent(studentId, updatedFields) {
        const existing = window.TCISDB.getItem('students', 'studentId', studentId);
        if (!existing) return null;

        const updated = { ...existing, ...updatedFields };
        window.TCISDB.upsertItem('students', 'studentId', updated);

        const admin = window.TCISAuth.getCurrentAdmin();
        window.TCISAuth.logAudit(admin ? admin.name : 'Admin', 'Update Student', `Updated student details for ID: ${studentId}.`);

        return updated;
    }

    function deleteStudent(studentId) {
        const student = window.TCISDB.getItem('students', 'studentId', studentId);
        window.TCISDB.deleteItem('students', 'studentId', studentId);

        const admin = window.TCISAuth.getCurrentAdmin();
        window.TCISAuth.logAudit(admin ? admin.name : 'Admin', 'Delete Student', `Deleted student ${studentId}.`);
    }

    /**
     * Import list of students from parsed CSV array
     */
    function importStudentsFromCSV(csvArray) {
        let importedCount = 0;
        let errors = [];

        csvArray.forEach((row, index) => {
            const rowNum = index + 2;
            const firstName = row.FirstName || row['First Name'] || row.firstName;
            const lastName = row.LastName || row['Last Name'] || row.lastName;
            const email = row.Email || row['Email Address'] || row.email;

            if (!firstName || !lastName || !email) {
                errors.push(`Row ${rowNum}: Missing mandatory fields (First Name, Last Name, Email).`);
                return;
            }

            addStudent({
                firstName: firstName,
                middleName: row.MiddleName || row['Middle Name'] || '',
                lastName: lastName,
                email: email,
                phone: row.Phone || row['Phone Number'] || '',
                dob: row.DOB || row['Date of Birth'] || '',
                gender: row.Gender || 'Not Specified',
                program: row.Program || row['Program'] || 'General Entrance',
                assignedExamId: row.AssignedExamId || row['Exam ID'] || ''
            });

            importedCount++;
        });

        return { importedCount, errors };
    }

    /**
     * Download Sample CSV Template
     */
    function downloadSampleCSV() {
        const sampleData = [
            {
                FirstName: "Emmanuel",
                MiddleName: "Kofi",
                LastName: "Appiah",
                Email: "emmanuel.appiah@example.com",
                Phone: "+233 24 555 0192",
                DOB: "2010-04-12",
                Gender: "Male",
                Program: "Grade 10 Admission"
            },
            {
                FirstName: "Abena",
                MiddleName: "Osei",
                LastName: "Bonsu",
                Email: "abena.bonsu@example.com",
                Phone: "+233 20 444 8811",
                DOB: "2010-09-05",
                Gender: "Female",
                Program: "Grade 10 Admission"
            }
        ];
        window.TCISUtils.exportToCSV("TCIS_Students_Import_Template.csv", sampleData);
    }

    return {
        getAllStudents,
        addStudent,
        updateStudent,
        deleteStudent,
        importStudentsFromCSV,
        downloadSampleCSV
    };
})();
