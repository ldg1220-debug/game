"""STONEAGE-REBUILD 백엔드.

세이브 보관소다. 게임 로직은 여기 없다 — 전투 엔진은 클라이언트의 순수
TypeScript로 굴러가고, 서버는 Phase 8에서 권위 검증을 맡을 때 같은 엔진을
실행하게 된다. 지금은 그 자리를 비워둔다.

세이브 내용을 서버가 해석하지 않는 것이 설계다. `payload`는 통짜 JSON으로
들어오고 그대로 나간다. 클라이언트의 세이브 스키마가 바뀔 때마다 서버를
같이 고쳐야 한다면 두 곳이 어긋나는 건 시간문제이고, 어긋난 쪽이 세이브를
깨뜨린다. 버전과 마이그레이션은 클라이언트(src/game/save.ts) 한 곳에만 둔다.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime
from sqlmodel import Field as SQLField
from sqlmodel import Session, SQLModel, create_engine, select

# 개발은 SQLite, 배포는 PostgreSQL. 헌장이 정한 스택이다.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./stoneage.db")
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)

# 세이브 하나의 상한. 파티·상자·도감이 다 차도 수백 KB를 넘지 않는다.
MAX_PAYLOAD_BYTES = 1_000_000
# 슬롯 하나당 보관하는 세대 수. 넘으면 오래된 것부터 지운다.
MAX_HISTORY = 5


@asynccontextmanager
async def lifespan(_: FastAPI):
    """기동 시 테이블을 만든다."""
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(title="STONEAGE-REBUILD", version="0.1.0", lifespan=lifespan)


class SaveRecord(SQLModel, table=True):
    """세이브 한 세대.

    덮어쓰지 않고 쌓는다. 잘못 저장했을 때 되돌릴 수 있어야 하고, 그게
    "거래 사기 복구 부재"를 고치겠다는 헌장 항목의 최소 전제다.
    """

    __tablename__ = "saves"

    id: int | None = SQLField(default=None, primary_key=True)
    player_id: str = SQLField(index=True)
    slot: str = SQLField(index=True, default="main")
    version: int
    payload: str
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


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


def get_session():
    """요청마다 세션 하나. 테스트가 갈아끼울 수 있게 의존성으로 둔다."""
    with Session(engine) as session:
        yield session


@app.get("/health", response_model=Health)
def health() -> Health:
    """서버가 떠 있는지 확인한다."""
    return Health(status="ok", version=app.version)


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
    row = session.exec(
        select(SaveRecord)
        .where(SaveRecord.player_id == player_id, SaveRecord.slot == slot)
        .order_by(SaveRecord.id.desc())  # type: ignore[union-attr]
    ).first()
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
