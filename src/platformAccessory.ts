import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { FireplaceController, IFireplaceController } from './controllers/fireplaceController';
import { RequestController, IRequestController } from './controllers/requestController';
import { IDeviceConfig } from './models/deviceConfig';
import { FireplaceStatus } from './models/fireplaceStatus';
import { FlameHeightUtils } from './models/flameHeight';
import { OperationMode } from './models/operationMode';
import { MertikPlatform } from './platform';

export type FireplaceAccessoryRole = 'power' | 'mode' | 'target-temperature' | 'flame' | 'connected';

export interface FireplaceAccessoryContext {
  device: IDeviceConfig;
  role: FireplaceAccessoryRole;
}

interface SharedFireplaceDevice {
  fireplace: IFireplaceController;
  request: IRequestController;
}

const FLAME_LEVEL_COUNT = 12;
const FLAME_LEVEL_PERCENT_STEP = 100 / (FLAME_LEVEL_COUNT - 1);
const FLAME_LEVEL_TEMPERATURES = Array.from({ length: FLAME_LEVEL_COUNT }, (_, index) => 5 + ((31 * index) / (FLAME_LEVEL_COUNT - 1)));
const FLAME_LEVEL_PERCENTAGES = Array.from({ length: FLAME_LEVEL_COUNT }, (_, index) => index * FLAME_LEVEL_PERCENT_STEP);

export class FireplacePlatformAccessory {
  constructor(
    private readonly platform: MertikPlatform,
    private readonly accessory: PlatformAccessory<FireplaceAccessoryContext>,
    private readonly shared: SharedFireplaceDevice,
  ) {
    this.configureAccessoryInformation();
    this.cleanupServices();
    this.configureRole();
  }

  static createSharedDevice(platform: MertikPlatform, device: IDeviceConfig): SharedFireplaceDevice {
    const fireplace = new FireplaceController(platform.log, device);
    const request = new RequestController(platform.log, fireplace, false);
    return { fireplace, request };
  }

  private configureAccessoryInformation() {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mertik')
      .setCharacteristic(this.platform.Characteristic.Model, 'B6R-WME')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID)
      .setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
  }

  private cleanupServices() {
    const desiredUuid = this.desiredServiceUuid();
    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.AccessoryInformation.UUID) {
        continue;
      }
      if (service.UUID !== desiredUuid) {
        this.accessory.removeService(service);
      }
    }
  }

  private desiredServiceUuid(): string {
    switch (this.accessory.context.role) {
      case 'power':
        return this.platform.Service.Switch.UUID;
      case 'mode':
      case 'target-temperature':
        return this.platform.Service.Thermostat.UUID;
      case 'flame':
        return this.platform.Service.Fan.UUID;
      case 'connected':
        return this.platform.Service.ContactSensor.UUID;
    }
  }

  private configureRole() {
    switch (this.accessory.context.role) {
      case 'power':
        this.configurePowerAccessory();
        break;
      case 'mode':
        this.configureModeAccessory();
        break;
      case 'target-temperature':
        this.configureTargetTemperatureAccessory();
        break;
      case 'flame':
        this.configureFlameAccessory();
        break;
      case 'connected':
        this.configureConnectedAccessory();
        break;
    }
  }

  private configurePowerAccessory() {
    const service = this.getOrAddService(this.platform.Service.Switch, 'power');
    service.setPrimaryService();
    service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    const on = service.getCharacteristic(this.platform.Characteristic.On);
    on.onGet(() => this.powerValue(this.getStatus()));
    on.onSet((value) => {
      const status = this.getStatus();
      if ((value as boolean) && this.effectiveMode(status) === OperationMode.Off) {
        this.shared.request.setMode(OperationMode.Manual);
      } else if (!(value as boolean) && this.effectiveMode(status) !== OperationMode.Off) {
        this.shared.request.setMode(OperationMode.Off);
      }
      this.syncPower(service);
    });

    this.shared.fireplace.on('status', (status) => {
      on.updateValue(this.powerValue(status));
    });
  }

  private configureModeAccessory() {
    const service = this.getOrAddService(this.platform.Service.Thermostat, 'mode-selector');
    service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    const currentState = service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);
    const targetState = service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);
    const currentTemperature = service.getCharacteristic(this.platform.Characteristic.CurrentTemperature);
    const targetTemperature = service.getCharacteristic(this.platform.Characteristic.TargetTemperature);
    const displayUnits = service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits);

    targetState.setProps({
      validValues: [
        this.platform.Characteristic.TargetHeatingCoolingState.AUTO,
        this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
        this.platform.Characteristic.TargetHeatingCoolingState.COOL,
      ],
    });

    targetTemperature.setProps({
      minValue: 5,
      maxValue: 36,
      minStep: 0.5,
    });

    currentState.onGet(() => this.modeCurrentHeatingCoolingStateValue(this.getStatus()));
    targetState.onGet(() => this.modeTargetHeatingCoolingStateValue(this.getStatus()));
    targetState.onSet((value) => {
      const status = this.getStatus();
      if (this.effectiveMode(status) === OperationMode.Off) {
        this.platform.log.debug('Ignoring mode change while fireplace is off');
        currentState.updateValue(this.modeCurrentHeatingCoolingStateValue(status));
        targetState.updateValue(this.modeTargetHeatingCoolingStateValue(status));
        return;
      }
      this.shared.request.setMode(this.operationModeFromHeatingCoolingState(value));
    });
    currentTemperature.onGet(() => this.displayCurrentTemperatureValue(this.getStatus()));
    targetTemperature.onGet(() => this.targetTemperatureValue(this.getStatus()));
    targetTemperature.onSet(() => undefined);
    displayUnits.onGet(() => this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
    displayUnits.onSet(() => undefined);

    this.shared.fireplace.on('status', (status) => {
      currentState.updateValue(this.modeCurrentHeatingCoolingStateValue(status));
      targetState.updateValue(this.modeTargetHeatingCoolingStateValue(status));
      currentTemperature.updateValue(this.displayCurrentTemperatureValue(status));
      targetTemperature.updateValue(this.targetTemperatureValue(status));
    });
  }

  private configureTargetTemperatureAccessory() {
    const service = this.getOrAddService(this.platform.Service.Thermostat, 'target-temperature');
    service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    const currentState = service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);
    const targetState = service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);
    const currentTemperature = service.getCharacteristic(this.platform.Characteristic.CurrentTemperature);
    const targetTemperature = service.getCharacteristic(this.platform.Characteristic.TargetTemperature);
    const displayUnits = service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits);

    targetState.setProps({
      validValues: [this.platform.Characteristic.TargetHeatingCoolingState.AUTO],
    });
    targetTemperature.setProps({
      minValue: 5,
      maxValue: 36,
      minStep: 0.5,
    });

    currentState.onGet(() => this.targetTemperatureCurrentHeatingCoolingStateValue(this.getStatus()));
    targetState.onGet(() => this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
    targetState.onSet(() => undefined);
    currentTemperature.onGet(() => this.displayCurrentTemperatureValue(this.getStatus()));
    targetTemperature.onGet(() => this.targetTemperatureValue(this.getStatus()));
    targetTemperature.onSet((value) => {
      const status = this.getStatus();
      if (this.effectiveMode(status) !== OperationMode.Temperature) {
        this.platform.log.debug('Ignoring target temperature change outside temperature mode');
        return;
      }
      this.shared.request.setTemperature(value as number);
    });
    displayUnits.onGet(() => this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
    displayUnits.onSet(() => undefined);

    this.shared.fireplace.on('status', (status) => {
      currentState.updateValue(this.targetTemperatureCurrentHeatingCoolingStateValue(status));
      currentTemperature.updateValue(this.displayCurrentTemperatureValue(status));
      targetTemperature.updateValue(this.targetTemperatureValue(status));
    });
  }

  private configureFlameAccessory() {
    const service = this.getOrAddService(this.platform.Service.Fan, 'flame-level');
    service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    const on = service.getCharacteristic(this.platform.Characteristic.On);
    const speed = service.getCharacteristic(this.platform.Characteristic.RotationSpeed);
    speed.setProps({
      minValue: 0,
      maxValue: 100,
      minStep: FLAME_LEVEL_PERCENT_STEP,
    });

    on.onGet(() => this.flameActiveValue(this.getStatus()));
    on.onSet(() => undefined);
    speed.onGet(() => this.flameLevelValue(this.getStatus()));
    speed.onSet((value) => {
      const status = this.getStatus();
      if (this.effectiveMode(status) !== OperationMode.Manual) {
        this.platform.log.debug('Ignoring flame level change outside manual mode');
        return;
      }
      this.shared.request.setTemperature(this.temperatureFromFlameLevel(value as number));
    });

    this.shared.fireplace.on('status', (status) => {
      on.updateValue(this.flameActiveValue(status));
      speed.updateValue(this.flameLevelValue(status));
    });
  }

  private configureConnectedAccessory() {
    const service = this.getOrAddService(this.platform.Service.ContactSensor, 'reachable');
    service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    const state = service.getCharacteristic(this.platform.Characteristic.ContactSensorState);
    state.onGet(() => this.reachableValue(this.shared.fireplace.reachable()));
    this.shared.fireplace.on('reachable', (reachable) => {
      state.updateValue(this.reachableValue(reachable));
    });
  }

  private getOrAddService(serviceConstructor: typeof Service & { UUID: string }, subtype: string) {
    return this.accessory.getServiceById(serviceConstructor, subtype)
      || this.accessory.addService(serviceConstructor, this.accessory.displayName, subtype);
  }

  private getStatus(): FireplaceStatus {
    if (!this.shared.fireplace.reachable()) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const status = this.shared.fireplace.status();
    if (!status) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.RESOURCE_BUSY);
    }
    return status;
  }

  private syncPower(service: Service) {
    service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.powerValue(this.getStatus()));
  }

  private effectiveMode(status: FireplaceStatus): OperationMode {
    const currentRequest = this.shared.request.currentRequest();
    if (currentRequest?.mode !== undefined) {
      return currentRequest.mode;
    }
    return status.mode;
  }

  private effectiveTargetTemperature(status: FireplaceStatus): number {
    const currentRequest = this.shared.request.currentRequest();
    if (currentRequest?.temperature !== undefined) {
      return currentRequest.temperature;
    }
    return status.targetTemperature;
  }

  private powerValue(status: FireplaceStatus): CharacteristicValue {
    return this.effectiveMode(status) !== OperationMode.Off;
  }

  private modeCurrentHeatingCoolingStateValue(status: FireplaceStatus): CharacteristicValue {
    const mode = this.effectiveMode(status);
    switch (mode) {
      case OperationMode.Manual:
      case OperationMode.Temperature:
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      case OperationMode.Eco:
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      default:
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }

  private modeTargetHeatingCoolingStateValue(status: FireplaceStatus): CharacteristicValue {
    switch (this.effectiveMode(status)) {
      case OperationMode.Manual:
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      case OperationMode.Eco:
        return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
      default:
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    }
  }

  private operationModeFromHeatingCoolingState(value: CharacteristicValue): OperationMode {
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      return OperationMode.Manual;
    }
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      return OperationMode.Eco;
    }
    return OperationMode.Temperature;
  }

  private displayCurrentTemperatureValue(status: FireplaceStatus): CharacteristicValue {
    return status.currentTemperature > 100 ? 20 : status.currentTemperature;
  }

  private targetTemperatureValue(status: FireplaceStatus): CharacteristicValue {
    return this.effectiveTargetTemperature(status);
  }

  private targetTemperatureCurrentHeatingCoolingStateValue(status: FireplaceStatus): CharacteristicValue {
    return this.effectiveMode(status) === OperationMode.Temperature
      ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
      : this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  private flameActiveValue(status: FireplaceStatus): CharacteristicValue {
    return this.effectiveMode(status) === OperationMode.Manual;
  }

  private flameLevelValue(status: FireplaceStatus): CharacteristicValue {
    if (this.effectiveMode(status) !== OperationMode.Manual) {
      return 0;
    }
    const currentRequest = this.shared.request.currentRequest();
    if (currentRequest?.temperature !== undefined) {
      return this.flameLevelFromTemperature(currentRequest.temperature);
    }
    return FlameHeightUtils.toPercentage(this.shared.fireplace.getFlameHeight()) * 100;
  }

  private flameLevelFromTemperature(temperature: number): number {
    let closestIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < FLAME_LEVEL_TEMPERATURES.length; index++) {
      const distance = Math.abs(FLAME_LEVEL_TEMPERATURES[index] - temperature);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestIndex = index;
      }
    }
    return FLAME_LEVEL_PERCENTAGES[closestIndex];
  }

  private temperatureFromFlameLevel(level: number): number {
    let closestIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < FLAME_LEVEL_PERCENTAGES.length; index++) {
      const distance = Math.abs(FLAME_LEVEL_PERCENTAGES[index] - level);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestIndex = index;
      }
    }
    return FLAME_LEVEL_TEMPERATURES[closestIndex];
  }

  private reachableValue(reachable: boolean): CharacteristicValue {
    return reachable ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }
}
