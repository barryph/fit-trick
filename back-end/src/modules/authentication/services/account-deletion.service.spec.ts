import { Test, TestingModule } from '@nestjs/testing';
import User from 'src/modules/users/domain/user.entity';
import UserEmail from 'src/modules/users/domain/value-objects/UserEmail';
import UsersRepo from 'src/modules/users/repos/user.repository';
import ExternalIdentitiesRepo from '../repos/external-identities.repository';
import AccountDeletionRepo from '../repos/account-deletion.repository';
import ExternalIdentity from '../domain/external-identity.entity';
import { AppleProvider } from '../infrastructure/providers/apple.provider';
import { AccountDeletionService } from './account-deletion.service';
import {
  AccountNotFoundError,
  ProviderRevocationFailedError,
} from '../authentication.errors';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let usersRepo: jest.Mocked<UsersRepo>;
  let identitiesRepo: jest.Mocked<ExternalIdentitiesRepo>;
  let deletionRepo: jest.Mocked<AccountDeletionRepo>;
  let appleProvider: jest.Mocked<AppleProvider>;

  const makeUser = (id: string): User =>
    User.reconstitute({
      id,
      email: UserEmail.create('u@example.com'),
      password: null,
    });

  const makeIdentity = (
    overrides: Partial<{
      provider: 'google' | 'apple';
      userId: string;
      refreshToken: string | null;
    }> = {},
  ) =>
    ExternalIdentity.reconstitute({
      id: '1',
      provider: 'google',
      providerSubject: 'subject-1',
      userId: '42',
      providerEmail: null,
      refreshToken: null,
      ...overrides,
    });

  beforeEach(async () => {
    usersRepo = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepo>;
    identitiesRepo = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<ExternalIdentitiesRepo>;
    deletionRepo = {
      deleteAccount: jest.fn(),
    } as unknown as jest.Mocked<AccountDeletionRepo>;
    appleProvider = {
      revokeRefreshToken: jest.fn(),
    } as unknown as jest.Mocked<AppleProvider>;

    process.env.APPLE_CLIENT_IDS = 'com.example.app';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: UsersRepo, useValue: usersRepo },
        { provide: ExternalIdentitiesRepo, useValue: identitiesRepo },
        { provide: AccountDeletionRepo, useValue: deletionRepo },
        { provide: AppleProvider, useValue: appleProvider },
      ],
    }).compile();

    service = module.get(AccountDeletionService);
  });

  it('deletes the authenticated user’s account and its data', async () => {
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([]);

    await service.deleteAccount('42');

    expect(deletionRepo.deleteAccount).toHaveBeenCalledWith('42');
  });

  it('revokes the Apple authorization before deleting, using the stored refresh token', async () => {
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([
      makeIdentity({
        provider: 'apple',
        refreshToken: 'apple-refresh-token',
      }),
    ]);
    appleProvider.revokeRefreshToken.mockResolvedValue(undefined);

    await service.deleteAccount('42');

    expect(appleProvider.revokeRefreshToken).toHaveBeenCalledWith(
      'apple-refresh-token',
      'com.example.app',
    );
    expect(deletionRepo.deleteAccount).toHaveBeenCalledWith('42');
  });

  it('skips Apple revocation when no refresh token is stored', async () => {
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([
      makeIdentity({ provider: 'apple', refreshToken: null }),
    ]);

    await service.deleteAccount('42');

    expect(appleProvider.revokeRefreshToken).not.toHaveBeenCalled();
    expect(deletionRepo.deleteAccount).toHaveBeenCalledWith('42');
  });

  it('skips any provider call for Google identities', async () => {
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([
      makeIdentity({ provider: 'google', refreshToken: null }),
    ]);

    await service.deleteAccount('42');

    expect(appleProvider.revokeRefreshToken).not.toHaveBeenCalled();
    expect(deletionRepo.deleteAccount).toHaveBeenCalledWith('42');
  });

  it('aborts deletion when Apple revocation fails, leaving the account intact', async () => {
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([
      makeIdentity({ provider: 'apple', refreshToken: 'apple-refresh-token' }),
    ]);
    appleProvider.revokeRefreshToken.mockRejectedValue(
      new ProviderRevocationFailedError(),
    );

    await expect(service.deleteAccount('42')).rejects.toThrow(
      ProviderRevocationFailedError,
    );
    expect(deletionRepo.deleteAccount).not.toHaveBeenCalled();
  });

  it('tries every configured Apple client ID before giving up on revocation', async () => {
    process.env.APPLE_CLIENT_IDS = 'com.example.primary,com.example.secondary';
    usersRepo.getById.mockResolvedValue(makeUser('42'));
    identitiesRepo.findByUserId.mockResolvedValue([
      makeIdentity({ provider: 'apple', refreshToken: 'apple-refresh-token' }),
    ]);
    appleProvider.revokeRefreshToken
      .mockRejectedValueOnce(new ProviderRevocationFailedError())
      .mockResolvedValueOnce(undefined);

    await service.deleteAccount('42');

    expect(appleProvider.revokeRefreshToken).toHaveBeenNthCalledWith(
      1,
      'apple-refresh-token',
      'com.example.primary',
    );
    expect(appleProvider.revokeRefreshToken).toHaveBeenNthCalledWith(
      2,
      'apple-refresh-token',
      'com.example.secondary',
    );
    expect(deletionRepo.deleteAccount).toHaveBeenCalledWith('42');
  });

  it('fails when the account does not exist', async () => {
    usersRepo.getById.mockResolvedValue(null);

    await expect(service.deleteAccount('999')).rejects.toThrow(
      AccountNotFoundError,
    );
    expect(deletionRepo.deleteAccount).not.toHaveBeenCalled();
  });
});
