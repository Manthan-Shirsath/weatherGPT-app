import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.app.core.websocket import ws_manager

logger = logging.getLogger("skycast.ws_route")

router = APIRouter(tags=["WebSocket"])

@router.websocket("/ws/weather")
async def websocket_weather_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time live weather updates.
    Clients can listen to live push broadcasts or send subscription messages.
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial welcome and status
        await websocket.send_json({
            "type": "connection_established",
            "message": "Connected to Skycast live meteorological WebSocket stream."
        })

        while True:
            text_data = await websocket.receive_text()
            try:
                msg = json.loads(text_data)
                action = msg.get("action")
                if action == "subscribe" and msg.get("city"):
                    ws_manager.subscribe(websocket, msg.get("city"))
                    await websocket.send_json({
                        "type": "subscription_confirmed",
                        "city": msg.get("city")
                    })
                elif action == "unsubscribe" and msg.get("city"):
                    ws_manager.unsubscribe(websocket, msg.get("city"))
                    await websocket.send_json({
                        "type": "unsubscription_confirmed",
                        "city": msg.get("city")
                    })
                elif action == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.error("WebSocket unexpected error: %s", exc)
        ws_manager.disconnect(websocket)
