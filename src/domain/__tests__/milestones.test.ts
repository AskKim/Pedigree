/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  ALPHA_3_MILESTONES,
  APP_MILESTONES,
  getMilestonesForRelease,
} from '../milestones';

describe('milestones — application release deliverables', () => {
  it('defines Alpha 3 milestones with all required deliverables', () => {
    expect(ALPHA_3_MILESTONES.version).toBe('0.1.0-alpha.3');
    expect(ALPHA_3_MILESTONES.label).toBe('Alpha 3');
    expect(ALPHA_3_MILESTONES.status).toBe('planned');

    const titles = ALPHA_3_MILESTONES.items.map((item) => item.title);
    expect(titles).toContain('QR code device to device read and receive of pedigrees');
    expect(titles).toContain('Modularity');
    expect(titles).toContain('Resolving outdated files dependencies Etc');
  });

  it('retrieves Alpha 3 milestone targets from the registry', () => {
    const alpha3 = getMilestonesForRelease('alpha-3');
    expect(alpha3).not.toBeNull();
    expect(alpha3?.items.length).toBeGreaterThanOrEqual(3);

    const alpha2 = getMilestonesForRelease('alpha-2');
    expect(alpha2?.status).toBe('released');

    expect(getMilestonesForRelease('non-existent')).toBeNull();
  });
});
