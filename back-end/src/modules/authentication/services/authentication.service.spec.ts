import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationService } from './authentication.service';
import { UsersService } from '../../users/services/users.service';
import { InvalidCredentialsError } from '../authentication.errors';
import User from '../../users/domain/user.entity';
import UserEmail from '../../users/domain/value-objects/UserEmail';
import UserPassword from '../../users/domain/value-objects/UserPassword';
import { EMAIL_SENDER, IEmailSender } from 'src/shared/email/email-sender.port';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let usersService: jest.Mocked<UsersService>;
  let emailSender: jest.Mocked<IEmailSender>;

  beforeEach(async () => {
    usersService = {
      getByEmail: jest.fn(),
      create: jest.fn(),
      initiatePasswordReset: jest.fn(),
      resetPassword: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    emailSender = {
      sendPasswordResetEmail: jest.fn(),
      sendAccountDeletionEmail: jest.fn(),
      sendAccountDeletedEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: UsersService, useValue: usersService },
        { provide: EMAIL_SENDER, useValue: emailSender },
      ],
    }).compile();

    service = module.get(AuthenticationService);
  });

  it('validates user with correct credentials', async () => {
    const password = UserPassword.create('password123');
    const hashed = await password.hashPassword();
    const user = User.reconstitute({
      id: '1',
      email: UserEmail.create('test@example.com'),
      password: UserPassword.create(hashed),
    });
    usersService.getByEmail.mockResolvedValue(user);

    const result = await service.validateUser(
      'test@example.com',
      'password123',
    );
    expect(result.id).toBe('1');
  });

  it('rejects unknown email', async () => {
    usersService.getByEmail.mockResolvedValue(null);

    await expect(
      service.validateUser('unknown@example.com', 'password123'),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects wrong password', async () => {
    const password = UserPassword.create('password123');
    const hashed = await password.hashPassword();
    const user = User.reconstitute({
      id: '1',
      email: UserEmail.create('test@example.com'),
      password: UserPassword.create(hashed),
    });
    usersService.getByEmail.mockResolvedValue(user);

    await expect(
      service.validateUser('test@example.com', 'wrongpassword'),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('sends reset email when user exists', async () => {
    usersService.initiatePasswordReset.mockResolvedValue({
      recipientEmail: 'test@example.com',
      resetToken: 'token123',
    });

    await service.forgotPassword('test@example.com');

    expect(emailSender.sendPasswordResetEmail).toHaveBeenCalledWith({
      recipientEmail: 'test@example.com',
      resetToken: 'token123',
    });
  });

  it('does not send email when user does not exist', async () => {
    usersService.initiatePasswordReset.mockResolvedValue(null);

    await service.forgotPassword('unknown@example.com');

    expect(emailSender.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
