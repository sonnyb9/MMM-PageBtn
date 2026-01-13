/* global Module, Log */

Module.register("MMM-PageBtn", {
  defaults: {
    gpioChip: "gpiochip0",
    gpioLine: 17,
    longPressMs: 1000,
    resumeAfterMs: 300000,
    debounceMs: 50,

    // "off" | "on" | "debug"
    logging: "off",

    // legacy (deprecated)
    debug: false
  },

  start: function () {
    this.paused = false;
    this.resumeTimer = null;

    this.logMode = this._getLogMode();

    // Send normalized config to helper
    const cfg = Object.assign({}, this.config, {
      logging: this.logMode,
      debug: this.logMode === "debug"
    });

    this.sendSocketNotification("INIT", cfg);

    if (this.logMode === "debug") {
      Log.log("[MMM-PageBtn] Initialized (logging=debug)");
    }
  },

  _getLogMode: function () {
    const raw = this.config && this.config.logging ? String(this.config.logging).toLowerCase() : "";
    if (raw === "off" || raw === "on" || raw === "debug") return raw;

    // legacy support
    if (this.config && this.config.debug === true) return "debug";
    return "off";
  },

  // Make operational logs land in PM2 logs by sending to node_helper
  _eventLog: function (msg) {
    if (this.logMode === "on" || this.logMode === "debug") {
      this.sendSocketNotification("EVENT_LOG", msg);
    }
    if (this.logMode === "debug") {
      Log.log("[MMM-PageBtn] " + msg);
    }
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SHORT_PRESS") {
      this._handleShortPress();
      return;
    }

    if (notification === "LONG_PRESS") {
      this._handleLongPress();
      return;
    }

    if (notification === "GPIO_ERROR") {
      Log.error("[MMM-PageBtn] GPIO error: " + payload);
      return;
    }

    if (notification === "DEBUG" && this.logMode === "debug") {
      Log.log("[MMM-PageBtn] " + payload);
    }
  },

  _handleShortPress: function () {
    this._eventLog("Short press detected");

    this.sendNotification("PAGE_INCREMENT");

    // If paused, resume immediately and cancel auto-resume timer
    if (this.paused) {
      this.paused = false;
      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.sendNotification("RESUME_ROTATION");
    }
  },

  _handleLongPress: function () {
    this._eventLog("Long press detected");

    // Reset any existing auto-resume timer
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    // Pause rotation (idempotent)
    if (!this.paused) {
      this.paused = true;
      this.sendNotification("PAUSE_ROTATION");
    }

    // Auto-resume after configured delay
    this.resumeTimer = setTimeout(() => {
      this.paused = false;
      this.sendNotification("RESUME_ROTATION");
      this._eventLog("Auto-resume page rotation");
    }, this.config.resumeAfterMs);
  },

  getDom: function () {
    return document.createElement("div");
  }
});
