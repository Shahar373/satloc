import { describe, expect, it } from 'vitest';
import { createClockStore } from './clock';

const EPOCH = new Date('2026-09-01T12:00:00.000Z');

describe('createClockStore', () => {
  it('initializes from the given time/options and stays independent across instances', () => {
    const a = createClockStore(EPOCH, { multiplier: 4 });
    const b = createClockStore(new Date(EPOCH.getTime() + 60_000));

    expect(a.getState().simTime.getTime()).toBe(EPOCH.getTime());
    expect(a.getState().multiplier).toBe(4);
    expect(b.getState().simTime.getTime()).toBe(EPOCH.getTime() + 60_000);
    expect(b.getState().multiplier).toBe(1);

    a.getState().advance(1000);
    expect(a.getState().simTime.getTime()).toBe(EPOCH.getTime() + 4000);
    expect(b.getState().simTime.getTime()).toBe(EPOCH.getTime() + 60_000); // untouched
  });

  it('pause/resume/setMultiplier/seek update the store reactively', () => {
    const useClock = createClockStore(EPOCH);

    useClock.getState().pause();
    expect(useClock.getState().running).toBe(false);

    useClock.getState().resume();
    expect(useClock.getState().running).toBe(true);

    useClock.getState().setMultiplier(60);
    expect(useClock.getState().multiplier).toBe(60);

    const target = new Date(EPOCH.getTime() + 3_600_000);
    useClock.getState().seek(target);
    expect(useClock.getState().simTime.getTime()).toBe(target.getTime());
  });

  it('subscribers are notified on state-changing calls', () => {
    const useClock = createClockStore(EPOCH);
    const seen: number[] = [];
    const unsubscribe = useClock.subscribe((state) => seen.push(state.simTime.getTime()));

    useClock.getState().advance(1000);
    useClock.getState().advance(2000);
    unsubscribe();

    expect(seen).toEqual([EPOCH.getTime() + 1000, EPOCH.getTime() + 3000]);
  });
});
