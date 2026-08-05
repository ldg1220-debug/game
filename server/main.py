"""STONEAGE-REBUILD 백엔드.

역할이 둘로 나뉘어 있다.

    FastAPI(여기)   상태 — 세이브·대전 기록·거래·길드·연결
    판정 서비스     규칙 — 세이브가 정당한가, 이 seed로 누가 이기는가

규칙을 파이썬으로 옮겨 적지 않는 것이 이 구조의 요점이다. 전투 엔진은 순수
TypeScript로 한 벌 있고, 클라이언트와 판정 서비스가 **같은 파일**을 쓴다. 여기서
한 번 더 구현하면 둘은 반드시 어긋나고, 어긋난 날 어느 쪽이 맞는지 판정할 방법이
없다. 밸런스 수치 하나 고칠 때마다 두 곳을 고쳐야 하는 것도 시간문제다.

세이브 내용을 서버가 해석하지 않는 원칙도 그대로다. `payload`는 통짜 JSON으로
들어오고 그대로 나간다. 버전과 마이그레이션은 클라이언트(src/game/save.ts) 한
곳에만 둔다. 대전할 때만 판정 서비스가 그 내용을 열어 본다 — 규칙을 아는 쪽은
거기뿐이다.
"""

from __future__ import annotations

import json
import os
import secrets
from datetime import datetime
from typing import Any

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlmodel import Session, SQLModel, create_engine, select

from server.arbiter import Arbiter, ArbiterError, get_arbiter
from server.hub import Hub, get_hub
from server.models import (
    DuelRecord,
    Guild,
    GuildMember,
    SaveRecord,
    Trade,
    TradeEvent,
    TradeState,
    utcnow,
)

# 개발은 SQLite, 배포는 PostgreSQL. 헌장이 정한 스택이다.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./stoneage.db")
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)

# 세이브 하나의 상한. 파티·상자·도감이 다 차도 수백 KB를 넘지 않는다.
MAX_PAYLOAD_BYTES = 1_000_000
# 슬롯 하나당 보관하는 세대 수. 넘으면 오래된 것부터 지운다.
MAX_HISTORY = 5
# 거래 한 건에 올릴 수 있는 품목 수. 무제한이면 목록 화면이 못 쓰게 된다.
MAX_TRADE_ITEMS = 20


@asynccontextmanager
async def lifespan(_: FastAPI):
    """기동 시 테이블을 만든다."""
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(title="STONEAGE-REBUILD", version="0.2.0", lifespan=lifespan)


def get_session():
    """요청마다 세션 하나. 테스트가 갈아끼울 수 있게 의존성으로 둔다."""
    with Session(engine) as session:
        yield session


# ─────────────── 응답 모형 ───────────────


class SaveIn(BaseModel):
    """저장 요청."""

    player_id: str = Field(min_length=1, max_length=64)
    slot: str = Field(default="main", min_length=1, max_length=32)
    version: int = Field(ge=1)
    payload: dict[str, Any]


class SaveOut(BaseModel):
    """저장·조회 응답."""

    id: int
    player_id: str
    slot: str
    version: int
    created_at: datetime
    payload: dict[str, Any]


class SaveSummary(BaseModel):
    """목록용 요약. payload는 빼서 목록이 무거워지지 않게 한다."""

    id: int
    slot: str
    version: int
    created_at: datetime
    bytes: int


class Health(BaseModel):
    """헬스체크 응답."""

    status: str
    version: str


class ActorIn(BaseModel):
    """행위자만 필요한 요청. 거래·길드가 함께 쓴다."""

    player_id: str = Field(min_length=1, max_length=64)


# ─────────────── 기본 ───────────────


@app.get("/health", response_model=Health)
def health() -> Health:
    """서버가 떠 있는지 확인한다."""
    return Health(status="ok", version=app.version)


# ─────────────── 세이브 ───────────────


@app.post("/saves", response_model=SaveOut, status_code=201)
def create_save(body: SaveIn, session: Session = Depends(get_session)) -> SaveOut:
    """세이브를 한 세대 남긴다."""
    text = json.dumps(body.payload, ensure_ascii=False, separators=(",", ":"))
    if len(text.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="세이브가 너무 크다")

    record = SaveRecord(
        player_id=body.player_id,
        slot=body.slot,
        version=body.version,
        payload=text,
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    # 오래된 세대 정리. 무한히 쌓이면 목록도 저장소도 못 쓰게 된다.
    old = session.exec(
        select(SaveRecord)
        .where(SaveRecord.player_id == body.player_id, SaveRecord.slot == body.slot)
        .order_by(SaveRecord.id.desc())  # type: ignore[union-attr]
        .offset(MAX_HISTORY)
    ).all()
    for row in old:
        session.delete(row)
    if old:
        session.commit()

    return SaveOut(
        id=record.id or 0,
        player_id=record.player_id,
        slot=record.slot,
        version=record.version,
        created_at=record.created_at,
        payload=body.payload,
    )


@app.get("/saves/{player_id}", response_model=list[SaveSummary])
def list_saves(player_id: str, session: Session = Depends(get_session)) -> list[SaveSummary]:
    """그 플레이어의 세이브 목록. 최신 순."""
    rows = session.exec(
        select(SaveRecord)
        .where(SaveRecord.player_id == player_id)
        .order_by(SaveRecord.id.desc())  # type: ignore[union-attr]
    ).all()
    return [
        SaveSummary(
            id=r.id or 0,
            slot=r.slot,
            version=r.version,
            created_at=r.created_at,
            bytes=len(r.payload.encode("utf-8")),
        )
        for r in rows
    ]


@app.get("/saves/{player_id}/latest", response_model=SaveOut)
def latest_save(
    player_id: str, slot: str = "main", session: Session = Depends(get_session)
) -> SaveOut:
    """그 슬롯의 가장 최근 세이브."""
    row = _latest_save_row(session, player_id, slot)
    if row is None:
        raise HTTPException(status_code=404, detail="세이브가 없다")
    return SaveOut(
        id=row.id or 0,
        player_id=row.player_id,
        slot=row.slot,
        version=row.version,
        created_at=row.created_at,
        payload=json.loads(row.payload),
    )


def _latest_save_row(session: Session, player_id: str, slot: str = "main") -> SaveRecord | None:
    return session.exec(
        select(SaveRecord)
        .where(SaveRecord.player_id == player_id, SaveRecord.slot == slot)
        .order_by(SaveRecord.id.desc())  # type: ignore[union-attr]
    ).first()


# ─────────────── 대전 ───────────────


class DuelIn(BaseModel):
    """대전 요청.

    세이브도 결과도 클라이언트가 보내지 않는다. 플레이어 id와 태세만 받고,
    나머지는 서버가 저장된 세이브에서 꺼낸다. 세이브를 요청에 담게 하면 그
    순간 "지금 그 사람의 상태"가 아니라 "그가 주장하는 상태"가 된다.
    """

    player_a: str = Field(min_length=1, max_length=64)
    player_b: str = Field(min_length=1, max_length=64)
    stance_a: str = Field(min_length=1, max_length=16)
    stance_b: str = Field(min_length=1, max_length=16)


class DuelOut(BaseModel):
    id: int
    seed: int
    winner: str
    ended_by: str
    rounds: int
    digest: str
    summary: dict[str, Any]
    log: list[dict[str, Any]]
    created_at: datetime


class DuelSummary(BaseModel):
    id: int
    player_a: str
    player_b: str
    winner: str
    rounds: int
    created_at: datetime


def _duel_out(record: DuelRecord) -> DuelOut:
    return DuelOut(
        id=record.id or 0,
        seed=record.seed,
        winner=record.winner,
        ended_by=record.ended_by,
        rounds=record.rounds,
        digest=record.digest,
        summary=json.loads(record.summary),
        log=json.loads(record.log),
        created_at=record.created_at,
    )


@app.post("/duels", response_model=DuelOut, status_code=201)
async def create_duel(
    body: DuelIn,
    session: Session = Depends(get_session),
    arbiter: Arbiter = Depends(get_arbiter),
    hub: Hub = Depends(get_hub),
) -> DuelOut:
    """대전 한 판을 굴린다.

    **seed를 서버가 뽑는다.** 클라이언트가 고르게 하면 유리한 seed가 나올
    때까지 미리 돌려보고 그때 요청을 보낼 수 있다 — 결정론 엔진에서 그건
    곧 결과 조작이다.
    """
    if body.player_a == body.player_b:
        raise HTTPException(status_code=400, detail="자기 자신과는 대전할 수 없다")

    saves: dict[str, Any] = {}
    for pid in (body.player_a, body.player_b):
        row = _latest_save_row(session, pid)
        if row is None:
            raise HTTPException(status_code=404, detail=f"{pid}의 세이브가 없다")
        saves[pid] = json.loads(row.payload)

    seed = secrets.randbits(30)
    payload = {
        "seed": seed,
        "a": {"playerId": body.player_a, "stance": body.stance_a, "save": saves[body.player_a]},
        "b": {"playerId": body.player_b, "stance": body.stance_b, "save": saves[body.player_b]},
    }

    try:
        status, result = arbiter.duel(payload)
    except ArbiterError as e:
        # 판정 서비스가 없으면 대전만 멈춘다. 나머지 기능은 계속 돌아야 한다.
        raise HTTPException(status_code=503, detail=f"판정 서비스를 쓸 수 없다 — {e}") from e

    if status == 422 or not result.get("ok"):
        # 검증 실패. 어느 쪽이 왜 거절됐는지 그대로 돌려준다.
        raise HTTPException(status_code=422, detail={"rejected": result.get("rejected", [])})
    if status != 200:
        raise HTTPException(status_code=502, detail="판정 서비스가 알 수 없는 답을 보냈다")

    record = DuelRecord(
        player_a=body.player_a,
        player_b=body.player_b,
        stance_a=body.stance_a,
        stance_b=body.stance_b,
        seed=result["seed"],
        winner=result["winner"],
        ended_by=result["endedBy"],
        rounds=result["rounds"],
        digest=result["digest"],
        log=json.dumps(result["log"], ensure_ascii=False, separators=(",", ":")),
        summary=json.dumps(result["sides"], ensure_ascii=False),
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    await hub.notify(
        [body.player_a, body.player_b],
        {"type": "duelFinished", "duelId": record.id, "winner": record.winner},
    )
    return _duel_out(record)


@app.get("/duels/{duel_id}", response_model=DuelOut)
def get_duel(duel_id: int, session: Session = Depends(get_session)) -> DuelOut:
    """지난 대전을 다시 본다. seed와 로그가 함께 남아 있어 재현할 수 있다."""
    record = session.get(DuelRecord, duel_id)
    if record is None:
        raise HTTPException(status_code=404, detail="그런 대전이 없다")
    return _duel_out(record)


@app.get("/players/{player_id}/duels", response_model=list[DuelSummary])
def list_duels(player_id: str, session: Session = Depends(get_session)) -> list[DuelSummary]:
    """그 사람의 대전 기록. 최신 순."""
    rows = session.exec(
        select(DuelRecord)
        .where((DuelRecord.player_a == player_id) | (DuelRecord.player_b == player_id))
        .order_by(DuelRecord.id.desc())  # type: ignore[union-attr]
    ).all()
    return [
        DuelSummary(
            id=r.id or 0,
            player_a=r.player_a,
            player_b=r.player_b,
            winner=r.winner,
            rounds=r.rounds,
            created_at=r.created_at,
        )
        for r in rows
    ]


# ─────────────── 거래 ───────────────


class OfferItem(BaseModel):
    item_id: str = Field(min_length=1, max_length=64)
    qty: int = Field(ge=1)


class TradeCreate(BaseModel):
    player_a: str = Field(min_length=1, max_length=64)
    player_b: str = Field(min_length=1, max_length=64)


class OfferIn(BaseModel):
    player_id: str = Field(min_length=1, max_length=64)
    items: list[OfferItem] = Field(default_factory=list)
    stones: int = Field(default=0, ge=0)


class TradeOut(BaseModel):
    id: int
    player_a: str
    player_b: str
    state: str
    offer_a: list[OfferItem]
    offer_b: list[OfferItem]
    stones_a: int
    stones_b: int
    locked_a: bool
    locked_b: bool
    confirmed_a: bool
    confirmed_b: bool
    cancelled_by: str | None
    updated_at: datetime


class TradeEventOut(BaseModel):
    id: int
    actor: str
    action: str
    snapshot: dict[str, Any]
    created_at: datetime


def _trade_out(t: Trade) -> TradeOut:
    return TradeOut(
        id=t.id or 0,
        player_a=t.player_a,
        player_b=t.player_b,
        state=t.state.value,
        offer_a=[OfferItem(**x) for x in json.loads(t.offer_a)],
        offer_b=[OfferItem(**x) for x in json.loads(t.offer_b)],
        stones_a=t.stones_a,
        stones_b=t.stones_b,
        locked_a=t.locked_a,
        locked_b=t.locked_b,
        confirmed_a=t.confirmed_a,
        confirmed_b=t.confirmed_b,
        cancelled_by=t.cancelled_by,
        updated_at=t.updated_at,
    )


def _snapshot(t: Trade) -> dict[str, Any]:
    return {
        "state": t.state.value,
        "offerA": json.loads(t.offer_a),
        "offerB": json.loads(t.offer_b),
        "stonesA": t.stones_a,
        "stonesB": t.stones_b,
        "lockedA": t.locked_a,
        "lockedB": t.locked_b,
        "confirmedA": t.confirmed_a,
        "confirmedB": t.confirmed_b,
    }


def _audit(session: Session, t: Trade, actor: str, action: str) -> None:
    """전이를 하나 남긴다. 상태를 바꾸는 곳마다 반드시 부른다."""
    session.add(
        TradeEvent(
            trade_id=t.id or 0,
            actor=actor,
            action=action,
            snapshot=json.dumps(_snapshot(t), ensure_ascii=False),
        )
    )


def _load_trade(session: Session, trade_id: int, actor: str) -> Trade:
    t = session.get(Trade, trade_id)
    if t is None:
        raise HTTPException(status_code=404, detail="그런 거래가 없다")
    if actor not in (t.player_a, t.player_b):
        # 404가 아니라 403이다. 404로 감추면 클라이언트가 "사라진 거래"로 오해한다.
        raise HTTPException(status_code=403, detail="이 거래의 당사자가 아니다")
    if t.state in (TradeState.completed, TradeState.cancelled):
        raise HTTPException(status_code=409, detail=f"이미 끝난 거래다 — {t.state.value}")
    return t


@app.post("/trades", response_model=TradeOut, status_code=201)
def create_trade(body: TradeCreate, session: Session = Depends(get_session)) -> TradeOut:
    """거래를 연다."""
    if body.player_a == body.player_b:
        raise HTTPException(status_code=400, detail="자기 자신과는 거래할 수 없다")
    t = Trade(player_a=body.player_a, player_b=body.player_b)
    session.add(t)
    session.commit()
    session.refresh(t)
    _audit(session, t, body.player_a, "created")
    session.commit()
    return _trade_out(t)


@app.get("/trades/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: int, session: Session = Depends(get_session)) -> TradeOut:
    t = session.get(Trade, trade_id)
    if t is None:
        raise HTTPException(status_code=404, detail="그런 거래가 없다")
    return _trade_out(t)


@app.get("/trades/{trade_id}/events", response_model=list[TradeEventOut])
def trade_events(trade_id: int, session: Session = Depends(get_session)) -> list[TradeEventOut]:
    """감사 로그. 끝난 거래도 그대로 남아 있다."""
    rows = session.exec(
        select(TradeEvent).where(TradeEvent.trade_id == trade_id).order_by(TradeEvent.id)  # type: ignore[arg-type]
    ).all()
    return [
        TradeEventOut(
            id=r.id or 0,
            actor=r.actor,
            action=r.action,
            snapshot=json.loads(r.snapshot),
            created_at=r.created_at,
        )
        for r in rows
    ]


@app.put("/trades/{trade_id}/offer", response_model=TradeOut)
async def set_offer(
    trade_id: int,
    body: OfferIn,
    session: Session = Depends(get_session),
    hub: Hub = Depends(get_hub),
) -> TradeOut:
    """내가 내놓을 것을 정한다.

    **내용이 바뀌면 양쪽 잠금과 확정이 모두 풀린다.** 원작의 거래 사기는 대부분
    상대가 확인한 뒤 조용히 품목을 바꾸는 수법이었다. 잠근 뒤에도 바꿀 수 있으면
    잠금은 아무 의미가 없다.
    """
    t = _load_trade(session, trade_id, body.player_id)
    if len(body.items) > MAX_TRADE_ITEMS:
        raise HTTPException(status_code=400, detail=f"품목이 너무 많다 — 최대 {MAX_TRADE_ITEMS}")

    payload = json.dumps([i.model_dump() for i in body.items], ensure_ascii=False)
    if body.player_id == t.player_a:
        t.offer_a = payload
        t.stones_a = body.stones
    else:
        t.offer_b = payload
        t.stones_b = body.stones

    t.locked_a = False
    t.locked_b = False
    t.confirmed_a = False
    t.confirmed_b = False
    t.state = TradeState.open
    t.updated_at = utcnow()

    session.add(t)
    _audit(session, t, body.player_id, "offer")
    session.commit()
    session.refresh(t)
    await hub.notify(
        [t.player_a, t.player_b],
        {"type": "tradeUpdated", "tradeId": t.id, "state": t.state.value},
    )
    return _trade_out(t)


@app.post("/trades/{trade_id}/lock", response_model=TradeOut)
async def lock_trade(
    trade_id: int,
    body: ActorIn,
    session: Session = Depends(get_session),
    hub: Hub = Depends(get_hub),
) -> TradeOut:
    """내 쪽을 잠근다. 둘 다 잠기면 확정할 수 있게 된다."""
    t = _load_trade(session, trade_id, body.player_id)
    if body.player_id == t.player_a:
        t.locked_a = True
    else:
        t.locked_b = True
    if t.locked_a and t.locked_b:
        t.state = TradeState.locked
    t.updated_at = utcnow()

    session.add(t)
    _audit(session, t, body.player_id, "lock")
    session.commit()
    session.refresh(t)
    await hub.notify(
        [t.player_a, t.player_b],
        {"type": "tradeUpdated", "tradeId": t.id, "state": t.state.value},
    )
    return _trade_out(t)


@app.post("/trades/{trade_id}/confirm", response_model=TradeOut)
async def confirm_trade(
    trade_id: int,
    body: ActorIn,
    session: Session = Depends(get_session),
    hub: Hub = Depends(get_hub),
) -> TradeOut:
    """확정한다. 둘 다 확정하면 그 순간 교환이 성립한다.

    확정은 **둘 다 잠근 뒤에만** 가능하다. 잠그지 않은 채 확정할 수 있으면
    한쪽이 확정한 뒤 다른 쪽이 내용을 바꾸는 길이 열린다.
    """
    t = _load_trade(session, trade_id, body.player_id)
    if t.state is not TradeState.locked:
        raise HTTPException(status_code=409, detail="양쪽이 잠근 뒤에 확정할 수 있다")

    if body.player_id == t.player_a:
        t.confirmed_a = True
    else:
        t.confirmed_b = True

    action = "confirm"
    if t.confirmed_a and t.confirmed_b:
        t.state = TradeState.completed
        action = "completed"
    t.updated_at = utcnow()

    session.add(t)
    _audit(session, t, body.player_id, action)
    # 상태 변경과 감사 로그가 한 트랜잭션에 들어간다. 나뉘면 "교환은 됐는데
    # 기록이 없는" 순간이 생기고, 하필 그때 장애가 나면 복구할 근거가 사라진다.
    session.commit()
    session.refresh(t)

    await hub.notify(
        [t.player_a, t.player_b],
        {"type": "tradeUpdated", "tradeId": t.id, "state": t.state.value},
    )
    return _trade_out(t)


@app.post("/trades/{trade_id}/cancel", response_model=TradeOut)
async def cancel_trade(
    trade_id: int,
    body: ActorIn,
    session: Session = Depends(get_session),
    hub: Hub = Depends(get_hub),
) -> TradeOut:
    """취소한다. 성립 전이면 언제든 가능하다."""
    t = _load_trade(session, trade_id, body.player_id)
    t.state = TradeState.cancelled
    t.cancelled_by = body.player_id
    t.updated_at = utcnow()
    session.add(t)
    _audit(session, t, body.player_id, "cancelled")
    session.commit()
    session.refresh(t)
    await hub.notify(
        [t.player_a, t.player_b],
        {"type": "tradeUpdated", "tradeId": t.id, "state": t.state.value},
    )
    return _trade_out(t)


@app.get("/players/{player_id}/trades", response_model=list[TradeOut])
def list_trades(player_id: str, session: Session = Depends(get_session)) -> list[TradeOut]:
    rows = session.exec(
        select(Trade)
        .where((Trade.player_a == player_id) | (Trade.player_b == player_id))
        .order_by(Trade.id.desc())  # type: ignore[union-attr]
    ).all()
    return [_trade_out(t) for t in rows]


# ─────────────── 길드 ───────────────


class GuildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    leader_id: str = Field(min_length=1, max_length=64)


class LeaderIn(BaseModel):
    player_id: str = Field(min_length=1, max_length=64)
    new_leader_id: str = Field(min_length=1, max_length=64)


class GuildOut(BaseModel):
    id: int
    name: str
    leader_id: str
    notice: str
    members: list[dict[str, Any]]


def _guild_out(session: Session, g: Guild) -> GuildOut:
    members = session.exec(
        select(GuildMember).where(GuildMember.guild_id == g.id).order_by(GuildMember.id)  # type: ignore[arg-type]
    ).all()
    return GuildOut(
        id=g.id or 0,
        name=g.name,
        leader_id=g.leader_id,
        notice=g.notice,
        members=[{"player_id": m.player_id, "role": m.role} for m in members],
    )


def _member_row(session: Session, guild_id: int, player_id: str) -> GuildMember | None:
    return session.exec(
        select(GuildMember).where(
            GuildMember.guild_id == guild_id, GuildMember.player_id == player_id
        )
    ).first()


def _require_guild(session: Session, guild_id: int) -> Guild:
    g = session.get(Guild, guild_id)
    if g is None:
        raise HTTPException(status_code=404, detail="그런 길드가 없다")
    return g


@app.post("/guilds", response_model=GuildOut, status_code=201)
def create_guild(body: GuildCreate, session: Session = Depends(get_session)) -> GuildOut:
    if session.exec(select(Guild).where(Guild.name == body.name)).first():
        raise HTTPException(status_code=409, detail="같은 이름의 길드가 있다")
    if session.exec(select(GuildMember).where(GuildMember.player_id == body.leader_id)).first():
        raise HTTPException(status_code=409, detail="이미 다른 길드에 속해 있다")

    g = Guild(name=body.name, leader_id=body.leader_id)
    session.add(g)
    session.commit()
    session.refresh(g)
    session.add(GuildMember(guild_id=g.id or 0, player_id=body.leader_id, role="leader"))
    session.commit()
    return _guild_out(session, g)


@app.post("/guilds/{guild_id}/join", response_model=GuildOut)
def join_guild(guild_id: int, body: ActorIn, session: Session = Depends(get_session)) -> GuildOut:
    g = _require_guild(session, guild_id)
    if session.exec(select(GuildMember).where(GuildMember.player_id == body.player_id)).first():
        raise HTTPException(status_code=409, detail="이미 다른 길드에 속해 있다")
    session.add(GuildMember(guild_id=guild_id, player_id=body.player_id))
    session.commit()
    return _guild_out(session, g)


@app.post("/guilds/{guild_id}/leave", response_model=GuildOut)
def leave_guild(guild_id: int, body: ActorIn, session: Session = Depends(get_session)) -> GuildOut:
    g = _require_guild(session, guild_id)
    if g.leader_id == body.player_id:
        # 길드장이 그냥 나가면 주인 없는 길드가 남는다. 넘기고 나가야 한다.
        raise HTTPException(status_code=409, detail="길드장은 먼저 길드장을 넘겨야 한다")
    m = _member_row(session, guild_id, body.player_id)
    if m is None:
        raise HTTPException(status_code=404, detail="길드원이 아니다")
    session.delete(m)
    session.commit()
    return _guild_out(session, g)


@app.post("/guilds/{guild_id}/leader", response_model=GuildOut)
def hand_over(guild_id: int, body: LeaderIn, session: Session = Depends(get_session)) -> GuildOut:
    g = _require_guild(session, guild_id)
    if g.leader_id != body.player_id:
        raise HTTPException(status_code=403, detail="길드장만 넘길 수 있다")
    target = _member_row(session, guild_id, body.new_leader_id)
    if target is None:
        raise HTTPException(status_code=404, detail="길드원이 아니다")

    old = _member_row(session, guild_id, body.player_id)
    if old is not None:
        old.role = "member"
        session.add(old)
    target.role = "leader"
    g.leader_id = body.new_leader_id
    session.add(target)
    session.add(g)
    session.commit()
    return _guild_out(session, g)


@app.get("/guilds/{guild_id}", response_model=GuildOut)
def get_guild(guild_id: int, session: Session = Depends(get_session)) -> GuildOut:
    return _guild_out(session, _require_guild(session, guild_id))


@app.get("/players/{player_id}/guild", response_model=GuildOut)
def my_guild(player_id: str, session: Session = Depends(get_session)) -> GuildOut:
    m = session.exec(select(GuildMember).where(GuildMember.player_id == player_id)).first()
    if m is None:
        raise HTTPException(status_code=404, detail="길드가 없다")
    return _guild_out(session, _require_guild(session, m.guild_id))


# ─────────────── 실시간 ───────────────


@app.websocket("/ws/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket, player_id: str, hub: Hub = Depends(get_hub)
) -> None:
    """접속 하나.

    프로토콜은 최소한이다 — 방에 들어가고, 위치를 알리고, 말을 한다. 게임 상태는
    이 통로로 오가지 않는다. 위치와 대화가 조작돼도 남의 게임이 망가지지 않지만
    전투 결과는 그렇지 않기 때문이다. 그건 /duels로 간다.
    """
    await hub.connect(player_id, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            await hub.handle(player_id, msg)
    except WebSocketDisconnect:
        await hub.disconnect(player_id)
    except Exception:
        # 한 사람의 잘못된 메시지가 서버를 흔들지 않게 한다
        await hub.disconnect(player_id)
        raise
