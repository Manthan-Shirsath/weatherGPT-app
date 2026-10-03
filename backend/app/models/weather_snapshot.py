import datetime
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Float,
    String,
    Text,
    DateTime,
    Index,
    Boolean
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class WeatherSnapshot(Base):
    """
    Persistent real weather observation snapshot collected by the centralized weather collector.
    Stored in PostgreSQL as the single source of truth for historical weather analytics.
    """
    __tablename__ = "weather_snapshots"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)
    city = Column(String(100), nullable=False, index=True)
    display_location = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Meteorological metrics
    temperature_c = Column(Float, nullable=False)
    feels_like_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=False)
    precipitation_mm = Column(Float, nullable=False, default=0.0)
    rain_probability_pct = Column(Float, nullable=True)
    wind_speed_kmh = Column(Float, nullable=False)
    wind_direction_deg = Column(Float, nullable=True)
    wind_direction_label = Column(String(10), nullable=True)
    cloud_cover_pct = Column(Float, nullable=True)
    pressure_hpa = Column(Float, nullable=False)
    visibility_km = Column(Float, nullable=True)
    weather_code = Column(Integer, nullable=True)
    condition_text = Column(String(100), nullable=True)

    # Skycast Risk Engine Assessment
    skycast_risk_level = Column(String(20), nullable=True)  # green, yellow, orange, red
    highest_risk = Column(String(100), nullable=True)
    active_hazards = Column(Text, nullable=True)  # Comma-separated or JSON string of active hazards
    
    # Provider & Freshness Meta
    provider = Column(String(50), nullable=True)
    is_stale = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("idx_weather_snapshots_city_timestamp", "city", "timestamp", unique=True),
        Index("idx_weather_snapshots_timestamp", "timestamp"),
    )

    def to_dict(self):
        """Serialize snapshot to dictionary."""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "city": self.city,
            "displayLocation": self.display_location,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "temperatureC": self.temperature_c,
            "feelsLikeC": self.feels_like_c,
            "humidityPct": self.humidity_pct,
            "precipitationMm": self.precipitation_mm,
            "rainProbabilityPct": self.rain_probability_pct,
            "windSpeedKmh": self.wind_speed_kmh,
            "windDirectionDeg": self.wind_direction_deg,
            "windDirectionLabel": self.wind_direction_label,
            "cloudCoverPct": self.cloud_cover_pct,
            "pressureHpa": self.pressure_hpa,
            "visibilityKm": self.visibility_km,
            "weatherCode": self.weather_code,
            "conditionText": self.condition_text,
            "skycastRiskLevel": self.skycast_risk_level,
            "highestRisk": self.highest_risk,
            "activeHazards": self.active_hazards,
            "provider": self.provider,
            "isStale": self.is_stale
        }
