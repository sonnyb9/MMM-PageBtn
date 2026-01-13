/* global Module, Log */

Module.register("MMM-PageBtn", {
  defaults: {
    gpioChip: "gpiochip0",
    gpioLine: 17,
    longPressMs: 1000,
    resumeAfterMs: 300000,
    debounceMs: 50,

    // New logging mode: "off" | "on" | "debug"
    // Back-compat: debug:true -> "debug", debug:false -> "off"
    logging: "off",
    debug: false // deprecated (kept for backward compatibility)
  },

  start: function () {
    this.paused = false;
    this.resumeTimer = null;

    // Determine effective log level
    this.logLevel = this._getLogLevel(this.config);

    // Ensure node_helper sees a boolean debug flag (for DEBUG socket messages)
    // so older helper logic remains compatible.
    this.config.debug = this.logLevel === "debug";

    // Send init to node_helper
    this.sendSocketNotification("INIT", this.config);

    if (this.logLevel === "debug") {
      Log.log("[MMM-PageBtn] Initialized (logging=debug)");
    }
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SHORT_PRESS") {
      this.handleShortPress();
      return;
    }

    if (notification === "LONG_PRESS") {
      this.handleLongPress();
      return;
    }

    if (notification === "GPIO_ERROR") {
      Log.error("[MMM-PageBtn] GPIO error: " + payload);
      return;
    }

    // DEBUG messages only in debug mode
    if (notification === "DEBUG" && this.logLevel === "debug") {
      Log.log("[MMM-PageBtn] " + payload);
    }
  },

  handleShortPress: function () {
    // Minimal operational logging
    if (this.logLevel === "on" || this.logLevel === "debug") {
      Log.log("[MMM-PageBtn] Short press detected");
    }

    this.sendNotification("PAGE_INCREMENT");

    // If paused, resume immediately on short press (behavior unchanged)
    if (this.paused) {
      this.paused = false;

      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
      }

      this.sendNotification("RESUME_ROTATION");

      if (this.logLevel === "debug") {
        Log.log("[MMM-PageBtn] Resumed rotation via short press");
      }
    }
  },

  handleLongPress: function () {
    if (this.logLevel === "on" || this.logLevel === "debug") {
      Log.log("[MMM-PageBtn] Long press detected");
    }

    // Reset existing timer
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    // Pause rotation (idempotent)
    if (!this.paused) {
      this.paused = true;
      this.sendNotification("PAUSE_ROTATION");

      if (this.logLevel === "debug") {
        Log.log("[MMM-PageBtn] Sent PAUSE_ROTATION");
      }
    }

    // Auto-resume timer
    this.resumeTimer = setTimeout(() => {
      this.paused = false;
      this.sendNotification("RESUME_ROTATION");

      // Minimal operational logging requirement
      if (this.logLevel === "on" || this.logLevel === "debug") {
        Log.log("[MMM-PageBtn] Auto-resume page rotation");
      }

      if (this.logLevel === "debug") {
        Log.log("[MMM-PageBtn] Sent RESUME_ROTATION");
      }
    }, this.config.resumeAfterMs);
  },

  _getLogLevel: function (cfg) {
    const raw = (cfg && cfg.logging) ? String(cfg.logging).toLowerCase() : "";
    if (raw === "off" || raw === "on" || raw === "debug") return raw;

    // Backward compatibility with debug: true/false
    if (cfg && typeof cfg.debug === "boolean") {
      return cfg.debug ? "debug" : "off";
    }

    return "off";
  },

  getDom: function () {
    return document.createElement("div");
  }
});
