# MMM-PageBtn

A MagicMirror² module that uses a physical GPIO button to control [MMM-Pages](https://github.com/edward-shen/MMM-pages) page rotation.

## Features

- **Short press** (< 1 second): Advance to next page
- **Long press** (≥ 1 second): Pause page rotation
- **Auto-resume**: Rotation resumes after 5 minutes of pause
- **Pi 5 / Bookworm compatible**: Uses `libgpiod` (no deprecated sysfs GPIO)
- **No native dependencies**: Spawns `gpiomon` CLI tool

## Requirements

- Raspberry Pi with GPIO
- Raspberry Pi OS Bookworm (or any OS with `libgpiod`)
- `gpiod` package installed: `sudo apt install -y gpiod`
- [MMM-Pages](https://github.com/edward-shen/MMM-pages) module

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/sonnyb9/MMM-PageBtn.git
```

No `npm install` required — this module has no Node dependencies.

## Hardware Wiring

Connect a momentary pushbutton between GPIO17 and GND:

```
[ Pushbutton ]
   ┌───────┐
   │   ○───┼──────── GPIO17 (Pin 11)
   │   ○───┼──────── GND    (Pin 9, 14, 20, 25, 30, 34, or 39)
   └───────┘
```

- Internal pull-up resistor is enabled via software
- No external resistors or capacitors required
- Button press connects GPIO17 to GND (active low)

### Test Hardware

Before configuring MagicMirror, verify your wiring:

```bash
sudo gpiomon --bias=pull-up --rising-edge --falling-edge gpiochip0 17
```

Press and release the button. You should see `falling` and `rising` edge events.

## Configuration

Add to your `config/config.js`:

```javascript
{
  module: "MMM-PageBtn",
  position: "top_left",       // Required by MagicMirror; any position is fine
  config: {
    gpioChip: "gpiochip0",    // GPIO device (default: gpiochip0)
    gpioLine: 17,             // BCM GPIO number (default: 17)
    longPressMs: 1000,        // Long press threshold in ms (default: 1000)
    resumeAfterMs: 300000,    // Auto-resume delay in ms (default: 300000 = 5 min)
    debounceMs: 50,           // Debounce window in ms (default: 50)

    // Logging mode: "off" | "on" | "debug"
    // - "off": minimal logging (errors only)
    // - "on":  operational logs only (short/long/auto-resume)
    // - "debug": verbose troubleshooting logs (GPIO events, spawn args, etc.)
    logging: "on"
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gpioChip` | string | `"gpiochip0"` | GPIO chip device |
| `gpioLine` | number | `17` | BCM GPIO pin number |
| `longPressMs` | number | `1000` | Minimum duration (ms) for long press |
| `resumeAfterMs` | number | `300000` | Auto-resume delay after pause (ms) |
| `debounceMs` | number | `50` | Software debounce window (ms) |
| `logging` | string | `"off"` | `"off"` = errors only, `"on"` = minimal operational logs, `"debug"` = verbose logs |

#### Backward Compatibility (`debug`)
Older configs using `debug: true|false` are still supported, but `debug` is deprecated in favor of `logging`:

- `debug: false` behaves like `logging: "off"`
- `debug: true` behaves like `logging: "debug"`

If both are set, `logging` takes precedence.

## Logging

When `logging: "on"`, the module logs only these operational events:

- `Short press detected`
- `Long press detected`
- `Auto-resume page rotation`

When `logging: "debug"`, you will also see verbose troubleshooting logs (GPIO edge lines, gpiomon spawn arguments, restart/fallback messages).

## Behavior

| Action | Trigger | MMM-Pages Notification |
|--------|---------|------------------------|
| Short press | Button held < `longPressMs` | `PAGE_INCREMENT` (+ `RESUME_ROTATION` if paused) |
| Long press | Button held ≥ `longPressMs` | `PAUSE_ROTATION` |
| Auto-resume | `resumeAfterMs` after long press | `RESUME_ROTATION` |

### Notes

- Long press fires when the threshold is reached (you do not need to release first)
- Repeated long presses reset the auto-resume timer
- Short presses resume rotation if paused (and cancel auto-resume timer)
- Restarting MagicMirror clears the pause state

## Troubleshooting

### Button not detected

1. Verify `gpiod` is installed: `which gpiomon`
2. Test GPIO manually: `sudo gpiomon --bias=pull-up --rising-edge --falling-edge gpiochip0 17`
3. Check wiring — button should connect GPIO (pin 11) to GND (pin 9 or any of the other GND pins available)
4. Enable troubleshooting logs: set `logging: "debug"` (or legacy `debug: true`)

### Device or resource busy

If `gpiomon` reports the GPIO line is busy, MagicMirror (or another process) is already monitoring that GPIO line.

- Stop MagicMirror, test with `gpiomon`, then start MagicMirror again.

### Permission denied

MagicMirror must have access to `/dev/gpiochip0`. Either:
- Run MagicMirror as a user in the `gpio` group, or
- Add a udev rule for GPIO access

### gpiomon not found

Install libgpiod tools:

```bash
sudo apt update
sudo apt install -y gpiod
```

## License

MIT

## Credits

Designed for use with [MMM-Pages](https://github.com/edward-shen/MMM-pages) by edward-shen.
