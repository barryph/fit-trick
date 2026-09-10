import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionExpiredError } from './authentication.errors';

type AuthenticatedRequest = Request & {
  isAuthenticated(): boolean;
};

/**
 * Requires the user is authenticated to access a route
 *
 * Example usage on a controller:
 * @UseGuards(IsAuthedGuard)
 * @Get('/protec')
 * protec() {
 *   console.log('my secret route');
 *   return { myData: 'this is a secret' };
 * }
 */
@Injectable()
export class IsAuthedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.isAuthenticated && request.isAuthenticated()) {
      return true;
    }

    // A session that existed and has since expired or been revoked is reported
    // separately, so the client can clear local state and explain the sign-out
    // rather than surfacing a generic error.
    if (request.sessionEnded) {
      throw new SessionExpiredError();
    }

    throw new UnauthorizedException('Not authenticated');
  }
}
