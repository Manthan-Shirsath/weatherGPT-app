import uuid
import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    JSON
)
from backend.app.models.weather_snapshot import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=True, unique=True, index=True)
    preferences = Column(JSON, nullable=True, default={})
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    tz = Column(String(50), nullable=True, default="auto")

from sqlalchemy import Boolean, Index

class ActiveAlert(Base):
    __tablename__ = "active_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(Integer, nullable=True, index=True)
    city = Column(String(100), nullable=False, index=True)
    hazard = Column(String(100), nullable=False)
    tier = Column(String(20), nullable=False)
    description = Column(String(1000), nullable=True)
    source = Column(String(50), nullable=False, default="skycast")
    is_active = Column(Boolean, nullable=False, default=True)
    issued_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    valid_until = Column(
        DateTime(timezone=True),
        nullable=True
    )

    __table_args__ = (
        Index("idx_active_alerts_city_active", "city", "is_active"),
        Index("idx_active_alerts_tier", "tier"),
    )
