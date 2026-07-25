import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventBus } from '../../../../shared/events';
import { DroneManager } from '../DroneManager';

describe('DroneManager facade lifecycle', () => {
  beforeEach(() => {
    eventBus.off();
  });

  afterEach(() => {
    eventBus.off();
  });

  it('clears the wrapped selected manager when selection is reset', () => {
    const manager = new DroneManager();

    manager.registerDrone('drone-test', 'Drone Test', 40.4168, -3.7038, 650);
    manager.selectDrone('drone-test');

    expect(manager.getSelectedManager()).not.toBeNull();

    manager.selectDrone(null);

    expect(manager.selectedDroneId).toBeNull();
    expect(manager.getSelectedManager()).toBeNull();

    manager.destroy();
  });

  it('tears down wrapped drone state on destroy', () => {
    const manager = new DroneManager();

    manager.registerDrone('drone-test', 'Drone Test', 40.4168, -3.7038, 650);
    manager.selectDrone('drone-test');

    expect(manager.getDroneState('drone-test')).not.toBeNull();

    manager.destroy();

    expect(manager.selectedDroneId).toBeNull();
    expect(manager.getDroneState('drone-test')).toBeNull();
    expect(manager.getSelectedManager()).toBeNull();
  });
});
