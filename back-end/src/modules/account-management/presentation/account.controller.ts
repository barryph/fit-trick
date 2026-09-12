import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBody } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IsAuthedGuard } from 'src/modules/authentication/is-authed.guard';
import {
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from 'src/modules/authentication/session/session-cookie';
import type { UserDTO } from 'src/modules/users/mappers/userMap';
import ServerError from 'src/shared/ServerError';
import RequestAccountDeletionDTO from '../dtos/requestAccountDeletion.dto';
import ConfirmAccountDeletionDTO from '../dtos/confirmAccountDeletion.dto';
import {
  DELETION_ADDRESS_THROTTLER,
  DELETION_CONFIRM_LIMIT,
  DELETION_CONFIRM_TTL_MS,
  DELETION_REQUEST_ADDRESS_LIMIT,
  DELETION_REQUEST_ADDRESS_TTL_MS,
  DELETION_REQUEST_CLIENT_LIMIT,
  DELETION_REQUEST_CLIENT_TTL_MS,
} from '../infrastructure/deletion.constants';
import { DeletionRequestThrottlerGuard } from '../infrastructure/deletion-request-throttler.guard';
import { AccountDeletionService } from '../services/accountDeletion.service';
import { DeletionRequestService } from '../services/deletionRequest.service';

/**
 * The authenticated account-lifecycle surface. The unauthenticated, emailed
 * half of the same feature lives in `AccountDeletionController`.
 */
@Controller('account')
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    private readonly accountDeletionService: AccountDeletionService,
  ) { }

  /**
   * Deletes the authenticated user's account and all of its data.
   *
   * The account to delete is derived exclusively from the authenticated
   * session.
   */
  @Delete('/')
  @HttpCode(200)
  @UseGuards(IsAuthedGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async deleteAccount(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown> | undefined,
  ) {
    // The endpoint never accepts a request body: any client-supplied
    // identifier (user ID, email, ...) must be impossible to submit. Rejecting
    // the body outright also makes abuse attempts visible in one place.
    if (body && Object.keys(body).length > 0) {
      throw new ServerError(
        'INVALID_REQUEST',
        'Request body not accepted',
        400,
      );
    }

    const userId = (req.user as UserDTO).id;
    await this.accountDeletionService.deleteAccount(userId);

    // The deletion already removed every session row belonging to the user.
    // Tear down this request's session defensively and always clear the
    // cookie, so the client is signed out regardless of store state.
    try {
      await new Promise<void>((resolve) => {
        req.logout(() => resolve());
      });
      await new Promise<void>((resolve) => {
        req.session.destroy(() => resolve());
      });
    } catch (err) {
      this.logger.error('Error destroying session after account deletion', err);
    }
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieAttributes());
    res.send({ data: { message: 'Account deleted' } });
  }
}

/**
 * The public, unauthenticated endpoints the account-deletion site calls.
 *
 * For people who no longer have the app and prove ownership through an emailed,
 * single-use token.
 *
 * Neither endpoint reads a session or returns any account detail; the only
 * proof of ownership is the emailed token.
 */
@Controller('account/deletion-requests')
export class AccountDeletionController {
  constructor(
    private readonly deletionRequestService: DeletionRequestService,
  ) { }

  /**
   * Starts the flow: emails a single-use link when the address belongs to an
   * account, and always answers the same way when it does not, so the endpoint
   * cannot be used to discover which emails are registered.
   */
  @Post('/')
  @HttpCode(200)
  @UseGuards(DeletionRequestThrottlerGuard)
  @Throttle({
    default: {
      ttl: DELETION_REQUEST_CLIENT_TTL_MS,
      limit: DELETION_REQUEST_CLIENT_LIMIT,
    },
    [DELETION_ADDRESS_THROTTLER]: {
      ttl: DELETION_REQUEST_ADDRESS_TTL_MS,
      limit: DELETION_REQUEST_ADDRESS_LIMIT,
    },
  })
  @ApiBody({
    type: RequestAccountDeletionDTO,
    examples: {
      requestExample: {
        summary: 'Request an account deletion link',
        value: { email: 'andrew@mail.com' },
      },
    },
  })
  async requestDeletion(@Body() dto: RequestAccountDeletionDTO) {
    await this.deletionRequestService.requestDeletion(dto.email);

    // Identical for a registered and an unregistered address, by design.
    return {
      data: {
        message:
          'If an account with that email exists, a deletion link has been sent.',
      },
    };
  }

  /**
   * Finishes the flow: redeems the emailed token and permanently deletes the
   * account. A token that is missing, expired or already used deletes nothing
   * and yields the same generic error.
   */
  @Post('/confirm')
  @HttpCode(200)
  @Throttle({
    default: { ttl: DELETION_CONFIRM_TTL_MS, limit: DELETION_CONFIRM_LIMIT },
  })
  @ApiBody({
    type: ConfirmAccountDeletionDTO,
    examples: {
      confirmExample: {
        summary: 'Confirm account deletion with the emailed token',
        value: { token: 'a1b2c3d4e5f6...' },
      },
    },
  })
  async confirmDeletion(@Body() dto: ConfirmAccountDeletionDTO) {
    await this.deletionRequestService.confirmDeletion(dto.token);

    return {
      data: {
        message:
          'Your account and all of its data have been permanently deleted.',
      },
    };
  }
}
