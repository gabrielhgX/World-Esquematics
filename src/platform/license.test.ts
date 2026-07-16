import { describe, expect, it } from 'vitest';
import { checkLicense, type License } from './license';

const NOW = 1_800_000_000_000;

describe('checkLicense — v1 aplica só a major (decisão §10.2)', () => {
  it('Steam: v1.x vitalício roda no app v1', () => {
    const license: License = { plan: 'steam-lifetime', majorVersion: 1, entitlements: [] };
    expect(checkLicense(license, 1, NOW).ok).toBe(true);
  });

  it('Steam: app v2 com licença v1 bloqueia — v2 é compra nova', () => {
    const license: License = { plan: 'steam-lifetime', majorVersion: 1, entitlements: [] };
    const status = checkLicense(license, 2, NOW);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toMatch(/compra nova/);
  });

  it('Steam: licença v2 cobre o app v1 (major nova cobre as antigas)', () => {
    const license: License = { plan: 'steam-lifetime', majorVersion: 2, entitlements: [] };
    expect(checkLicense(license, 1, NOW).ok).toBe(true);
  });

  it('web: assinatura vigente vale — inclusive em majors novas', () => {
    const license: License = {
      plan: 'web-subscription',
      majorVersion: 1,
      entitlements: [],
      expiresAt: NOW + 1000,
    };
    expect(checkLicense(license, 99, NOW).ok).toBe(true);
  });

  it('web: expirada bloqueia; sem validade bloqueia', () => {
    const expired: License = {
      plan: 'web-subscription',
      majorVersion: 1,
      entitlements: [],
      expiresAt: NOW - 1,
    };
    expect(checkLicense(expired, 1, NOW).ok).toBe(false);
    const invalid: License = { plan: 'web-subscription', majorVersion: 1, entitlements: [] };
    expect(checkLicense(invalid, 1, NOW).ok).toBe(false);
  });

  it('entitlements NÃO são checados no v1 (viram nuvem/assets depois)', () => {
    const license: License = {
      plan: 'steam-lifetime',
      majorVersion: 1,
      entitlements: ['cloud-sync', 'asset-library'],
    };
    expect(checkLicense(license, 1, NOW).ok).toBe(true);
  });
});
