Module.register("MMM-PageBtn", {
  defaults: {
    longPressMs: 1000,
    resumeAfterMs: 300000,
    debug: false
  },

  start: function() {
    this.paused = false;
    this.resumeTimer = null;
    this.sendSocketNotification("INIT", this.config);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SHORT_PRESS") {
      this.handleShortPress();
    } else if (notification === "LONG_PRESS") {
      this.handleLongPress();
    } else if (notification === "GPIO_ERROR") {
      Log.error("[MMM-PageBtn] GPIO error: " + payload);
    } else if (notification === "DEBUG") {
      if (this.config.debug) {
        Log.log("[MMM-PageBtn] " + payload);
      }
    }
  },

  handleShortPress: function() {
    if (this.config.debug) {
      Log.log("[MMM-PageBtn] Short press detected, sending PAGE_INCREMENT");
    }
    this.sendNotification("PAGE_INCREMENT");

    if (this.paused) {
      this.paused = false;
      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.sendNotification("RESUME_ROTATION");
      if (this.config.debug) {
        Log.log("[MMM-PageBtn] Resumed rotation via short press");
      }
    }
  },

  handleLongPress: function() {
    if (this.config.debug) {
      Log.log("[MMM-PageBtn] Long press detected, paused=" + this.paused);
    }

    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    if (!this.paused) {
      this.paused = true;
      this.sendNotification("PAUSE_ROTATION");
      if (this.config.debug) {
        Log.log("[MMM-PageBtn] Sent PAUSE_ROTATION");
      }
    }

    this.resumeTimer = setTimeout(() => {
      this.paused = false;
      this.sendNotification("RESUME_ROTATION");
      if (this.config.debug) {
        Log.log("[MMM-PageBtn] Auto-resume: sent RESUME_ROTATION");
      }
    }, this.config.resumeAfterMs);

    if (this.config.debug) {
      Log.log("[MMM-PageBtn] Resume timer set for " + this.config.resumeAfterMs + "ms");
    }
  },

  getDom: function() {
    return document.createElement("div");
  }
});
