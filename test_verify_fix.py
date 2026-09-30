import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
os.chdir('backend')

from dotenv import load_dotenv
load_dotenv()

async def test_full_agent():
    from backend.app.services.agent.agent import WeatherGPTAgent
    
    agent_svc = WeatherGPTAgent()
    
    # We force provider to ovserve for this test, even if env var is groq
    agent_svc.provider = "ovserve"
    agent_svc.model = "openai/OpenVINO/gemma-4-E2B-it-int4-ov"
    agent_svc.api_key = "local-ovserve"
    agent_svc.base_url = "http://127.0.0.1:11435/v1"
    
    print("Testing '7-day temperature outlook for Pune'")
    try:
        res = await agent_svc._run_llm_loop(
            user_text="7-day temperature outlook for Pune",
            session_id="test-session",
            active_city="Pune",
            history_turns=[]
        )
        print(f"Reply: {res.reply}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_full_agent())
