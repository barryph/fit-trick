import { Injectable, Logger } from '@nestjs/common';
import {
  AccountDeletedEmailPayload,
  AccountDeletionEmailPayload,
  IEmailSender,
  PasswordResetEmailPayload,
  SentEmail,
} from './email-sender.port';

/**
 * Records every email it is asked to send instead of delivering it. Used as the
 * default binding so the app runs, and in tests so specs can read the token/link
 * that would have reached the user.
 */
@Injectable()
export class NoopEmailSender implements IEmailSender {
  private readonly logger = new Logger(NoopEmailSender.name);
  readonly sentEmails: SentEmail[] = [];

  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    this.sentEmails.push({ kind: 'password-reset', ...payload });
    this.logger.log(
      `[NoopEmailSender] Password reset email would be sent to ${payload.recipientEmail}`,
    );
    return Promise.resolve();
  }

  sendAccountDeletionEmail(
    payload: AccountDeletionEmailPayload,
  ): Promise<void> {
    this.sentEmails.push({ kind: 'account-deletion', ...payload });
    // The deletion URL is deliberately not logged: it is the credential.
    this.logger.log(
      `[NoopEmailSender] Account deletion email would be sent to ${payload.recipientEmail}`,
    );
    return Promise.resolve();
  }

  sendAccountDeletedEmail(payload: AccountDeletedEmailPayload): Promise<void> {
    this.sentEmails.push({ kind: 'account-deleted', ...payload });
    this.logger.log(
      `[NoopEmailSender] Account deleted confirmation would be sent to ${payload.recipientEmail}`,
    );
    return Promise.resolve();
  }
}
