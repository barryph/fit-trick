import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import UsersRepo from './repos/user.repository';
import ExternalIdentitiesRepo from '../authentication/repos/external-identities.repository';
import SessionRevocationRepo from '../authentication/repos/session-revocation.repository';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepo,
    ExternalIdentitiesRepo,
    SessionRevocationRepo,
  ],
  exports: [
    UsersService,
    UsersRepo,
    ExternalIdentitiesRepo,
    SessionRevocationRepo,
  ],
})
export class UsersModule {}
