/**
 * TCIS Entrance Examination Portal - Authentication & Session Manager
 * Admin: Firebase Authentication (email/password) + Firestore role check
 * Student: Firestore lookup by studentId + invitationPasskey
 */

window.TCISAuth = (function () {
    const ADMIN_SESSION_KEY = 'tcis_admin_session';
    const STUDENT_SESSION_KEY = 'tcis_student_session';

    // ─────────────────────────────────────────────────
    // ADMIN AUTHENTICATION  (Firebase Auth regulated)
    // ─────────────────────────────────────────────────

    async function loginAdmin(email, password) {
        const cleanEmail = email.trim().toLowerCase();

        // Firebase Authentication is REQUIRED for admin access
        const authInst = window.TCISAuthInstance;
        if (!authInst || typeof authInst.signInWithEmailAndPassword !== 'function') {
            return { success: false, error: 'Firebase Authentication is not available. Please check your internet connection and refresh.' };
        }

        try {
            const userCredential = await authInst.signInWithEmailAndPassword(cleanEmail, password);
            const user = userCredential.user;

            // Optional: Check Firestore 'admins' collection for role/name metadata
            let adminName = user.displayName || cleanEmail.split('@')[0];
            let adminRole = 'Admin';

            const db = window.TCISFirestoreInstance;
            if (db) {
                try {
                    const snap = await db.collection('admins').doc(user.uid).get();
                    if (snap.exists) {
                        const data = snap.data();
                        adminName = data.name || adminName;
                        adminRole = data.role || adminRole;
                    } else {
                        // Also try lookup by email as doc id for backwards compat
                        const emailSnap = await db.collection('admins').where('email', '==', cleanEmail).limit(1).get();
                        if (!emailSnap.empty) {
                            const data = emailSnap.docs[0].data();
                            adminName = data.name || adminName;
                            adminRole = data.role || adminRole;
                        }
                    }
                } catch (fsErr) {
                    // Non-fatal — Firestore role lookup failed, use defaults
                    console.warn('Firestore admin role lookup:', fsErr.message);
                }
            }

            const sessionData = {
                uid: user.uid,
                adminId: user.uid,
                email: user.email,
                name: adminName,
                role: adminRole,
                loginTime: new Date().toISOString()
            };
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
            logAudit(sessionData.name, 'Firebase Admin Login', `Administrator ${user.email} authenticated via Firebase Auth.`);
            return { success: true, admin: sessionData };

        } catch (fbErr) {
            // Map Firebase error codes to user-friendly messages
            let errMsg = 'Authentication failed. Please check your credentials.';
            switch (fbErr.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    errMsg = 'Invalid email or password. Please verify your credentials.';
                    break;
                case 'auth/too-many-requests':
                    errMsg = 'Too many failed attempts. Account temporarily locked. Try again later.';
                    break;
                case 'auth/network-request-failed':
                    errMsg = 'Network error. Please check your internet connection.';
                    break;
                case 'auth/user-disabled':
                    errMsg = 'This administrator account has been disabled. Contact support.';
                    break;
                default:
                    errMsg = fbErr.message || errMsg;
            }
            return { success: false, error: errMsg };
        }
    }

    function getCurrentAdmin() {
        try {
            const session = localStorage.getItem(ADMIN_SESSION_KEY);
            return session ? JSON.parse(session) : null;
        } catch (e) {
            return null;
        }
    }

    async function logoutAdmin() {
        const admin = getCurrentAdmin();
        if (admin) {
            logAudit(admin.name, 'Admin Logout', `Administrator ${admin.email} logged out.`);
        }
        const authInst = window.TCISAuthInstance;
        if (authInst && typeof authInst.signOut === 'function') {
            try { await authInst.signOut(); } catch (e) { /* ignore */ }
        }
        localStorage.removeItem(ADMIN_SESSION_KEY);
        // Redirect to admin login (handle both admin/ and root paths)
        const path = window.location.pathname;
        if (path.includes('/admin/')) {
            window.location.href = 'login.html';
        } else {
            window.location.href = 'admin/login.html';
        }
    }

    function requireAdminAuth() {
        // First check local session
        const admin = getCurrentAdmin();
        if (!admin) {
            window.TCISUtils && window.TCISUtils.showToast('Please login as administrator to access this page.', 'warning');
            setTimeout(() => {
                const path = window.location.pathname;
                if (path.includes('/admin/')) {
                    window.location.href = 'login.html';
                } else {
                    window.location.href = 'admin/login.html';
                }
            }, 500);
            return false;
        }

        // Also listen for Firebase Auth state — if token is revoked, force logout
        const authInst = window.TCISAuthInstance;
        if (authInst && typeof authInst.onAuthStateChanged === 'function') {
            authInst.onAuthStateChanged((user) => {
                if (!user) {
                    // Firebase session expired — clear local session and redirect
                    localStorage.removeItem(ADMIN_SESSION_KEY);
                    window.TCISUtils && window.TCISUtils.showToast('Your session has expired. Please log in again.', 'warning');
                    setTimeout(() => {
                        const path = window.location.pathname;
                        if (path.includes('/admin/')) {
                            window.location.href = 'login.html';
                        } else {
                            window.location.href = 'admin/login.html';
                        }
                    }, 800);
                }
            });
        }
        return true;
    }

    // ─────────────────────────────────────────────────
    // STUDENT AUTHENTICATION  (Firestore + passkey)
    // ─────────────────────────────────────────────────

    async function loginStudent(studentId, passkey) {
        const cleanId = studentId.trim().toUpperCase();
        const cleanPasskey = passkey.trim();

        const db = window.TCISFirestoreInstance;

        // 1. Try Firestore first (live data)
        if (db) {
            try {
                // Query by studentId field
                const snap = await db.collection('students')
                    .where('studentId', '==', cleanId)
                    .limit(1).get();

                if (!snap.empty) {
                    const student = snap.docs[0].data();
                    return _validateStudentRecord(student, cleanPasskey);
                }
                // No record in Firestore — fall through to local cache
            } catch (fsErr) {
                console.warn('Firestore student lookup:', fsErr.message);
                // Fall through to local cache
            }
        }

        // 2. Fallback: Local cache (TCISDB)
        const students = window.TCISDB.getCollection('students');
        const student = students.find(s => s.studentId.trim().toUpperCase() === cleanId);
        if (student) {
            return _validateStudentRecord(student, cleanPasskey);
        }

        return { success: false, error: 'Student ID not found. Please verify your Student ID or contact TCIS Admissions.' };
    }

    function _validateStudentRecord(student, passkey) {
        if (student.status && student.status !== 'Active') {
            return { success: false, error: 'Your student profile is deactivated. Please contact TCIS Admissions.' };
        }

        const cleanPasskey = passkey.trim().toUpperCase();

        const exams = window.TCISDB ? window.TCISDB.getCollection('examinations') : [];
        const assignedExam = exams.find(e => e.id === student.assignedExamId) || null;

        const passkeyMatch = 
            (student.invitationPasskey && student.invitationPasskey.trim().toUpperCase() === cleanPasskey) ||
            (student.assignedExamId && student.assignedExamId.trim().toUpperCase() === cleanPasskey) ||
            (student.examCode && student.examCode.trim().toUpperCase() === cleanPasskey) ||
            (assignedExam && assignedExam.code && assignedExam.code.trim().toUpperCase() === cleanPasskey);

        if (!passkeyMatch) {
            return { success: false, error: 'Invalid Exam ID or Access Code. Please verify your assigned Exam ID or Access Code and try again.' };
        }

        const sessionData = {
            studentId: student.studentId,
            firstName: student.firstName,
            lastName: student.lastName,
            middleName: student.middleName || '',
            fullName: `${student.firstName} ${student.lastName}`.trim(),
            email: student.email || '',
            program: student.program || '',
            assignedExamId: student.assignedExamId || (assignedExam ? assignedExam.id : ''),
            examCode: (assignedExam ? assignedExam.code : student.examCode) || '',
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('tcis_student_session', JSON.stringify(sessionData));
        return { success: true, student: sessionData };
    }

    function getCurrentStudent() {
        try {
            const session = localStorage.getItem(STUDENT_SESSION_KEY);
            return session ? JSON.parse(session) : null;
        } catch (e) {
            return null;
        }
    }

    function logoutStudent() {
        localStorage.removeItem(STUDENT_SESSION_KEY);
        const path = window.location.pathname;
        if (path.includes('/student/')) {
            window.location.href = 'login.html';
        } else {
            window.location.href = 'student/login.html';
        }
    }

    function requireStudentAuth() {
        const student = getCurrentStudent();
        if (!student) {
            const path = window.location.pathname;
            if (path.includes('/student/')) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'student/login.html';
            }
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────────────────
    // AUDIT LOG HELPER
    // ─────────────────────────────────────────────────

    function logAudit(adminName, action, details) {
        try {
            const logs = window.TCISDB.getCollection('auditLogs');
            const entry = {
                id: window.TCISUtils ? window.TCISUtils.generateUniqueId('LOG') : `LOG-${Date.now()}`,
                admin: adminName || 'System',
                action: action,
                details: details,
                timestamp: new Date().toISOString()
            };
            logs.unshift(entry);
            window.TCISDB.saveCollection('auditLogs', logs.slice(0, 200)); // cap at 200 entries

            // Also write to Firestore
            const db = window.TCISFirestoreInstance;
            if (db) {
                db.collection('auditLogs').add(entry).catch(() => {});
            }
        } catch (e) {
            console.warn('Audit log error:', e);
        }
    }

    // ─────────────────────────────────────────────────
    // ADMIN USER MANAGEMENT  (Create/Delete Firebase Auth users)
    // Note: Creating users via client SDK signs the current user out.
    // Use Firebase Admin SDK (Cloud Functions) for production.
    // This helper is provided for reference/admin setup panel.
    // ─────────────────────────────────────────────────

    async function createAdminUser(email, password, displayName, role) {
        // Creating a new Firebase Auth user from client SDK signs in as that user.
        // We instead store admin metadata in Firestore for role resolution.
        const db = window.TCISFirestoreInstance;
        if (!db) return { success: false, error: 'Firestore not available.' };

        // Store admin metadata in 'pendingAdmins' collection (to be activated via Firebase Console)
        try {
            await db.collection('pendingAdmins').add({
                email: email.trim().toLowerCase(),
                name: displayName,
                role: role || 'Admin',
                createdAt: new Date().toISOString(),
                status: 'Pending'
            });
            return { success: true, message: `Admin invitation stored. Please create ${email} in Firebase Console > Authentication, then they can log in.` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    return {
        loginAdmin,
        getCurrentAdmin,
        logoutAdmin,
        requireAdminAuth,
        loginStudent,
        getCurrentStudent,
        logoutStudent,
        requireStudentAuth,
        logAudit,
        createAdminUser
    };
})();
