"""add representation to forecastvalue

Revision ID: 66622be3fc38
Revises: 003_add_historical_coverage
Create Date: 2026-08-31 19:08:44.918625

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '66622be3fc38'
down_revision: Union[str, None] = '003_add_historical_coverage'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'forecast_runs' not in tables:
        op.create_table('forecast_runs',
            sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column('model_id', sa.String(length=50), nullable=False),
            sa.Column('location_name', sa.String(length=100), nullable=False),
            sa.Column('run_time', sa.DateTime(timezone=True), nullable=False),
            sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('model_id', 'location_name', 'run_time', name='uix_forecast_run_identity')
        )
        op.create_index('idx_forecast_runs_lookup', 'forecast_runs', ['location_name', 'model_id', 'run_time'])
        op.create_index(op.f('ix_forecast_runs_model_id'), 'forecast_runs', ['model_id'], unique=False)
        op.create_index(op.f('ix_forecast_runs_location_name'), 'forecast_runs', ['location_name'], unique=False)

    if 'forecast_values' not in tables:
        op.create_table('forecast_values',
            sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column('forecast_run_id', sa.BigInteger(), nullable=False),
            sa.Column('valid_time', sa.DateTime(timezone=True), nullable=False),
            sa.Column('lead_hours', sa.Integer(), nullable=False),
            sa.Column('variable', sa.String(length=50), nullable=False),
            sa.Column('representation', sa.String(length=50), server_default='deterministic', nullable=False),
            sa.Column('value', sa.Float(), nullable=False),
            sa.Column('unit', sa.String(length=20), nullable=False),
            sa.ForeignKeyConstraint(['forecast_run_id'], ['forecast_runs.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
            # unique constraint added in next migration 40bce457b771
        )
        op.create_index('idx_forecast_values_query', 'forecast_values', ['forecast_run_id', 'variable', 'valid_time'])
        op.create_index(op.f('ix_forecast_values_forecast_run_id'), 'forecast_values', ['forecast_run_id'], unique=False)
        op.create_index(op.f('ix_forecast_values_valid_time'), 'forecast_values', ['valid_time'], unique=False)
    else:
        columns = [c['name'] for c in inspector.get_columns('forecast_values')]
        if 'representation' not in columns:
            op.add_column('forecast_values', sa.Column('representation', sa.String(length=50), server_default='deterministic', nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'forecast_values' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('forecast_values')]
        if 'representation' in columns:
            op.drop_column('forecast_values', 'representation')
