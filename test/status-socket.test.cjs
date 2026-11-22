const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { FireplaceController } = require('../dist/controllers/fireplaceController');
const { OperationMode } = require('../dist/models/operationMode');

class SimulatedSocket extends EventEmitter {
  destroyed = false;
  connect() {}
  setTimeout() {}
  destroy() { this.destroyed = true; }
  receive(data) { this.emit('data', Buffer.from(data, 'latin1')); }
}

function setup(t) {
  const controller = new FireplaceController({ debug() {} }, { ip: '127.0.0.1' });
  controller.stopStatusSubscription();
  controller.createSocket = () => new SimulatedSocket();
  t.after(() => {
    controller.stopStatusSubscription();
    controller.closeClient();
  });
  return controller;
}

function frame({ header = '303030300003', valve = 'C3', flags = '0080', mode = '0', temperatures = '00CF00C8' } = {}) {
  return '\x02' + (header + 'C6' + valve + flags + '0004' + mode + '000' + temperatures).padEnd(106, '0') + '\x03';
}

test('accepts both status headers in split or combined frames', t => {
  const controller = setup(t);
  const socket = controller.ensureClient();
  const on = frame();
  socket.receive(on.slice(0, 30));
  assert.equal(controller.reachable(), false);
  socket.receive(on.slice(30) + '\x02303030300016\x03');
  assert.equal(controller.status().mode, OperationMode.Manual);
  assert.equal(controller.reachable(), true);
  socket.receive(frame({ header: '030300000003', flags: '0000', valve: '??' }));
  assert.equal(controller.status().mode, OperationMode.Off);
});

test('rejects invalid status without replacing state or refreshing contact', t => {
  const controller = setup(t);
  const socket = controller.ensureClient();
  socket.receive(frame());
  const previous = controller.status();
  controller.lastContact = new Date(0);
  for (const fields of [
    { header: '000000000000' },
    { flags: '0xyz' },
    { mode: '3' },
    { temperatures: '00CF00?8' },
  ]) {
    socket.receive(frame(fields));
    assert.equal(controller.status(), previous);
    assert.equal(controller.reachable(), false);
  }
});

test('retired socket events cannot affect a replacement', t => {
  const controller = setup(t);
  const old = controller.ensureClient();
  controller.startStatusSubscription();
  assert.equal(old.destroyed, true);
  const active = controller.ensureClient();
  old.receive(frame());
  old.emit('error', new Error('late error'));
  old.emit('close');
  assert.equal(controller.status(), undefined);
  assert.equal(controller.ensureClient(), active);
  assert.equal(active.destroyed, false);
  active.receive(frame());
  assert.equal(controller.status().mode, OperationMode.Manual);
  active.emit('timeout');
  assert.equal(active.destroyed, true);
  assert.notEqual(controller.ensureClient(), active);
});
