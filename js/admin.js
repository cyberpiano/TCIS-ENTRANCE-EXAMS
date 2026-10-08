/**
 * TCIS Entrance Examination Portal - Main Admin Portal Interface Handler
 */

window.TCISAdmin = (function () {
    // Render Admin Sidebar & Top Navigation Bar dynamically
    function renderAdminNavigation(activePage = 'dashboard') {
        const admin = window.TCISAuth.getCurrentAdmin();

        const navContainer = document.getElementById('admin-sidebar-container');
        if (!navContainer) return;

        const navItems = [
            { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', link: 'dashboard.html' },
            { id: 'students', label: 'Students', icon: 'fa-user-graduate', link: 'students.html' },
            { id: 'subjects', label: 'Subjects', icon: 'fa-book-bookmark', link: 'subjects.html' },
            { id: 'question-bank', label: 'Question Bank', icon: 'fa-folder-tree', link: 'question-bank.html' },
            { id: 'examinations', label: 'Examinations', icon: 'fa-file-signature', link: 'examinations.html' },
            { id: 'assignments', label: 'Student Assignments', icon: 'fa-clipboard-user', link: 'assignments.html' },
            { id: 'monitoring', label: 'Live Monitoring', icon: 'fa-video', link: 'monitoring.html' },
            { id: 'results', label: 'Results & Marking', icon: 'fa-square-poll-vertical', link: 'results.html' },
            { id: 'reports', label: 'Print Reports', icon: 'fa-print', link: 'reports.html' },
            { id: 'settings', label: 'Portal Settings', icon: 'fa-sliders', link: 'settings.html' }
        ];

        navContainer.innerHTML = `
            <div class="flex flex-col h-full bg-slate-900 text-slate-300 w-64 fixed left-0 top-0 bottom-0 z-30 shadow-2xl border-r border-slate-800">
                <!-- Branding Header -->
                <div class="p-5 flex items-center gap-3 border-b border-slate-800 bg-slate-950/50">
                    <img src="../TCIS-Logo.png" alt="TCIS Logo" class="h-10 w-auto object-contain filter drop-shadow">
                    <div>
                        <h1 class="font-heading font-extrabold text-white text-lg tracking-wider">TCIS</h1>
                        <span class="text-xs font-semibold text-indigo-400 tracking-widest block uppercase">Admin Portal</span>
                    </div>
                </div>

                <!-- Navigation Links -->
                <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    ${navItems.map(item => {
                        const isActive = activePage === item.id;
                        return `
                            <a href="${item.link}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                isActive
                                    ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-600/30'
                                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                            }">
                                <i class="fa-solid ${item.icon} text-base w-5 text-center ${isActive ? 'text-white' : 'text-slate-400'}"></i>
                                <span>${item.label}</span>
                            </a>
                        `;
                    }).join('')}
                </nav>

                <!-- Admin User Profile & Logout Footer -->
                <div class="p-4 border-t border-slate-800 bg-slate-950/40">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2.5 overflow-hidden">
                            <div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30 flex-shrink-0">
                                ${(admin ? admin.name.charAt(0) : 'A')}
                            </div>
                            <div class="truncate">
                                <p class="text-xs font-semibold text-white truncate">${window.TCISUtils.escapeHTML(admin ? admin.name : 'Administrator')}</p>
                                <p class="text-[10px] text-slate-400 truncate">${window.TCISUtils.escapeHTML(admin ? admin.email : 'admin@tcis.edu')}</p>
                            </div>
                        </div>
                        <button onclick="window.TCISAuth.logoutAdmin()" title="Logout" class="text-slate-400 hover:text-rose-400 p-1.5 transition-colors">
                            <i class="fa-solid fa-right-from-bracket text-sm"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Dashboard Overview Metrics & Activity Feed
     */
    function renderDashboardMetrics() {
        const students = window.TCISDB.getCollection('students');
        const exams = window.TCISDB.getCollection('examinations');
        const results = window.TCISDB.getCollection('results');
        const auditLogs = window.TCISDB.getCollection('auditLogs');

        const totalStudents = students.length;
        const totalExams = exams.length;
        const activeExams = exams.filter(e => e.status === 'Open' || e.status === 'In Progress').length;
        const scheduledExams = exams.filter(e => e.status === 'Scheduled').length;
        const completedExams = results.length;

        let totalScore = 0;
        results.forEach(r => totalScore += (r.percentage || 0));
        const avgScore = results.length > 0 ? (totalScore / results.length).toFixed(1) : 'N/A';

        // Update DOM elements if present
        const elTotalStudents = document.getElementById('metric-total-students');
        if (elTotalStudents) elTotalStudents.innerText = totalStudents;

        const elTotalExams = document.getElementById('metric-total-exams');
        if (elTotalExams) elTotalExams.innerText = totalExams;

        const elActiveExams = document.getElementById('metric-active-exams');
        if (elActiveExams) elActiveExams.innerText = activeExams;

        const elCompletedExams = document.getElementById('metric-completed-exams');
        if (elCompletedExams) elCompletedExams.innerText = completedExams;

        const elAvgScore = document.getElementById('metric-avg-score');
        if (elAvgScore) elAvgScore.innerText = avgScore === 'N/A' ? 'N/A' : `${avgScore}%`;

        // Render Recent Activity Stream
        const activityContainer = document.getElementById('recent-activity-container');
        if (activityContainer) {
            if (auditLogs.length === 0) {
                activityContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No recent activity logs.</p>`;
            } else {
                activityContainer.innerHTML = auditLogs.slice(0, 7).map(log => `
                    <div class="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
                        <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <h4 class="text-xs font-bold text-slate-800">${window.TCISUtils.escapeHTML(log.action)}</h4>
                                <span class="text-[10px] text-slate-400">${window.TCISUtils.formatDate(log.timestamp)}</span>
                            </div>
                            <p class="text-xs text-slate-600 mt-0.5">${window.TCISUtils.escapeHTML(log.details)}</p>
                            <span class="text-[10px] font-medium text-slate-400">By ${window.TCISUtils.escapeHTML(log.admin)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    return {
        renderAdminNavigation,
        renderDashboardMetrics
    };
})();
