import logging
import json
from typing import List, Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("skycast.ws")

class WebSocketManager:
    """Manages active WebSocket client connections and broadcasts live weather updates."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.city_subscriptions: Dict[WebSocket, Set[str]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.city_subscriptions[websocket] = set()
        logger.info("🔌 [WS CONNECTED] Total clients: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.city_subscriptions:
            del self.city_subscriptions[websocket]
        logger.info("🔌 [WS DISCONNECTED] Total clients: %d", len(self.active_connections))

    def subscribe(self, websocket: WebSocket, city: str):
        if websocket in self.city_subscriptions:
            self.city_subscriptions[websocket].add(city.strip().lower())
            logger.info("📡 [WS SUBSCRIBED] Client subscribed to '%s'", city)

    def unsubscribe(self, websocket: WebSocket, city: str):
        if websocket in self.city_subscriptions:
            self.city_subscriptions[websocket].discard(city.strip().lower())
            logger.info("📡 [WS UNSUBSCRIBED] Client unsubscribed from '%s'", city)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return

        dead_connections = []
        city_target = message.get("city", "").strip().lower()

        for connection in self.active_connections:
            # If the message targets a specific city, enforce subscription filtering.
            # If a client hasn't subscribed to ANY city, we don't send targeted messages.
            if city_target:
                subs = self.city_subscriptions.get(connection, set())
                if city_target not in subs:
                    continue

            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)

    async def broadcast_weather_update(self, city_name: str, payload: dict):
        """Broadcast live weather refresh to all connected clients."""
        msg = {
            "type": "weather_update",
            "city": city_name,
            "data": payload
        }
        await self.broadcast(msg)

    async def broadcast_radar_update(self, radar_meta: dict):
        """Broadcast new radar frame metadata to all connected clients."""
        msg = {
            "type": "radar_update",
            "data": radar_meta
        }
        await self.broadcast(msg)

ws_manager = WebSocketManager()
