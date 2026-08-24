import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { IsAuthedGuard } from '../authentication/is-authed.guard';
import type { Request } from 'express';
import ExternalIdentitiesRepo from '../authentication/repos/external-identities.repository';
import type { UserDTO } from '../users/mappers/userMap';

@Controller('users')
export class UsersController {
  constructor(
    private readonly externalIdentitiesRepo: ExternalIdentitiesRepo,
  ) {}

  @UseGuards(IsAuthedGuard)
  @Get('/protec')
  protec() {
    return { myData: 'this is a secret' };
  }

  /**
   * Returns the authenticated user plus the external providers their account
   * is linked to (e.g. `google`, `apple`), derived server-side from the
   * `external_identities` records. Clients use this to know which provider
   * disconnections apply (e.g. Google's client-side revoke) without ever
   * trusting a client-supplied provider list. Unauthenticated requests get an
   * empty payload rather than an error, preserving the existing session
   * probe behavior.
   */
  @Get('/current')
  async getCurrent(@Req() req: Request) {
    const user = req.user as UserDTO | undefined;
    if (!user) {
      return { data: { user: undefined, authProviders: [] } };
    }
    const identities = await this.externalIdentitiesRepo.findByUserId(user.id);
    const authProviders = identities.map((identity) => identity.provider);

    return { data: { user, authProviders } };
  }
}
