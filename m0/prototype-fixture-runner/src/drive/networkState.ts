import * as Network from 'expo-network';
import type { DriveNetworkPolicy } from './contracts';

export type NetworkTransport = 'none' | 'wifi' | 'ethernet' | 'cellular' | 'vpn' | 'unknown' | 'other';

export type NetworkSnapshot = {
  type?: Network.NetworkStateType;
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

/**
 * Reduces Expo's Network.State to a stable transport label. VPN and Unknown do
 * not satisfy Wi-Fi-only policy, and a disconnected or internet-unreachable
 * network always maps to none.
 */
export function normalizeTransport(state: NetworkSnapshot): NetworkTransport {
  if (state.isConnected !== true) return 'none';
  if (state.isInternetReachable === false) return 'none';
  switch (state.type) {
    case Network.NetworkStateType.WIFI:
      return 'wifi';
    case Network.NetworkStateType.ETHERNET:
      return 'ethernet';
    case Network.NetworkStateType.CELLULAR:
      return 'cellular';
    case Network.NetworkStateType.VPN:
      return 'vpn';
    case Network.NetworkStateType.NONE:
      return 'none';
    default:
      return 'unknown';
  }
}

export function isNetworkEligible(policy: DriveNetworkPolicy, transport: NetworkTransport): boolean {
  if (transport === 'none') return false;
  if (policy === 'any') return true;
  return transport === 'wifi' || transport === 'ethernet';
}

export function createInstalledNetworkReader(): () => Promise<NetworkTransport> {
  return async () => normalizeTransport(await Network.getNetworkStateAsync());
}