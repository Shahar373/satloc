import { describe, expect, it } from 'vitest';
import { nextTargetName } from './targets';

describe('nextTargetName', () => {
  const t = (name: string) => ({ id: name, name, latitudeDeg: 0, longitudeDeg: 0 });
  it('counts from the list length like before when nothing collides', () => {
    expect(nextTargetName([t('Tel Aviv')])).toBe('Target 2');
  });
  it('skips names that are still in use after a removal', () => {
    expect(nextTargetName([t('Tel Aviv'), t('Target 3')])).toBe('Target 4');
    expect(nextTargetName([t('Target 2'), t('Target 3')])).toBe('Target 4');
  });
});
