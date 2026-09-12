import { Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender.port';
import { NoopEmailSender } from './noop-email-sender';

/**
 * Owns the single `IEmailSender` binding for the whole app.
 *
 * It lives in `shared/` rather than inside a feature module because two
 * bounded contexts now depend on it: `authentication` (password reset) and
 * `account-management` (deletion links and the post-deletion confirmation).
 * Binding it once here means tests that read the no-op sender's outbox see
 * every email the app produced, whichever module produced it.
 */
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useClass: NoopEmailSender,
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
