"""
Unit tests for FastAPI REST endpoints in api_server.py.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from deckforge.api_server import app
from deckforge.input_sniffer import DeviceInfo

client = TestClient(app)


class TestAPIServer:
    @patch("deckforge.api_server.discover_devices")
    def test_get_devices(self, mock_discover):
        mock_dev = DeviceInfo(
            path="/dev/input/event0",
            name="Test Gamepad",
            vendor_id=0x1234,
            product_id=0x5678,
            serial="",
            phys="",
            uniq="",
            capabilities={},
            bus_type="usb",
        )
        mock_discover.return_value = [mock_dev]

        resp = client.get("/api/devices")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Gamepad"

    def test_get_presets(self):
        resp = client.get("/api/presets")
        assert resp.status_code == 200
        presets = resp.json()
        assert len(presets) >= 4
        ids = [p["id"] for p in presets]
        assert "crkd_clone_hero" in ids

    def test_vdf_validate_endpoint(self):
        valid_vdf = '"controller_mappings" { "version" "3" "title" "Test" }'
        resp = client.post("/api/vdf/validate", json={"vdf_text": valid_vdf})
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

        invalid_vdf = '"unterminated'
        resp2 = client.post("/api/vdf/validate", json={"vdf_text": invalid_vdf})
        assert resp2.status_code == 200
        assert resp2.json()["valid"] is False

    def test_calibrate_endpoint(self):
        resp = client.post("/api/calibrate", json={
            "device_path": "/dev/input/event0",
            "axis_name": "ABS_X",
            "raw_value": 32767,
            "inner_deadzone": 5.0,
            "outer_deadzone": 2.0,
            "curve_type": "Linear",
            "finalize": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "calibrated_value" in data

    def test_template_crud_workflow(self, tmp_path):
        from deckforge.api_server import template_manager
        template_manager.local_dir = tmp_path

        # 1. Create template
        tpl_payload = {
            "title": "API Test Template",
            "description": "Created via REST API",
            "controller_type": "neptune",
            "version": 3,
            "group_source_bindings": [{"name": "A", "output": "key_press SPACE"}],
        }
        create_resp = client.post("/api/templates", json=tpl_payload)
        assert create_resp.status_code == 200
        assert create_resp.json()["status"] == "success"

        # 2. Get template
        get_resp = client.get("/api/templates/api_test_template")
        assert get_resp.status_code == 200
        assert get_resp.json()["title"] == "API Test Template"

        # 3. Export template
        export_resp = client.post("/api/templates/api_test_template/export", json={"format": "vdf"})
        assert export_resp.status_code == 200
        assert "controller_mappings" in export_resp.text

        # 4. Delete template
        del_resp = client.delete("/api/templates/api_test_template")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"
