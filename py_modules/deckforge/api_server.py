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
from pydantic import BaseModel, Field

from . import __version__ as _pkg_version
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
from .auto_profiler import (
    auto_profile as auto_build_profile,
    best_candidate as auto_best,
    generate_profile as auto_generate,
    scan as auto_scan,
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
    version="0.2.0",
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

# Static assets are served by reading the bytes in-process rather than through
# StaticFiles/FileResponse.  Inside Decky Loader's frozen interpreter the
# threadpool-backed file paths hand back a zero-length body while still sending
# the full Content-Length, so uvicorn aborts the response ("Response content
# shorter than Content-Length").  Reading directly is a few lines and behaves
# identically in every interpreter this runs under.
_MEDIA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
}


# A service worker must never be served from cache, or a redeploy can leave
# clients pinned to an old worker indefinitely.
_NO_STORE_PATHS = frozenset({"/sw.js", "/manifest.webmanifest"})

# Headers the PWA needs on every static response.
_STATIC_HEADERS = {
    # The service worker is same-origin; this keeps it usable from the Deck too.
    "Service-Worker-Allowed": "/",
    "X-Content-Type-Options": "nosniff",
}


def _serve_file(base: Path, relative: str, *, no_store: bool = False) -> Response:
    """Return *relative* from *base*, refusing to escape it."""
    try:
        target = (base / relative).resolve()
        target.relative_to(base.resolve())
    except (ValueError, OSError):
        return Response(content="Forbidden", status_code=403)
    if not target.is_file():
        return Response(content="Not found", status_code=404)
    media_type = _MEDIA_TYPES.get(target.suffix.lower(), "application/octet-stream")
    headers = dict(_STATIC_HEADERS)
    headers["Cache-Control"] = "no-store" if no_store else "no-cache"
    return Response(
        content=target.read_bytes(), media_type=media_type, headers=headers
    )


if _static_dir.exists():
    @app.get("/static/{path:path}", include_in_schema=False)
    async def serve_static(path: str) -> Response:
        return _serve_file(
            _static_dir, path, no_store=path in ("sw.js", "manifest.webmanifest")
        )

    @app.get("/sw.js", include_in_schema=False)
    async def serve_service_worker() -> Response:
        """Service workers must be same-origin at scope root."""
        return _serve_file(_static_dir, "sw.js", no_store=True)

    @app.get("/manifest.webmanifest", include_in_schema=False)
    async def serve_manifest() -> Response:
        return _serve_file(_static_dir, "manifest.webmanifest", no_store=True)
if _assets_dir.exists():
    @app.get("/assets/{path:path}", include_in_schema=False)
    async def serve_asset(path: str) -> Response:
        return _serve_file(_assets_dir, path)


@app.get("/", include_in_schema=False)
async def serve_index() -> Response:
    index_file = _static_dir / "index.html"
    if index_file.is_file():
        return _serve_file(_static_dir, "index.html")
    return Response(
        content="DeckForge Input Studio API is running. Build the frontend to view the studio.",
        media_type="text/plain",
    )



# ===================================================================
# Pydantic Request Models
# ===================================================================

class TemplateSaveRequest(BaseModel):
    """Accepts the studio's VDFTemplate payload.

    The frontend sends ``{metadata, actionSets, ...}``; older clients send a
    flat ``{title, controller_type, group_source_bindings}``.  Both are accepted
    and normalised through ``VDFTemplate.from_dict``.
    """
    model_config = {"extra": "allow"}

    title: Optional[str] = None
    description: Optional[str] = None
    creator: Optional[str] = None
    controller_type: Optional[str] = None
    version: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None
    actionSets: Optional[list[dict[str, Any]]] = None
    action_sets: Optional[list[dict[str, Any]]] = None
    group_source_bindings: Optional[list[dict[str, Any]]] = None
    virtualMenus: Optional[list[dict[str, Any]]] = None
    macros: Optional[list[dict[str, Any]]] = None
    axisCalibrations: Optional[list[dict[str, Any]]] = None
    turboConfigs: Optional[dict[str, Any]] = None

    def to_template(self, fallback_name: str = "") -> "VDFTemplate":
        """Build a VDFTemplate from whichever payload shape arrived."""
        payload: dict[str, Any] = self.model_dump(exclude_none=True)
        if fallback_name:
            payload.setdefault("title", fallback_name)
        tpl = VDFTemplate.from_dict(payload)
        if fallback_name and not tpl.name:
            tpl.name = fallback_name
        return tpl


class ExportRequest(BaseModel):
    format: str = "vdf"  # "vdf" or "deckforge_json"


class AssignGameRequest(BaseModel):
    """The studio sends ``templateName``; keep ``template_name`` working too."""
    templateName: Optional[str] = None
    template_name: Optional[str] = None

    @property
    def name(self) -> str:
        value = self.templateName or self.template_name
        if not value:
            raise HTTPException(status_code=422, detail="templateName is required")
        return value


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


# ===================================================================
# Known hardware catalog and one-click game profiles
# ===================================================================

@app.get("/api/catalog/devices")
async def catalog_devices() -> list[dict[str, Any]]:
    """Controller families DeckForge knows natively, with their mode-dial maps."""
    try:
        from .device_catalog import all_families
        return all_families()
    except Exception as exc:
        logger.error("Device catalog failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/catalog/profiles")
async def catalog_profiles(device_path: Optional[str] = None) -> dict[str, Any]:
    """Every pre-made one-click profile, optionally filtered to one device.

    Profiles carry the hardware state they require (mode-dial position), because
    for some games the correct bindings are meaningless unless the dial matches.
    """
    try:
        from .game_profiles import catalog, profiles_for_device

        if device_path:
            detections = await asyncio.to_thread(auto_scan)
            wanted = next((d for d in detections if d.device_path == device_path), None)
            if wanted is None:
                return {"profiles": [], "matched_device": None}
            matched = profiles_for_device(wanted.vendor_id, wanted.product_id, wanted.name)
            return {
                "profiles": [p.to_dict() for p in matched],
                "matched_device": wanted.to_dict(),
            }
        return {"profiles": catalog(), "matched_device": None}
    except Exception as exc:
        logger.error("Profile catalog failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


class ApplyProfileRequest(BaseModel):
    profile_id: str


@app.post("/api/catalog/apply")
async def catalog_apply(req: ApplyProfileRequest) -> dict[str, Any]:
    """One click: save a pre-made profile and publish it into Steam."""
    try:
        from .game_profiles import apply_profile

        return await asyncio.to_thread(
            apply_profile, req.profile_id, manager=template_manager
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Apply profile failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ===================================================================
# Auto-profiler: detect connected hardware and map it automatically
# ===================================================================

class AutoProfileRequest(BaseModel):
    """Request body for auto-profiling."""
    target_game: str = "clone_hero"
    # When true the generated profile is also saved and published to Steam.
    save: bool = False
    # Optional explicit device path; otherwise the best candidate is chosen.
    device_path: Optional[str] = None
    # Optional Steam app id. When given, the published profile is also bound to
    # that game, which is what makes it appear in Game Mode for the game itself
    # rather than only existing as a file in the templates folder.
    app_id: Optional[str] = None


@app.get("/api/auto/detect")
async def auto_detect() -> dict[str, Any]:
    """Classify every connected input device and name the best candidate.

    Returns the reasoning for each verdict (which inputs were seen, why the
    device was classified that way), so a wrong guess is diagnosable instead of
    mysterious.
    """
    try:
        detections = await asyncio.to_thread(auto_scan)
        best = await asyncio.to_thread(auto_best, detections)
        return {
            "devices": [d.to_dict() for d in detections],
            "best": best.to_dict() if best else None,
        }
    except Exception as exc:
        logger.error("Auto-detect failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/auto/profile")
async def auto_profile_device(req: AutoProfileRequest) -> dict[str, Any]:
    """Detect the connected hardware and build a matching Steam Input profile."""
    try:
        if req.device_path:
            result = await asyncio.to_thread(
                _auto_profile_for_path, req.device_path, req.target_game,
                req.save, req.app_id,
            )
        else:
            result = await asyncio.to_thread(
                auto_build_profile, req.target_game, req.save, req.app_id
            )
        if result is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No controllable device found. Connect a controller, guitar, "
                    "fightstick or drum kit and try again."
                ),
            )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Auto-profile failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


def auto_save(result: Any, app_id: Optional[str] = None) -> dict[str, Any]:
    """Save-and-publish a generated auto profile, reporting what Steam took."""
    path = template_manager.save_template(result.template)
    compiled = template_manager.last_compile
    payload: dict[str, Any] = {
        "path": str(path),
        "name": result.template.safe_name(),
        "applied": list(getattr(compiled, "applied", []) or []),
        "skipped": list(getattr(compiled, "skipped", []) or []),
        "steam": template_manager.steam_status(),
    }

    if app_id:
        # Publishing a template only puts a file in controller_base/templates.
        # Steam shows a config for a *game* only when the configset for this
        # controller says so, so bind it here as part of "save".
        try:
            payload["assigned"] = game_assigner.assign_template_to_game(
                result.template.safe_name(), app_id,
                template_manager=template_manager,
            )
        except Exception as exc:
            payload["assigned"] = {"error": str(exc)}
            logger.warning("Saved profile but could not assign to app %s: %s",
                           app_id, exc)
    return payload


def _auto_profile_for_path(device_path: str, target_game: str,
                           save: bool) -> Optional[dict[str, Any]]:
    """Auto-profile one specific device rather than the best candidate."""
    detections = auto_scan()
    wanted = next((d for d in detections if d.device_path == device_path), None)
    if wanted is None:
        return None
    result = auto_generate(wanted, target_game)
    payload = result.to_dict()
    if save:
        payload["saved"] = auto_save(result)
    return payload


@app.get("/api/midi/devices")
async def get_midi_devices_list() -> list[dict[str, Any]]:
    """List connected USB-MIDI electronic drums and synthesizers."""
    return list_midi_devices()



# ===================================================================
# REST Endpoints: VDF Templates CRUD & Import / Export
# ===================================================================

@app.get("/api/health")
async def health() -> dict[str, Any]:
    """Liveness probe used by the plugin and the standalone web client."""
    return {
        "ok": True,
        "version": _pkg_version,
        "steam": template_manager.steam_status(),
    }


@app.get("/api/steam/info")
async def steam_info() -> dict[str, Any]:
    """Where DeckForge publishes templates, and whether Steam will see them."""
    return template_manager.steam_status()


@app.get("/api/templates")
async def get_templates() -> list[dict[str, Any]]:
    """List DeckForge vault templates plus Steam's own base templates."""
    try:
        return template_manager.list_templates()
    except Exception as exc:
        logger.error("Error listing templates: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/templates")
async def save_template(req: TemplateSaveRequest) -> dict[str, Any]:
    """Create a template and publish it to Steam."""
    try:
        tpl = req.to_template()
        if not tpl.title:
            raise HTTPException(status_code=400, detail="Template title is required")
        return _save_and_report(tpl)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error saving template: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/templates/{name}")
async def get_template(name: str) -> dict[str, Any]:
    """Load one template as the studio's JSON shape."""
    try:
        return template_manager._find_and_load(name).to_dict()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/templates/{name}")
async def update_template(name: str, req: TemplateSaveRequest) -> dict[str, Any]:
    """Update an existing template in place."""
    try:
        tpl = req.to_template(fallback_name=name)
        return _save_and_report(tpl)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/templates/{name}")
async def delete_template(name: str) -> dict[str, Any]:
    """Delete a template from the vault and from Steam."""
    try:
        template_manager.delete_template(name)
        return {"status": "deleted", "name": name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/templates/{name}/sync")
async def sync_template(name: str) -> dict[str, Any]:
    """Re-publish an existing template into Steam's template directory."""
    try:
        tpl = template_manager._find_and_load(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")

    errors = template_manager.sync_to_steam(tpl)
    status = template_manager.steam_status()
    if errors:
        raise HTTPException(status_code=409, detail="; ".join(errors))
    return {
        "status": "synced",
        "name": name,
        "published_to": str(template_manager.steam.controller_base_templates_dir() / f"{tpl.safe_name()}.vdf"),
        "steam": status,
    }


@app.post("/api/templates/{name}/export")
async def export_template(name: str, req: ExportRequest) -> Response:
    """Export a template as compiled VDF text or DeckForge JSON."""
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
    """Import a template from raw text."""
    try:
        tpl = template_manager.import_template(req.data.encode("utf-8"), fmt=req.format)
        return {"status": "imported", "title": tpl.title, "name": tpl.safe_name()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}")


@app.get("/api/templates/{name}/diff")
async def template_diff(name: str) -> dict[str, Any]:
    """Diff a template against Steam's stock template for its controller type."""
    try:
        tpl = template_manager._find_and_load(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    try:
        from .steam_compiler import _load_skeleton

        stock = VDFTemplate.from_vdf_dict(_load_skeleton(tpl.controller_type))
        return {"template": tpl.title, "diff": diff_templates(tpl, stock)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _save_and_report(tpl: VDFTemplate) -> dict[str, Any]:
    """Persist a template and report what Steam accepted."""
    path = template_manager.save_template(tpl)
    compiled = template_manager.last_compile
    return {
        "status": "success",
        "name": tpl.safe_name(),
        "title": tpl.title,
        "path": str(path),
        "template": tpl.to_dict(),
        "published": compiled is not None and not template_manager.steam_status().get("writable") is False,
        "applied": list(getattr(compiled, "applied", []) or []),
        "skipped": list(getattr(compiled, "skipped", []) or []),
        "steam": template_manager.steam_status(),
    }


# ===================================================================
# REST Endpoints: Game Enumeration & Assignment
# ===================================================================

@app.get("/api/games")
async def list_games() -> list[dict[str, Any]]:
    """List installed Steam games and non-Steam shortcuts.

    Emitted in the studio's ``SteamGame`` shape (``appId`` as an int, camelCase
    fields); the raw enumerator returns snake_case strings suitable for Steam.
    """
    try:
        games: list[dict[str, Any]] = []
        for game in game_assigner.list_all_games():
            raw_id = str(game.get("app_id") or "")
            try:
                app_id = int(raw_id)
            except ValueError:
                app_id = 0
            games.append({
                "appId": app_id,
                "name": game.get("name") or "",
                "installDir": game.get("install_dir") or game.get("start_dir") or "",
                "headerImage": "",
                "assignedTemplate": "",
                "lastPlayed": 0,
                "source": game.get("source") or "steam",
                "appIdRaw": raw_id,
            })
        return games
    except Exception as exc:
        logger.error("Error listing games: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/games/{app_id}/assign")
async def assign_game_template(app_id: str, req: AssignGameRequest) -> dict[str, Any]:
    """Bind a template to a game through Steam's configset indirection."""
    try:
        result = game_assigner.assign_template_to_game(
            req.name, app_id, template_manager=template_manager
        )
        return {"status": "assigned", "app_id": app_id, "template": req.name, **result}
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
