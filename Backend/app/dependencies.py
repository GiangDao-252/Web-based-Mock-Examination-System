from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError

from app.security import decode_access_token


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/token",
)


def get_token_user_id(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> int:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        subject = payload["sub"]

        if not isinstance(subject, str):
            raise credentials_error

        if (
            not subject.isascii()
            or not subject.isdecimal()
            or len(subject) > 19
        ):
            raise credentials_error

        user_id = int(subject)

        if not 1 <= user_id <= 9_223_372_036_854_775_807:
            raise credentials_error

        return user_id

    except (InvalidTokenError, ValueError, KeyError):
        raise credentials_error from None


TokenUserId = Annotated[int, Depends(get_token_user_id)]