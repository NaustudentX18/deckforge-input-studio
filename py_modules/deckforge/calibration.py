"""
DeckForge Input Studio — Input Calibration & Filtering Engine.

Provides deadzone processing, response curves, axis calibration,
debounce filtering, tilt/whammy normalization, and latency testing.
All classes are dataclass-based and JSON-serializable.
"""

from __future__ import annotations

import json
import math
import statistics
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# DeadzoneProcessor
# ---------------------------------------------------------------------------

@dataclass
class DeadzoneProcessor:
    """Applies inner deadzone, outer deadzone, and anti-deadzone to a raw axis
    value.

    - *inner_deadzone*: percentage (0-100) of range around center treated as 0.
    - *outer_deadzone*: percentage (0-100) of range near extremes treated as 1.
    - *anti_deadzone*: percentage (0-100) of output range to skip at the edge
      of the inner deadzone so games with their own deadzone still register
      small movements.
    """
    inner_deadzone: float = 0.0
    outer_deadzone: float = 0.0
    anti_deadzone: float = 0.0

    def apply(self, raw_value: int, axis_min: int, axis_max: int) -> float:
        """Map *raw_value* in [axis_min, axis_max] → [0.0, 1.0] with deadzone
        processing.  The returned value treats 0.5 as center."""
        total_range = axis_max - axis_min
        if total_range == 0:
            return 0.5

        # Normalize to -1.0 .. +1.0 centred on midpoint
        mid = (axis_min + axis_max) / 2.0
        normalized = (raw_value - mid) / (total_range / 2.0)
        normalized = max(-1.0, min(1.0, normalized))

        sign = 1.0 if normalized >= 0.0 else -1.0
        magnitude = abs(normalized)

        inner = self.inner_deadzone / 100.0
        outer = self.outer_deadzone / 100.0
        anti = self.anti_deadzone / 100.0

        # Inner deadzone — values below this are zero
        if magnitude <= inner:
            return 0.5

        # Outer deadzone — values above (1 - outer) are full
        upper_bound = 1.0 - outer
        if upper_bound <= inner:
            upper_bound = inner + 0.001  # prevent division by zero

        if magnitude >= upper_bound:
            result = sign * 1.0
        else:
            # Scale remaining range linearly
            scaled = (magnitude - inner) / (upper_bound - inner)
            # Anti-deadzone: jump the output from 0 to anti, then scale the rest
            result = sign * (anti + scaled * (1.0 - anti))

        # Convert from -1..+1 to 0..1
        return max(0.0, min(1.0, (result + 1.0) / 2.0))

    def to_dict(self) -> dict[str, Any]:
        return {
            "inner_deadzone": self.inner_deadzone,
            "outer_deadzone": self.outer_deadzone,
            "anti_deadzone": self.anti_deadzone,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DeadzoneProcessor":
        return cls(
            inner_deadzone=float(data.get("inner_deadzone", 0)),
            outer_deadzone=float(data.get("outer_deadzone", 0)),
            anti_deadzone=float(data.get("anti_deadzone", 0)),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "DeadzoneProcessor":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# ResponseCurve
# ---------------------------------------------------------------------------

class CurveType(str, Enum):
    LINEAR = "Linear"
    AGGRESSIVE = "Aggressive"
    RELAXED = "Relaxed"
    CUSTOM_BEZIER = "CustomBezier"


@dataclass
class ResponseCurve:
    """Maps a normalized 0..1 input to a shaped 0..1 output.

    - Linear: y = x
    - Aggressive: y = x^2  (more sensitive near full)
    - Relaxed: y = sqrt(x) (more sensitive near center)
    - CustomBezier: cubic Bézier defined by *bezier_points* [(x1,y1),(x2,y2)].
    """
    curve_type: CurveType = CurveType.LINEAR
    bezier_points: list[tuple[float, float]] = field(default_factory=lambda: [(0.25, 0.25), (0.75, 0.75)])

    def apply(self, normalized_value: float) -> float:
        """Apply the response curve to *normalized_value* ∈ [0, 1]."""
        t = max(0.0, min(1.0, normalized_value))

        if self.curve_type == CurveType.LINEAR:
            return t
        elif self.curve_type == CurveType.AGGRESSIVE:
            return t * t
        elif self.curve_type == CurveType.RELAXED:
            return math.sqrt(t)
        elif self.curve_type == CurveType.CUSTOM_BEZIER:
            return self._cubic_bezier(t)
        return t

    def _cubic_bezier(self, t: float) -> float:
        """Evaluate a cubic Bézier curve from (0,0) to (1,1) with two control
        points, returning the y value for input parameter *t*.

        We solve for the Bézier parameter that produces the given x=t, then
        evaluate y at that parameter.
        """
        p1 = self.bezier_points[0] if len(self.bezier_points) > 0 else (0.25, 0.25)
        p2 = self.bezier_points[1] if len(self.bezier_points) > 1 else (0.75, 0.75)
        x1, y1 = p1
        x2, y2 = p2

        # Newton's method to find Bézier parameter u such that Bx(u) = t
        u = t  # initial guess
        for _ in range(16):
            bx = 3.0 * (1 - u) ** 2 * u * x1 + 3.0 * (1 - u) * u ** 2 * x2 + u ** 3
            dbx = 3.0 * (1 - u) ** 2 * x1 + 6.0 * (1 - u) * u * (x2 - x1) + 3.0 * u ** 2 * (1.0 - x2)
            if abs(dbx) < 1e-12:
                break
            u -= (bx - t) / dbx
            u = max(0.0, min(1.0, u))

        # Evaluate By(u)
        by = 3.0 * (1 - u) ** 2 * u * y1 + 3.0 * (1 - u) * u ** 2 * y2 + u ** 3
        return max(0.0, min(1.0, by))

    def to_dict(self) -> dict[str, Any]:
        return {
            "curve_type": self.curve_type.value,
            "bezier_points": [list(p) for p in self.bezier_points],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ResponseCurve":
        ct = CurveType(data.get("curve_type", "Linear"))
        bp = [tuple(p) for p in data.get("bezier_points", [(0.25, 0.25), (0.75, 0.75)])]
        return cls(curve_type=ct, bezier_points=bp)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "ResponseCurve":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# AxisCalibrator
# ---------------------------------------------------------------------------

@dataclass
class AxisCalibrator:
    """Per-axis calibration with auto-detection of min, max, and center.

    Feed raw samples via ``record_sample()`` and use ``calibrate()`` to map
    future raw values into [0.0, 1.0].
    """
    axis_name: str = ""
    detected_min: Optional[int] = None
    detected_max: Optional[int] = None
    detected_center: Optional[int] = None
    inverted: bool = False
    deadzone: DeadzoneProcessor = field(default_factory=DeadzoneProcessor)
    response_curve: ResponseCurve = field(default_factory=ResponseCurve)
    _samples: list[int] = field(default_factory=list, repr=False)

    def record_sample(self, value: int) -> None:
        """Record a raw sample for auto-calibration."""
        self._samples.append(value)
        if self.detected_min is None or value < self.detected_min:
            self.detected_min = value
        if self.detected_max is None or value > self.detected_max:
            self.detected_max = value

    def finalize_calibration(self) -> None:
        """Compute detected center from recorded samples."""
        if self._samples:
            self.detected_center = int(statistics.median(self._samples))

    def calibrate(self, raw_value: int) -> float:
        """Map a raw axis value to [0.0, 1.0] using calibration data."""
        lo = self.detected_min if self.detected_min is not None else 0
        hi = self.detected_max if self.detected_max is not None else 65535

        if self.inverted:
            raw_value = hi - (raw_value - lo)

        dz_result = self.deadzone.apply(raw_value, lo, hi)
        # dz_result is 0..1 centred on 0.5, convert to magnitude 0..1
        magnitude = abs(dz_result - 0.5) * 2.0
        shaped = self.response_curve.apply(magnitude)
        sign = 1.0 if dz_result >= 0.5 else -1.0
        return max(0.0, min(1.0, 0.5 + sign * shaped / 2.0))

    def reset(self) -> None:
        """Clear calibration data."""
        self.detected_min = None
        self.detected_max = None
        self.detected_center = None
        self._samples.clear()

    def to_dict(self) -> dict[str, Any]:
        return {
            "axis_name": self.axis_name,
            "detected_min": self.detected_min,
            "detected_max": self.detected_max,
            "detected_center": self.detected_center,
            "inverted": self.inverted,
            "deadzone": self.deadzone.to_dict(),
            "response_curve": self.response_curve.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AxisCalibrator":
        return cls(
            axis_name=data.get("axis_name", ""),
            detected_min=data.get("detected_min"),
            detected_max=data.get("detected_max"),
            detected_center=data.get("detected_center"),
            inverted=data.get("inverted", False),
            deadzone=DeadzoneProcessor.from_dict(data.get("deadzone", {})),
            response_curve=ResponseCurve.from_dict(data.get("response_curve", {})),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "AxisCalibrator":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# DebounceFilter
# ---------------------------------------------------------------------------

@dataclass
class DebounceFilter:
    """Configurable debounce filter for mechanical switch contacts.

    Ignores events that arrive within *threshold_ms* of the last accepted
    event on the same code.
    """
    threshold_ms: float = 5.0
    _last_accepted: dict[int, float] = field(default_factory=dict, repr=False)

    def accept(self, code: int, timestamp: Optional[float] = None) -> bool:
        """Return ``True`` if the event should be accepted (not bounced)."""
        now = timestamp if timestamp is not None else time.monotonic() * 1000.0
        last = self._last_accepted.get(code)
        if last is not None and (now - last) < self.threshold_ms:
            return False
        self._last_accepted[code] = now
        return True

    def reset(self) -> None:
        self._last_accepted.clear()

    def to_dict(self) -> dict[str, Any]:
        return {"threshold_ms": self.threshold_ms}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DebounceFilter":
        return cls(threshold_ms=float(data.get("threshold_ms", 5.0)))

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "DebounceFilter":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# TiltThresholdCalibrator
# ---------------------------------------------------------------------------

@dataclass
class TiltThresholdCalibrator:
    """Calibration for tilt-sensor Star Power / Overdrive activation.

    Records tilt samples and determines an activation threshold.
    """
    activation_threshold: float = 0.65
    hold_time_ms: float = 200.0
    axis_min: int = -32768
    axis_max: int = 32767
    _resting_samples: list[int] = field(default_factory=list, repr=False)
    _active_samples: list[int] = field(default_factory=list, repr=False)

    def record_resting(self, value: int) -> None:
        """Record a sample while the controller is at rest."""
        self._resting_samples.append(value)

    def record_active(self, value: int) -> None:
        """Record a sample while the controller is tilted (active)."""
        self._active_samples.append(value)

    def auto_calibrate(self) -> None:
        """Compute activation threshold from recorded samples."""
        if not self._resting_samples or not self._active_samples:
            return
        resting_avg = statistics.mean(self._resting_samples)
        active_avg = statistics.mean(self._active_samples)

        # Normalize both to 0..1
        total_range = self.axis_max - self.axis_min
        if total_range == 0:
            return
        resting_norm = (resting_avg - self.axis_min) / total_range
        active_norm = (active_avg - self.axis_min) / total_range

        # Threshold halfway between resting and active
        self.activation_threshold = (resting_norm + active_norm) / 2.0

    def is_activated(self, raw_value: int) -> bool:
        """Check whether the tilt sensor is past the activation threshold."""
        total_range = self.axis_max - self.axis_min
        if total_range == 0:
            return False
        normalized = (raw_value - self.axis_min) / total_range
        return normalized >= self.activation_threshold

    def reset(self) -> None:
        self._resting_samples.clear()
        self._active_samples.clear()
        self.activation_threshold = 0.65

    def to_dict(self) -> dict[str, Any]:
        return {
            "activation_threshold": self.activation_threshold,
            "hold_time_ms": self.hold_time_ms,
            "axis_min": self.axis_min,
            "axis_max": self.axis_max,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TiltThresholdCalibrator":
        return cls(
            activation_threshold=float(data.get("activation_threshold", 0.65)),
            hold_time_ms=float(data.get("hold_time_ms", 200.0)),
            axis_min=int(data.get("axis_min", -32768)),
            axis_max=int(data.get("axis_max", 32767)),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "TiltThresholdCalibrator":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# WhammyNormalizer
# ---------------------------------------------------------------------------

@dataclass
class WhammyNormalizer:
    """Half-axis normalizer for whammy bars.

    Maps a signed 16-bit range (typically -32768..32767 or a subset) to 0.0..1.0.
    """
    raw_min: int = -32768
    raw_max: int = 32767
    rest_value: Optional[int] = None
    inverted: bool = False
    _samples: list[int] = field(default_factory=list, repr=False)

    def record_sample(self, value: int) -> None:
        """Record a raw sample for auto-calibration."""
        self._samples.append(value)
        if value < self.raw_min:
            self.raw_min = value
        if value > self.raw_max:
            self.raw_max = value

    def auto_calibrate(self) -> None:
        """Determine rest value from initial samples."""
        if self._samples:
            # Rest position is typically the first few samples
            initial = self._samples[:min(20, len(self._samples))]
            self.rest_value = int(statistics.median(initial))

    def normalize(self, raw_value: int) -> float:
        """Map *raw_value* → [0.0, 1.0]. 0.0 = rest position, 1.0 = fully pressed."""
        rest = self.rest_value if self.rest_value is not None else self.raw_min

        if self.inverted:
            # Whammy goes from rest toward raw_min
            active_range = rest - self.raw_min
            if active_range == 0:
                return 0.0
            result = (rest - raw_value) / active_range
        else:
            # Whammy goes from rest toward raw_max
            active_range = self.raw_max - rest
            if active_range == 0:
                return 0.0
            result = (raw_value - rest) / active_range

        return max(0.0, min(1.0, result))

    def reset(self) -> None:
        self.raw_min = -32768
        self.raw_max = 32767
        self.rest_value = None
        self._samples.clear()

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_min": self.raw_min,
            "raw_max": self.raw_max,
            "rest_value": self.rest_value,
            "inverted": self.inverted,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WhammyNormalizer":
        return cls(
            raw_min=int(data.get("raw_min", -32768)),
            raw_max=int(data.get("raw_max", 32767)),
            rest_value=data.get("rest_value"),
            inverted=data.get("inverted", False),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, text: str) -> "WhammyNormalizer":
        return cls.from_dict(json.loads(text))


# ---------------------------------------------------------------------------
# LatencyTester
# ---------------------------------------------------------------------------

@dataclass
class LatencyTester:
    """Measures actual polling frequency, jitter, and button bounce intervals
    for a device's input stream.

    Usage::

        tester = LatencyTester()
        tester.record_event(timestamp_sec)
        ...
        result = tester.compute()
    """
    _timestamps: list[float] = field(default_factory=list, repr=False)
    _bounce_intervals: list[float] = field(default_factory=list, repr=False)
    _last_key_events: dict[int, float] = field(default_factory=dict, repr=False)

    def record_event(self, timestamp_sec: float) -> None:
        """Record an event timestamp (seconds, e.g. from event.timestamp())."""
        self._timestamps.append(timestamp_sec)

    def record_key_event(self, code: int, value: int, timestamp_sec: float) -> None:
        """Record a key event for bounce analysis.  Tracks consecutive presses."""
        if value == 1:  # key down
            last = self._last_key_events.get(code)
            if last is not None:
                interval_ms = (timestamp_sec - last) * 1000.0
                if interval_ms < 50.0:  # Likely a bounce if under 50ms
                    self._bounce_intervals.append(interval_ms)
            self._last_key_events[code] = timestamp_sec

    def compute(self) -> dict[str, Any]:
        """Return latency diagnostics."""
        if len(self._timestamps) < 2:
            return {
                "polling_hz": 0.0,
                "jitter_ms_stddev": 0.0,
                "bounce_intervals_ms": [round(b, 4) for b in self._bounce_intervals[:50]],
                "sample_count": len(self._timestamps),
                "avg_bounce_ms": round(statistics.mean(self._bounce_intervals), 4) if self._bounce_intervals else 0.0,
            }

        intervals = [
            (self._timestamps[i + 1] - self._timestamps[i]) * 1000.0
            for i in range(len(self._timestamps) - 1)
        ]
        # Filter out unreasonably large gaps (>100ms = likely idle)
        active_intervals = [iv for iv in intervals if 0 < iv < 100.0]

        if not active_intervals:
            return {
                "polling_hz": 0.0,
                "jitter_ms_stddev": 0.0,
                "bounce_intervals_ms": self._bounce_intervals[:50],
                "sample_count": len(self._timestamps),
                "avg_bounce_ms": statistics.mean(self._bounce_intervals) if self._bounce_intervals else 0.0,
            }

        avg_interval_ms = statistics.mean(active_intervals)
        polling_hz = 1000.0 / avg_interval_ms if avg_interval_ms > 0 else 0.0
        jitter_ms = statistics.stdev(active_intervals) if len(active_intervals) >= 2 else 0.0

        return {
            "polling_hz": round(polling_hz, 2),
            "jitter_ms_stddev": round(jitter_ms, 4),
            "bounce_intervals_ms": [round(b, 4) for b in self._bounce_intervals[:50]],
            "sample_count": len(self._timestamps),
            "avg_interval_ms": round(avg_interval_ms, 4),
            "min_interval_ms": round(min(active_intervals), 4),
            "max_interval_ms": round(max(active_intervals), 4),
            "avg_bounce_ms": round(statistics.mean(self._bounce_intervals), 4) if self._bounce_intervals else 0.0,
        }

    def reset(self) -> None:
        self._timestamps.clear()
        self._bounce_intervals.clear()
        self._last_key_events.clear()


# ---------------------------------------------------------------------------
# Calibration RPC helper
# ---------------------------------------------------------------------------

class CalibrationResult:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return self.data


def calibrate_axis(device_path: str, axis: str, settings: dict[str, Any]) -> CalibrationResult:
    """Helper to calibrate an axis with provided settings dictionary."""
    cal = AxisCalibrator(axis_name=axis)
    if "inner_deadzone" in settings:
        cal.deadzone.inner_deadzone = float(settings["inner_deadzone"])
    if "outer_deadzone" in settings:
        cal.deadzone.outer_deadzone = float(settings["outer_deadzone"])
    if "anti_deadzone" in settings:
        cal.deadzone.anti_deadzone = float(settings["anti_deadzone"])
    if "curve_type" in settings:
        try:
            cal.response_curve.curve_type = CurveType(settings["curve_type"])
        except ValueError:
            pass
    if "inverted" in settings:
        cal.inverted = bool(settings["inverted"])
    return CalibrationResult({
        "device_path": device_path,
        "axis": axis,
        "settings": cal.to_dict(),
        "status": "calibrated",
    })

