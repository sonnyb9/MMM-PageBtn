# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-01-13

### Added
- **`logging` configuration option** with modes `"off" | "on" | "debug"`:
  - `"on"` emits minimal operational breadcrumbs (`Short press detected`, `Long press detected`, `Auto-resume page rotation`)
  - `"debug"` enables verbose troubleshooting output
  - `"off"` keeps logs quiet (errors only)
- Backward-compatible support for legacy `debug: true|false` (deprecated in favor of `logging`).

### Changed
- Updated README to document `logging` modes and to use a more compatible `gpiomon` test command (`--rising-edge --falling-edge`).

### Fixed
- **GPIO event ingestion reliability** by forcing line-buffered `gpiomon` output when spawned by Node (prevents “no events received” behavior).
- **Robust stdout parsing** for `gpiomon` output to handle partial chunks correctly.
- **Long press detection**: long press now fires at the threshold (without requiring release), preventing bounce/early-release from causing long presses to be misclassified as short presses.
- Improved resilience across `gpiomon`/libgpiod variations by detecting unsupported `--debounce` and restarting without it.

[Unreleased]: https://github.com/sonnyb9/MMM-PageBtn/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/sonnyb9/MMM-PageBtn/releases/tag/v0.1.1
