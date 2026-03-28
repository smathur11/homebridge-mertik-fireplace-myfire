import { Characteristic, Logger, PlatformAccessory, Service } from 'homebridge';
import { IDeviceConfig } from '../models/deviceConfig';
import { MertikPlatform } from '../platform';

export interface IServiceController {
  reachableCharacteristic(): Characteristic;
  powerCharacteristic(): Characteristic;
  modeCurrentHeatingCoolingStateCharacteristic(): Characteristic;
  modeTargetHeatingCoolingStateCharacteristic(): Characteristic;
  modeCurrentTemperatureCharacteristic(): Characteristic;
  modeTargetTemperatureCharacteristic(): Characteristic;
  modeTemperatureDisplayUnitsCharacteristic(): Characteristic;
  targetTemperatureCurrentHeatingCoolingStateCharacteristic(): Characteristic;
  targetTemperatureTargetHeatingCoolingStateCharacteristic(): Characteristic;
  targetTemperatureCurrentTemperatureCharacteristic(): Characteristic;
  targetTemperatureTargetTemperatureCharacteristic(): Characteristic;
  targetTemperatureDisplayUnitsCharacteristic(): Characteristic;
  flameActiveCharacteristic(): Characteristic;
  flameRotationSpeedCharacteristic(): Characteristic;
}

export class ServiceController implements IServiceController {
  private readonly config: IDeviceConfig;
  private readonly powerService: Service;
  private readonly modeService: Service;
  private readonly targetTemperatureService: Service;
  private readonly flameService: Service;
  private readonly reachableService: Service;

  constructor(
    public readonly log: Logger,
    public readonly accessory: PlatformAccessory,
    private readonly platform: MertikPlatform) {
    this.config = this.accessory.context.device;
    this.cleanupLegacyServices();
    this.powerService = this.accessory.getServiceById(this.platform.Service.Switch, 'power')
      || this.accessory.addService(this.platform.Service.Switch, this.config.name, 'power');
    this.modeService = this.accessory.getServiceById(this.platform.Service.Thermostat, 'mode-selector')
      || this.accessory.addService(this.platform.Service.Thermostat, 'Mode', 'mode-selector');
    this.targetTemperatureService = this.accessory.getServiceById(this.platform.Service.Thermostat, 'target-temperature')
      || this.accessory.addService(this.platform.Service.Thermostat, 'Target Temperature', 'target-temperature');
    this.flameService = this.accessory.getServiceById(this.platform.Service.Fan, 'flame-level')
      || this.accessory.addService(this.platform.Service.Fan, 'Flame Level', 'flame-level');
    this.reachableService = this.accessory.getServiceById(this.platform.Service.ContactSensor, 'reachable')
      || this.accessory.getService(this.platform.Service.ContactSensor)
      || this.accessory.addService(this.platform.Service.ContactSensor, 'Connected', 'reachable');
    this.initCharacteristics();
  }

  private cleanupLegacyServices() {
    const allowedSwitchSubtypes = new Set(['power']);
    const allowedThermostatSubtypes = new Set(['mode-selector', 'target-temperature']);
    const allowedFanSubtypes = new Set(['flame-level']);
    const allowedContactSensorSubtypes = new Set(['reachable']);

    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.AccessoryInformation.UUID) {
        continue;
      }
      if (service.UUID === this.platform.Service.HeaterCooler.UUID) {
        this.accessory.removeService(service);
        continue;
      }
      if (service.UUID === this.platform.Service.Switch.UUID
        && !allowedSwitchSubtypes.has(service.subtype ?? '')) {
        this.accessory.removeService(service);
        continue;
      }
      if (service.UUID === this.platform.Service.Thermostat.UUID
        && !allowedThermostatSubtypes.has(service.subtype ?? '')) {
        this.accessory.removeService(service);
        continue;
      }
      if (service.UUID === this.platform.Service.Fan.UUID
        && !allowedFanSubtypes.has(service.subtype ?? '')) {
        this.accessory.removeService(service);
        continue;
      }
      if (service.UUID === this.platform.Service.ContactSensor.UUID
        && service.subtype !== undefined
        && !allowedContactSensorSubtypes.has(service.subtype)) {
        this.accessory.removeService(service);
        continue;
      }
    }
  }

  initCharacteristics() {
    const name = this.config.name;
    if (name.length < 2) {
      this.platform.log.error(`The given name ${this.config.name}, is too short`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.RESOURCE_DOES_NOT_EXIST);
    }
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mertik')
      .setCharacteristic(this.platform.Characteristic.Model, 'B6R-WME')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID)
      .setCharacteristic(this.platform.Characteristic.Name, this.config.name ?? 'Fireplace');

    this.powerService.setPrimaryService();
    this.powerService.setCharacteristic(this.platform.Characteristic.Name, this.config.name ?? 'Fireplace');
    this.modeService.setCharacteristic(this.platform.Characteristic.Name, 'Mode');
    this.targetTemperatureService.setCharacteristic(this.platform.Characteristic.Name, 'Target Temperature');
    this.flameService.setCharacteristic(this.platform.Characteristic.Name, 'Flame Level');
    this.reachableService.setCharacteristic(this.platform.Characteristic.Name, 'Connected');

    this.modeTargetHeatingCoolingStateCharacteristic()
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.AUTO,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
          this.platform.Characteristic.TargetHeatingCoolingState.COOL,
        ],
      });

    this.targetTemperatureTargetHeatingCoolingStateCharacteristic()
      .setProps({
        validValues: [this.platform.Characteristic.TargetHeatingCoolingState.AUTO],
      });

    this.modeTargetTemperatureCharacteristic()
      .setProps({
        minValue: 5,
        maxValue: 36,
        minStep: 0.5,
      });

    this.targetTemperatureTargetTemperatureCharacteristic()
      .setProps({
        minValue: 5,
        maxValue: 36,
        minStep: 0.5,
      });

    this.flameRotationSpeedCharacteristic()
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 20,
      });
  }

  reachableCharacteristic = () => this.reachableService.getCharacteristic(this.platform.Characteristic.ContactSensorState);

  powerCharacteristic = () => this.powerService.getCharacteristic(this.platform.Characteristic.On);

  modeCurrentHeatingCoolingStateCharacteristic = () =>
    this.modeService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);

  modeTargetHeatingCoolingStateCharacteristic = () =>
    this.modeService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);

  modeCurrentTemperatureCharacteristic = () =>
    this.modeService.getCharacteristic(this.platform.Characteristic.CurrentTemperature);

  modeTargetTemperatureCharacteristic = () =>
    this.modeService.getCharacteristic(this.platform.Characteristic.TargetTemperature);

  modeTemperatureDisplayUnitsCharacteristic = () =>
    this.modeService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits);

  targetTemperatureCurrentHeatingCoolingStateCharacteristic = () =>
    this.targetTemperatureService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);

  targetTemperatureTargetHeatingCoolingStateCharacteristic = () =>
    this.targetTemperatureService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);

  targetTemperatureCurrentTemperatureCharacteristic = () =>
    this.targetTemperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature);

  targetTemperatureTargetTemperatureCharacteristic = () =>
    this.targetTemperatureService.getCharacteristic(this.platform.Characteristic.TargetTemperature);

  targetTemperatureDisplayUnitsCharacteristic = () =>
    this.targetTemperatureService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits);

  flameActiveCharacteristic = () => this.flameService.getCharacteristic(this.platform.Characteristic.On);

  flameRotationSpeedCharacteristic = () => this.flameService.getCharacteristic(this.platform.Characteristic.RotationSpeed);
}
