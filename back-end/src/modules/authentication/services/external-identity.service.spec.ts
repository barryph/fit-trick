import { Test, TestingModule } from '@nestjs/testing';
import { KnexService } from 'src/shared/knex/knex.service';
import User from 'src/modules/users/domain/user.entity';
import UserEmail from 'src/modules/users/domain/value-objects/UserEmail';
import UsersRepo from 'src/modules/users/repos/user.repository';
import ExternalIdentitiesRepo from '../repos/external-identities.repository';
import ExternalIdentity from '../domain/external-identity.entity';
import { ExternalIdentityService } from './external-identity.service';
import { OAuthCredentialError } from '../authentication.errors';

describe('ExternalIdentityService', () => {
  let service: ExternalIdentityService;
  let usersRepo: jest.Mocked<UsersRepo>;
  let identitiesRepo: jest.Mocked<ExternalIdentitiesRepo>;
  const fakeTrx = {};

  const knexService = {
    connection: {
      transaction: jest.fn(async (cb: (trx: unknown) => Promise<unknown>) =>
        cb(fakeTrx),
      ),
    },
  };

  const makeUser = (id: string, email: string): User =>
    User.reconstitute({
      id,
      email: UserEmail.create(email),
      password: null,
    });

  const makeIdentity = (
    provider: 'google' | 'apple',
    subject: string,
    userId: string,
  ) =>
    ExternalIdentity.createNew({
      provider,
      providerSubject: subject,
      userId,
      providerEmail: 'provider@example.com',
      refreshToken: null,
    });

  beforeEach(async () => {
    usersRepo = {
      getById: jest.fn(),
      exists: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersRepo>;
    identitiesRepo = {
      findByProviderSubject: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<ExternalIdentitiesRepo>;
    knexService.connection.transaction.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalIdentityService,
        { provide: UsersRepo, useValue: usersRepo },
        { provide: ExternalIdentitiesRepo, useValue: identitiesRepo },
        { provide: KnexService, useValue: knexService },
      ],
    }).compile();

    service = module.get(ExternalIdentityService);
  });

  const verified = {
    provider: 'google' as const,
    subject: 'google-subject-1',
    email: 'user@example.com',
  };

  it('creates a user and identity for an unknown identity', async () => {
    identitiesRepo.findByProviderSubject.mockResolvedValue(null);
    usersRepo.exists.mockResolvedValue(false);
    usersRepo.create.mockResolvedValue(makeUser('99', 'user@example.com'));
    identitiesRepo.create.mockImplementation(async (identity, trx) => {
      expect(trx).toBe(fakeTrx);
      return makeIdentity(identity.provider, identity.providerSubject, '99');
    });

    const user = await service.resolveOrCreate(verified);

    expect(user.id).toBe('99');
    expect(usersRepo.create).toHaveBeenCalledTimes(1);
    const createdUser = usersRepo.create.mock.calls[0][0];
    expect(createdUser.password).toBeNull();
    expect(identitiesRepo.create).toHaveBeenCalledTimes(1);
    expect(identitiesRepo.create.mock.calls[0][0].providerSubject).toBe(
      'google-subject-1',
    );
  });

  it('reuses the existing user for an existing identity', async () => {
    const existingUser = makeUser('42', 'user@example.com');
    identitiesRepo.findByProviderSubject.mockResolvedValue(
      makeIdentity('google', 'google-subject-1', '42'),
    );
    usersRepo.getById.mockResolvedValue(existingUser);

    const user = await service.resolveOrCreate(verified);

    expect(user.id).toBe('42');
    expect(usersRepo.create).not.toHaveBeenCalled();
    expect(identitiesRepo.create).not.toHaveBeenCalled();
  });

  it('never merges: uses a synthetic email when the provider email is taken', async () => {
    identitiesRepo.findByProviderSubject.mockResolvedValue(null);
    usersRepo.exists.mockResolvedValue(true);
    usersRepo.create.mockImplementation(async (user) =>
      makeUser('7', user.email.value),
    );

    const user = await service.resolveOrCreate(verified);

    expect(user.email.value).toBe('google-google-subject-1@local.kadence');
    expect(identitiesRepo.create).toHaveBeenCalledTimes(1);
  });

  it('uses a synthetic email when the provider supplies no email', async () => {
    identitiesRepo.findByProviderSubject.mockResolvedValue(null);
    usersRepo.exists.mockResolvedValue(false);
    usersRepo.create.mockImplementation(async (user) =>
      makeUser('8', user.email.value),
    );

    const user = await service.resolveOrCreate({
      ...verified,
      email: null,
    });

    expect(user.email.value).toBe('google-google-subject-1@local.kadence');
  });

  it('fails closed when an identity row has no matching user', async () => {
    identitiesRepo.findByProviderSubject.mockResolvedValue(
      makeIdentity('google', 'google-subject-1', 'gone-user'),
    );
    usersRepo.getById.mockResolvedValue(null);

    await expect(service.resolveOrCreate(verified)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('resolves a concurrent first sign-in winner via the unique constraint', async () => {
    identitiesRepo.findByProviderSubject
      .mockResolvedValueOnce(null) // initial lookup
      .mockResolvedValueOnce(makeIdentity('google', 'google-subject-1', '42')); // after unique violation
    usersRepo.exists.mockResolvedValue(false);
    usersRepo.create.mockResolvedValue(makeUser('99', 'user@example.com'));
    usersRepo.getById.mockResolvedValue(makeUser('42', 'user@example.com'));
    identitiesRepo.create.mockRejectedValue({ code: '23505' });

    const user = await service.resolveOrCreate(verified);

    expect(user.id).toBe('42');
    expect(usersRepo.getById).toHaveBeenCalledWith('42');
  });
});
