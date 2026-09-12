export interface PasswordResetEmailPayload {
  recipientEmail: string;
  resetToken: string;
}

export interface AccountDeletionEmailPayload {
  recipientEmail: string;
  /** The single-use link that finishes the flow. Never log this. */
  deletionUrl: string;
  /** When the link stops working, so the email can say so. */
  expiresInMinutes: number;
}

export interface AccountDeletedEmailPayload {
  recipientEmail: string;
}

export interface IEmailSender {
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>;

  /**
   * Sends the verification link that starts the external account-deletion
   * flow. Only ever called for an address that belongs to a real account.
   */
  sendAccountDeletionEmail(payload: AccountDeletionEmailPayload): Promise<void>;

  /**
   * Confirms to the account's address that the deletion happened. The account
   * no longer exists by the time this is called, so this must be best-effort:
   * a failure is logged and swallowed, never surfaced to the caller.
   */
  sendAccountDeletedEmail(payload: AccountDeletedEmailPayload): Promise<void>;
}

/** One entry in the no-op sender's in-memory outbox, discriminated by `kind`. */
export type SentEmail =
  | ({ kind: 'password-reset' } & PasswordResetEmailPayload)
  | ({ kind: 'account-deletion' } & AccountDeletionEmailPayload)
  | ({ kind: 'account-deleted' } & AccountDeletedEmailPayload);

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
