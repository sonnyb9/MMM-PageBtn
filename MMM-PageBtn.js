Module.register("MMM-PageBtn", {
  defaults: {
    longPressMs: 1000,
    resumeAfterMs: 300000,
    // New: logging mode: "off" | "on" | "debug"
    logging: "off"
    // Back-compat: users may still have config.debug; handled in code below.
  },

  start: function () {
    this.paused = false;
    this.resumeTimer = null;

    // Cache logging mode once at startup
    this.logMode = this.getLogMode();

    // Send config to node_helper (include derived logging so helper can honor it too)
    const cfg = Object.assign({}, this.config, { logging: this.logMode });
    this.sendSocketNotification("INIT", cfg);
  },

  // Determine effective logging mode:
  // - Prefer config.logging if provided
  // - Else fall back to legacy config.debug boolean
  getLogMode: function () {
    const raw = (this.config && this.config.logging) ? String(this.config.logging).toLowerCase() : null;
    if (raw === "off" || raw === "on" || raw === "debug") return raw;

    // Legacy support
    if (this.config && this.config.debug === true) return "debug";
    return "off";
  },

  // Minimal operational logs for "on"; verbose for "debug"
  logOn: function (message) {
    if (this.logMode === "on" || this.logMode === "debug") {
      Log.log("[MMM-PageBtn] " + message);
    }
  },

  logDebug: function (message) {
    if (this.logMode === "debug") {
      Log.log("[MMM-PageBtn] " + message);
    }
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SHORT_PRESS") {
      this.handleShortPress();
    } else if (notification === "LONG_PRESS") {
      this.handleLongPress();
    } else if (notification === "GPIO_ERROR") {
      Log.error("[MMM-PageBtn] GPIO error: " + payload);
    } else if (notification === "DEBUG") {
      // Only surface node_helper debug chatter in debug mode
      this.logDebug(payload);
    }
  },

  handleShortPress: function () {
    // Minimal operational breadcrumb
    this.logOn("Short press detected");

    // Debug detail if desired
    this.logDebug("Sending PAGE_INCREMENT");

    this.sendNotification("PAGE_INCREMENT");

    // If paused, short press resumes rotation and cancels auto-resume timer
    if (this.paused) {
      this.paused = false;
      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.sendNotification("RESUME_ROTATION");
      this.logDebug("Resumed rotation via short press (sent RESUME_ROTATION)");
    }
  },

  handleLongPress: function () {
    // Minimal operational breadcrumb
    this.logOn("Long press detected");

    this.logDebug("Long press handler entered, paused=" + this.paused);

    // Reset any existing auto-resume timer
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
      this.logDebug("Cleared existing resume timer");
    }

    // Pause rotation (idempotent)
    if (!this.paused) {
      this.paused = true;
      this.sendNotification("PAUSE_ROTATION");
      this.logDebug("Sent PAUSE_ROTATION");
    }

    // Auto-resume after configured delay
    this.resumeTimer = setTimeout(() => {
      this.paused = false;
      this.sendNotification("RESUME_ROTATION");

      // Minimal operational breadcrumb
      this.logOn("Auto-resume page rotation");

      this.logDebug("Auto-resume: sent RESUME_ROTATION");
    }, this.config.resumeAfterMs);

    this.logDebug("Resume timer set for " + this.config.resumeAfterMs + "ms");
  },

  getDom: function () {
    return document.createElement("div");
  }
});
