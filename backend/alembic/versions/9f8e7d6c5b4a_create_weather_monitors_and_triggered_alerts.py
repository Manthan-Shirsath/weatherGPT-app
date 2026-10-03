"""Create weather_monitors and triggered_alerts tables

Revision ID: 9f8e7d6c5b4a
Revises: 38661a7d3a71
Create Date: 2026-10-04 00:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f8e7d6c5b4a'
down_revision: Union[str, None] = '38661a7d3a71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'weather_monitors',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=True),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('location', sa.String(length=100), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('rule_type', sa.String(length=50), nullable=False),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('operator', sa.String(length=20), nullable=False),
        sa.Column('threshold', sa.Float(), nullable=False),
        sa.Column('secondary_threshold', sa.Float(), nullable=True),
        sa.Column('time_window', sa.String(length=50), server_default='all_day', nullable=True),
        sa.Column('severity', sa.String(length=20), server_default='warning', nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('state', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('last_evaluated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weather_monitors_user_id'), 'weather_monitors', ['user_id'], unique=False)
    op.create_index(op.f('ix_weather_monitors_session_id'), 'weather_monitors', ['session_id'], unique=False)
    op.create_index(op.f('ix_weather_monitors_location'), 'weather_monitors', ['location'], unique=False)
    op.create_index(op.f('ix_weather_monitors_rule_type'), 'weather_monitors', ['rule_type'], unique=False)
    op.create_index('idx_monitors_location_enabled', 'weather_monitors', ['location', 'enabled'], unique=False)
    op.create_index('idx_monitors_session_enabled', 'weather_monitors', ['session_id', 'enabled'], unique=False)
    op.create_index('idx_monitors_user_enabled', 'weather_monitors', ['user_id', 'enabled'], unique=False)

    op.create_table(
        'triggered_alerts',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('monitor_id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=True),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('location', sa.String(length=100), nullable=False),
        sa.Column('rule_type', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=20), server_default='warning', nullable=False),
        sa.Column('condition_desc', sa.String(length=255), nullable=False),
        sa.Column('threshold', sa.Float(), nullable=False),
        sa.Column('actual_value', sa.Float(), nullable=False),
        sa.Column('time_window', sa.String(length=50), nullable=True),
        sa.Column('explanation', sa.String(length=1000), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_value', sa.Float(), nullable=True),
        sa.Column('resolution_explanation', sa.String(length=1000), nullable=True),
        sa.ForeignKeyConstraint(['monitor_id'], ['weather_monitors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_triggered_alerts_monitor_id'), 'triggered_alerts', ['monitor_id'], unique=False)
    op.create_index(op.f('ix_triggered_alerts_user_id'), 'triggered_alerts', ['user_id'], unique=False)
    op.create_index(op.f('ix_triggered_alerts_session_id'), 'triggered_alerts', ['session_id'], unique=False)
    op.create_index(op.f('ix_triggered_alerts_location'), 'triggered_alerts', ['location'], unique=False)
    op.create_index(op.f('ix_triggered_alerts_triggered_at'), 'triggered_alerts', ['triggered_at'], unique=False)
    op.create_index('idx_triggered_alerts_monitor_status', 'triggered_alerts', ['monitor_id', 'status'], unique=False)
    op.create_index('idx_triggered_alerts_session_status', 'triggered_alerts', ['session_id', 'status'], unique=False)
    op.create_index('idx_triggered_alerts_location_status', 'triggered_alerts', ['location', 'status'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_triggered_alerts_location_status', table_name='triggered_alerts')
    op.drop_index('idx_triggered_alerts_session_status', table_name='triggered_alerts')
    op.drop_index('idx_triggered_alerts_monitor_status', table_name='triggered_alerts')
    op.drop_index(op.f('ix_triggered_alerts_triggered_at'), table_name='triggered_alerts')
    op.drop_index(op.f('ix_triggered_alerts_location'), table_name='triggered_alerts')
    op.drop_index(op.f('ix_triggered_alerts_session_id'), table_name='triggered_alerts')
    op.drop_index(op.f('ix_triggered_alerts_user_id'), table_name='triggered_alerts')
    op.drop_index(op.f('ix_triggered_alerts_monitor_id'), table_name='triggered_alerts')
    op.drop_table('triggered_alerts')

    op.drop_index('idx_monitors_user_enabled', table_name='weather_monitors')
    op.drop_index('idx_monitors_session_enabled', table_name='weather_monitors')
    op.drop_index('idx_monitors_location_enabled', table_name='weather_monitors')
    op.drop_index(op.f('ix_weather_monitors_rule_type'), table_name='weather_monitors')
    op.drop_index(op.f('ix_weather_monitors_location'), table_name='weather_monitors')
    op.drop_index(op.f('ix_weather_monitors_session_id'), table_name='weather_monitors')
    op.drop_index(op.f('ix_weather_monitors_user_id'), table_name='weather_monitors')
    op.drop_table('weather_monitors')
