from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "localhost")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER") or ""
        self.smtp_password = os.getenv("SMTP_PASSWORD") or ""
        self.from_email = os.getenv("FROM_EMAIL", "noreply@vericorpus.ai")
        self.from_name = os.getenv("FROM_NAME", "VeriCorpus AI")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.enabled = bool(self.smtp_user and self.smtp_password)

    def _send(self, to_email: str, subject: str, html: str, text: str) -> bool:
        if not self.enabled:
            # In development, just log
            print(f"[EMAIL] To: {to_email}, Subject: {subject}")
            return True

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = to_email

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            return True
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
            return False

    async def send_password_reset_email(
        self, to_email: str, full_name: str, reset_token: str
    ) -> bool:
        reset_url = f"{self.frontend_url}/reset-password/{reset_token}"

        subject = "Reset your VeriCorpus AI password"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0ea5e9, #8b5cf6); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">VeriCorpus AI</h1>
            </div>
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <h2 style="color: #0f172a; margin-top: 0;">Reset your password</h2>
                <p>Hi {full_name},</p>
                <p>You requested to reset your password. Click the button below to create a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background: linear-gradient(135deg, #0ea5e9, #8b5cf6); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #64748b; font-size: 14px;">Or copy this link:</p>
                <p style="color: #0ea5e9; font-size: 14px; word-break: break-all;">{reset_url}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                <p style="color: #64748b; font-size: 12px;">
                    This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
                </p>
                <p style="color: #64748b; font-size: 12px;">— The VeriCorpus AI Team</p>
            </div>
        </body>
        </html>
        """

        text = f"""
        Reset your VeriCorpus AI password

        Hi {full_name},

        You requested to reset your password. Visit this link to create a new password:

        {reset_url}

        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.

        — The VeriCorpus AI Team
        """

        return self._send(to_email, subject, html, text)


email_service = EmailService()


async def send_password_reset_email(to_email: str, full_name: str, reset_token: str) -> bool:
    return await email_service.send_password_reset_email(to_email, full_name, reset_token)