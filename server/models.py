"""테이블 정의.

main.py에서 떼어냈다. Phase 8에서 표가 하나에서 여섯으로 늘었고, 라우트와 섞여
있으면 어떤 상태가 서버에 있는지 한눈에 안 보인다.

공통 규칙 두 가지.

1. **지우지 않고 상태를 바꾼다.** 거래를 취소해도 행은 남는다. 사기 신고가
   들어왔을 때 "그런 거래는 없었다"가 되면 복구할 방법이 없다.
2. **시각은 UTC로 저장한다.** 서버가 어디서 돌든 같은 값이어야 하고, 감사
   로그에서 순서를 따질 때 지역 시간이 섞이면 못 쓴다.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Column, DateTime
from sqlmodel import Field as SQLField
from sqlmodel import SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _created_at() -> object:
    return SQLField(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


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
    created_at: datetime = _created_at()  # type: ignore[assignment]


class DuelRecord(SQLModel, table=True):
    """대전 한 판.

    seed와 로그를 함께 남긴다. 둘 중 하나만 있으면 분쟁이 생겼을 때 다시
    돌려볼 수 없다 — seed만 있으면 그때의 세이브를 알 수 없고, 로그만 있으면
    그게 정말 엔진이 뱉은 것인지 확인할 수 없다.
    """

    __tablename__ = "duels"

    id: int | None = SQLField(default=None, primary_key=True)
    player_a: str = SQLField(index=True)
    player_b: str = SQLField(index=True)
    stance_a: str
    stance_b: str
    seed: int
    winner: str
    ended_by: str
    rounds: int
    #  판정 서비스가 돌려준 로그 지문. 같은 판인지 싸게 비교한다.
    digest: str
    log: str
    summary: str
    created_at: datetime = _created_at()  # type: ignore[assignment]


class TradeState(str, Enum):
    """거래 상태.

    `open`에서만 내용을 바꿀 수 있다. 잠근 뒤에 바꾸려면 잠금이 풀리고 다시
    `open`으로 돌아간다 — 막판 바꿔치기를 막는 유일한 방법이다.
    """

    open = "open"
    locked = "locked"
    completed = "completed"
    cancelled = "cancelled"


class Trade(SQLModel, table=True):
    """거래 한 건.

    양쪽이 각각 내놓을 것을 정하고(offer), 잠그고(lock), 확정한다(confirm).
    확정은 둘 다 잠근 뒤에만 가능하고, 둘 다 확정해야 교환이 일어난다.
    """

    __tablename__ = "trades"

    id: int | None = SQLField(default=None, primary_key=True)
    player_a: str = SQLField(index=True)
    player_b: str = SQLField(index=True)
    state: TradeState = SQLField(default=TradeState.open, index=True)

    # 각 진영이 내놓는 것. JSON 문자열이다 — 품목 구성은 클라이언트 규칙이고,
    # 서버가 해석하기 시작하면 아이템이 추가될 때마다 서버를 고쳐야 한다.
    offer_a: str = SQLField(default="[]")
    offer_b: str = SQLField(default="[]")
    stones_a: int = SQLField(default=0)
    stones_b: int = SQLField(default=0)

    locked_a: bool = SQLField(default=False)
    locked_b: bool = SQLField(default=False)
    confirmed_a: bool = SQLField(default=False)
    confirmed_b: bool = SQLField(default=False)

    cancelled_by: str | None = SQLField(default=None)
    created_at: datetime = _created_at()  # type: ignore[assignment]
    updated_at: datetime = _created_at()  # type: ignore[assignment]


class TradeEvent(SQLModel, table=True):
    """거래 감사 로그.

    모든 전이를 한 줄씩 남긴다. 이게 헌장이 지목한 "거래 사기 복구 부재"의
    실제 해결책이다 — 원자적 교환은 사기를 **덜 일어나게** 할 뿐이고, 일어난
    뒤에 되돌리려면 무엇이 오갔는지가 기록으로 남아 있어야 한다.
    """

    __tablename__ = "trade_events"

    id: int | None = SQLField(default=None, primary_key=True)
    trade_id: int = SQLField(index=True)
    actor: str
    action: str
    #  그 시점의 양쪽 제안 내용. 나중에 바뀌어도 이 줄은 안 바뀐다.
    snapshot: str
    created_at: datetime = _created_at()  # type: ignore[assignment]


class Guild(SQLModel, table=True):
    """길드."""

    __tablename__ = "guilds"

    id: int | None = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True, unique=True)
    leader_id: str = SQLField(index=True)
    notice: str = SQLField(default="")
    created_at: datetime = _created_at()  # type: ignore[assignment]


class GuildMember(SQLModel, table=True):
    """길드원.

    한 사람은 한 길드에만 속한다. player_id에 unique를 걸어 그 규칙을 DB가
    지키게 한다 — 코드로만 막으면 동시 요청 둘이 통과한다.
    """

    __tablename__ = "guild_members"

    id: int | None = SQLField(default=None, primary_key=True)
    guild_id: int = SQLField(index=True)
    player_id: str = SQLField(index=True, unique=True)
    role: str = SQLField(default="member")
    joined_at: datetime = _created_at()  # type: ignore[assignment]
