import Purchases, {
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';
import { REVENUCAT_API_KEY, REVENUECAT_ENTITLEMENTS } from '@/config/constants';
import type { Tier } from '@/types';

let initialized = false;

export async function initPurchases(uid: string): Promise<void> {
  if (initialized) return;

  Purchases.configure({
    apiKey: REVENUCAT_API_KEY,
    appUserID: uid,
  });
  initialized = true;
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  if (!offerings.current) return [];
  return offerings.current.availablePackages;
}

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export function getTierFromEntitlements(info: CustomerInfo): Tier {
  const entitlements = info.entitlements.active;

  if (REVENUECAT_ENTITLEMENTS.power in entitlements) return 'power';
  if (REVENUECAT_ENTITLEMENTS.core in entitlements) return 'core';
  if (REVENUECAT_ENTITLEMENTS.starter in entitlements) return 'starter';
  return 'free';
}
