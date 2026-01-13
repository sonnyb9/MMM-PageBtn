const NodeHelper = require("node_helper");
const { spawn } = require("child_process");

module.exports = NodeHelper.create({
  start: function () {
    this.config = null;
    this.gpioProcess = null;

    // Press state
    this._pressed = false;
    this._longPressTimer = null;
    this._longPressFired = false;

    // stdout line buffering
    this._stdoutBuf = "";

    // gpiomon compatibility
    this._useDebounceFlag = true;
    this._restartPending = false;

    // software debounce fallback (ms)
    this._lastAcceptedMs = 0;

    // Absolute path (avoids PATH issues under pm2)
    this._stdbuf = "/usr/bin/stdbuf";
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "INIT") {
      this.config = payload || {};

      // normalize logging -> debug boolean for helper chatter
      const mode = this._logMode();
      this.config.debug = mode === "debug";

      // reset state
      this._pressed = false;
      this._longPressFired = false;
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }

      this._stdoutBuf = "";
      this._useDebounceFlag = true;
      this._restartPending = false;
      this._lastAcceptedMs = 0;

      this._startGpioMon();
      return;
    }

    // Operational event logs should land in pm2 logs
    if (notification === "EVENT_LOG") {
      const mode = this._logMode();
      if (mode === "on" || mode === "debug") {
        console.log("[MMM-PageBtn] " + String(payload || ""));
      }
      return;
    }
  },

  _logMode: function () {
    const raw = this.config && this.config.logging ? String(this.config.logging).toLowerCase() : "";
    if (raw === "off" || raw === "on" || raw === "debug") return raw;

    // legacy support
    if (this.config && this.config.debug === true) return "debug";
    return "off";
  },

  _debug: function (msg) {
    if (this._logMode() === "debug") {
      console.log("[MMM-PageBtn] " + msg);
      this.sendSocketNotification("DEBUG", msg);
    }
  },

  _stopGpioMon: function () {
    if (this.gpioProcess) {
      try { this.gpioProcess.kill(); } catch (_) {}
      this.gpioProcess = null;
    }
  },

  _spawnGpioMon: function (args) {
    this._stdoutBuf = "";

    // Force line buffered stdout/stderr:
    // stdbuf -oL -eL gpiomon <args...>
    return spawn(this._stdbuf, ["-oL", "-eL", "gpiomon", ...args]);
  },

  _startGpioMon: function () {
    const chip = this.config.gpioChip || "gpiochip0";
    const line = this.config.gpioLine || 17;
    const debounceUs = (this.config.debounceMs || 50) * 1000;

    this._stopGpioMon();

    const args = ["--bias=pull-up", "--rising-edge", "--falling-edge"];

    // Try gpiomon debounce first; auto-fallback if unsupported.
    if (this._useDebounceFlag) {
      args.push(`--debounce=${debounceUs}us`);
    }

    args.push(chip, String(line));

    this._debug("Starting gpiomon with args: " + args.join(" ") + " (via /usr/bin/stdbuf)");

    this.gpioProcess = this._spawnGpioMon(args);

    this.gpioProcess.stdout.on("data", (data) => {
      this._stdoutBuf += data.toString();

      let idx;
      while ((idx = this._stdoutBuf.indexOf("\n")) !== -1) {
        const line = this._stdoutBuf.slice(0, idx).trim();
        this._stdoutBuf = this._stdoutBuf.slice(idx + 1);
        if (line) this._handleEvent(line);
      }
    });

    this.gpioProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      this.sendSocketNotification("GPIO_ERROR", msg);

      // Detect unsupported --debounce and restart without it
      const lower = msg.toLowerCase();
      if (
        this._useDebounceFlag &&
        !this._restartPending &&
        lower.includes("unrecognized option") &&
        lower.includes("debounce")
      ) {
        this._debug("gpiomon does not support --debounce; restarting without debounce.");
        this._useDebounceFlag = false;
        this._restartPending = true;

        this._stopGpioMon();
        setTimeout(() => {
          this._restartPending = false;
          this._startGpioMon();
        }, 250);
      }
    });

    this.gpioProcess.on("close", (code) => {
      this._debug("gpiomon exited with code " + code);
      if (this._restartPending) return;

      if (code !== 0 && code !== null) {
        this.sendSocketNotification("GPIO_ERROR", "gpiomon exited with code " + code);
        setTimeout(() => this._startGpioMon(), 5000);
      }
    });

    this.gpioProcess.on("error", (err) => {
      this.sendSocketNotification("GPIO_ERROR", "Failed to start gpiomon via stdbuf: " + err.message);
      setTimeout(() => this._startGpioMon(), 5000);
    });
  },

  _handleEvent: function (rawLine) {
    this._debug("GPIO event: " + rawLine);

    const s = String(rawLine).toLowerCase();
    const now = Date.now();

      // Edge-aware debounce:
      // - Do NOT time-filter rising edges needed to end a press.
      // - Ignore bounce by state: duplicate FALLING while pressed, duplicate RISING while released.
      // - Keep a lightweight time filter only for identical-edge spam when state is ambiguous.
      const debounceMs = this.config.debounceMs || 50;

      const isFalling = s.includes("falling");
      const isRising = s.includes("rising");

      // If neither rising nor falling, ignore
      if (!isFalling && !isRising) return;

      // Optional time filter for same-edge chatter only
      if (now - this._lastAcceptedMs < debounceMs) {
        // Allow a RISING to end a press even if within debounce window
        if (!(isRising && this._pressed)) {
          this._debug("Debounce: ignored event within " + debounceMs + "ms");
          return;
        }
      }
      this._lastAcceptedMs = now;

    const longPressMs = this.config.longPressMs || 1000;

    // FALLING = press (active-low)
    if (s.includes("falling")) {
      if (this._pressed) return;

      this._pressed = true;
      this._longPressFired = false;

      if (this._longPressTimer) clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        if (this._pressed && !this._longPressFired) {
          this._longPressFired = true;
          this.sendSocketNotification("LONG_PRESS");
        }
      }, longPressMs);

      return;
    }

    // RISING = release
    if (s.includes("rising")) {
      if (!this._pressed) return;

      this._pressed = false;

      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }

      // If long already fired, do not also short-press
      if (this._longPressFired) {
        this._longPressFired = false;
        return;
      }

      this.sendSocketNotification("SHORT_PRESS");
    }
  },

  stop: function () {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this._stopGpioMon();
  }
});
