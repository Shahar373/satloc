import { describe, expect, it, vi } from 'vitest';
import { SimulationClock, type ClockSnapshot } from './SimulationClock';

const EPOCH = new Date('2026-09-01T12:00:00.000Z');

describe('SimulationClock', () => {
  it('starts at the given time, multiplier 1, running by default', () => {
    const clock = new SimulationClock(EPOCH);
    expect(clock.simTime.getTime()).toBe(EPOCH.getTime());
    expect(clock.multiplier).toBe(1);
    expect(clock.running).toBe(true);
  });

  it('honors initial multiplier/running options', () => {
    const clock = new SimulationClock(EPOCH, { multiplier: 10, running: false });
    expect(clock.multiplier).toBe(10);
    expect(clock.running).toBe(false);
  });

  it('rejects a non-positive initial multiplier', () => {
    expect(() => new SimulationClock(EPOCH, { multiplier: 0 })).toThrow();
    expect(() => new SimulationClock(EPOCH, { multiplier: -1 })).toThrow();
  });

  it('advance() moves simTime by realElapsedMs * multiplier, never reading the wall clock', () => {
    const clock = new SimulationClock(EPOCH, { multiplier: 5 });
    clock.advance(1000);
    expect(clock.simTime.getTime()).toBe(EPOCH.getTime() + 5000);
  });

  it('advance() is a no-op while paused', () => {
    const clock = new SimulationClock(EPOCH, { running: false });
    clock.advance(1000);
    expect(clock.simTime.getTime()).toBe(EPOCH.getTime());
  });

  it('seek() jumps directly to a time, forward or backward', () => {
    const clock = new SimulationClock(EPOCH);
    const later = new Date(EPOCH.getTime() + 3_600_000);
    clock.seek(later);
    expect(clock.simTime.getTime()).toBe(later.getTime());
    const earlier = new Date(EPOCH.getTime() - 3_600_000);
    clock.seek(earlier);
    expect(clock.simTime.getTime()).toBe(earlier.getTime());
  });

  it('setMultiplier() rejects non-positive values without changing state', () => {
    const clock = new SimulationClock(EPOCH, { multiplier: 2 });
    expect(() => clock.setMultiplier(0)).toThrow();
    expect(() => clock.setMultiplier(-5)).toThrow();
    expect(clock.multiplier).toBe(2);
  });

  it('pause()/resume() toggle running and are idempotent', () => {
    const clock = new SimulationClock(EPOCH);
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.pause();
    expect(clock.running).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    clock.pause(); // already paused: no-op, no extra notification
    expect(listener).toHaveBeenCalledTimes(1);

    clock.resume();
    expect(clock.running).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('subscribe() delivers a snapshot on every state-changing call, and unsubscribe stops delivery', () => {
    const clock = new SimulationClock(EPOCH);
    const snapshots: ClockSnapshot[] = [];
    const unsubscribe = clock.subscribe((s) => snapshots.push(s));

    clock.advance(1000);
    clock.setMultiplier(2);
    unsubscribe();
    clock.advance(1000);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toEqual({ simTimeMs: EPOCH.getTime() + 1000, multiplier: 1, running: true });
    expect(snapshots[1]).toEqual({ simTimeMs: EPOCH.getTime() + 1000, multiplier: 2, running: true });
  });

  it('seek()/setMultiplier() to the current value are no-ops (no notification)', () => {
    const clock = new SimulationClock(EPOCH, { multiplier: 3 });
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.seek(EPOCH);
    clock.setMultiplier(3);
    expect(listener).not.toHaveBeenCalled();
  });
});
