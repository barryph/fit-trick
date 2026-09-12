import { Test, TestingModule } from '@nestjs/testing';
import User from 'src/modules/users/domain/user.entity';
import UserEmail from 'src/modules/users/domain/value-objects/UserEmail';
import { UsersService } from 'src/modules/users/services/users.service';
import { EMAIL_SENDER, IEmailSender } from 'src/shared/email/email-sender.port';
import {
  AccountNotFoundError,
  InvalidDeletionTokenError,
} from '../domain/account-management.errors';
import DeletionTokenRepo from '../repos/deletionToken.repository';
import { AccountDeletionService } from './accountDeletion.service';
import { DeletionRequestService } from './deletionRequest.service';

describe('DeletionRequestService', () => {
  let service: DeletionRequestService;
  let usersService: jest.Mocked<UsersService>;
  let deletionTokens: jest.Mocked<DeletionTokenRepo>;
  let accountDeletionService: jest.Mocked<AccountDeletionService>;
  let emailSender: jest.Mocked<IEmailSender>;

  const persistedUser = (email: string) =>
    User.reconstitute({
      id: '42',
      email: UserEmail.create(email),
      password: null,
    });

  const anUnpersistedUser = (email: string) =>
    User.createNew({
      email: UserEmail.create(email),
      password: null,
    });

  beforeEach(async () => {
    delete process.env.ACCOUNT_DELETION_SITE_URL;

    usersService = {
      getByEmail: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    deletionTokens = {
      replacePendingForUser: jest.fn(),
      consumeIfValid: jest.fn(),
      restore: jest.fn(),
      deleteAllForUser: jest.fn(),
    } as unknown as jest.Mocked<DeletionTokenRepo>;
    accountDeletionService = {
      deleteAccount: jest.fn(),
    } as unknown as jest.Mocked<AccountDeletionService>;
    emailSender = {
      sendPasswordResetEmail: jest.fn(),
      sendAccountDeletionEmail: jest.fn(),
      sendAccountDeletedEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletionRequestService,
        { provide: UsersService, useValue: usersService },
        { provide: DeletionTokenRepo, useValue: deletionTokens },
        { provide: AccountDeletionService, useValue: accountDeletionService },
        { provide: EMAIL_SENDER, useValue: emailSender },
      ],
    }).compile();

    service = module.get(DeletionRequestService);
  });

  describe('requestDeletion', () => {
    it('does nothing at all for an address with no account', async () => {
      usersService.getByEmail.mockResolvedValue(null);

      await expect(
        service.requestDeletion('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(deletionTokens.replacePendingForUser).not.toHaveBeenCalled();
      expect(emailSender.sendAccountDeletionEmail).not.toHaveBeenCalled();
    });

    it('does nothing for a user that exists only in memory', async () => {
      usersService.getByEmail.mockResolvedValue(
        anUnpersistedUser('ghost@example.com'),
      );

      await service.requestDeletion('ghost@example.com');

      expect(deletionTokens.replacePendingForUser).not.toHaveBeenCalled();
      expect(emailSender.sendAccountDeletionEmail).not.toHaveBeenCalled();
    });

    it('issues a token and emails a site link when an account exists', async () => {
      process.env.ACCOUNT_DELETION_SITE_URL = 'https://delete.kadence.app/';
      usersService.getByEmail.mockResolvedValue(
        persistedUser('delete-me@example.com'),
      );
      emailSender.sendAccountDeletionEmail.mockResolvedValue(undefined);

      await service.requestDeletion('delete-me@example.com');

      expect(deletionTokens.replacePendingForUser).toHaveBeenCalledTimes(1);
      const stored = deletionTokens.replacePendingForUser.mock.calls[0][0];
      expect(stored.userId).toBe('42');
      expect(stored.email).toBe('delete-me@example.com');
      // Only the hash is handed to storage.
      expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(emailSender.sendAccountDeletionEmail).toHaveBeenCalledTimes(1);
      const sent = emailSender.sendAccountDeletionEmail.mock.calls[0][0];
      expect(sent.recipientEmail).toBe('delete-me@example.com');
      expect(sent.deletionUrl).toMatch(
        /^https:\/\/delete\.kadence\.app\/delete\?token=[a-f0-9]{64}$/,
      );
      expect(sent.expiresInMinutes).toBeGreaterThan(0);

      // The plaintext token is the one in the email and is not the stored hash.
      const token = new URL(sent.deletionUrl).searchParams.get('token');
      expect(token).not.toBe(stored.tokenHash);
    });

    it('falls back to a mailto link when no deletion site is configured', async () => {
      usersService.getByEmail.mockResolvedValue(
        persistedUser('delete-me@example.com'),
      );
      emailSender.sendAccountDeletionEmail.mockResolvedValue(undefined);

      await service.requestDeletion('delete-me@example.com');

      const sent = emailSender.sendAccountDeletionEmail.mock.calls[0][0];
      expect(sent.deletionUrl.startsWith('mailto:')).toBe(true);
      const decoded = decodeURIComponent(sent.deletionUrl);
      expect(decoded).toContain('support@kadence.app');
      expect(decoded).toContain('permanently delete my Kadence account');
      // The token still has to reach the user, as a 64-char hex value.
      expect(decoded).toMatch(/[a-f0-9]{64}/);
    });

    it('still resolves neutrally when the email cannot be sent', async () => {
      usersService.getByEmail.mockResolvedValue(
        persistedUser('delete-me@example.com'),
      );
      emailSender.sendAccountDeletionEmail.mockRejectedValue(
        new Error('smtp unavailable'),
      );

      await expect(
        service.requestDeletion('delete-me@example.com'),
      ).resolves.toBeUndefined();

      // The token is left in place rather than rolled back: a send timeout may
      // have delivered the message anyway, and it expires on its own.
      expect(deletionTokens.replacePendingForUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmDeletion', () => {
    it('rejects a token that is unknown, expired or already used', async () => {
      deletionTokens.consumeIfValid.mockResolvedValue(null);

      await expect(service.confirmDeletion('bogus')).rejects.toThrow(
        InvalidDeletionTokenError,
      );
      expect(accountDeletionService.deleteAccount).not.toHaveBeenCalled();
    });

    it('deletes the account the token belongs to and requests a confirmation email', async () => {
      deletionTokens.consumeIfValid.mockResolvedValue({
        userId: '42',
        email: 'delete-me@example.com',
      });

      await service.confirmDeletion('valid-token');

      expect(accountDeletionService.deleteAccount).toHaveBeenCalledWith('42', {
        notifyByEmail: true,
      });
      expect(deletionTokens.restore).not.toHaveBeenCalled();
    });

    it('restores the token when the deletion fails, and propagates the failure', async () => {
      deletionTokens.consumeIfValid.mockResolvedValue({
        userId: '42',
        email: 'delete-me@example.com',
      });
      const failure = new Error('provider revocation failed');
      accountDeletionService.deleteAccount.mockRejectedValue(failure);

      await expect(service.confirmDeletion('valid-token')).rejects.toBe(
        failure,
      );

      expect(deletionTokens.restore).toHaveBeenCalledTimes(1);
      const restored = deletionTokens.restore.mock.calls[0][0];
      expect(restored.userId).toBe('42');
      expect(restored.email).toBe('delete-me@example.com');
      expect(restored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('restores the token when the account no longer exists', async () => {
      deletionTokens.consumeIfValid.mockResolvedValue({
        userId: '42',
        email: 'delete-me@example.com',
      });
      accountDeletionService.deleteAccount.mockRejectedValue(
        new AccountNotFoundError(),
      );

      await expect(service.confirmDeletion('valid-token')).rejects.toThrow(
        AccountNotFoundError,
      );
      expect(deletionTokens.restore).toHaveBeenCalledTimes(1);
    });

    it('still surfaces the deletion failure when the token cannot be restored', async () => {
      deletionTokens.consumeIfValid.mockResolvedValue({
        userId: '42',
        email: 'delete-me@example.com',
      });
      const failure = new Error('provider revocation failed');
      accountDeletionService.deleteAccount.mockRejectedValue(failure);
      deletionTokens.restore.mockRejectedValue(new Error('database down'));

      await expect(service.confirmDeletion('valid-token')).rejects.toBe(
        failure,
      );
    });
  });
});
