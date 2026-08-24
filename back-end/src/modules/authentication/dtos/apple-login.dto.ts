import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export default class AppleLoginDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;

  // The raw, unhashed nonce generated for this authentication attempt. Apple
  // embeds its SHA-256 hash in the token's `nonce` claim, which the backend
  // compares against.
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  nonce: string;

  // Apple's authorization code for this sign-in. Exchanged server-side for a
  // refresh token (never returned to the client) so account deletion can
  // revoke the user's Sign in with Apple authorization.
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  authorizationCode: string;
}
