import { Logger } from 'homebridge';
import { OperationMode } from '../models/operationMode';
import { IRequest } from '../models/request';
import { IFireplaceController } from './fireplaceController';

export interface IRequestController {
  isLocked(): boolean;
  unlock(): void;
  lock(): void;
  setAux(on: boolean): void;
  setMode(mode: OperationMode): void;
  setTemperature(temperature: number): void;
  setFlameLevel(temperature: number): void;
  currentRequest(): IRequest | undefined;
}

export class RequestController implements IRequestController{
  private busy = false;
  private scheduledRequest?: IRequest;
  private inFlightRequest?: IRequest;
  private scheduledDelay = 10_000;
  private sendTask?: NodeJS.Timeout;
  private lockTask?: NodeJS.Timeout;
  private flameTask?: NodeJS.Timeout;
  private pendingFlameLevel?: number;

  constructor(
    public readonly log: Logger,
    public readonly fireplace: IFireplaceController,
    public locked = false) {

  }

  public isLocked(): boolean {
    return this.locked || this.lockTask !== undefined;
  }

  private isAllowed(): boolean {
    return !this.locked;
  }

  currentRequest() {
    return this.pendingFlameLevel === undefined
      ? this.scheduledRequest ?? this.inFlightRequest
      : {temperature: this.pendingFlameLevel};
  }

  clearScheduledLock() {
    clearInterval(this.lockTask);
    this.lockTask = undefined;
  }

  lock() {
    this.clearScheduledLock();
    this.log.info('Lock control after 1 minute (makes sure that automations still run through.');
    this.lockTask = setTimeout(() => {
      this.locked = true;
      this.log.info('Locked controls');
    }, 60_000);
  }

  unlock() {
    this.clearScheduledLock();
    this.locked = false;
    this.log.info('Unlocked controls');

  }

  setAux(on: boolean) {
    this.scheduleRequest({auxOn: on}, 500);
  }

  setMode(mode: OperationMode) {
    clearTimeout(this.flameTask);
    this.pendingFlameLevel = undefined;
    this.scheduleRequest({mode}, 500);
  }

  setTemperature(temperature: number) {
    this.scheduleRequest({temperature}, 500);
  }

  setFlameLevel(temperature: number) {
    clearTimeout(this.flameTask);
    const latestRequest = this.scheduledRequest ?? this.inFlightRequest;
    if (latestRequest?.temperature === temperature) {
      this.pendingFlameLevel = undefined;
      return;
    }

    this.pendingFlameLevel = temperature;
    this.flameTask = setTimeout(() => {
      this.pendingFlameLevel = undefined;
      const latestRequest = this.scheduledRequest ?? this.inFlightRequest;
      if (latestRequest?.temperature !== temperature) {
        this.scheduleRequest({temperature}, 0);
      }
    }, 1000);
  }

  clearScheduledTask() {
    clearInterval(this.sendTask);
    this.sendTask = undefined;
  }

  private scheduleRequest(request: IRequest, delay = 10_000) {
    const hasExistingTask = this.sendTask !== undefined;
    if (hasExistingTask) {
      this.clearScheduledTask();
    }

    const mergedRequest = this.scheduledRequest ? {...this.scheduledRequest, ...request} : request;
    this.scheduledRequest = mergedRequest;
    this.scheduledDelay = hasExistingTask ? Math.min(this.scheduledDelay, delay) : delay;
    if (!this.busy) {
      this.sendTask = setTimeout(() => this.sendRequest(), this.scheduledDelay);
    }
  }

  private async sendRequest(retry = false) {
    if (this.busy) {
      return;
    }
    this.clearScheduledTask();

    const request = this.scheduledRequest;
    if (!request) {
      this.scheduledDelay = 10_000;
      return;
    }

    if (!this.isAllowed()) {
      if (!retry) {
        this.sendTask = setTimeout(() => this.sendRequest(true), 10_000);
        return;
      }

      this.log.info('Parental controls active, action is not allowed!');
      this.scheduledRequest = undefined;
      return;
    }

    this.log.debug(`Request: ${JSON.stringify(request)}`);
    this.scheduledRequest = undefined;
    this.inFlightRequest = request;
    this.busy = true;
    try {
      const success = await this.fireplace.request(request);
      if (!success) {
        this.scheduleRequest(request, this.scheduledDelay);
      }
    } catch (error) {
      this.log.error(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleRequest(request, this.scheduledDelay);
    } finally {
      this.inFlightRequest = undefined;
      this.busy = false;
      if (this.scheduledRequest && this.sendTask === undefined) {
        this.sendTask = setTimeout(() => this.sendRequest(), this.scheduledDelay);
      }
      if (!this.scheduledRequest) {
        this.scheduledDelay = 10_000;
      }
    }
  }
}
