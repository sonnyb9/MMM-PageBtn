const NodeHelper = require("node_helper");
const { spawn } = require("child_process");

module.exports = NodeHelper.create({
  start: function () {
    this.config = null;
    this.gpioProcess = null;

    // Press state
    this._pressed = false;
    this._pressStartTime = null;
    this._longPressTimer = null;
    this._longPressFired = false;

    // Buffer for stdout so we can reliably process line-delimited gpiomon output
    this._stdoutBuf = "";

    // Compatibility toggles for different libgpiod/gpiomon builds
    this._useDebounce = true;
    this._restartPending = false;

    // Prefer stdbuf to force line-buffered output; fall back if not available.
    this._useStdbuf = true;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "INIT") {
      this.config = payload;

      // Reset compatibility toggles on init
      this._useDebounce = true;
      this._restartPending = false;
      this._useStdbuf = true;

      // Reset press state
      this._pressed = false;
      this._pressStartTime = null;
      this._longPressFired = false;
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }

      this.startGpioMonitor();
    }
  },

  getLogMode: function () {
    const raw = (this.config && this.config.logging) ? String(this.config.logging).toLowerCase() : null;
    if (raw === "off" || raw === "on" || raw === "debug") return raw;

    // Legacy support: if someone still passes debug boolean
    if (this.config && this.config.debug === true) return "debug";
    return "off";
  },

  debug: function (message) {
    if (this.getLogMode() === "debug") {
      console.log("[MMM-PageBtn] " + message);
      this.sendSocketNotification("DEBUG", message);
    }
  },

  stopGpioMonitor: function () {
    if (this.gpioProcess) {
      try {
        this.gpioProcess.kill();
      } catch (e) {
        // ignore
      }
      this.gpioProcess = null;
    }
  },

  spawnGpioMon: function (args) {
    // Reset stdout buffer each time we start a fresh process
    this._stdoutBuf = "";

    if (this._useStdbuf) {
      // Force line-buffered stdout/stderr so events appear immediately when spawned by Node.
      return spawn("stdbuf", ["-oL", "-eL", "gpiomon", ...args]);
    }

    // Fallback path if stdbuf is not available
    return spawn("gpiomon", args);
  },

  startGpioMonitor: function () {
    const chip = this.config.gpioChip || "gpiochip0";
    const line = this.config.gpioLine || 17;
    const debounceUs = (this.config.debounceMs || 50) * 1000;

    // Stop any previous gpiomon process before starting a new one
    this.stopGpioMonitor();

    // Use split edge flags for compatibility
    const args = ["--bias=pull-up", "--rising-edge", "--falling-edge"];

    // Some builds may not support --debounce; we fall back automatically if needed
    if (this._useDebounce) {
      args.push("--debounce=" + debounceUs + "us");
    }

    args.push(chip, String(line));

    this.debug(
      "Starting gpiomon with args: " +
        args.join(" ") +
        (this._useStdbuf ? " (via stdbuf)" : "")
    );

    this.gpioProcess = this.spawnGpioMon(args);

    this.gpioProcess.stdout.on("data", (data) => {
      // Robust line buffering: handle partial chunks and multiple lines in one chunk.
      this._stdoutBuf += data.toString();

      let idx;
      while ((idx = this._stdoutBuf.indexOf("\n")) !== -1) {
        const line = this._stdoutBuf.slice(0, idx).trim();
        this._stdoutBuf = this._stdoutBuf.slice(idx + 1);
        if (line) this.handleGpioEvent(line);
      }
    });

    this.gpioProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      this.sendSocketNotification("GPIO_ERROR", msg);

      // Compatibility fallback: some gpiomon/libgpiod builds do not support --debounce
      const lower = msg.toLowerCase();
      if (
        this._useDebounce &&
        !this._restartPending &&
        lower.includes("unrecognized option") &&
        lower.includes("debounce")
      ) {
        this.debug("gpiomon does not support --debounce; restarting without debounce.");
        this._useDebounce = false;
        this._restartPending = true;

        // Kill current process and restart quickly without debounce
        this.stopGpioMonitor();
        setTimeout(() => {
          this._restartPending = false;
          this.startGpioMonitor();
        }, 250);
      }
    });

    this.gpioProcess.on("close", (code) => {
      this.debug("gpiomon exited with code " + code);

      // If we're in the middle of a controlled restart, don't schedule another restart
      if (this._restartPending) return;

      if (code !== 0 && code !== null) {
        this.sendSocketNotification("GPIO_ERROR", "gpiomon exited with code " + code);
        setTimeout(() => this.startGpioMonitor(), 5000);
      }
    });

    this.gpioProcess.on("error", (err) => {
      // If stdbuf isn't installed, fall back to running gpiomon directly.
      if (this._useStdbuf && err && err.code === "ENOENT") {
        this.debug('stdbuf not found; falling back to spawning "gpiomon" directly.');
        this._useStdbuf = false;
        setTimeout(() => this.startGpioMonitor(), 250);
        return;
      }

      this.sendSocketNotification("GPIO_ERROR", "Failed to start gpiomon: " + err.message);
      setTimeout(() => this.startGpioMonitor(), 5000);
    });
  },

  handleGpioEvent: function (line) {
    this.debug("GPIO event: " + line);

    const normalized = (line || "").toLowerCase();
    const now = Date.now();
    const longPressMs = (this.config && this.config.longPressMs) || 1000;

    // Press (FALLING with pull-up wiring)
    if (normalized.includes("falling")) {
      // Ignore bounce / duplicate FALLING while already pressed
      if (this._pressed) return;

      this._pressed = true;
      this._pressStartTime = now;
      this._longPressFired = false;

      // Start long-press timer; fire LONG_PRESS at threshold even before release
      if (this._longPressTimer) clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        // Only fire if still pressed and not already fired
        if (this._pressed && !this._longPressFired) {
          this._longPressFired = true;
          this.debug("Long press detected (timer fired)");
          this.sendSocketNotification("LONG_PRESS");
        }
      }, longPressMs);

      this.debug("Button pressed (falling edge)");
      return;
    }

    // Release (RISING)
    if (normalized.includes("rising")) {
      // Ignore stray RISING if we never saw a press
      if (!this._pressed) return;

      this._pressed = false;

      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }

      const duration = this._pressStartTime ? now - this._pressStartTime : 0;
      this._pressStartTime = null;

      this.debug("Button released (rising edge), duration: " + duration + "ms");

      // If long press already fired, do not also send SHORT_PRESS
      if (this._longPressFired) {
        this.debug("Release after long press; not sending short press.");
        this._longPressFired = false; // reset for next cycle
        return;
      }

      // Otherwise it was a short press
      this.debug("Short press detected");
      this.sendSocketNotification("SHORT_PRESS");
    }
  },

  stop: function () {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this.stopGpioMonitor();
  }
});
