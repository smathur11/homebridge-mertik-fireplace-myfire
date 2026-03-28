# homebridge-mertik-fireplace-myfire

[![npm](https://img.shields.io/npm/v/homebridge-mertik-fireplace-myfire.svg)](https://www.npmjs.com/package/homebridge-mertik-fireplace-myfire)
[![npm](https://img.shields.io/npm/dt/homebridge-mertik-fireplace-myfire.svg)](https://www.npmjs.com/package/homebridge-mertik-fireplace-myfire)

Homebridge plugin for controlling Mertik / Maxitrol WiFi fireplace controllers with a Home app layout that works better alongside the MyFire app.

## What This Fork Changes

This fork is based on the original [`tritter/homebridge-mertik-fireplace`](https://github.com/tritter/homebridge-mertik-fireplace) project and keeps the original Apache-2.0 license.

The main differences in this fork are:

- Exposes separate Apple Home accessories for power, mode, target temperature, flame level, and connectivity
- Uses faster command timing for mode, flame, and target temperature changes
- Provides a finer-grained 12-step flame level control
- Keeps the original conservative on/off timing for fireplace safety transitions

## Compatibility

- Homebridge `1.11.x`
- Homebridge `2.0.0-beta.x`

## Home App Layout

Each configured fireplace is exposed as separate accessories:

- `Fireplace`: on/off switch
- `Fireplace Mode`: thermostat-style mode selector
  - `Heat` = Manual
  - `Auto` = Temperature
  - `Cool` = Eco
- `Fireplace Target Temp`: thermostat for target temperature changes
- `Fireplace Flame Level`: fan-speed style flame control
- `Fireplace Connected`: contact sensor for reachability / automations

## Install

```bash
npm install -g --unsafe-perm homebridge-mertik-fireplace-myfire
```

For Homebridge v2 beta:

```bash
npm install -g --unsafe-perm homebridge@beta
npm install -g --unsafe-perm homebridge-mertik-fireplace-myfire
```

## Homebridge Configuration

Update your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "MertikFireplaceMyFire",
      "fireplaces": [
        {
          "name": "Fireplace",
          "ip": "192.168.1.111"
        }
      ]
    }
  ]
}
```

## Configuration Options

| Key | Default | Description |
| --- | --- | --- |
| `platform` | `"MertikFireplaceMyFire"` | Required. The platform name used by Homebridge. |
| `fireplaces` | `[]` | Required. Array of configured fireplaces. |
| `name` | `"Fireplace"` | Required. Display name for the fireplace. This is also used in accessory identity, so renaming it creates new accessories. |
| `ip` | `"192.168.1.111"` | Required. Static IP address of the fireplace controller. |

## Notes

- Flame level changes only apply while the fireplace is already in Manual mode.
- Target temperature changes only apply while the fireplace is in Temperature mode.
- The plugin expects each fireplace controller to keep a stable IP address.

## Legal

*Mertik* is a registered trademark of Maxitrol GmbH & Co. KG.

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by Maxitrol or any of its affiliates.

## Credits

- Original project: [`tritter/homebridge-mertik-fireplace`](https://github.com/tritter/homebridge-mertik-fireplace)
- Prior related work referenced by the original plugin: [`erdebee/homey-mertik-wifi`](https://github.com/erdebee/homey-mertik-wifi)
