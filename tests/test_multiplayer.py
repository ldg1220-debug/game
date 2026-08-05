"""멀티플레이 테스트.

Phase 8이 지켜야 할 것은 셋이다.

  1. **대전 결과를 클라이언트가 정하지 못한다** — seed도 판정도 서버가 한다
  2. **거래에서 막판 바꿔치기가 불가능하다** — 내용이 바뀌면 잠금이 풀린다
  3. **무슨 일이 있었는지 기록이 남는다** — 사기를 되돌리려면 근거가 필요하다

특히 둘째가 헌장이 지목한 "거래 사기 복구 부재"의 핵심이다. 원자적 교환은
사기를 덜 일어나게 할 뿐이고, 잠금이 안 풀리면 원자적이든 아니든 상대가
확인한 뒤 품목을 바꿔치기할 수 있다.

판정 서비스(Node)는 가짜로 갈아끼운다. pytest가 Node 프로세스를 띄워야만
돌아간다면 아무도 테스트를 돌리지 않게 된다. 진짜 판정은 vitest가
tests/verify.test.ts 에서 확인한다.
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from server.arbiter import ArbiterError, get_arbiter
from server.hub import Hub, get_hub
from server.main import app, get_session


class FakeArbiter:
    """판정 서비스 대역.

    받은 요청을 기록해 두어 "서버가 정말 저장된 세이브를 보냈는가"를 확인할 수
    있게 한다. 결과는 seed에서 만들어 결정론을 흉내낸다.
    """

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.reject: list[str] = []
        self.raises: Exception | None = None

    def duel(self, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        if self.raises is not None:
            raise self.raises
        self.calls.append(body)
        if self.reject:
            return 422, {
                "ok": False,
                "rejected": [
                    {"playerId": p, "issues": [{"where": "party[0].growth", "message": "상한 초과", "kind": "tamper"}]}
                    for p in self.reject
                ],
            }
        seed = body["seed"]
        return 200, {
            "ok": True,
            "seed": seed,
            "winner": "a" if seed % 2 == 0 else "b",
            "endedBy": "defeat",
            "rounds": 3 + seed % 5,
            "digest": f"{seed:08x}",
            "log": [{"type": "battleStart", "allies": ["a:hero"], "enemies": ["b:hero"]}],
            "sides": {
                "a": {"playerId": body["a"]["playerId"], "stance": body["a"]["stance"], "roster": []},
                "b": {"playerId": body["b"]["playerId"], "stance": body["b"]["stance"], "roster": []},
            },
        }


@pytest.fixture(name="arbiter")
def arbiter_fixture() -> FakeArbiter:
    return FakeArbiter()


@pytest.fixture(name="hub")
def hub_fixture() -> Hub:
    return Hub()


@pytest.fixture(name="client")
def client_fixture(arbiter: FakeArbiter, hub: Hub) -> Iterator[TestClient]:
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
    app.dependency_overrides[get_arbiter] = lambda: arbiter
    app.dependency_overrides[get_hub] = lambda: hub
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def put_save(client: TestClient, player_id: str, level: int = 20) -> None:
    client.post(
        "/saves",
        json={
            "player_id": player_id,
            "version": 2,
            "payload": {"version": 2, "character": {"name": player_id, "level": level}},
        },
    )


# ─────────────── 대전 ───────────────


def test_duel_uses_stored_saves(client: TestClient, arbiter: FakeArbiter) -> None:
    """서버가 저장된 세이브를 꺼내 판정에 넘긴다. 요청에는 세이브가 없다."""
    put_save(client, "u1", 21)
    put_save(client, "u2", 33)

    res = client.post(
        "/duels",
        json={"player_a": "u1", "player_b": "u2", "stance_a": "aggressive", "stance_b": "defensive"},
    )
    assert res.status_code == 201, res.text

    sent = arbiter.calls[-1]
    assert sent["a"]["save"]["character"]["level"] == 21
    assert sent["b"]["save"]["character"]["level"] == 33
    assert sent["a"]["stance"] == "aggressive"


def test_client_cannot_choose_seed(client: TestClient, arbiter: FakeArbiter) -> None:
    """seed를 요청에 실어도 무시된다.

    결정론 엔진에서 seed를 고를 수 있으면 유리한 seed가 나올 때까지 미리
    돌려보고 그때 요청을 보낼 수 있다. 그건 곧 결과 조작이다.
    """
    put_save(client, "u1")
    put_save(client, "u2")

    seeds = set()
    for _ in range(8):
        res = client.post(
            "/duels",
            json={
                "player_a": "u1",
                "player_b": "u2",
                "stance_a": "aggressive",
                "stance_b": "aggressive",
                "seed": 7,
            },
        )
        assert res.status_code == 201
        seeds.add(res.json()["seed"])

    assert 7 not in seeds
    #  서버가 매번 새로 뽑으므로 같은 값이 여덟 번 나올 리 없다
    assert len(seeds) > 1


def test_client_cannot_submit_result(client: TestClient) -> None:
    """결과를 실어 보내도 반영되지 않는다."""
    put_save(client, "u1")
    put_save(client, "u2")
    res = client.post(
        "/duels",
        json={
            "player_a": "u1",
            "player_b": "u2",
            "stance_a": "aggressive",
            "stance_b": "aggressive",
            "winner": "a",
            "rounds": 999,
        },
    )
    assert res.status_code == 201
    assert res.json()["rounds"] != 999


def test_duel_is_recorded_and_replayable(client: TestClient) -> None:
    """seed와 로그가 함께 남아야 나중에 다시 돌려볼 수 있다."""
    put_save(client, "u1")
    put_save(client, "u2")
    made = client.post(
        "/duels",
        json={"player_a": "u1", "player_b": "u2", "stance_a": "aggressive", "stance_b": "aggressive"},
    ).json()

    got = client.get(f"/duels/{made['id']}").json()
    assert got["seed"] == made["seed"]
    assert got["log"] == made["log"]
    assert got["digest"] == made["digest"]

    rows = client.get("/players/u1/duels").json()
    assert len(rows) == 1
    assert rows[0]["id"] == made["id"]


def test_duel_rejects_tampered_save(client: TestClient, arbiter: FakeArbiter) -> None:
    """판정 서비스가 거절하면 대전이 성립하지 않고 이유가 그대로 온다."""
    put_save(client, "honest")
    put_save(client, "cheat")
    arbiter.reject = ["cheat"]

    res = client.post(
        "/duels",
        json={"player_a": "honest", "player_b": "cheat", "stance_a": "aggressive", "stance_b": "aggressive"},
    )
    assert res.status_code == 422
    rejected = res.json()["detail"]["rejected"]
    assert [r["playerId"] for r in rejected] == ["cheat"]
    #  거절된 판은 기록에 남지 않는다
    assert client.get("/players/honest/duels").json() == []


def test_duel_needs_both_saves(client: TestClient) -> None:
    put_save(client, "u1")
    res = client.post(
        "/duels",
        json={"player_a": "u1", "player_b": "nobody", "stance_a": "aggressive", "stance_b": "aggressive"},
    )
    assert res.status_code == 404


def test_duel_with_self_is_rejected(client: TestClient) -> None:
    put_save(client, "u1")
    res = client.post(
        "/duels",
        json={"player_a": "u1", "player_b": "u1", "stance_a": "aggressive", "stance_b": "aggressive"},
    )
    assert res.status_code == 400


def test_arbiter_down_only_breaks_duels(client: TestClient, arbiter: FakeArbiter) -> None:
    """판정 서비스가 죽어도 나머지 기능은 계속 돌아야 한다."""
    put_save(client, "u1")
    put_save(client, "u2")
    arbiter.raises = ArbiterError("연결 거부")

    res = client.post(
        "/duels",
        json={"player_a": "u1", "player_b": "u2", "stance_a": "aggressive", "stance_b": "aggressive"},
    )
    assert res.status_code == 503
    #  세이브와 거래는 멀쩡하다
    assert client.get("/saves/u1/latest").status_code == 200
    assert client.post("/trades", json={"player_a": "u1", "player_b": "u2"}).status_code == 201


# ─────────────── 거래 ───────────────


def open_trade(client: TestClient, a: str = "u1", b: str = "u2") -> int:
    res = client.post("/trades", json={"player_a": a, "player_b": b})
    assert res.status_code == 201
    return int(res.json()["id"])


def offer(client: TestClient, tid: int, who: str, items: list[dict[str, Any]], stones: int = 0):
    return client.put(f"/trades/{tid}/offer", json={"player_id": who, "items": items, "stones": stones})


def lock(client: TestClient, tid: int, who: str):
    return client.post(f"/trades/{tid}/lock", json={"player_id": who})


def confirm(client: TestClient, tid: int, who: str):
    return client.post(f"/trades/{tid}/confirm", json={"player_id": who})


def test_trade_happy_path(client: TestClient) -> None:
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "ropeFine", "qty": 2}])
    offer(client, tid, "u2", [], stones=500)

    assert lock(client, tid, "u1").json()["state"] == "open"
    assert lock(client, tid, "u2").json()["state"] == "locked"
    assert confirm(client, tid, "u1").json()["state"] == "locked"

    done = confirm(client, tid, "u2").json()
    assert done["state"] == "completed"
    assert done["stones_b"] == 500
    assert done["offer_a"] == [{"item_id": "ropeFine", "qty": 2}]


def test_changing_offer_clears_both_locks(client: TestClient) -> None:
    """막판 바꿔치기 방지 — 여기가 이 기능의 존재 이유다.

    상대가 내용을 확인하고 잠근 뒤에 조용히 품목을 바꿀 수 있으면, 잠금은
    아무것도 지키지 못한다. 원작의 거래 사기는 대부분 이 수법이었다.
    """
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "ropeMaster", "qty": 1}])
    offer(client, tid, "u2", [], stones=1500)
    lock(client, tid, "u1")
    assert lock(client, tid, "u2").json()["state"] == "locked"

    #  u1이 명인의 밧줄을 거친 밧줄로 바꿔치기한다
    after = offer(client, tid, "u1", [{"item_id": "ropeCrude", "qty": 1}]).json()
    assert after["state"] == "open"
    assert after["locked_a"] is False
    assert after["locked_b"] is False

    #  u2가 다시 잠그지 않는 한 확정은 불가능하다
    assert confirm(client, tid, "u2").status_code == 409


def test_confirm_requires_both_locks(client: TestClient) -> None:
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "herbSmall", "qty": 1}])
    lock(client, tid, "u1")
    #  한쪽만 잠근 상태에서는 확정할 수 없다
    assert confirm(client, tid, "u1").status_code == 409


def test_changing_offer_clears_confirmations(client: TestClient) -> None:
    """확정까지 갔다가 내용이 바뀌면 확정도 함께 풀린다."""
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "herbLarge", "qty": 3}])
    lock(client, tid, "u1")
    lock(client, tid, "u2")
    confirm(client, tid, "u1")

    after = offer(client, tid, "u2", [{"item_id": "meatChunk", "qty": 1}]).json()
    assert after["confirmed_a"] is False
    assert after["confirmed_b"] is False
    assert after["state"] == "open"


def test_cancel_is_terminal(client: TestClient) -> None:
    tid = open_trade(client)
    cancelled = client.post(f"/trades/{tid}/cancel", json={"player_id": "u2"}).json()
    assert cancelled["state"] == "cancelled"
    assert cancelled["cancelled_by"] == "u2"

    #  끝난 거래는 더 못 건드린다
    assert lock(client, tid, "u1").status_code == 409
    assert offer(client, tid, "u1", []).status_code == 409
    assert client.post(f"/trades/{tid}/cancel", json={"player_id": "u1"}).status_code == 409


def test_completed_is_terminal(client: TestClient) -> None:
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "herbSmall", "qty": 1}])
    lock(client, tid, "u1")
    lock(client, tid, "u2")
    confirm(client, tid, "u1")
    confirm(client, tid, "u2")

    assert offer(client, tid, "u1", []).status_code == 409
    assert client.post(f"/trades/{tid}/cancel", json={"player_id": "u1"}).status_code == 409


def test_outsider_cannot_touch_trade(client: TestClient) -> None:
    """당사자가 아니면 손댈 수 없다."""
    tid = open_trade(client, "u1", "u2")
    assert offer(client, tid, "stranger", [{"item_id": "herbSmall", "qty": 1}]).status_code == 403
    assert lock(client, tid, "stranger").status_code == 403
    assert client.post(f"/trades/{tid}/cancel", json={"player_id": "stranger"}).status_code == 403


def test_trade_with_self_is_rejected(client: TestClient) -> None:
    assert client.post("/trades", json={"player_a": "u1", "player_b": "u1"}).status_code == 400


def test_audit_log_records_every_transition(client: TestClient) -> None:
    """감사 로그가 헌장이 말한 "복구"의 근거다.

    끝난 거래에도 남아 있어야 하고, 각 줄은 **그 시점의** 내용을 담아야 한다.
    지금 상태만 보관하면 바꿔치기가 있었다는 사실 자체가 사라진다.
    """
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "ropeMaster", "qty": 1}])
    lock(client, tid, "u1")
    lock(client, tid, "u2")
    offer(client, tid, "u1", [{"item_id": "ropeCrude", "qty": 1}])
    lock(client, tid, "u1")
    lock(client, tid, "u2")
    confirm(client, tid, "u1")
    confirm(client, tid, "u2")

    events = client.get(f"/trades/{tid}/events").json()
    actions = [e["action"] for e in events]
    assert actions == [
        "created", "offer", "lock", "lock", "offer", "lock", "lock", "confirm", "completed",
    ]

    #  바꿔치기 전후가 각각 남아 있다
    offers = [e["snapshot"]["offerA"] for e in events if e["action"] == "offer"]
    assert offers[0] == [{"item_id": "ropeMaster", "qty": 1}]
    assert offers[1] == [{"item_id": "ropeCrude", "qty": 1}]

    #  잠금이 풀렸다는 것도 기록에 남는다
    reset = events[4]["snapshot"]
    assert reset["lockedA"] is False and reset["lockedB"] is False


def test_audit_survives_cancel(client: TestClient) -> None:
    tid = open_trade(client)
    offer(client, tid, "u1", [{"item_id": "honeyJar", "qty": 2}])
    client.post(f"/trades/{tid}/cancel", json={"player_id": "u1"})
    events = client.get(f"/trades/{tid}/events").json()
    assert [e["action"] for e in events] == ["created", "offer", "cancelled"]


def test_too_many_items_rejected(client: TestClient) -> None:
    tid = open_trade(client)
    items = [{"item_id": f"item{i}", "qty": 1} for i in range(50)]
    assert offer(client, tid, "u1", items).status_code == 400


def test_negative_stones_rejected(client: TestClient) -> None:
    tid = open_trade(client)
    assert offer(client, tid, "u1", [], stones=-100).status_code == 422


# ─────────────── 길드 ───────────────


def test_guild_lifecycle(client: TestClient) -> None:
    g = client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"}).json()
    assert g["leader_id"] == "u1"
    assert g["members"] == [{"player_id": "u1", "role": "leader"}]

    joined = client.post(f"/guilds/{g['id']}/join", json={"player_id": "u2"}).json()
    assert len(joined["members"]) == 2

    left = client.post(f"/guilds/{g['id']}/leave", json={"player_id": "u2"}).json()
    assert len(left["members"]) == 1


def test_one_guild_per_player(client: TestClient) -> None:
    a = client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"}).json()
    client.post("/guilds", json={"name": "바람뼈", "leader_id": "u3"})
    client.post(f"/guilds/{a['id']}/join", json={"player_id": "u2"})
    #  이미 속해 있으면 다른 길드에 못 들어간다
    assert client.post("/guilds/2/join", json={"player_id": "u2"}).status_code == 409
    assert client.post("/guilds", json={"name": "새길드", "leader_id": "u2"}).status_code == 409


def test_duplicate_guild_name_rejected(client: TestClient) -> None:
    client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"})
    assert client.post("/guilds", json={"name": "돌망치", "leader_id": "u2"}).status_code == 409


def test_leader_must_hand_over_before_leaving(client: TestClient) -> None:
    """길드장이 그냥 나가면 주인 없는 길드가 남는다."""
    g = client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"}).json()
    client.post(f"/guilds/{g['id']}/join", json={"player_id": "u2"})

    assert client.post(f"/guilds/{g['id']}/leave", json={"player_id": "u1"}).status_code == 409

    handed = client.post(
        f"/guilds/{g['id']}/leader", json={"player_id": "u1", "new_leader_id": "u2"}
    ).json()
    assert handed["leader_id"] == "u2"
    assert {m["player_id"]: m["role"] for m in handed["members"]} == {"u1": "member", "u2": "leader"}

    assert client.post(f"/guilds/{g['id']}/leave", json={"player_id": "u1"}).status_code == 200


def test_only_leader_can_hand_over(client: TestClient) -> None:
    g = client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"}).json()
    client.post(f"/guilds/{g['id']}/join", json={"player_id": "u2"})
    res = client.post(f"/guilds/{g['id']}/leader", json={"player_id": "u2", "new_leader_id": "u2"})
    assert res.status_code == 403


def test_my_guild_lookup(client: TestClient) -> None:
    client.post("/guilds", json={"name": "돌망치", "leader_id": "u1"})
    assert client.get("/players/u1/guild").json()["name"] == "돌망치"
    assert client.get("/players/nobody/guild").status_code == 404


# ─────────────── 실시간 ───────────────


def test_ws_room_presence(client: TestClient) -> None:
    """같은 방 사람들끼리 서로가 보인다."""
    with client.websocket_connect("/ws/u1") as w1:
        assert w1.receive_json()["type"] == "welcome"
        w1.send_json({"type": "join", "room": "meadow"})
        assert w1.receive_json() == {"type": "roomState", "room": "meadow", "players": []}

        with client.websocket_connect("/ws/u2") as w2:
            assert w2.receive_json()["type"] == "welcome"
            w2.send_json({"type": "join", "room": "meadow"})
            state = w2.receive_json()
            assert [p["playerId"] for p in state["players"]] == ["u1"]
            #  있던 사람에게는 들어왔다고 알린다
            assert w1.receive_json() == {"type": "joined", "playerId": "u2"}

            w2.send_json({"type": "move", "x": 3.5, "y": 4.0, "facing": "left"})
            moved = w1.receive_json()
            assert moved == {"type": "moved", "playerId": "u2", "x": 3.5, "y": 4.0, "facing": "left"}

            w1.send_json({"type": "chat", "text": "안녕"})
            #  대화는 보낸 사람에게도 돌아온다 — 내 말이 갔는지 확인해야 한다
            assert w1.receive_json() == {"type": "chat", "playerId": "u1", "text": "안녕"}
            assert w2.receive_json() == {"type": "chat", "playerId": "u1", "text": "안녕"}


def test_ws_rooms_are_separate(client: TestClient) -> None:
    with client.websocket_connect("/ws/u1") as w1, client.websocket_connect("/ws/u2") as w2:
        w1.receive_json()
        w2.receive_json()
        w1.send_json({"type": "join", "room": "meadow"})
        w1.receive_json()
        w2.send_json({"type": "join", "room": "marsh"})
        w2.receive_json()

        w2.send_json({"type": "chat", "text": "여기 늪이다"})
        #  다른 방 사람에게는 안 간다. 대신 자기에게는 돌아온다.
        assert w2.receive_json()["text"] == "여기 늪이다"
        w1.send_json({"type": "chat", "text": "여기 초원이다"})
        assert w1.receive_json()["text"] == "여기 초원이다"


def test_ws_unknown_message_is_answered_not_fatal(client: TestClient) -> None:
    with client.websocket_connect("/ws/u1") as w:
        w.receive_json()
        w.send_json({"type": "춤추기"})
        assert w.receive_json()["type"] == "error"
        #  연결은 살아 있다
        w.send_json({"type": "join", "room": "village"})
        assert w.receive_json()["type"] == "roomState"


def test_ws_move_before_join_is_ignored(client: TestClient) -> None:
    with client.websocket_connect("/ws/u1") as w:
        w.receive_json()
        w.send_json({"type": "move", "x": 1, "y": 1})
        w.send_json({"type": "join", "room": "village"})
        #  move에 답이 없어야 다음 메시지가 roomState다
        assert w.receive_json()["type"] == "roomState"


def test_http_events_notify_connected_players(client: TestClient) -> None:
    """거래는 HTTP로 일어나지만 알림은 접속 통로로 간다."""
    with client.websocket_connect("/ws/u1") as w1:
        w1.receive_json()
        tid = open_trade(client, "u1", "u2")
        offer(client, tid, "u1", [{"item_id": "herbSmall", "qty": 1}])
        msg = w1.receive_json()
        assert msg["type"] == "tradeUpdated"
        assert msg["tradeId"] == tid


def test_hub_forgets_disconnected(client: TestClient, hub: Hub) -> None:
    with client.websocket_connect("/ws/u1") as w:
        w.receive_json()
        w.send_json({"type": "join", "room": "meadow"})
        w.receive_json()
        assert hub.members("meadow") == {"u1"}
    assert hub.members("meadow") == set()
    assert hub.online() == 0
