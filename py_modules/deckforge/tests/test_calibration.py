"""
Unit tests for DeckForge input calibration and filtering engine.
"""

from __future__ import annotations

import math
import time
import pytest

from deckforge.calibration import (
    AxisCalibrator,
    CurveType,
    DeadzoneProcessor,
    DebounceFilter,
    LatencyTester,
    ResponseCurve,
    TiltThresholdCalibrator,
    WhammyNormalizer,
)


class TestDeadzoneProcessor:
    def test_zero_deadzone_maps_linearly(self):
        dz = DeadzoneProcessor(inner_deadzone=0, outer_deadzone=0, anti_deadzone=0)
        # Midpoint of 0..1000 is 500 -> 0.5
        assert dz.apply(500, 0, 1000) == pytest.approx(0.5, abs=0.01)
        # Extremes
        assert dz.apply(0, 0, 1000) == pytest.approx(0.0, abs=0.01)
        assert dz.apply(1000, 0, 1000) == pytest.approx(1.0, abs=0.01)

    def test_inner_deadzone_clamps_center(self):
        dz = DeadzoneProcessor(inner_deadzone=10.0)  # 10% deadzone
        # Range -100 to 100, center is 0. 5 is within 10%
        val = dz.apply(5, -100, 100)
        assert val == 0.5
        val_neg = dz.apply(-5, -100, 100)
        assert val_neg == 0.5

    def test_outer_deadzone_clamps_extremes(self):
        dz = DeadzoneProcessor(inner_deadzone=0.0, outer_deadzone=10.0)  # Top 10% maxed out
        # In range 0..100, 95 is in outer 10%
        val = dz.apply(95, 0, 100)
        assert val == 1.0
        # Lower outer deadzone
        val_low = dz.apply(5, 0, 100)
        assert val_low == 0.0

    def test_anti_deadzone_boost(self):
        dz = DeadzoneProcessor(inner_deadzone=10.0, outer_deadzone=0.0, anti_deadzone=20.0)
        # Just outside inner deadzone (11% of range)
        # Raw value: center is 50, range 0..100. Value 61 is 11% away from center (magnitude 0.22)
        val = dz.apply(61, 0, 100)
        # With anti-deadzone, the output should be shifted beyond anti-deadzone (0.2 + ...)
        assert val > 0.60

    def test_deadzone_json_serialization(self):
        dz = DeadzoneProcessor(inner_deadzone=5.5, outer_deadzone=3.2, anti_deadzone=1.0)
        json_str = dz.to_json()
        dz2 = DeadzoneProcessor.from_json(json_str)
        assert dz2.inner_deadzone == 5.5
        assert dz2.outer_deadzone == 3.2
        assert dz2.anti_deadzone == 1.0


class TestResponseCurve:
    def test_linear_curve(self):
        rc = ResponseCurve(curve_type=CurveType.LINEAR)
        assert rc.apply(0.0) == 0.0
        assert rc.apply(0.5) == 0.5
        assert rc.apply(1.0) == 1.0

    def test_aggressive_curve_is_quadratic(self):
        rc = ResponseCurve(curve_type=CurveType.AGGRESSIVE)
        assert rc.apply(0.0) == 0.0
        assert rc.apply(0.5) == pytest.approx(0.25, abs=0.001)
        assert rc.apply(1.0) == 1.0

    def test_relaxed_curve_is_sqrt(self):
        rc = ResponseCurve(curve_type=CurveType.RELAXED)
        assert rc.apply(0.0) == 0.0
        assert rc.apply(0.25) == pytest.approx(0.5, abs=0.001)
        assert rc.apply(1.0) == 1.0

    def test_custom_bezier_endpoints(self):
        rc = ResponseCurve(
            curve_type=CurveType.CUSTOM_BEZIER,
            bezier_points=[(0.1, 0.4), (0.9, 0.6)],
        )
        assert rc.apply(0.0) == pytest.approx(0.0, abs=0.01)
        assert rc.apply(1.0) == pytest.approx(1.0, abs=0.01)

    def test_response_curve_serialization(self):
        rc = ResponseCurve(curve_type=CurveType.AGGRESSIVE)
        data = rc.to_dict()
        rc2 = ResponseCurve.from_dict(data)
        assert rc2.curve_type == CurveType.AGGRESSIVE


class TestDebounceFilter:
    def test_debounce_filters_rapid_clicks(self):
        df = DebounceFilter(threshold_ms=10.0)
        # First event accepted
        assert df.accept(code=304, timestamp=100.0) is True
        # Event within 10ms rejected
        assert df.accept(code=304, timestamp=105.0) is False
        # Event at 111ms accepted
        assert df.accept(code=304, timestamp=111.0) is True

    def test_debounce_tracks_independent_codes(self):
        df = DebounceFilter(threshold_ms=10.0)
        assert df.accept(code=304, timestamp=100.0) is True
        # Different button code should be accepted even if within threshold
        assert df.accept(code=305, timestamp=102.0) is True


class TestWhammyNormalizer:
    def test_standard_range_mapping(self):
        wn = WhammyNormalizer(raw_min=-32768, raw_max=32767, rest_value=-32768)
        assert wn.normalize(-32768) == 0.0
        assert wn.normalize(32767) == 1.0
        assert wn.normalize(0) == pytest.approx(0.5, abs=0.02)

    def test_inverted_range_mapping(self):
        wn = WhammyNormalizer(raw_min=-32768, raw_max=32767, rest_value=32767, inverted=True)
        assert wn.normalize(32767) == 0.0
        assert wn.normalize(-32768) == 1.0

    def test_whammy_auto_calibrate(self):
        wn = WhammyNormalizer()
        for val in [-32000, -32100, -31900]:
            wn.record_sample(val)
        wn.auto_calibrate()
        assert wn.rest_value is not None
        assert abs(wn.rest_value - (-32000)) < 200


class TestTiltThresholdCalibrator:
    def test_activation_detection(self):
        tt = TiltThresholdCalibrator(
            activation_threshold=0.7,
            axis_min=0,
            axis_max=100,
        )
        assert tt.is_activated(50) is False
        assert tt.is_activated(75) is True

    def test_auto_calibrate(self):
        tt = TiltThresholdCalibrator(axis_min=0, axis_max=100)
        for _ in range(5):
            tt.record_resting(10)  # Resting ~10%
        for _ in range(5):
            tt.record_active(90)   # Active ~90%
        tt.auto_calibrate()
        # Midpoint should be around 0.50
        assert tt.activation_threshold == pytest.approx(0.50, abs=0.05)


class TestAxisCalibrator:
    def test_axis_auto_calibration(self):
        ac = AxisCalibrator(axis_name="ABS_X")
        for val in [100, 200, 300, 400, 500]:
            ac.record_sample(val)
        ac.finalize_calibration()

        assert ac.detected_min == 100
        assert ac.detected_max == 500
        assert ac.detected_center == 300

        # Center value should calibrate to ~0.5
        cal_val = ac.calibrate(300)
        assert cal_val == pytest.approx(0.5, abs=0.05)


class TestLatencyTester:
    def test_polling_rate_calculation(self):
        lt = LatencyTester()
        # Simulate 1000 Hz (1ms intervals)
        for i in range(100):
            lt.record_event(1000.0 + i * 0.001)

        result = lt.compute()
        assert result["polling_hz"] == pytest.approx(1000.0, rel=0.05)
        assert result["jitter_ms_stddev"] == pytest.approx(0.0, abs=0.01)
        assert result["sample_count"] == 100

    def test_key_bounce_recording(self):
        lt = LatencyTester()
        lt.record_key_event(code=1, value=1, timestamp_sec=100.000)
        lt.record_key_event(code=1, value=1, timestamp_sec=100.005)  # 5ms later (bounce)
        result = lt.compute()
        assert len(result["bounce_intervals_ms"]) == 1
        assert result["bounce_intervals_ms"][0] == pytest.approx(5.0, abs=0.1)
