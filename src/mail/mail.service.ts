import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: Number(this.config.get<number>('SMTP_PORT', 1025)),
    });
  }

  async sendPasswordReset(options: {
    to: string;
    link: string;
  }): Promise<void> {
    const subject = 'Reset your password';
    const text = `You requested a password reset. Click the link below to reset your password:\n\n${options.link}\n\nIf you did not request this, you can safely ignore this email.`;
    const html = `<p>You requested a password reset.</p><p><a href="${options.link}">Click here to reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`;

    await this.sendMail({ to: options.to, subject, text, html });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'no-reply@example.com');

    try {
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
