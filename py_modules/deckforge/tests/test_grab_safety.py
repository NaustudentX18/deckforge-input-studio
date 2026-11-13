"""
Integration Tests for evdev Exclusive Grab Watchdog & Disconnect Recovery.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from deckforge.input_sniffer import PressAnyInputListener


@pytest.mark.asyncio
async def test_watchdog_timeout_fires_and_ungrabs():
    """Verify that when grab is enabled, wait() strictly enforces the watchdog
    and safely calls ungrab() on all grabbed devices on timeout.
    """
    mock_dev = MagicMock()
    mock_dev.path = "/dev/input/event99"
    mock_dev.capabilities.return_value = {}
    mock_dev.grab = MagicMock()
    mock_dev.ungrab = MagicMock()
    mock_dev.close = MagicMock()

    # async_read_loop that never produces an event
    async def mock_read_loop():
        while True:
            await asyncio.sleep(1.0)
            yield None

    mock_dev.async_read_loop = mock_read_loop

    with patch("deckforge.input_sniffer.evdev.list_devices", return_value=["/dev/input/event99"]), \
         patch("deckforge.input_sniffer.InputDevice", return_value=mock_dev):

        listener = PressAnyInputListener(grab=True)
        # Small timeout for test speed
        result = await listener.wait(timeout=0.05)

        assert result is None
        # Grab must have been called
        assert mock_dev.grab.called
        # Ungrab MUST have been called in finally block
        assert mock_dev.ungrab.called
        assert mock_dev.close.called


@pytest.mark.asyncio
async def test_hot_unplug_enodev_recovery():
    """Verify that if an OSError/ENODEV occurs (controller unplugged mid-bind),
    the listener recovers gracefully and ungrab() cleanup runs without exceptions.
    """
    mock_dev = MagicMock()
    mock_dev.path = "/dev/input/event98"
    mock_dev.capabilities.return_value = {}
    mock_dev.grab = MagicMock()
    mock_dev.ungrab = MagicMock()
    mock_dev.close = MagicMock()

    # async_read_loop raises OSError (ENODEV) immediately
    async def mock_read_loop():
        raise OSError(19, "No such device")
        yield None

    mock_dev.async_read_loop = mock_read_loop

    with patch("deckforge.input_sniffer.evdev.list_devices", return_value=["/dev/input/event98"]), \
         patch("deckforge.input_sniffer.InputDevice", return_value=mock_dev):

        listener = PressAnyInputListener(grab=True)
        result = await listener.wait(timeout=0.1)

        assert result is None
        assert mock_dev.ungrab.called
        assert mock_dev.close.called
