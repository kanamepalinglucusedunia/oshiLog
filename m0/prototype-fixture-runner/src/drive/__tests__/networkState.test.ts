import * as Network from 'expo-network';
import {
  isNetworkEligible,
  normalizeTransport,
  type NetworkTransport,
} from '../networkState';

describe('drive networkState', () => {
  describe('isNetworkEligible', () => {
    it('any network allows every transport except none', () => {
      for (const transport of ['wifi', 'ethernet', 'cellular', 'vpn', 'unknown', 'other'] as NetworkTransport[]) {
        expect(isNetworkEligible('any', transport)).toBe(true);
      }
      expect(isNetworkEligible('any', 'none')).toBe(false);
    });

    it('wifi_only allows wifi and ethernet', () => {
      expect(isNetworkEligible('wifi_only', 'wifi')).toBe(true);
      expect(isNetworkEligible('wifi_only', 'ethernet')).toBe(true);
    });

    it('wifi_only rejects cellular', () => {
      expect(isNetworkEligible('wifi_only', 'cellular')).toBe(false);
    });

    it('wifi_only rejects vpn, unknown, and none', () => {
      expect(isNetworkEligible('wifi_only', 'vpn')).toBe(false);
      expect(isNetworkEligible('wifi_only', 'unknown')).toBe(false);
      expect(isNetworkEligible('wifi_only', 'none')).toBe(false);
    });
  });

  describe('normalizeTransport', () => {
    it('maps connected wifi with internet to wifi', () => {
      expect(normalizeTransport({ type: 'WIFI' as Network.NetworkStateType, isConnected: true, isInternetReachable: true })).toBe('wifi');
    });

    it('maps ethernet to ethernet', () => {
      expect(normalizeTransport({ type: 'ETHERNET' as Network.NetworkStateType, isConnected: true, isInternetReachable: true })).toBe('ethernet');
    });

    it('maps cellular even when internet reachability is unset but connected', () => {
      expect(normalizeTransport({ type: 'CELLULAR' as Network.NetworkStateType, isConnected: true })).toBe('cellular');
    });

    it('maps vpn to vpn and unreachable wifi to none', () => {
      expect(normalizeTransport({ type: 'VPN' as Network.NetworkStateType, isConnected: true, isInternetReachable: true })).toBe('vpn');
      expect(normalizeTransport({ type: 'WIFI' as Network.NetworkStateType, isConnected: true, isInternetReachable: false })).toBe('none');
    });

    it('maps none and disconnected states to none', () => {
      expect(normalizeTransport({ type: 'NONE' as Network.NetworkStateType, isConnected: false })).toBe('none');
      expect(normalizeTransport({ type: 'WIFI' as Network.NetworkStateType, isConnected: false })).toBe('none');
      expect(normalizeTransport({ type: 'UNKNOWN' as Network.NetworkStateType, isConnected: false })).toBe('none');
    });

    it('treats a types other than wifi/ethernet/cellular/vpn as unknown when reachable', () => {
      expect(normalizeTransport({ type: 'OTHER' as Network.NetworkStateType, isConnected: true, isInternetReachable: true })).toBe('unknown');
      expect(normalizeTransport({ type: 'OTHER' as Network.NetworkStateType, isConnected: true, isInternetReachable: undefined })).toBe('unknown');
    });

    it('treats cellular with unset reachability as cellular (iOS-style reachability proxy)', () => {
      expect(normalizeTransport({ type: 'CELLULAR' as Network.NetworkStateType, isConnected: true })).toBe('cellular');
      expect(normalizeTransport({ type: 'UNKNOWN' as Network.NetworkStateType, isConnected: true, isInternetReachable: true })).toBe('unknown');
    });
  });
});