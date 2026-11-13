"""
DeckForge Input Studio — FastAPI + WebSocket Backend Server.

Runs on 0.0.0.0:8765 to serve REST endpoints and 60 Hz+ WebSocket streams
for live input monitoring, hardware calibration, VDF template management,
and game configuration assignments. Includes CORS for Tailscale access.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import traceback
from typing import Any, Optional

import evdev
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .calibration import (
    AxisCalibrator,
    CurveType,
    DeadzoneProcessor,
    DebounceFilter,
    LatencyTester,
    ResponseCurve,
    TiltThresholdCalibrator,
    WhammyNormalizer,
)
from .crkd_profiler import auto_detect_crkd, auto_detect_crkd_les_paul, generate_crkd_template
from .gp2040_profiler import auto_detect_gp2040, generate_gp2040_template
from .midi_sniffer import MidiEventStream, list_midi_devices
from .security import (
    generate_svg_qr,
    get_network_interfaces,
    is_ip_allowed,
    load_security_settings,
    save_security_settings,
)
from .input_sniffer import (
    DeviceInfo,
    DeviceMonitor,
    InputEventStream,
    PressAnyInputListener,
    discover_devices,
)
from .vdf_manager import (
    GameAssigner,
    SteamPathResolver,
    TemplateManager,
    VDFTemplate,
    VDFValidator,
    diff_templates,
    parse_vdf,
)

logger = logging.getLogger("deckforge.api_server")

app = FastAPI(
    title="DeckForge Input Studio API",
    version="0.1.0",
    description="Steam Deck input hardware sniffer, calibration engine, and VDF template manager",
)

# CORS middleware for local deck access and Tailscale remote access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Enforce optional 4-digit PIN authentication and Tailscale / LAN subnet restrictions."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    # Local loopback on Steam Deck and test clients are always permitted
    if client_ip in ("127.0.0.1", "::1", "localhost", "testclient"):
        return await call_next(request)

    sec = load_security_settings()

    # Subnet guard check (Tailscale + private LAN)
    if sec.get("subnet_guard_enabled", True):
        if not is_ip_allowed(client_ip):
            return Response(
                content="Forbidden: Client IP not in allowed Tailscale / private LAN subnets",
                status_code=403,
            )

    # 4-digit PIN guard check
    if sec.get("pin_enabled", False) and sec.get("pin"):
        path = request.url.path
        if not (
            path.startswith("/api/security")
            or path.startswith("/api/system")
            or path.startswith("/static")
            or path.startswith("/assets")
            or path == "/"
        ):
            pin_header = request.headers.get("X-DeckForge-PIN") or request.query_params.get("pin")
            if pin_header != sec.get("pin"):
                return Response(
                    content="Unauthorized: Invalid or missing DeckForge PIN",
                    status_code=401,
                )

    return await call_next(request)

# Managers / singletons
template_manager = TemplateManager()
game_assigner = GameAssigner()

# Active calibration sessions cache
_calibrators: dict[str, AxisCalibrator] = {}

# Static files and assets mounting
from pathlib import Path
_project_root = Path(__file__).resolve().parent.parent.parent
_static_dir = _project_root / "static"
_assets_dir = _project_root / "assets"

if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")


@app.get("/", include_in_schema=False)
async def serve_index():
    index_file = _static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "DeckForge Input Studio API is running. Build frontend to view studio."}



# ===================================================================
# Pydantic Request Models
# ===================================================================

class TemplateSaveRequest(BaseModel):
    title: str
    description: str = ""
    creator: str = "DeckForge"
    controller_type: str = "neptune"
    version: int = 3
    group_source_bindings: list[dict[str, Any]] = Field(default_factory=list)
    action_sets: list[dict[str, Any]] = Field(default_factory=list)
    action_layers: list[dict[str, Any]] = Field(default_factory=list)


class TemplateImportRequest(BaseModel):
    data: str
    format: str = "vdf"  # "vdf" or "deckforge_json"


class ExportRequest(BaseModel):
    format: str = "vdf"  # "vdf" or "deckforge_json"


class AssignGameRequest(BaseModel):
    template_name: str


class PresetApplyRequest(BaseModel):
    device_path: Optional[str] = None
    target_game: Optional[str] = "Clone Hero"


class CalibrateRequest(BaseModel):
    device_path: str
    axis_name: str
    raw_value: Optional[int] = None
    inner_deadzone: Optional[float] = 0.0
    outer_deadzone: Optional[float] = 0.0
    anti_deadzone: Optional[float] = 0.0
    curve_type: Optional[str] = "Linear"
    inverted: Optional[bool] = False
    finalize: Optional[bool] = False


class VDFValidateRequest(BaseModel):
    vdf_text: str


class VDFDiffRequest(BaseModel):
    template_a: str
    template_b: str


# ===================================================================
# Helper Functions
# ===================================================================

def _normalize_device_path(path: str) -> str:
    """Normalize input device path: accept e.g. 'event0', '/dev/input/event0'."""
    path = path.strip()
    if not path.startswith("/dev/input/"):
        if path.startswith("event"):
            path = f"/dev/input/{path}"
        elif not path.startswith("/"):
            path = f"/dev/input/{path}"
    return path


# ===================================================================
# REST Endpoints: Device Discovery & Capabilities
# ===================================================================

@app.get("/api/devices")
async def list_devices() -> list[dict[str, Any]]:
    """List all connected evdev and USB-MIDI input devices with capabilities."""
    try:
        devices = [dev.to_dict() for dev in discover_devices()]
        midi_devices = list_midi_devices()
        return devices + midi_devices
    except Exception as exc:
        logger.error("Failed to discover devices: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/devices/{path:path}/capabilities")
async def get_device_capabilities(path: str) -> dict[str, Any]:
    """Get the full capability map for a specific device (evdev or MIDI)."""
    if path.startswith("midi:") or path.startswith("rawmidi:"):
        return {
            "path": path,
            "name": path,
            "bus_type": "usb_midi",
            "capabilities": {
                "EV_MIDI": ["NOTE_ON", "NOTE_OFF", "CONTROL_CHANGE"],
            },
        }

    dev_path = _normalize_device_path(path)
    try:
        dev = evdev.InputDevice(dev_path)
        from .input_sniffer import _bus_type_name, _capability_map, _resolve_by_id
        caps = _capability_map(dev)
        info = {
            "path": dev.path,
            "name": dev.name,
            "vendor_id": f"0x{dev.info.vendor:04x}",
            "product_id": f"0x{dev.info.product:04x}",
            "bus_type": _bus_type_name(dev.info.bustype),
            "by_id_path": _resolve_by_id(dev.path),
            "capabilities": caps,
        }
        dev.close()
        return info
    except (FileNotFoundError, OSError) as exc:
        raise HTTPException(status_code=404, detail=f"Device not found or inaccessible: {dev_path} ({exc})")


# ===================================================================
# REST Endpoints: Security, Network Info & QR Pairing
# ===================================================================

class SecuritySettingsRequest(BaseModel):
    pin_enabled: bool = False
    pin: str = ""
    subnet_guard_enabled: bool = True


class SecurityVerifyRequest(BaseModel):
    pin: str


@app.get("/api/security/settings")
async def get_security_settings() -> dict[str, Any]:
    """Get current PIN & subnet guard settings."""
    sec = load_security_settings()
    return {
        "pin_enabled": sec.get("pin_enabled", False),
        "has_pin": bool(sec.get("pin")),
        "subnet_guard_enabled": sec.get("subnet_guard_enabled", True),
    }


@app.post("/api/security/settings")
async def update_security_settings(req: SecuritySettingsRequest) -> dict[str, Any]:
    """Update PIN & subnet guard settings."""
    sec = load_security_settings()
    sec["pin_enabled"] = req.pin_enabled
    if req.pin:
        sec["pin"] = req.pin
    sec["subnet_guard_enabled"] = req.subnet_guard_enabled
    save_security_settings(sec)
    return {"status": "ok", "pin_enabled": sec["pin_enabled"]}


@app.post("/api/security/verify")
async def verify_pin(req: SecurityVerifyRequest) -> dict[str, Any]:
    """Verify 4-digit PIN for remote studio access."""
    sec = load_security_settings()
    if not sec.get("pin_enabled", False):
        return {"valid": True, "required": False}
    valid = req.pin == sec.get("pin", "")
    return {"valid": valid, "required": True}


@app.get("/api/system/network-info")
async def get_network_info() -> dict[str, Any]:
    """Return discovered Tailscale and local network IPs for tablet/phone pairing."""
    ifaces = get_network_interfaces()
    tailscale_ip = ifaces.get("tailscale")
    wifi_ip = ifaces.get("wifi")
    primary_ip = tailscale_ip or wifi_ip or ifaces.get("primary", "127.0.0.1")

    port = 8765
    remote_url = f"http://{primary_ip}:{port}/"
    qr_svg = generate_svg_qr(remote_url)

    return {
        "interfaces": ifaces,
        "primary_ip": primary_ip,
        "port": port,
        "remote_url": remote_url,
        "qr_svg": qr_svg,
    }


@app.get("/api/system/qrcode")
async def get_qrcode_svg(url: Optional[str] = None):
    """Return raw SVG QR code for the remote pairing URL."""
    if not url:
        info = await get_network_info()
        url = info["remote_url"]
    svg = generate_svg_qr(url)
    return Response(content=svg, media_type="image/svg+xml")


# ===================================================================
# REST Endpoints: GP2040-CE & MIDI Profilers
# ===================================================================

@app.get("/api/gp2040/detect")
async def detect_gp2040_controller() -> dict[str, Any]:
    """Auto-detect connected GP2040-CE / RP2040 custom guitar or controller."""
    profile = auto_detect_gp2040()
    if not profile:
        return {"detected": False, "profile": None}
    return {"detected": True, "profile": profile.to_dict()}


class GP2040GenerateRequest(BaseModel):
    target_game: str = "clone_hero"


@app.post("/api/gp2040/generate")
async def generate_gp2040_guitar_template(req: GP2040GenerateRequest) -> dict[str, Any]:
    """Generate optimized rhythm game Steam Input VDF template for GP2040-CE."""
    profile = auto_detect_gp2040()
    template = generate_gp2040_template(profile, target_game=req.target_game)
    path = template_manager.save_template(template)
    return {
        "status": "generated",
        "template": template.to_dict(),
        "saved_path": str(path),
    }


@app.get("/api/midi/devices")
async def get_midi_devices_list() -> list[dict[str, Any]]:
    """List connected USB-MIDI electronic drums and synthesizers."""
    return list_midi_devices()



# ===================================================================
# REST Endpoints: VDF Templates CRUD & Import / Export
# ===================================================================

@app.get("/api/templates")
async def get_templates() -> list[dict[str, Any]]:
    """List all Steam base, user, and DeckForge local templates."""
    try:
        return template_manager.list_all_templates()
    except Exception as exc:
        logger.error("Error listing templates: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/templates")
async def save_template(req: TemplateSaveRequest) -> dict[str, Any]:
    """Save a new VDF template to the local vault and Steam user templates."""
    try:
        tpl = VDFTemplate(
            title=req.title,
            description=req.description,
            creator=req.creator,
            controller_type=req.controller_type,
            version=req.version,
            group_source_bindings=req.group_source_bindings,
            action_sets=req.action_sets,
            action_layers=req.action_layers,
        )
        saved_path = template_manager.save_template(tpl)
        return {"status": "success", "path": str(saved_path), "title": tpl.title}
    except Exception as exc:
        logger.error("Error saving template: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/templates/{name}")
async def get_template(name: str) -> dict[str, Any]:
    """Load a template by name or path."""
    try:
        tpl = template_manager._find_and_load(name)
        return tpl.to_dict()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/templates/{name}")
async def update_template(name: str, req: TemplateSaveRequest) -> dict[str, Any]:
    """Update an existing template."""
    try:
        tpl = VDFTemplate(
            title=req.title or name,
            description=req.description,
            creator=req.creator,
            controller_type=req.controller_type,
            version=req.version,
            group_source_bindings=req.group_source_bindings,
            action_sets=req.action_sets,
            action_layers=req.action_layers,
        )
        saved_path = template_manager.save_template(tpl)
        return {"status": "updated", "path": str(saved_path), "title": tpl.title}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/templates/{name}")
async def delete_template(name: str) -> dict[str, Any]:
    """Delete a template from the vault (creating .bak backup)."""
    try:
        template_manager.delete_template(name)
        return {"status": "deleted", "name": name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/templates/{name}/export")
async def export_template(name: str, req: ExportRequest) -> Response:
    """Export template as raw VDF text or DeckForge JSON."""
    try:
        raw_bytes = template_manager.export_template(name, fmt=req.format)
        media_type = "application/json" if req.format == "deckforge_json" else "text/plain"
        return Response(content=raw_bytes, media_type=media_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/templates/import")
async def import_template(req: TemplateImportRequest) -> dict[str, Any]:
    """Import a template from raw string data."""
    try:
        data_bytes = req.data.encode("utf-8")
        tpl = template_manager.import_template(data_bytes, fmt=req.format)
        return {"status": "imported", "title": tpl.title}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}")


# ===================================================================
# REST Endpoints: Game Enumeration & Assignment
# ===================================================================

@app.get("/api/games")
async def list_games() -> list[dict[str, Any]]:
    """List all installed Steam games and non-Steam shortcuts."""
    try:
        return game_assigner.list_all_games()
    except Exception as exc:
        logger.error("Error listing games: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/games/{app_id}/assign")
async def assign_game_template(app_id: str, req: AssignGameRequest) -> dict[str, Any]:
    """Assign a template to a game (updating configset_controller_neptune.vdf)."""
    try:
        game_assigner.assign_template_to_game(req.template_name, app_id, template_manager=template_manager)
        return {"status": "assigned", "app_id": app_id, "template": req.template_name}
    except Exception as exc:
        logger.error("Error assigning template: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ===================================================================
# REST Endpoints: Presets & CRKD Profiler
# ===================================================================

@app.get("/api/presets")
async def list_presets() -> list[dict[str, Any]]:
    """List preset generators."""
    return [
        {
            "id": "crkd_les_paul_clone_hero",
            "name": "CRKD Les Paul Pro - Clone Hero",
            "description": "Zero-latency mechanical fret, pickup Star Power switch & strum mapping for Clone Hero",
            "target": "Clone Hero",
        },
        {
            "id": "crkd_les_paul_yarg",
            "name": "CRKD Les Paul Pro - YARG",
            "description": "Single-cutaway Les Paul Pro layout with whammy half-axis normalization and speed knobs",
            "target": "YARG",
        },
        {
            "id": "crkd_clone_hero",
            "name": "CRKD Neo S - Clone Hero",
            "description": "Zero-latency mechanical fret & strum mapping for Clone Hero",
            "target": "Clone Hero",
        },
        {
            "id": "crkd_yarg",
            "name": "CRKD Neo S - YARG",
            "description": "Native rhythm game layout with whammy half-axis normalization",
            "target": "YARG",
        },
        {
            "id": "crkd_rb4",
            "name": "CRKD Neo S - Rock Band 4 (RPCS3)",
            "description": "PS3 emulated guitar controller layout for RPCS3",
            "target": "Rock Band 4 (RPCS3)",
        },
        {
            "id": "crkd_gh3",
            "name": "CRKD Neo S - Guitar Hero III (PCSX2)",
            "description": "DualShock 2 emulated fret layout for PCSX2",
            "target": "Guitar Hero III (PCSX2)",
        },
    ]


@app.post("/api/presets/{name}/apply")
async def apply_preset(name: str, req: PresetApplyRequest) -> dict[str, Any]:
    """Apply a preset generator and save it as an active template."""
    try:
        name_lower = name.lower()
        if "les_paul" in name_lower or "lp" in name_lower:
            profile = auto_detect_crkd_les_paul()
        else:
            profile = auto_detect_crkd()

        target_game = req.target_game or "Clone Hero"

        # Check name mapping
        if "yarg" in name_lower:
            target_game = "YARG"
        elif "rb4" in name_lower or "rpcs3" in name_lower:
            target_game = "Rock Band 4 (RPCS3)"
        elif "gh3" in name_lower or "pcsx2" in name_lower:
            target_game = "Guitar Hero III (PCSX2)"
        else:
            target_game = "Clone Hero"

        template = generate_crkd_template(profile, target_game=target_game)
        saved_path = template_manager.save_template(template)
        return {
            "status": "applied",
            "preset": name,
            "template_title": template.title,
            "path": str(saved_path),
            "profile": profile.to_dict(),
        }
    except Exception as exc:
        logger.error("Error applying preset %s: %s", name, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ===================================================================
# REST Endpoints: Calibration & Latency
# ===================================================================

@app.post("/api/calibrate")
async def calibrate_axis(req: CalibrateRequest) -> dict[str, Any]:
    """Update or query per-axis calibration settings."""
    key = f"{req.device_path}:{req.axis_name}"
    calibrator = _calibrators.get(key)
    if calibrator is None:
        calibrator = AxisCalibrator(axis_name=req.axis_name)
        _calibrators[key] = calibrator

    if req.inner_deadzone is not None:
        calibrator.deadzone.inner_deadzone = req.inner_deadzone
    if req.outer_deadzone is not None:
        calibrator.deadzone.outer_deadzone = req.outer_deadzone
    if req.anti_deadzone is not None:
        calibrator.deadzone.anti_deadzone = req.anti_deadzone
    if req.curve_type is not None:
        try:
            calibrator.response_curve.curve_type = CurveType(req.curve_type)
        except ValueError:
            pass
    if req.inverted is not None:
        calibrator.inverted = req.inverted

    if req.raw_value is not None:
        calibrator.record_sample(req.raw_value)

    if req.finalize:
        calibrator.finalize_calibration()

    calibrated_val = calibrator.calibrate(req.raw_value) if req.raw_value is not None else 0.5
    return {
        "status": "success",
        "key": key,
        "calibrated_value": round(calibrated_val, 4),
        "settings": calibrator.to_dict(),
    }


@app.get("/api/diagnostics/latency")
async def run_latency_test(device_path: Optional[str] = None, duration_sec: float = 1.0) -> dict[str, Any]:
    """Run an async latency and polling-rate test on a connected device."""
    paths = [device_path] if device_path else [dev.path for dev in discover_devices()]
    target_path = None
    for p in paths:
        if p and os.path.exists(p):
            target_path = p
            break

    if not target_path:
        # Return fallback zeroed metrics if no device attached
        tester = LatencyTester()
        return tester.compute()

    tester = LatencyTester()
    try:
        dev = evdev.InputDevice(target_path)
        end_time = asyncio.get_event_loop().time() + min(duration_sec, 3.0)
        while asyncio.get_event_loop().time() < end_time:
            events = dev.read()
            try:
                for ev in events:
                    tester.record_event(ev.timestamp())
                    if ev.type == evdev.ecodes.EV_KEY:
                        tester.record_key_event(ev.code, ev.value, ev.timestamp())
            except BlockingIOError:
                pass
            await asyncio.sleep(0.005)
        dev.close()
    except Exception as exc:
        logger.debug("Latency test read error on %s: %s", target_path, exc)

    return tester.compute()


# ===================================================================
# REST Endpoints: VDF Validation & Diff
# ===================================================================

@app.post("/api/vdf/validate")
async def validate_vdf(req: VDFValidateRequest) -> dict[str, Any]:
    """Validate raw VDF content syntax and required fields."""
    errors = VDFValidator.validate_vdf_text(req.vdf_text)
    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }


@app.post("/api/vdf/diff")
async def get_vdf_diff(req: VDFDiffRequest) -> dict[str, Any]:
    """Diff two templates by name."""
    try:
        tpl_a = template_manager._find_and_load(req.template_a)
        tpl_b = template_manager._find_and_load(req.template_b)
        return {
            "template_a": req.template_a,
            "template_b": req.template_b,
            "diffs": diff_templates(tpl_a, tpl_b),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ===================================================================
# WebSocket Endpoints
# ===================================================================

@app.websocket("/ws/input/{device_path:path}")
async def ws_input_stream(websocket: WebSocket, device_path: str):
    """Stream live normalized input events from a single evdev or USB-MIDI device at 60 Hz+."""
    await websocket.accept()

    # Handle USB-MIDI devices
    if device_path.startswith("midi:") or device_path.startswith("rawmidi:"):
        midi_stream = MidiEventStream(device_path)
        try:
            async for event in midi_stream.events():
                await websocket.send_json(event)
        except WebSocketDisconnect:
            pass
        finally:
            midi_stream.stop()
        return

    dev_path = _normalize_device_path(device_path)

    if not os.path.exists(dev_path):
        await websocket.send_json({"error": f"Device {dev_path} not found"})
        await websocket.close()
        return

    stream = InputEventStream(dev_path)
    try:
        async for event in stream:
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS stream ended: %s", exc)
    finally:
        stream.close()


@app.websocket("/ws/input/all")
async def ws_input_all(websocket: WebSocket):
    """Stream live events from all currently connected devices multiplexed (evdev + MIDI)."""
    await websocket.accept()
    devices = discover_devices()
    midi_devices = list_midi_devices()

    if not devices and not midi_devices:
        await websocket.send_json({"message": "No devices connected"})

    open_devices: list[evdev.InputDevice] = []
    for d in devices:
        try:
            open_devices.append(evdev.InputDevice(d.path))
        except Exception:
            pass

    async def _read_dev(dev: evdev.InputDevice):
        from .input_sniffer import _event_code_name, _normalize_axis
        try:
            async for ev in dev.async_read_loop():
                if ev.type == evdev.ecodes.EV_SYN:
                    continue
                msg = {
                    "device_path": dev.path,
                    "event_type": evdev.ecodes.EV.get(ev.type, f"EV_{ev.type}"),
                    "code": ev.code,
                    "code_name": _event_code_name(ev.type, ev.code),
                    "value": ev.value,
                    "timestamp": ev.timestamp(),
                }
                await websocket.send_json(msg)
        except (asyncio.CancelledError, WebSocketDisconnect):
            return
        except Exception as exc:
            logger.debug("Error in read loop for %s: %s", dev.path, exc)

    async def _read_midi(mdev: dict[str, Any]):
        m_stream = MidiEventStream(mdev["path"])
        try:
            async for ev in m_stream.events():
                await websocket.send_json(ev)
        except (asyncio.CancelledError, WebSocketDisconnect):
            return
        finally:
            m_stream.stop()

    tasks = [asyncio.create_task(_read_dev(d)) for d in open_devices]
    tasks.extend([asyncio.create_task(_read_midi(m)) for m in midi_devices])

    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        for t in tasks:
            t.cancel()
        for d in open_devices:
            try:
                d.close()
            except Exception:
                pass


@app.websocket("/ws/bind")
async def ws_bind(websocket: WebSocket):
    """Listen for 'Press Any Input' and emit the first registered button or axis movement.
    Supports fail-safe exclusive grab with 10s watchdog and hotkey escape.
    """
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_text()
            req = json.loads(msg) if msg else {}
            timeout = float(req.get("timeout", 10.0))
            grab = bool(req.get("grab", False))

            listener = PressAnyInputListener(grab=grab)
            result = await listener.wait(timeout=timeout)
            if result:
                await websocket.send_json({"status": "detected", "input": result})
            else:
                await websocket.send_json({"status": "timeout"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS bind error: %s", exc)


@app.websocket("/ws/monitor")
async def ws_monitor(websocket: WebSocket):
    """Stream device hotplug connect/disconnect events."""
    await websocket.accept()
    monitor = DeviceMonitor()
    try:
        async for action, dev_info in monitor.events():
            await websocket.send_json({
                "action": action,
                "device": dev_info.to_dict(),
            })
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        monitor.stop()
