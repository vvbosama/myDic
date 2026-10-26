from typing import Annotated

from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models import User


SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(session: SessionDep) -> User:
    settings = get_settings()
    user = await session.get(User, settings.dev_user_id)
    if user:
        return user
    user = User(id=settings.dev_user_id, nickname="Phase 2 Developer")
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.get(User, settings.dev_user_id)
        if existing:
            return existing
        raise
    await session.refresh(user)
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
