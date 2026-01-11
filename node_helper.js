const NodeHelper = require("node_helper");
const { spawn } = require("child_process");

module.exports = NodeHelper.create({
  start: function() {
    this.config = null;
    this.gpioProcess = null;
    this.pressStartTime = null;
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      this.startGpioMonitor();
    }
  },

  startGpioMonitor: function() {
    const chip = this.config.gpioChip || "gpiochip0";
    const line = this.config.gpioLine || 17;
    const debounceUs = (this.config.debounceMs || 50) * 1000;

    const args = [
      "--bias=pull-up",
      "--edges=both",
      "--debounce=" + debounceUs + "us",
      chip,
      String(line)
    ];

    this.debug("Starting gpiomon with args: " + args.join(" "));

    this.gpioProcess = spawn("gpiomon", args);

    this.gpioProcess.stdout.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      lines.forEach((line) => this.handleGpioEvent(line));
    });

    this.gpioProcess.stderr.on("data", (data) => {
      this.sendSocketNotification("GPIO_ERROR", data.toString());
    });

    this.gpioProcess.on("close", (code) => {
      this.debug("gpiomon exited with code " + code);
      if (code !== 0 && code !== null) {
        this.sendSocketNotification("GPIO_ERROR", "gpiomon exited with code " + code);
        setTimeout(() => this.startGpioMonitor(), 5000);
      }
    });

    this.gpioProcess.on("error", (err) => {
      this.sendSocketNotification("GPIO_ERROR", "Failed to start gpiomon: " + err.message);
      setTimeout(() => this.startGpioMonitor(), 5000);
    });
  },

  handleGpioEvent: function(line) {
    this.debug("GPIO event: " + line);

    if (line.includes("falling")) {
      this.pressStartTime = Date.now();
      this.debug("Button pressed (falling edge)");
    } else if (line.includes("rising")) {
      if (this.pressStartTime === null) {
        this.debug("Rising edge without prior falling edge, ignoring");
        return;
      }

      const pressDuration = Date.now() - this.pressStartTime;
      this.pressStartTime = null;

      this.debug("Button released (rising edge), duration: " + pressDuration + "ms");

      const longPressMs = this.config.longPressMs || 1000;

      if (pressDuration >= longPressMs) {
        this.debug("Long press detected");
        this.sendSocketNotification("LONG_PRESS");
      } else {
        this.debug("Short press detected");
        this.sendSocketNotification("SHORT_PRESS");
      }
    }
  },

  debug: function(message) {
    if (this.config && this.config.debug) {
      console.log("[MMM-PageBtn] " + message);
      this.sendSocketNotification("DEBUG", message);
    }
  },

  stop: function() {
    if (this.gpioProcess) {
      this.gpioProcess.kill();
      this.gpioProcess = null;
    }
  }
});
