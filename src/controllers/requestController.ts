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
  currentRequest(): IRequest | undefined;
}

export class RequestController implements IRequestController{
  private busy = false;
  private scheduledRequest?: IRequest;
  private scheduledDelay = 10_000;
  private sendTask?: NodeJS.Timeout;
  private lockTask?: NodeJS.Timeout;

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
    return this.scheduledRequest;
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
    this.scheduleRequest({mode}, 500);
  }

  setTemperature(temperature: number) {
    this.scheduleRequest({temperature}, 500);
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
    this.sendTask = setTimeout(() => this.sendRequest(mergedRequest), this.scheduledDelay);
  }

  private async sendRequest(request: IRequest, retry = false) {
    if (!this.busy) {
      this.clearScheduledTask();
    }
    if (!this.isAllowed()) {
      if (!retry) {
        setTimeout(() => this.sendRequest(request, true), 10_000);
        return;
      }

      this.log.info('Parental controls active, action is not allowed!');
      this.scheduledRequest = undefined;
      return;
    }
    this.log.debug(`Request: ${JSON.stringify(request)}`);
    this.busy = true;
    const success = await this.fireplace.request(request);
    if (!success) {
      this.scheduleRequest(request, this.scheduledDelay);
    }
    this.scheduledRequest = undefined;
    this.scheduledDelay = 10_000;
    this.busy = false;
  }
}
