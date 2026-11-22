const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FireplaceController } = require('../dist/controllers/fireplaceController');
const { RequestController } = require('../dist/controllers/requestController');
const { OperationMode } = require('../dist/models/operationMode');

const log = { debug() {}, info() {}, error() {} };

test('only explicit power-on can ignite an off fireplace', async () => {
  const commands = [];
  const fireplace = Object.assign(Object.create(FireplaceController.prototype), {
    log,
    igniteFireplace: async () => commands.push('ignite'),
    guardFlameOff: async () => commands.push('off'),
  });
  for (const mode of [OperationMode.Manual, OperationMode.Eco, OperationMode.Temperature]) {
    await fireplace.setMode({ mode });
  }
  assert.deepEqual(commands, []);
  await fireplace.setMode({ mode: OperationMode.Manual, allowIgnition: true });
  fireplace.igniting = true;
  await fireplace.setMode({ mode: OperationMode.Off });
  assert.deepEqual(commands, ['ignite', 'off']);
});

test('off replaces queued work and survives failure of an older request', async () => {
  const requests = [];
  let fail;
  const queue = new RequestController(log, {
    request(request) {
      requests.push(request);
      if (requests.length === 1) {
        return new Promise((_, reject) => { fail = reject; });
      }
      return Promise.resolve(true);
    },
  });
  queue.setMode(OperationMode.Eco);
  const active = queue.sendRequest();
  queue.powerOn();
  queue.setFlameLevel(25);
  queue.setMode(OperationMode.Off);
  queue.setTemperature(20);
  fail(new Error('simulated disconnect'));
  await active;
  await queue.sendRequest();
  assert.deepEqual(requests, [
    { mode: OperationMode.Eco, allowIgnition: false },
    { mode: OperationMode.Off },
  ]);
});

test('power-on is not retried after a failed attempt', async () => {
  const requests = [];
  const queue = new RequestController(log, {
    async request(request) {
      requests.push(request);
      return false;
    },
  });
  queue.powerOn();
  await queue.sendRequest();
  await queue.sendRequest();
  assert.deepEqual(requests, [{ mode: OperationMode.Manual, allowIgnition: true }]);
});
