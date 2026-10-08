/**
 * TCIS Entrance Examination Portal - Proctoring, Security & Camera Monitoring Engine
 */

window.TCISMonitoring = (function () {
    let videoStream = null;
    let cameraInterval = null;
    let activeSession = null;
    let fullscreenExitCount = 0;
    let tabSwitchCount = 0;
    let cameraFailureCount = 0;

    /**
     * Request Camera Access & Stream Setup
     */
    async function requestCameraAccess(videoElementId) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                audio: false
            });
            videoStream = stream;

            if (videoElementId) {
                const videoEl = document.getElementById(videoElementId);
                if (videoEl) {
                    videoEl.srcObject = stream;
                    await videoEl.play();
                }
            }
            return { success: true, stream };
        } catch (err) {
            console.warn("Camera access denied or unequipped:", err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Stop Camera Stream
     */
    function stopCamera() {
        if (cameraInterval) {
            clearInterval(cameraInterval);
            cameraInterval = null;
        }
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    }

    /**
     * Start Periodic Compressed Frame Snapshot Capture (Every 5 seconds)
     */
    function startCameraMonitoring(videoElementId, studentId, examId, intervalMs = 5000) {
        if (cameraInterval) clearInterval(cameraInterval);

        cameraInterval = setInterval(() => {
            const videoEl = document.getElementById(videoElementId);
            if (!videoEl || !videoStream) {
                logViolation(studentId, examId, 'CAMERA_UNAVAILABLE', 'Webcam feed disconnected or unavailable.');
                cameraFailureCount++;
                return;
            }

            const base64Image = window.TCISUtils.captureAndCompressFrame(videoEl, 320, 240, 0.5);
            if (base64Image) {
                saveMonitoringImage(studentId, examId, base64Image);
            }
        }, intervalMs);
    }

    function saveMonitoringImage(studentId, examId, imageDataUrl) {
        const images = window.TCISDB.getCollection('monitoringImages');
        images.push({
            id: window.TCISUtils.generateUniqueId('IMG'),
            studentId: studentId,
            examId: examId,
            timestamp: new Date().toISOString(),
            imageUrl: imageDataUrl
        });
        window.TCISDB.saveCollection('monitoringImages', images);
    }

    /**
     * Initialize Anti-Cheating Control Event Listeners
     */
    function setupAntiCheatingControls(studentId, examId, onAutoSubmitTrigger) {
        fullscreenExitCount = 0;
        tabSwitchCount = 0;
        cameraFailureCount = 0;

        // 1. Block Copy / Cut / Paste / Selection / Right Click
        const blockEvents = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'];
        blockEvents.forEach(evt => {
            document.addEventListener(evt, (e) => {
                e.preventDefault();
                window.TCISUtils.showToast('🚫 Copying, pasting, selecting text, and right-clicking are disabled during this examination.', 'warning');
                logViolation(studentId, examId, 'COPY_PASTE_ATTEMPT', `Blocked event: ${evt}`);
                return false;
            });
        });

        // 2. Block Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, F12, Ctrl+Shift+I)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                window.TCISUtils.showToast('🚫 Keyboard shortcut disabled for security.', 'warning');
                logViolation(studentId, examId, 'KEYBOARD_SHORTCUT', `Shortcut blocked: Ctrl+${e.key.toUpperCase()}`);
                return false;
            }
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))) {
                e.preventDefault();
                window.TCISUtils.showToast('🚫 Developer tools shortcut blocked.', 'warning');
                logViolation(studentId, examId, 'DEVTOOLS_ATTEMPT', `DevTools key blocked: ${e.key}`);
                return false;
            }
        });

        // 3. Tab Switch / Window Blur Detection
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                tabSwitchCount++;
                logViolation(studentId, examId, 'TAB_SWITCH', `Student left examination tab (Count: ${tabSwitchCount}).`);
                checkViolationThresholds(studentId, examId, onAutoSubmitTrigger);
            }
        });

        window.addEventListener('blur', () => {
            tabSwitchCount++;
            logViolation(studentId, examId, 'WINDOW_BLUR', `Focus lost from examination window.`);
            checkViolationThresholds(studentId, examId, onAutoSubmitTrigger);
        });

        // 4. Fullscreen Exit Monitoring
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                fullscreenExitCount++;
                logViolation(studentId, examId, 'FULLSCREEN_EXIT', `Student exited full-screen mode (Count: ${fullscreenExitCount}).`);
                window.TCISUtils.showToast(`⚠️ WARNING: Fullscreen exited (${fullscreenExitCount} time(s)). Please return to full-screen immediately!`, 'error', 6000);
                checkViolationThresholds(studentId, examId, onAutoSubmitTrigger);
            }
        });
    }

    /**
     * Request Fullscreen Mode
     */
    function requestFullscreen() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.warn('Fullscreen request rejected', err));
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }
    }

    /**
     * Log Proctoring Violation Event
     */
    function logViolation(studentId, examId, type, description) {
        const violations = window.TCISDB.getCollection('violations');
        const event = {
            id: window.TCISUtils.generateUniqueId('VIO'),
            studentId: studentId,
            examId: examId,
            type: type,
            description: description,
            timestamp: new Date().toISOString()
        };
        violations.unshift(event);
        window.TCISDB.saveCollection('violations', violations);

        updateMonitoringSessionStatus(studentId, examId);
    }

    /**
     * Evaluate Risk Level and Auto-Submit Thresholds
     */
    function checkViolationThresholds(studentId, examId, onAutoSubmitTrigger) {
        const settings = window.TCISDB.getCollection('settings');
        const thresholdConfig = (settings && settings.violationThresholds) || { maxViolationsAutoSubmit: 5 };

        const totalViolations = fullscreenExitCount + tabSwitchCount + cameraFailureCount;

        if (totalViolations >= thresholdConfig.maxViolationsAutoSubmit) {
            window.TCISUtils.showToast('🚨 Maximum proctoring violations exceeded. Your examination is being automatically submitted.', 'error', 10000);
            if (typeof onAutoSubmitTrigger === 'function') {
                setTimeout(() => onAutoSubmitTrigger(), 2000);
            }
        }
    }

    function updateMonitoringSessionStatus(studentId, examId) {
        const totalViolations = fullscreenExitCount + tabSwitchCount + cameraFailureCount;
        let riskLevel = 'LOW';
        if (totalViolations >= 5) riskLevel = 'HIGH';
        else if (totalViolations >= 2) riskLevel = 'MEDIUM';

        const session = {
            id: `MON-${studentId}-${examId}`,
            studentId: studentId,
            examId: examId,
            fullscreenExits: fullscreenExitCount,
            tabSwitches: tabSwitchCount,
            cameraFailures: cameraFailureCount,
            totalViolations: totalViolations,
            riskLevel: riskLevel,
            lastActivity: new Date().toISOString()
        };

        window.TCISDB.upsertItem('monitoringSessions', 'id', session);
    }

    function getStudentViolations(studentId, examId) {
        const all = window.TCISDB.getCollection('violations');
        return all.filter(v => v.studentId === studentId && (!examId || v.examId === examId));
    }

    function getStudentSnapshots(studentId, examId) {
        const all = window.TCISDB.getCollection('monitoringImages');
        return all.filter(img => img.studentId === studentId && (!examId || img.examId === examId));
    }

    /**
     * Get aggregated session stats for result submission
     * @param {string} studentId
     * @param {string} examId
     * @returns {{ tabSwitches: number, violations: number, snapshots: number }}
     */
    function getSessionStats(studentId, examId) {
        const violations = getStudentViolations(studentId, examId);
        const snapshots = getStudentSnapshots(studentId, examId);
        return {
            tabSwitches: tabSwitchCount,
            violations: violations.length,
            snapshots: snapshots.length
        };
    }

    return {
        requestCameraAccess,
        stopCamera,
        startCameraMonitoring,
        setupAntiCheatingControls,
        requestFullscreen,
        logViolation,
        getStudentViolations,
        getStudentSnapshots,
        getSessionStats
    };
})();
