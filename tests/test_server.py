"""백엔드 테스트.

세이브 보관소가 지켜야 할 것은 셋이다.
  1. 넣은 걸 그대로 돌려준다 (서버가 내용을 해석하지 않는다)
  2. 덮어쓰지 않고 세대를 쌓되, 무한히 쌓지는 않는다
  3. 남의 세이브가 섞이지 않는다
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from server.main import MAX_HISTORY, app, get_session


@pytest.fixture(name="client")
def client_fixture() -> Iterator[TestClient]:
    """테스트마다 새 인메모리 DB. 파일을 쓰면 테스트끼리 상태가 샌다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def payload(level: int = 5) -> dict[str, Any]:
    """세이브 흉내. 서버는 내용을 모르므로 모양만 있으면 된다."""
    return {
        "version": 2,
        "character": {"name": "탐험가", "level": level},
        "party": [{"uid": "p1", "speciesId": "emberfox"}],
        "한글": "그대로 돌아와야 한다",
    }


def test_health_returns_ok(client: TestClient) -> None:
    """헬스체크가 200과 status=ok를 돌려준다."""
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


def test_save_round_trips_untouched(client: TestClient) -> None:
    """넣은 payload가 글자 하나 안 바뀌고 돌아온다."""
    body = payload()
    res = client.post("/saves", json={"player_id": "u1", "version": 2, "payload": body})
    assert res.status_code == 201
    assert res.json()["payload"] == body

    got = client.get("/saves/u1/latest")
    assert got.status_code == 200
    assert got.json()["payload"] == body


def test_latest_returns_most_recent(client: TestClient) -> None:
    """덮어쓰지 않고 쌓되, 최신을 돌려준다."""
    for level in (5, 9, 21):
        client.post("/saves", json={"player_id": "u1", "version": 2, "payload": payload(level)})

    latest = client.get("/saves/u1/latest").json()
    assert latest["payload"]["character"]["level"] == 21

    rows = client.get("/saves/u1").json()
    assert len(rows) == 3
    # 최신 순
    assert rows[0]["id"] > rows[-1]["id"]


def test_history_is_capped(client: TestClient) -> None:
    """무한히 쌓이지 않는다. 넘치면 오래된 것부터 사라진다."""
    for level in range(1, MAX_HISTORY + 4):
        client.post("/saves", json={"player_id": "u1", "version": 2, "payload": payload(level)})

    rows = client.get("/saves/u1").json()
    assert len(rows) == MAX_HISTORY
    # 남은 것 중 가장 최근은 마지막으로 저장한 것이다
    assert client.get("/saves/u1/latest").json()["payload"]["character"]["level"] == MAX_HISTORY + 3


def test_slots_are_independent(client: TestClient) -> None:
    """슬롯이 다르면 서로를 밀어내지 않는다."""
    client.post("/saves", json={"player_id": "u1", "slot": "main", "version": 2, "payload": payload(5)})
    client.post("/saves", json={"player_id": "u1", "slot": "backup", "version": 2, "payload": payload(40)})

    assert client.get("/saves/u1/latest", params={"slot": "main"}).json()["payload"]["character"]["level"] == 5
    assert client.get("/saves/u1/latest", params={"slot": "backup"}).json()["payload"]["character"]["level"] == 40
    assert len(client.get("/saves/u1").json()) == 2


def test_players_are_isolated(client: TestClient) -> None:
    """남의 세이브가 섞이지 않는다."""
    client.post("/saves", json={"player_id": "u1", "version": 2, "payload": payload(5)})
    client.post("/saves", json={"player_id": "u2", "version": 2, "payload": payload(40)})

    assert len(client.get("/saves/u1").json()) == 1
    assert client.get("/saves/u1/latest").json()["payload"]["character"]["level"] == 5
    assert client.get("/saves/u2/latest").json()["payload"]["character"]["level"] == 40


def test_missing_save_is_404(client: TestClient) -> None:
    """없는 세이브는 404다. 빈 객체를 돌려주면 클라이언트가 빈 상태로 덮어쓴다."""
    assert client.get("/saves/nobody/latest").status_code == 404
    assert client.get("/saves/nobody").json() == []


def test_oversized_save_is_rejected(client: TestClient) -> None:
    """지나치게 큰 세이브는 거절한다."""
    huge = {"blob": "가" * 400_000}
    res = client.post("/saves", json={"player_id": "u1", "version": 2, "payload": huge})
    assert res.status_code == 413


def test_bad_request_is_422(client: TestClient) -> None:
    """필수 필드가 빠지거나 범위를 벗어나면 거절한다."""
    assert client.post("/saves", json={"version": 2, "payload": {}}).status_code == 422
    assert client.post("/saves", json={"player_id": "", "version": 2, "payload": {}}).status_code == 422
    assert client.post("/saves", json={"player_id": "u1", "version": 0, "payload": {}}).status_code == 422
