"""멀티플레이 테스트.

Phase 8이 지켜야 할 것은 넷이다.

  1. **대전 결과를 클라이언트가 정하지 못한다** — seed도 판정도 서버가 한다
  2. **거래에서 막판 바꿔치기가 불가능하다** — 내용이 바뀌면 잠금이 풀린다
  3. **무슨 일이 있었는지 기록이 남는다** — 사기를 되돌리려면 근거가 필요하다
  4. **행위자는 본인만 될 수 있다** — 토큰이 정하고, 본문의 id는 못 믿는다

넷째는 나중에 추가됐다. `player_id`를 본문·경로에서 받아 그대로 믿던 시절엔
앞의 셋을 아무리 촘촘히 지켜도 남의 id를 적어 남의 대전·거래·길드를 조작할 수
있었다 — 검증은 "무엇을 하는가"만 보고 "누가 하는가"는 안 봤기 때문이다.

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


#  모든 계정이 같은 비밀번호를 쓴다. 각 테스트가 인증 자체를 다루는 게 아니면
#  비밀번호는 그냥 잡음이다.
PASSWORD = "correct horse battery staple"

Auth = dict[str, str]


def signup(client: TestClient, player_id: str) -> Auth:
    """계정을 만들고 인증 헤더를 돌려준다. 이후 모든 헬퍼가 이 헤더를 쓴다."""
    res = client.post("/auth/register", json={"player_id": player_id, "password": PASSWORD})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def put_save(client: TestClient, auth: Auth, level: int = 20, name: str = "player") -> None:
    res = client.post(
        "/saves",
        headers=auth,
        json={
            "version": 2,
            "payload": {"version": 2, "character": {"name": name, "level": level}},
        },
    )
    assert res.status_code == 201, res.text


# ─────────────── 인증 ───────────────


def test_register_then_use_token(client: TestClient) -> None:
    auth = signup(client, "u1")
    res = client.get("/auth/me", headers=auth)
    assert res.status_code == 200
    assert res.json()["player_id"] == "u1"


def test_no_token_is_rejected(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401
    assert client.get("/saves").status_code == 401
    assert client.post("/saves", json={"version": 2, "payload": {}}).status_code == 401


def test_garbage_token_is_rejected(client: TestClient) -> None:
    # HTTP 헤더값은 라틴-1이라 한글은 애초에 못 보낸다 — ASCII 쓰레기로 확인한다.
    res = client.get("/auth/me", headers={"Authorization": "Bearer no-such-token-exists"})
    assert res.status_code == 401


def test_malformed_authorization_header_is_rejected(client: TestClient) -> None:
    signup(client, "u1")
    assert client.get("/auth/me", headers={"Authorization": "just-garbage"}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Basic dTpw"}).status_code == 401


def test_duplicate_registration_is_rejected(client: TestClient) -> None:
    signup(client, "u1")
    res = client.post("/auth/register", json={"player_id": "u1", "password": PASSWORD})
    assert res.status_code == 409


def test_login_with_right_password(client: TestClient) -> None:
    signup(client, "u1")
    res = client.post("/auth/login", json={"player_id": "u1", "password": PASSWORD})
    assert res.status_code == 200
    assert res.json()["player_id"] == "u1"


def test_login_with_wrong_password_is_rejected(client: TestClient) -> None:
    signup(client, "u1")
    res = client.post("/auth/login", json={"player_id": "u1", "password": "다른비밀번호12345"})
    assert res.status_code == 401


def test_login_to_nonexistent_account_gives_same_error(client: TestClient) -> None:
    """없는 계정과 틀린 비밀번호가 같은 메시지여야 한다.

    다르면 응답만 보고도 그 이름의 계정이 존재하는지 알 수 있다 — 이름 목록을
    긁어 계정 존재 여부를 확인하는 데 쓰인다.
    """
    signup(client, "real")
    wrong_pw = client.post("/auth/login", json={"player_id": "real", "password": "틀린비밀번호1234"})
    no_account = client.post("/auth/login", json={"player_id": "ghost", "password": "아무비밀번호1234"})
    assert wrong_pw.status_code == no_account.status_code == 401
    assert wrong_pw.json()["detail"] == no_account.json()["detail"]


def test_logout_invalidates_token_immediately(client: TestClient) -> None:
    """즉시 무효화된다 — 서명 토큰이 아니라 DB 행이라 가능하다."""
    auth = signup(client, "u1")
    assert client.get("/auth/me", headers=auth).status_code == 200
    assert client.post("/auth/logout", headers=auth).status_code == 204
    assert client.get("/auth/me", headers=auth).status_code == 401


def test_login_issues_a_new_usable_token(client: TestClient) -> None:
    signup(client, "u1")
    res = client.post("/auth/login", json={"player_id": "u1", "password": PASSWORD})
    auth = {"Authorization": f"Bearer {res.json()['token']}"}
    assert client.get("/auth/me", headers=auth).status_code == 200


def test_short_password_is_rejected(client: TestClient) -> None:
    res = client.post("/auth/register", json={"player_id": "u1", "password": "짧다"})
    assert res.status_code == 422


# ─────────────── 신원 위조 방지 ───────────────
#
# 예전엔 player_id를 본문·경로에서 받아 그대로 믿었다. 아래 테스트들은 그
# 구멍이 실제로 막혔는지 확인한다 — "검증을 통과하는가"가 아니라 "누구 행세를
# 할 수 있는가"를 묻는다.


def test_cannot_read_others_saves(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1, name="u1의비밀")

    #  u2는 자기 세이브가 없으므로 404다. u1의 것을 대신 보여주면 실패다.
    assert client.get("/saves/latest", headers=auth2).status_code == 404
    assert client.get("/saves", headers=auth2).json() == []

    mine = client.get("/saves/latest", headers=auth1).json()
    assert mine["payload"]["character"]["name"] == "u1의비밀"


def test_duel_actor_is_the_token_owner(client: TestClient, arbiter: FakeArbiter) -> None:
    """예전엔 player_a를 본문으로 받아, 아무나 남의 이름으로 대전을 성립시킬 수 있었다."""
    auth_u1 = signup(client, "u1")
    signup(client, "u2")
    put_save(client, auth_u1)
    put_save(client, signup(client, "u2-saver"))  # 관계없는 세이브 — u2 몫은 아래에서

    # u2 세이브가 없어 404가 나더라도, 판정 서비스가 호출됐다면 반드시 a=u1이어야 한다
    res = client.post(
        "/duels",
        headers=auth_u1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 404  # u2에게 세이브가 없다
    assert arbiter.calls == []  # 저장 조회 단계에서 이미 막혔다


def test_duel_body_cannot_impersonate_actor(client: TestClient, arbiter: FakeArbiter) -> None:
    """본문에 다른 필드로 남을 지목해도 행위자는 여전히 토큰의 주인이다."""
    auth_u1 = signup(client, "u1")
    auth_u2 = signup(client, "u2")
    put_save(client, auth_u1, name="u1")
    put_save(client, auth_u2, name="u2")

    res = client.post(
        "/duels",
        headers=auth_u1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 201, res.text
    sent = arbiter.calls[-1]
    assert sent["a"]["playerId"] == "u1"
    assert sent["b"]["playerId"] == "u2"


def test_guild_creator_is_the_token_owner(client: TestClient) -> None:
    """예전엔 leader_id를 본문으로 받았다 — 아무나 남을 길드장으로 만들 수 있었다."""
    auth = signup(client, "u1")
    g = client.post("/guilds", headers=auth, json={"name": "돌망치"}).json()
    assert g["leader_id"] == "u1"


def test_guild_join_actor_is_the_token_owner(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    g = client.post("/guilds", headers=auth1, json={"name": "돌망치"}).json()
    joined = client.post(f"/guilds/{g['id']}/join", headers=auth2).json()
    assert {m["player_id"] for m in joined["members"]} == {"u1", "u2"}


def test_trade_actor_is_the_token_owner(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    t = client.post("/trades", headers=auth1, json={"partner": "u2"}).json()
    assert t["player_a"] == "u1"
    assert t["player_b"] == "u2"

    offered = client.put(
        f"/trades/{t['id']}/offer", headers=auth2, json={"items": [{"item_id": "herbSmall", "qty": 1}], "stones": 0}
    ).json()
    assert offered["offer_b"] == [{"item_id": "herbSmall", "qty": 1}]
    assert offered["offer_a"] == []  # u1은 아직 안 냈다


def test_ws_rejects_invalid_token(client: TestClient) -> None:
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=이런-토큰은-없다"):
            pass


def test_ws_identity_comes_from_token(client: TestClient) -> None:
    """예전엔 경로의 /ws/{player_id}를 그대로 믿어 아무 이름으로나 접속할 수 있었다."""
    res = client.post("/auth/register", json={"player_id": "u1", "password": PASSWORD})
    token = res.json()["token"]
    with client.websocket_connect(f"/ws?token={token}") as w:
        hello = w.receive_json()
        assert hello == {"type": "welcome", "playerId": "u1"}


# ─────────────── 대전 ───────────────


def test_duel_uses_stored_saves(client: TestClient, arbiter: FakeArbiter) -> None:
    """서버가 저장된 세이브를 꺼내 판정에 넘긴다. 요청에는 세이브가 없다."""
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1, 21)
    put_save(client, auth2, 33)

    res = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "defensive"},
    )
    assert res.status_code == 201, res.text

    sent = arbiter.calls[-1]
    assert sent["a"]["save"]["character"]["level"] == 21
    assert sent["b"]["save"]["character"]["level"] == 33
    assert sent["a"]["stance"] == "aggressive"
    assert sent["b"]["stance"] == "defensive"


def test_client_cannot_choose_seed(client: TestClient, arbiter: FakeArbiter) -> None:
    """seed를 요청에 실어도 무시된다.

    결정론 엔진에서 seed를 고를 수 있으면 유리한 seed가 나올 때까지 미리
    돌려보고 그때 요청을 보낼 수 있다. 그건 곧 결과 조작이다.
    """
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1)
    put_save(client, auth2)

    seeds = set()
    for _ in range(8):
        res = client.post(
            "/duels",
            headers=auth1,
            json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive", "seed": 7},
        )
        assert res.status_code == 201
        seeds.add(res.json()["seed"])

    assert 7 not in seeds
    #  서버가 매번 새로 뽑으므로 같은 값이 여덟 번 나올 리 없다
    assert len(seeds) > 1


def test_client_cannot_submit_result(client: TestClient) -> None:
    """결과를 실어 보내도 반영되지 않는다."""
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1)
    put_save(client, auth2)
    res = client.post(
        "/duels",
        headers=auth1,
        json={
            "opponent": "u2",
            "stance": "aggressive",
            "opponent_stance": "aggressive",
            "winner": "a",
            "rounds": 999,
        },
    )
    assert res.status_code == 201
    assert res.json()["rounds"] != 999


def test_duel_is_recorded_and_replayable(client: TestClient) -> None:
    """seed와 로그가 함께 남아야 나중에 다시 돌려볼 수 있다."""
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1)
    put_save(client, auth2)
    made = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive"},
    ).json()

    got = client.get(f"/duels/{made['id']}", headers=auth1).json()
    assert got["seed"] == made["seed"]
    assert got["log"] == made["log"]
    assert got["digest"] == made["digest"]

    rows = client.get("/duels", headers=auth1).json()
    assert len(rows) == 1
    assert rows[0]["id"] == made["id"]

    #  상대도 조회할 수 있다 — 당사자다
    assert client.get(f"/duels/{made['id']}", headers=auth2).status_code == 200
    assert len(client.get("/duels", headers=auth2).json()) == 1


def test_outsider_cannot_read_duel(client: TestClient) -> None:
    """당사자가 아니면 로그를 못 본다 — 상대 명부·능력치가 담겨 있다."""
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    auth3 = signup(client, "outsider")
    put_save(client, auth1)
    put_save(client, auth2)
    made = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive"},
    ).json()

    assert client.get(f"/duels/{made['id']}", headers=auth3).status_code == 403
    assert client.get("/duels", headers=auth3).json() == []


def test_duel_rejects_tampered_save(client: TestClient, arbiter: FakeArbiter) -> None:
    """판정 서비스가 거절하면 대전이 성립하지 않고 이유가 그대로 온다."""
    auth_honest = signup(client, "honest")
    auth_cheat = signup(client, "cheat")
    put_save(client, auth_honest)
    put_save(client, auth_cheat)
    arbiter.reject = ["cheat"]

    res = client.post(
        "/duels",
        headers=auth_honest,
        json={"opponent": "cheat", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 422
    rejected = res.json()["detail"]["rejected"]
    assert [r["playerId"] for r in rejected] == ["cheat"]
    #  거절된 판은 기록에 남지 않는다
    assert client.get("/duels", headers=auth_honest).json() == []


def test_duel_needs_both_saves(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    signup(client, "nobody")
    put_save(client, auth1)
    res = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "nobody", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 404


def test_duel_with_unknown_opponent_is_404(client: TestClient) -> None:
    """상대가 계정조차 없으면(등록 안 함) 세이브 조회에서 404다."""
    auth1 = signup(client, "u1")
    put_save(client, auth1)
    res = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "ghost", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 404


def test_duel_with_self_is_rejected(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    put_save(client, auth1)
    res = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "u1", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 400


def test_arbiter_down_only_breaks_duels(client: TestClient, arbiter: FakeArbiter) -> None:
    """판정 서비스가 죽어도 나머지 기능은 계속 돌아야 한다."""
    auth1 = signup(client, "u1")
    auth2 = signup(client, "u2")
    put_save(client, auth1)
    put_save(client, auth2)
    arbiter.raises = ArbiterError("연결 거부")

    res = client.post(
        "/duels",
        headers=auth1,
        json={"opponent": "u2", "stance": "aggressive", "opponent_stance": "aggressive"},
    )
    assert res.status_code == 503
    #  세이브와 거래는 멀쩡하다
    assert client.get("/saves/latest", headers=auth1).status_code == 200
    assert client.post("/trades", headers=auth1, json={"partner": "u2"}).status_code == 201


# ─────────────── 거래 ───────────────


def open_trade(client: TestClient, auth_a: Auth, b: str) -> int:
    res = client.post("/trades", headers=auth_a, json={"partner": b})
    assert res.status_code == 201, res.text
    return int(res.json()["id"])


def offer(client: TestClient, tid: int, auth: Auth, items: list[dict[str, Any]], stones: int = 0):
    return client.put(f"/trades/{tid}/offer", headers=auth, json={"items": items, "stones": stones})


def lock(client: TestClient, tid: int, auth: Auth):
    return client.post(f"/trades/{tid}/lock", headers=auth)


def confirm(client: TestClient, tid: int, auth: Auth):
    return client.post(f"/trades/{tid}/confirm", headers=auth)


def cancel(client: TestClient, tid: int, auth: Auth):
    return client.post(f"/trades/{tid}/cancel", headers=auth)


@pytest.fixture(name="pair")
def pair_fixture(client: TestClient) -> tuple[Auth, Auth]:
    """u1·u2 계정과 그 인증 헤더. 거래 테스트 대부분이 이 둘을 쓴다."""
    return signup(client, "u1"), signup(client, "u2")


def test_trade_happy_path(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "ropeFine", "qty": 2}])
    offer(client, tid, auth2, [], stones=500)

    assert lock(client, tid, auth1).json()["state"] == "open"
    assert lock(client, tid, auth2).json()["state"] == "locked"
    assert confirm(client, tid, auth1).json()["state"] == "locked"

    done = confirm(client, tid, auth2).json()
    assert done["state"] == "completed"
    assert done["stones_b"] == 500
    assert done["offer_a"] == [{"item_id": "ropeFine", "qty": 2}]


def test_changing_offer_clears_both_locks(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    """막판 바꿔치기 방지 — 여기가 이 기능의 존재 이유다.

    상대가 내용을 확인하고 잠근 뒤에 조용히 품목을 바꿀 수 있으면, 잠금은
    아무것도 지키지 못한다. 원작의 거래 사기는 대부분 이 수법이었다.
    """
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "ropeMaster", "qty": 1}])
    offer(client, tid, auth2, [], stones=1500)
    lock(client, tid, auth1)
    assert lock(client, tid, auth2).json()["state"] == "locked"

    #  u1이 명인의 밧줄을 거친 밧줄로 바꿔치기한다
    after = offer(client, tid, auth1, [{"item_id": "ropeCrude", "qty": 1}]).json()
    assert after["state"] == "open"
    assert after["locked_a"] is False
    assert after["locked_b"] is False

    #  u2가 다시 잠그지 않는 한 확정은 불가능하다
    assert confirm(client, tid, auth2).status_code == 409


def test_confirm_requires_both_locks(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, _ = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "herbSmall", "qty": 1}])
    lock(client, tid, auth1)
    #  한쪽만 잠근 상태에서는 확정할 수 없다
    assert confirm(client, tid, auth1).status_code == 409


def test_changing_offer_clears_confirmations(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    """확정까지 갔다가 내용이 바뀌면 확정도 함께 풀린다."""
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "herbLarge", "qty": 3}])
    lock(client, tid, auth1)
    lock(client, tid, auth2)
    confirm(client, tid, auth1)

    after = offer(client, tid, auth2, [{"item_id": "meatChunk", "qty": 1}]).json()
    assert after["confirmed_a"] is False
    assert after["confirmed_b"] is False
    assert after["state"] == "open"


def test_cancel_is_terminal(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    cancelled = cancel(client, tid, auth2).json()
    assert cancelled["state"] == "cancelled"
    assert cancelled["cancelled_by"] == "u2"

    #  끝난 거래는 더 못 건드린다
    assert lock(client, tid, auth1).status_code == 409
    assert offer(client, tid, auth1, []).status_code == 409
    assert cancel(client, tid, auth1).status_code == 409


def test_completed_is_terminal(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "herbSmall", "qty": 1}])
    lock(client, tid, auth1)
    lock(client, tid, auth2)
    confirm(client, tid, auth1)
    confirm(client, tid, auth2)

    assert offer(client, tid, auth1, []).status_code == 409
    assert cancel(client, tid, auth1).status_code == 409


def test_outsider_cannot_touch_trade(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    """당사자가 아니면 손댈 수 없다."""
    auth1, _ = pair
    auth3 = signup(client, "stranger")
    tid = open_trade(client, auth1, "u2")
    assert offer(client, tid, auth3, [{"item_id": "herbSmall", "qty": 1}]).status_code == 403
    assert lock(client, tid, auth3).status_code == 403
    assert cancel(client, tid, auth3).status_code == 403
    assert client.get(f"/trades/{tid}", headers=auth3).status_code == 403
    assert client.get(f"/trades/{tid}/events", headers=auth3).status_code == 403


def test_trade_with_self_is_rejected(client: TestClient) -> None:
    auth1 = signup(client, "u1")
    assert client.post("/trades", headers=auth1, json={"partner": "u1"}).status_code == 400


def test_audit_log_records_every_transition(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    """감사 로그가 헌장이 말한 "복구"의 근거다.

    끝난 거래에도 남아 있어야 하고, 각 줄은 **그 시점의** 내용을 담아야 한다.
    지금 상태만 보관하면 바꿔치기가 있었다는 사실 자체가 사라진다.
    """
    auth1, auth2 = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "ropeMaster", "qty": 1}])
    lock(client, tid, auth1)
    lock(client, tid, auth2)
    offer(client, tid, auth1, [{"item_id": "ropeCrude", "qty": 1}])
    lock(client, tid, auth1)
    lock(client, tid, auth2)
    confirm(client, tid, auth1)
    confirm(client, tid, auth2)

    events = client.get(f"/trades/{tid}/events", headers=auth1).json()
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


def test_audit_survives_cancel(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, _ = pair
    tid = open_trade(client, auth1, "u2")
    offer(client, tid, auth1, [{"item_id": "honeyJar", "qty": 2}])
    cancel(client, tid, auth1)
    events = client.get(f"/trades/{tid}/events", headers=auth1).json()
    assert [e["action"] for e in events] == ["created", "offer", "cancelled"]


def test_too_many_items_rejected(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, _ = pair
    tid = open_trade(client, auth1, "u2")
    items = [{"item_id": f"item{i}", "qty": 1} for i in range(50)]
    assert offer(client, tid, auth1, items).status_code == 400


def test_negative_stones_rejected(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, _ = pair
    tid = open_trade(client, auth1, "u2")
    assert offer(client, tid, auth1, [], stones=-100).status_code == 422


def test_list_trades_only_shows_mine(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    auth3 = signup(client, "u3")
    open_trade(client, auth1, "u2")
    open_trade(client, auth3, "u2")

    assert len(client.get("/trades", headers=auth1).json()) == 1
    assert len(client.get("/trades", headers=auth2).json()) == 2
    assert len(client.get("/trades", headers=auth3).json()) == 1


# ─────────────── 길드 ───────────────


def test_guild_lifecycle(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    g = client.post("/guilds", headers=auth1, json={"name": "돌망치"}).json()
    assert g["leader_id"] == "u1"
    assert g["members"] == [{"player_id": "u1", "role": "leader"}]

    joined = client.post(f"/guilds/{g['id']}/join", headers=auth2).json()
    assert len(joined["members"]) == 2

    left = client.post(f"/guilds/{g['id']}/leave", headers=auth2).json()
    assert len(left["members"]) == 1


def test_one_guild_per_player(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    auth3 = signup(client, "u3")
    a = client.post("/guilds", headers=auth1, json={"name": "돌망치"}).json()
    client.post("/guilds", headers=auth3, json={"name": "바람뼈"})
    client.post(f"/guilds/{a['id']}/join", headers=auth2)
    #  이미 속해 있으면 다른 길드에 못 들어간다
    assert client.post("/guilds/2/join", headers=auth2).status_code == 409
    assert client.post("/guilds", headers=auth2, json={"name": "새길드"}).status_code == 409


def test_duplicate_guild_name_rejected(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    client.post("/guilds", headers=auth1, json={"name": "돌망치"})
    assert client.post("/guilds", headers=auth2, json={"name": "돌망치"}).status_code == 409


def test_leader_must_hand_over_before_leaving(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    """길드장이 그냥 나가면 주인 없는 길드가 남는다."""
    auth1, auth2 = pair
    g = client.post("/guilds", headers=auth1, json={"name": "돌망치"}).json()
    client.post(f"/guilds/{g['id']}/join", headers=auth2)

    assert client.post(f"/guilds/{g['id']}/leave", headers=auth1).status_code == 409

    handed = client.post(
        f"/guilds/{g['id']}/leader", headers=auth1, json={"new_leader_id": "u2"}
    ).json()
    assert handed["leader_id"] == "u2"
    assert {m["player_id"]: m["role"] for m in handed["members"]} == {"u1": "member", "u2": "leader"}

    assert client.post(f"/guilds/{g['id']}/leave", headers=auth1).status_code == 200


def test_only_leader_can_hand_over(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    g = client.post("/guilds", headers=auth1, json={"name": "돌망치"}).json()
    client.post(f"/guilds/{g['id']}/join", headers=auth2)
    res = client.post(f"/guilds/{g['id']}/leader", headers=auth2, json={"new_leader_id": "u2"})
    assert res.status_code == 403


def test_my_guild_lookup(client: TestClient, pair: tuple[Auth, Auth]) -> None:
    auth1, auth2 = pair
    client.post("/guilds", headers=auth1, json={"name": "돌망치"})
    assert client.get("/guilds/mine", headers=auth1).json()["name"] == "돌망치"
    assert client.get("/guilds/mine", headers=auth2).status_code == 404


# ─────────────── 실시간 ───────────────


def ws_token(client: TestClient, player_id: str) -> str:
    res = client.post("/auth/register", json={"player_id": player_id, "password": PASSWORD})
    assert res.status_code == 201
    return str(res.json()["token"])


def test_ws_room_presence(client: TestClient) -> None:
    """같은 방 사람들끼리 서로가 보인다."""
    t1 = ws_token(client, "u1")
    t2 = ws_token(client, "u2")
    with client.websocket_connect(f"/ws?token={t1}") as w1:
        assert w1.receive_json() == {"type": "welcome", "playerId": "u1"}
        w1.send_json({"type": "join", "room": "meadow"})
        assert w1.receive_json() == {"type": "roomState", "room": "meadow", "players": []}

        with client.websocket_connect(f"/ws?token={t2}") as w2:
            assert w2.receive_json() == {"type": "welcome", "playerId": "u2"}
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
    t1 = ws_token(client, "u1")
    t2 = ws_token(client, "u2")
    with client.websocket_connect(f"/ws?token={t1}") as w1, client.websocket_connect(f"/ws?token={t2}") as w2:
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
    t1 = ws_token(client, "u1")
    with client.websocket_connect(f"/ws?token={t1}") as w:
        w.receive_json()
        w.send_json({"type": "춤추기"})
        assert w.receive_json()["type"] == "error"
        #  연결은 살아 있다
        w.send_json({"type": "join", "room": "village"})
        assert w.receive_json()["type"] == "roomState"


def test_ws_move_before_join_is_ignored(client: TestClient) -> None:
    t1 = ws_token(client, "u1")
    with client.websocket_connect(f"/ws?token={t1}") as w:
        w.receive_json()
        w.send_json({"type": "move", "x": 1, "y": 1})
        w.send_json({"type": "join", "room": "village"})
        #  move에 답이 없어야 다음 메시지가 roomState다
        assert w.receive_json()["type"] == "roomState"


def test_http_events_notify_connected_players(client: TestClient) -> None:
    """거래는 HTTP로 일어나지만 알림은 접속 통로로 간다."""
    auth1 = signup(client, "u1")
    t1 = client.post("/auth/login", json={"player_id": "u1", "password": PASSWORD}).json()["token"]
    signup(client, "u2")

    with client.websocket_connect(f"/ws?token={t1}") as w1:
        w1.receive_json()
        tid = open_trade(client, auth1, "u2")
        offer(client, tid, auth1, [{"item_id": "herbSmall", "qty": 1}])
        msg = w1.receive_json()
        assert msg["type"] == "tradeUpdated"
        assert msg["tradeId"] == tid


def test_hub_forgets_disconnected(client: TestClient, hub: Hub) -> None:
    t1 = ws_token(client, "u1")
    with client.websocket_connect(f"/ws?token={t1}") as w:
        w.receive_json()
        w.send_json({"type": "join", "room": "meadow"})
        w.receive_json()
        assert hub.members("meadow") == {"u1"}
    assert hub.members("meadow") == set()
    assert hub.online() == 0
