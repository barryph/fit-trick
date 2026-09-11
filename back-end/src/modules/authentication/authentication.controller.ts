import {
  Controller,
  Delete,
  Post,
  Body,
  Req,
  Res,
  Next,
  Logger,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import CreateUserDTO from '../authentication/dtos/createUser.dto';
import { AuthenticationService } from './services/authentication.service';
import { AccountDeletionService } from './services/account-deletion.service';
import type { UserDTO } from '../users/mappers/userMap';
import passport from 'passport';
import type { NextFunction, Request, Response } from 'express';
import LoginDTO from './dtos/login.dto';
import ForgotPasswordDTO from './dtos/forgotPassword.dto';
import ResetPasswordDTO from './dtos/resetPassword.dto';
import GoogleLoginDTO from './dtos/google-login.dto';
import AppleLoginDTO from './dtos/apple-login.dto';
import { SocialAuthService } from './services/social-auth.service';
import { InvalidCredentialsError } from './authentication.errors';
import ServerError from 'src/shared/ServerError';
import { IsAuthedGuard } from './is-authed.guard';
import { createSessionAnchor } from './session/session-policy';
import {
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from './session/session-cookie';
import SessionRevocationRepo from './repos/session-revocation.repository';

@Controller('auth')
export class AuthenticationController {
  private readonly logger = new Logger(AuthenticationController.name);

  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly socialAuthService: SocialAuthService,
    private readonly accountDeletionService: AccountDeletionService,
    private readonly revocations: SessionRevocationRepo,
  ) {}

  /**
   * Establishes an authenticated session for the given user, regenerating the
   * session ID first to prevent session fixation. Identical to the flow used
   * for email/password login so the resulting session is indistinguishable.
   *
   * The session is also anchored here: `createdAt` starts the absolute session
   * lifetime (the cap that rolling renewal may never extend past) and
   * `renewedAt` starts the first idle window. Both are server timestamps.
   */
  private async establishSession(
    req: Request,
    res: Response,
    next: NextFunction,
    user: UserDTO,
  ) {
    // The session being replaced is revoked first, not just deleted: a request
    // that is already in flight with the old cookie could otherwise write the
    // record back and keep the *previous* account signed in.
    const previousSid = req.sessionID;
    if (previousSid) {
      try {
        await this.revocations.revoke(previousSid);
      } catch (err) {
        next(err);
        return;
      }
    }

    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          this.logger.error(loginErr, 'Session login error');
          return next(
            new ServerError('SESSION_LOGIN_ERROR', 'Session login error'),
          );
        }
        req.session.auth = createSessionAnchor();
        return res.send({ data: { user } });
      });
    });
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBody({
    type: LoginDTO,
    examples: {
      loginExample: {
        summary: 'Login',
        value: {
          email: 'andrew@mail.com',
          password: 'asdfasdf',
        },
      },
    },
  })
  login(
    @Req() req: Request,
    @Res() res: Response,
    @Body() _dto: LoginDTO,
    @Next() next: NextFunction,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    passport.authenticate('local', (err, user: UserDTO) => {
      if (err) {
        this.logger.error('Login authentication error', err);
        next(err);
        return;
      }
      if (!user) {
        next(new InvalidCredentialsError());
        return;
      }

      void this.establishSession(req, res, next, user);
    })(req, res, next);
  }

  @Delete('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    // Record the revocation *before* deleting the row, so a request that
    // already loaded the session cannot write it back into a usable one.
    const sid = req.sessionID;
    if (sid) {
      try {
        await this.revocations.revoke(sid);
      } catch (err) {
        next(err);
        return;
      }
    }

    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieAttributes());
        res.sendStatus(200);
      });
    });
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiBody({
    type: CreateUserDTO,
    examples: {
      userExample1: {
        summary: 'Register a new user',
        value: {
          email: 'andrew@mail.com',
          password: 'asdfasdf',
          passwordConfirm: 'asdfasdf',
        },
      },
    },
  })
  async create(
    @Req() req: Request,
    @Res() res: Response,
    @Body() createUserDto: CreateUserDTO,
    @Next() next: NextFunction,
  ) {
    const user = await this.authenticationService.register(createUserDto);
    void this.establishSession(req, res, next, user);
  }

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBody({
    type: GoogleLoginDTO,
    examples: {
      googleExample: {
        summary: 'Sign in with Google',
        value: {
          idToken: '...google id token...',
        },
      },
    },
  })
  async googleLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: GoogleLoginDTO,
    @Next() next: NextFunction,
  ) {
    const user = await this.socialAuthService.signInWithGoogle(dto.idToken);
    void this.establishSession(req, res, next, user);
  }

  @Post('apple')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBody({
    type: AppleLoginDTO,
    examples: {
      appleExample: {
        summary: 'Sign in with Apple',
        value: {
          idToken: '...apple identity token...',
          nonce: '...raw nonce...',
        },
      },
    },
  })
  async appleLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: AppleLoginDTO,
    @Next() next: NextFunction,
  ) {
    const user = await this.socialAuthService.signInWithApple(
      dto.idToken,
      dto.nonce,
      dto.authorizationCode,
    );
    void this.establishSession(req, res, next, user);
  }

  /**
   * Deletes the authenticated user's account and all of its data.
   *
   * The account to delete is derived exclusively from the authenticated
   * session; no client-supplied identifier is accepted (the validation pipe
   * rejects any request body). The deletion is transactional and runs only
   * after any required provider disconnection succeeds.
   */
  @Delete('account')
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

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBody({
    type: ForgotPasswordDTO,
    examples: {
      forgotPasswordExample: {
        summary: 'Request a password reset email',
        value: {
          email: 'andrew@mail.com',
        },
      },
    },
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDTO) {
    await this.authenticationService.forgotPassword(forgotPasswordDto.email);
    return {
      data: {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      },
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBody({
    type: ResetPasswordDTO,
    examples: {
      resetPasswordExample: {
        summary: 'Reset password with token',
        value: {
          token: 'a1b2c3d4e5f6789012345678901234567890abcd',
          password: 'newpassword',
        },
      },
    },
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDTO) {
    await this.authenticationService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
    return { data: { message: 'Password has been reset successfully.' } };
  }
}
