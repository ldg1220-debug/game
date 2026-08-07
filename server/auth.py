"""계정과 토큰.

Phase 8까지는 `player_id`를 그대로 믿었다. 남의 id를 적어 보내면 남의 대전이
성립하고 남의 세이브를 읽을 수 있었다 — 검증을 아무리 촘촘히 해도 "누가
보냈는가"를 모르면 소용이 없다.

## 설계

**토큰은 서버가 만든 난수다.** JWT를 쓰지 않는다. 서명 토큰의 장점은 서버가
상태를 안 가져도 된다는 것인데, 우리는 어차피 DB가 있고, 대신 **즉시 무효화**를
잃는다. 계정을 도난당했을 때 "다음 만료까지 기다리세요"는 답이 아니다.

**비밀번호는 scrypt로 늘려 저장한다.** 표준 라이브러리(`hashlib.scrypt`)만
쓴다 — 의존성을 하나 늘리는 것보다, 검증된 KDF가 이미 파이썬에 들어 있다는
사실을 쓰는 게 낫다. 계정마다 소금을 따로 둬서 같은 비밀번호가 같은 해시로
저장되지 않게 한다.

**비교는 상수 시간으로 한다.** `==` 로 해시를 비교하면 앞자리부터 어긋나는
지점까지의 시간 차이로 정보가 샌다. 토큰 조회도 마찬가지다.

## 하지 않은 것

비밀번호 재설정, 2단계 인증, 계정 잠금(무차별 대입 방어), 이메일 확인. 전부
실서비스에는 필요하지만 각각이 별도의 흐름(메일 발송·복구 코드·잠금 해제)을
끌고 오고, 그 흐름을 확인할 방법이 지금 없다.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from server.models import Account, AuthToken, utcnow

#  scrypt 파라미터. n을 올리면 안전해지지만 로그인이 느려진다. 2**14는
#  서버에서 수십 ms 수준이라 사람은 못 느끼고 무차별 대입에는 충분히 비싸다.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_LEN = 32

#  토큰 수명. 짧으면 자주 로그인하고 길면 도난 시 노출이 길어진다.
TOKEN_TTL = timedelta(days=14)

MIN_PASSWORD = 8
MAX_PASSWORD = 200


class Credentials(BaseModel):
    player_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=MIN_PASSWORD, max_length=MAX_PASSWORD)


class TokenOut(BaseModel):
    token: str
    player_id: str
    expires_at: datetime


def hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_LEN,
    )


def verify_password(password: str, salt: bytes, expected: bytes) -> bool:
    #  상수 시간 비교. == 는 어긋나는 자리에서 바로 멈춰 시간이 정보를 흘린다.
    return hmac.compare_digest(hash_password(password, salt), expected)


def issue_token(session: Session, player_id: str) -> AuthToken:
    token = AuthToken(
        token=secrets.token_urlsafe(32),
        player_id=player_id,
        expires_at=utcnow() + TOKEN_TTL,
    )
    session.add(token)
    session.commit()
    session.refresh(token)
    return token


def register(session: Session, creds: Credentials) -> AuthToken:
    exists = session.exec(select(Account).where(Account.player_id == creds.player_id)).first()
    if exists is not None:
        raise HTTPException(status_code=409, detail="이미 있는 이름이다")

    salt = secrets.token_bytes(16)
    session.add(
        Account(
            player_id=creds.player_id,
            salt=salt.hex(),
            password_hash=hash_password(creds.password, salt).hex(),
        )
    )
    session.commit()
    return issue_token(session, creds.player_id)


def login(session: Session, creds: Credentials) -> AuthToken:
    account = session.exec(select(Account).where(Account.player_id == creds.player_id)).first()

    #  계정이 없어도 해시를 한 번 돌린다. 안 그러면 응답 시간만 재도 어떤
    #  이름이 존재하는지 알 수 있다.
    if account is None:
        hash_password(creds.password, b"\x00" * 16)
        raise HTTPException(status_code=401, detail="이름이나 비밀번호가 틀렸다")

    if not verify_password(creds.password, bytes.fromhex(account.salt), bytes.fromhex(account.password_hash)):
        #  없는 계정과 같은 메시지다. 다르면 이름이 존재하는지가 새어나간다.
        raise HTTPException(status_code=401, detail="이름이나 비밀번호가 틀렸다")

    return issue_token(session, account.player_id)


def resolve_token(session: Session, raw: str) -> str:
    """토큰 → player_id. 없거나 만료면 401."""
    row = session.exec(select(AuthToken).where(AuthToken.token == raw)).first()
    if row is None:
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않다")

    expires = row.expires_at
    #  SQLite는 시간대를 잃어버리고 돌려준다. UTC로 저장했으니 UTC로 읽는다.
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        session.delete(row)
        session.commit()
        raise HTTPException(status_code=401, detail="토큰이 만료됐다")

    return row.player_id


def revoke(session: Session, raw: str) -> None:
    row = session.exec(select(AuthToken).where(AuthToken.token == raw)).first()
    if row is not None:
        session.delete(row)
        session.commit()


def bearer(authorization: Annotated[str | None, Header()] = None) -> str:
    """`Authorization: Bearer <토큰>` 에서 토큰만 꺼낸다."""
    if not authorization:
        raise HTTPException(status_code=401, detail="인증이 필요하다")
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        raise HTTPException(status_code=401, detail="Bearer 토큰이 필요하다")
    return value


def make_current_player(get_session):
    """`current_player` 의존성을 만든다.

    세션 의존성을 인자로 받는 이유는 순환 import를 피하기 위해서다 — main이
    auth를 부르고 auth가 다시 main의 get_session을 부르면 서로를 기다린다.
    """

    def current_player(
        token: Annotated[str, Depends(bearer)],
        session: Session = Depends(get_session),
    ) -> str:
        return resolve_token(session, token)

    return current_player
