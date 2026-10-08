/**
 * TCIS Entrance Examination Portal - Brevo Transactional Email Service
 */

window.TCISEmail = (function () {
    /**
     * Send Transactional Email via Brevo API with local log fallback
     */
    async function sendEmail({ recipientEmail, recipientName, subject, htmlContent, emailType, examTitle }) {
        const settings = window.TCISDB.getCollection('settings');
        const apiKey = (settings && settings.brevoApiKey) ? settings.brevoApiKey.trim() : '';
        const senderEmail = (settings && settings.brevoSenderEmail) || 'admissions@tcis.edu';
        const senderName = 'TCIS Admissions Office';

        let success = false;
        let errorMessage = null;

        if (apiKey) {
            try {
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': apiKey,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { name: senderName, email: senderEmail },
                        to: [{ email: recipientEmail, name: recipientName }],
                        subject: subject,
                        htmlContent: htmlContent
                    })
                });

                if (response.ok) {
                    success = true;
                } else {
                    const errData = await response.json();
                    errorMessage = errData.message || 'Brevo API error';
                }
            } catch (err) {
                errorMessage = err.message;
            }
        } else {
            // Simulated local email dispatch log
            success = true;
            errorMessage = 'Simulated Dispatch (Brevo API key not configured)';
        }

        // Store Email Log
        const logs = window.TCISDB.getCollection('emailLogs');
        logs.unshift({
            id: window.TCISUtils.generateUniqueId('EML'),
            recipient: recipientEmail,
            recipientName: recipientName,
            emailType: emailType || 'Exam Invitation',
            examination: examTitle || 'TCIS Entrance Exam',
            subject: subject,
            sentTime: new Date().toISOString(),
            status: success ? 'Sent' : 'Failed',
            error: errorMessage
        });
        window.TCISDB.saveCollection('emailLogs', logs);

        return { success, errorMessage };
    }

    /**
     * HTML Email Template: Examination Invitation
     */
    function sendExamInvitation(student, exam) {
        const portalUrl = window.location.origin + window.location.pathname.replace('/admin/', '/student/').replace('assignments.html', 'login.html');
        const directLink = `${portalUrl}?studentId=${encodeURIComponent(student.studentId)}&passkey=${encodeURIComponent(student.invitationPasskey)}`;

        const subject = `[TCIS Admissions] Official Examination Invitation: ${exam.title}`;
        const html = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
                <div style="background-color: #0f172a; padding: 32px; text-align: center; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1px;">TCIS ENTRANCE PORTAL</h1>
                    <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 14px;">The Comprehensive International School</p>
                </div>
                <div style="padding: 32px; color: #1e293b;">
                    <h2 style="color: #0f172a; margin-top: 0;">Dear ${student.firstName} ${student.lastName},</h2>
                    <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                        You have been officially invited to take the <strong>${exam.title}</strong> for admission into <strong>${student.program}</strong>.
                    </p>
                    
                    <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 20px; margin: 24px 0;">
                        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px;">Examination Details</h3>
                        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Student ID:</strong> ${student.studentId}</p>
                        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Passkey:</strong> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:bold;">${student.invitationPasskey}</code></p>
                        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Duration:</strong> ${exam.durationMinutes} Minutes</p>
                        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Total Marks:</strong> ${exam.totalMarks}</p>
                    </div>

                    <div style="margin: 28px 0; text-align: center;">
                        <a href="${directLink}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3);">
                            Access Examination Portal
                        </a>
                    </div>
                    
                    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                        <strong>Important Security Notice:</strong> Camera monitoring and full-screen enforcement will be active throughout this examination. Please ensure you have a working webcam and a stable internet connection.
                    </p>
                </div>
                <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b;">
                    &copy; 2026 TCIS Admissions Office. All rights reserved.
                </div>
            </div>
        `;

        return sendEmail({
            recipientEmail: student.email,
            recipientName: `${student.firstName} ${student.lastName}`,
            subject: subject,
            htmlContent: html,
            emailType: 'Exam Invitation',
            examTitle: exam.title
        });
    }

    return {
        sendEmail,
        sendExamInvitation
    };
})();
