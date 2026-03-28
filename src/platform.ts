import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  FireplaceAccessoryContext,
  FireplaceAccessoryRole,
  FireplacePlatformAccessory,
} from './platformAccessory';
import { IDeviceConfig } from './models/deviceConfig';

type ManagedAccessory = PlatformAccessory<FireplaceAccessoryContext>;

const ACCESSORY_ROLES: Array<{
  role: FireplaceAccessoryRole;
  suffix: string;
  category: Categories;
}> = [
  { role: 'power', suffix: '', category: Categories.SWITCH },
  { role: 'mode', suffix: 'Mode', category: Categories.THERMOSTAT },
  { role: 'target-temperature', suffix: 'Target Temp', category: Categories.THERMOSTAT },
  { role: 'flame', suffix: 'Flame Level', category: Categories.FAN },
  { role: 'connected', suffix: 'Connected', category: Categories.SENSOR },
];

export class MertikPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: ManagedAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.configureDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory as ManagedAccessory);
  }

  configureDevices() {
    const configuredDevices: IDeviceConfig[] = this.config['fireplaces'] ?? [];
    const desiredAccessoryIds = new Set<string>();

    for (const configuredDevice of configuredDevices) {
      if (!configuredDevice.name) {
        this.log.error('No valid fireplace name given!');
        continue;
      }

      const shared = FireplacePlatformAccessory.createSharedDevice(this, configuredDevice);
      const accessoriesToRegister: ManagedAccessory[] = [];

      for (const roleConfig of ACCESSORY_ROLES) {
        const uuid = this.api.hap.uuid.generate(`${configuredDevice.name}:${roleConfig.role}`);
        desiredAccessoryIds.add(uuid);

        const existingAccessory = this.accessories.find(a => a.UUID === uuid);
        const displayName = roleConfig.suffix ? `${configuredDevice.name} ${roleConfig.suffix}` : configuredDevice.name;
        const context: FireplaceAccessoryContext = {
          device: configuredDevice,
          role: roleConfig.role,
        };

        if (existingAccessory) {
          existingAccessory.category = roleConfig.category;
          existingAccessory.context = context;
          existingAccessory.updateDisplayName(displayName);
          new FireplacePlatformAccessory(this, existingAccessory, shared);
          this.api.updatePlatformAccessories([existingAccessory]);
        } else {
          const newAccessory = new this.api.platformAccessory(displayName, uuid) as ManagedAccessory;
          newAccessory.category = roleConfig.category;
          newAccessory.context = context;
          new FireplacePlatformAccessory(this, newAccessory, shared);
          accessoriesToRegister.push(newAccessory);
          this.accessories.push(newAccessory);
        }
      }

      if (accessoriesToRegister.length > 0) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRegister);
      }
    }

    for (const existingAccessory of [...this.accessories]) {
      if (!desiredAccessoryIds.has(existingAccessory.UUID)) {
        this.log.info('Removing existing fireplace accessory from cache:', existingAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      }
    }
  }
}
