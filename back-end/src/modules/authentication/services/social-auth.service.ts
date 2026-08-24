import { Injectable, Logger } from '@nestjs/common';
import { UserDTO, toDTO } from 'src/modules/users/mappers/userMap';
import { AppleProvider } from '../infrastructure/providers/apple.provider';
import { GoogleProvider } from '../infrastructure/providers/google.provider';
import { ExternalIdentityService } from './external-identity.service';

/**
 * Orchestrates OAuth sign-in: verify the provider credential, resolve or
 * create the application user, and return the user DTO for the session layer.
 *
 * The application session is established by the controller using the same
 * mechanism as email/password login; this service never creates a session.
 *
 * For Apple, the authorization code is exchanged server-side for a refresh
 * token that is stored so account deletion can revoke the user's Sign in with
 * Apple authorization. The exchange is best-effort: identity verification is
 * the authority for sign-in, and a failed exchange (e.g. provider key material
 * not configured) merely means no refresh token is stored. The refresh token
 * is never returned to the client and never logged.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly googleProvider: GoogleProvider,
    private readonly appleProvider: AppleProvider,
    private readonly externalIdentityService: ExternalIdentityService,
  ) {}

  async signInWithGoogle(idToken: string): Promise<UserDTO> {
    const identity = await this.googleProvider.verifyIdToken(idToken);
    const user = await this.externalIdentityService.resolveOrCreate(identity);
    return toDTO(user);
  }

  async signInWithApple(
    idToken: string,
    nonce: string,
    authorizationCode: string,
  ): Promise<UserDTO> {
    const identity = await this.appleProvider.verifyIdentityToken(
      idToken,
      nonce,
    );
    const refreshToken = await this.tryExchangeAppleCode(
      authorizationCode,
      identity.clientId,
    );
    const user = await this.externalIdentityService.resolveOrCreate(
      {
        provider: identity.provider,
        subject: identity.subject,
        email: identity.email,
      },
      refreshToken,
    );
    return toDTO(user);
  }

  private async tryExchangeAppleCode(
    authorizationCode: string,
    clientId: string,
  ): Promise<string | null> {
    try {
      return await this.appleProvider.exchangeAuthorizationCode(
        authorizationCode,
        clientId,
      );
    } catch {
      // The sign-in itself succeeded (the identity token was verified); the
      // refresh token only powers later revocation. Log without credentials.
      this.logger.log(
        'Apple authorization-code exchange failed; continuing without a stored refresh token',
      );
      return null;
    }
  }
}
