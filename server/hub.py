"""실시간 연결 허브.

방 하나에 있는 사람들에게 서로의 위치와 말을 전한다. 그게 전부다.

**게임 상태는 이 통로로 오가지 않는다.** 위치와 대화는 조작돼도 남의 게임을
망가뜨리지 않지만 전투 결과와 거래는 그렇지 않고, 그래서 그쪽은 검증과 기록이
있는 HTTP 경로로만 간다. 실시간 통로를 "빠르니까"라는 이유로 상태 변경에 쓰기
시작하면, 검증을 붙일 자리가 없어진 뒤에 그걸 깨닫게 된다.

연결은 메모리에만 있다. 서버를 여러 대로 늘리면 이 허브는 그대로 못 쓰고
Redis 같은 것이 필요하다 — 지금 그걸 넣지 않는 이유는, 넣어도 확인할 방법이
없어서 맞게 짰는지 알 수 없기 때문이다. 그때 가서 바꾼다.
"""

from __future__ import annotations

from typing import Any, Protocol

from fastapi import WebSocket

#  한 방에 들어갈 수 있는 인원. 넘으면 브로드캐스트 비용이 인원 제곱으로 는다.
MAX_ROOM = 64
#  대화 한 줄의 길이 상한.
MAX_CHAT = 300


class Connection(Protocol):
    """테스트가 가짜를 끼울 수 있도록 최소한만 요구한다."""

    async def accept(self) -> None:
        ...

    async def send_json(self, data: Any) -> None:
        ...


class Hub:
    def __init__(self) -> None:
        #  player_id -> 연결
        self._conns: dict[str, Connection] = {}
        #  player_id -> 방 id
        self._room_of: dict[str, str] = {}
        #  방 id -> player_id 집합
        self._rooms: dict[str, set[str]] = {}
        #  player_id -> 마지막으로 알린 위치
        self._where: dict[str, dict[str, Any]] = {}

    # ── 연결 ──

    async def connect(self, player_id: str, ws: Connection) -> None:
        await ws.accept()
        #  같은 id로 다시 붙으면 이전 연결은 버린다. 두 창을 띄웠을 때 위치가
        #  두 개로 갈라져 서로를 밀어내는 걸 막는다.
        await self.disconnect(player_id, notify=False)
        self._conns[player_id] = ws
        await ws.send_json({"type": "welcome", "playerId": player_id})

    async def disconnect(self, player_id: str, notify: bool = True) -> None:
        self._conns.pop(player_id, None)
        self._where.pop(player_id, None)
        room = self._room_of.pop(player_id, None)
        if room is None:
            return
        members = self._rooms.get(room)
        if members is not None:
            members.discard(player_id)
            if not members:
                del self._rooms[room]
        if notify:
            await self._broadcast(room, {"type": "left", "playerId": player_id})

    # ── 방 ──

    async def join(self, player_id: str, room: str) -> None:
        previous = self._room_of.get(player_id)
        if previous == room:
            return
        if previous is not None:
            members = self._rooms.get(previous)
            if members is not None:
                members.discard(player_id)
                if not members:
                    del self._rooms[previous]
            await self._broadcast(previous, {"type": "left", "playerId": player_id})

        members = self._rooms.setdefault(room, set())
        if len(members) >= MAX_ROOM:
            await self._send(player_id, {"type": "error", "message": "방이 가득 찼다"})
            return
        members.add(player_id)
        self._room_of[player_id] = room

        #  들어온 사람에게는 지금 있는 사람들을, 있던 사람들에게는 들어왔다는 것을
        await self._send(
            player_id,
            {
                "type": "roomState",
                "room": room,
                "players": [
                    {"playerId": p, **self._where.get(p, {})} for p in sorted(members) if p != player_id
                ],
            },
        )
        await self._broadcast(room, {"type": "joined", "playerId": player_id}, exclude=player_id)

    # ── 메시지 ──

    async def handle(self, player_id: str, msg: Any) -> None:
        if not isinstance(msg, dict):
            await self._send(player_id, {"type": "error", "message": "메시지가 객체가 아니다"})
            return
        kind = msg.get("type")

        if kind == "join":
            room = msg.get("room")
            if not isinstance(room, str) or not room:
                await self._send(player_id, {"type": "error", "message": "room이 없다"})
                return
            await self.join(player_id, room)
            return

        if kind == "move":
            room = self._room_of.get(player_id)
            if room is None:
                return
            x, y = msg.get("x"), msg.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return
            where = {"x": float(x), "y": float(y), "facing": str(msg.get("facing", "down"))[:12]}
            self._where[player_id] = where
            await self._broadcast(room, {"type": "moved", "playerId": player_id, **where}, exclude=player_id)
            return

        if kind == "chat":
            room = self._room_of.get(player_id)
            text = msg.get("text")
            if room is None or not isinstance(text, str):
                return
            await self._broadcast(room, {"type": "chat", "playerId": player_id, "text": text[:MAX_CHAT]})
            return

        await self._send(player_id, {"type": "error", "message": f"모르는 메시지 — {kind}"})

    # ── 서버가 미는 알림 ──

    async def notify(self, player_ids: list[str], payload: dict[str, Any]) -> None:
        """거래·대전처럼 HTTP로 일어난 일을 접속 중인 당사자에게 알린다."""
        for pid in player_ids:
            await self._send(pid, payload)

    # ── 내부 ──

    async def _send(self, player_id: str, payload: dict[str, Any]) -> None:
        ws = self._conns.get(player_id)
        if ws is None:
            return
        try:
            await ws.send_json(payload)
        except Exception:
            #  보내다 끊긴 연결은 조용히 정리한다. 여기서 예외가 올라가면
            #  한 사람이 끊겼다는 이유로 브로드캐스트 전체가 중단된다.
            await self.disconnect(player_id, notify=False)

    async def _broadcast(self, room: str, payload: dict[str, Any], exclude: str | None = None) -> None:
        for pid in list(self._rooms.get(room, set())):
            if pid != exclude:
                await self._send(pid, payload)

    # ── 조회(테스트·운영용) ──

    def room_of(self, player_id: str) -> str | None:
        return self._room_of.get(player_id)

    def members(self, room: str) -> set[str]:
        return set(self._rooms.get(room, set()))

    def online(self) -> int:
        return len(self._conns)


_hub = Hub()


def get_hub() -> Hub:
    """요청마다 허브를 얻는다. 테스트가 갈아끼울 수 있게 의존성으로 둔다."""
    return _hub
