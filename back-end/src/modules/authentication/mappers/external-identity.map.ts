import ExternalIdentity from '../domain/external-identity.entity';
import type { ExternalProvider } from '../domain/external-identity.types';

export interface IExternalIdentityPersistence {
  id: string;
  provider: ExternalProvider;
  provider_subject: string;
  user_id: string;
  provider_email: string | null;
  refresh_token: string | null;
  created_at?: string;
  updated_at?: string;
}

export function toPersistence(
  identity: ExternalIdentity,
): Omit<IExternalIdentityPersistence, 'id'> {
  return {
    provider: identity.provider,
    provider_subject: identity.providerSubject,
    user_id: identity.userId,
    provider_email: identity.providerEmail,
    refresh_token: identity.refreshToken,
  };
}

export function persistenceToDomain(
  row: IExternalIdentityPersistence,
): ExternalIdentity {
  return ExternalIdentity.reconstitute({
    id: row.id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    userId: row.user_id,
    providerEmail: row.provider_email,
    refreshToken: row.refresh_token,
  });
}
