from fastapi.testclient import TestClient
import sys
import os

# Add the project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from main import app

client = TestClient(app)

def test_weather_api():
    cities = ['Pune'] # Just test one to be fast and not exhaust API rate limits
    for city in cities:
        r = client.get(f'/api/weather?city={city}')
        assert r.status_code == 200
        data = r.json()
        assert 'displayLocation' in data
        assert 'tempC' in data

    # Invalid city test
    inv_r = client.get('/api/weather?city=ThisCityDoesNotExistXYZ999')
    assert inv_r.status_code == 404
