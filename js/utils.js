/**
 * TCIS Entrance Examination Portal - Core Utility Functions
 */

window.TCISUtils = (function () {
    // Ensure Toast Container exists
    function getOrCreateToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Display a modern animated toast notification
     * @param {string} message - Text to display
     * @param {'success'|'error'|'info'|'warning'} type - Toast style
     * @param {number} duration - Display time in ms
     */
    function showToast(message, type = 'info', duration = 4000) {
        const container = getOrCreateToastContainer();
        const toast = document.createElement('div');

        const icons = {
            success: 'fa-circle-check text-emerald-500',
            error: 'fa-circle-xmark text-rose-500',
            warning: 'fa-triangle-exclamation text-amber-500',
            info: 'fa-circle-info text-blue-500'
        };

        const bgColors = {
            success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
            error: 'bg-rose-50 border-rose-200 text-rose-900',
            warning: 'bg-amber-50 border-amber-200 text-amber-900',
            info: 'bg-blue-50 border-blue-200 text-blue-900'
        };

        toast.className = `toast-item flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-md ${bgColors[type] || bgColors.info}`;
        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info} text-xl flex-shrink-0"></i>
            <span class="text-sm font-medium flex-1">${escapeHTML(message)}</span>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 text-xs ml-2">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    /**
     * Display custom modal confirmation dialog
     */
    function showConfirmModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'info', onConfirm }) {
        const modalId = 'tcis-confirm-modal';
        let existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const colors = {
            danger: 'bg-rose-600 hover:bg-rose-700 text-white',
            warning: 'bg-amber-600 hover:bg-amber-700 text-white',
            info: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            success: 'bg-emerald-600 hover:bg-emerald-700 text-white'
        };

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 transform transition-all scale-100">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-600 font-bold">
                        <i class="fa-solid ${type === 'danger' ? 'fa-triangle-exclamation text-rose-600' : 'fa-circle-question'}"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-900">${escapeHTML(title)}</h3>
                </div>
                <p class="text-slate-600 text-sm mb-6 leading-relaxed">${escapeHTML(message)}</p>
                <div class="flex items-center justify-end gap-3">
                    <button id="modal-cancel-btn" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors">
                        ${escapeHTML(cancelText)}
                    </button>
                    <button id="modal-confirm-btn" class="px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-md ${colors[type] || colors.info}">
                        ${escapeHTML(confirmText)}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('modal-cancel-btn').onclick = () => modal.remove();
        document.getElementById('modal-confirm-btn').onclick = () => {
            modal.remove();
            if (typeof onConfirm === 'function') onConfirm();
        };
    }

    /**
     * Escape string to prevent XSS
     */
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Generate unique prefix ID (e.g. TCIS-STU-8F32, TCIS-EXM-9A4B)
     */
    function generateUniqueId(prefix = 'TCIS') {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const timestamp = Date.now().toString().slice(-4);
        return `${prefix}-${rand}${timestamp}`;
    }

    /**
     * Format JavaScript Date or Firestore Timestamp to readable format
     */
    function formatDate(dateObj, includeTime = true) {
        if (!dateObj) return 'N/A';
        let d = dateObj;
        if (dateObj.toDate && typeof dateObj.toDate === 'function') {
            d = dateObj.toDate();
        } else if (typeof dateObj === 'string' || typeof dateObj === 'number') {
            d = new Date(dateObj);
        }
        if (isNaN(d.getTime())) return 'N/A';

        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        return new Intl.DateTimeFormat('en-US', options).format(d);
    }

    /**
     * Export JSON Data Array to CSV download
     */
    function exportToCSV(filename, rows) {
        if (!rows || !rows.length) {
            showToast('No data available to export', 'warning');
            return;
        }

        const separator = ',';
        const keys = Object.keys(rows[0]);

        const csvContent =
            keys.join(separator) +
            '\n' +
            rows.map(row => {
                return keys.map(k => {
                    let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                    cell = cell instanceof Date ? cell.toISOString() : String(cell);
                    cell = cell.replace(/"/g, '""');
                    if (cell.search(/("|,|\n)/g) >= 0) {
                        cell = `"${cell}"`;
                    }
                    return cell;
                }).join(separator);
            }).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Parse CSV File text into array of objects
     */
    function parseCSV(text) {
        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            // Regex handling quotes with commas
            const rowValues = [];
            let inQuotes = false;
            let currentVal = '';

            for (let char of lines[i]) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    rowValues.push(currentVal.trim().replace(/^"(.*)"$/, '$1'));
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            rowValues.push(currentVal.trim().replace(/^"(.*)"$/, '$1'));

            if (rowValues.length === headers.length) {
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = rowValues[idx];
                });
                result.push(obj);
            }
        }
        return result;
    }

    /**
     * Compress webcam HTMLVideoElement canvas to JPEG base64 data URL (~320x240)
     */
    function captureAndCompressFrame(videoElement, width = 320, height = 240, quality = 0.6) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0, width, height);
            return canvas.toDataURL('image/jpeg', quality);
        } catch (err) {
            console.error('Frame compression error:', err);
            return null;
        }
    }

    return {
        showToast,
        showConfirmModal,
        escapeHTML,
        generateUniqueId,
        formatDate,
        exportToCSV,
        parseCSV,
        captureAndCompressFrame
    };
})();
