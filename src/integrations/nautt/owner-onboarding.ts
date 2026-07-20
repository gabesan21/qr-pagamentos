import "server-only";

import {
  getNauttCredentialService,
  NauttCredentialReplacementBlockedError,
  type NauttCredentialRedacted,
} from "../../auth/nautt-credential";
import type { Principal } from "../../auth/authorization";

import { getMainWalletBalanceAdapter, MainWalletBalanceError, type MainWalletBalance } from "./main-wallet-balance";
import {
  getOwnerWebhookRegistrationService,
  OwnerWebhookRegistrationRecoveryRequiredError,
} from "./owner-webhook-registration";

type CredentialService = {
  snapshotRevision(actor: Principal, targetUserId: string): Promise<string | null>;
  saveValidated(actor: Principal, targetUserId: string, apiKey: string, expectedRevision: string | null): Promise<string>;
  getRedacted(actor: Principal, targetUserId: string): Promise<NauttCredentialRedacted>;
  getDecryptedApiKey(targetUserId: string): Promise<string>;
};

type WalletAdapter = { read(apiKey: string): Promise<MainWalletBalance> };
type RegistrationService = {
  register(userId: string, callbackUrl: string, expectedRevision: string): Promise<unknown>;
  reset(userId: string): Promise<boolean>;
};

export class OwnerOnboardingInvalidKeyError extends Error {}
export class OwnerOnboardingChangedError extends Error {}
export class OwnerOnboardingRecoveryRequiredError extends Error {}

export type OwnerNauttStatus = {
  credential: NauttCredentialRedacted;
  balance: MainWalletBalance | null;
  balanceUnavailable: boolean;
};

export function createOwnerOnboardingService(
  credentials: CredentialService,
  wallet: WalletAdapter,
  registration: RegistrationService,
) {
  return {
    async onboard(actor: Principal, targetUserId: string, apiKey: string, callbackUrl: string): Promise<void> {
      const expectedRevision = await credentials.snapshotRevision(actor, targetUserId);
      try {
        await wallet.read(apiKey);
      } catch {
        throw new OwnerOnboardingInvalidKeyError("Nautt API key could not be validated");
      }

      let committedRevision: string;
      try {
        committedRevision = await credentials.saveValidated(actor, targetUserId, apiKey, expectedRevision);
      } catch (error) {
        if (error instanceof NauttCredentialReplacementBlockedError) {
          throw new OwnerOnboardingChangedError("Credential setup changed");
        }
        throw error;
      }

      try {
        await registration.register(targetUserId, callbackUrl, committedRevision);
      } catch (error) {
        if (error instanceof OwnerWebhookRegistrationRecoveryRequiredError) {
          throw new OwnerOnboardingRecoveryRequiredError("Webhook setup requires recovery");
        }
        throw error;
      }
    },

    async completeRegistration(actor: Principal, callbackUrl: string): Promise<void> {
      const revision = await credentials.snapshotRevision(actor, actor.id);
      if (!revision) throw new OwnerOnboardingChangedError("Credential setup changed");
      try {
        await registration.register(actor.id, callbackUrl, revision);
      } catch (error) {
        if (error instanceof OwnerWebhookRegistrationRecoveryRequiredError) {
          throw new OwnerOnboardingRecoveryRequiredError("Webhook setup requires recovery");
        }
        throw error;
      }
    },

    async resetRegistration(actor: Principal): Promise<void> {
      const resetApplied = await registration.reset(actor.id);
      if (!resetApplied) throw new OwnerOnboardingChangedError("Credential setup changed");
    },

    async readStatus(actor: Principal): Promise<OwnerNauttStatus> {
      const credential = await credentials.getRedacted(actor, actor.id);
      if (!credential.hasCredential) return { credential, balance: null, balanceUnavailable: false };
      let apiKey = "";
      try {
        apiKey = await credentials.getDecryptedApiKey(actor.id);
        return { credential, balance: await wallet.read(apiKey), balanceUnavailable: false };
      } catch (error) {
        if (error instanceof MainWalletBalanceError) {
          return { credential, balance: null, balanceUnavailable: true };
        }
        throw error;
      } finally {
        apiKey = "";
      }
    },
  };
}

export function getOwnerOnboardingService() {
  return createOwnerOnboardingService(
    getNauttCredentialService(),
    getMainWalletBalanceAdapter(),
    getOwnerWebhookRegistrationService(),
  );
}
