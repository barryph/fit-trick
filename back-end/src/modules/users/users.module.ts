import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import UsersRepo from './repos/user.repository';
import ExternalIdentitiesRepo from '../authentication/repos/external-identities.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepo, ExternalIdentitiesRepo],
  exports: [UsersService, UsersRepo, ExternalIdentitiesRepo],
})
export class UsersModule {}
