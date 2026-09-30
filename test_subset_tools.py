import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, set_default_openai_api
from backend.app.services.agent.executor import ToolExecutor

async def test_subset_tools():
    print("--- TESTING GEMMA WITH SUBSET OF TOOLS ---")
    set_default_openai_api("chat_completions")
    
    client = AsyncOpenAI(
        base_url="http://127.0.0.1:11435/v1",
        api_key="local-ovserve",
        timeout=300
    )
    set_default_openai_client(client, use_for_tracing=False)
    
    subset_tools = [
        "get_forecast", 
        "compare_models"
    ]
    
    tools = ToolExecutor.get_openai_tools(subset_tools)
    print(f"Loaded {len(tools)} tools.")
    
    test_agent = Agent(
        name="TestWeatherAgent",
        instructions="You are a helpful weather assistant. Use the provided tools.",
        tools=tools,
        model="openai/OpenVINO/gemma-4-E2B-it-int4-ov"
    )
    
    queries = [
        "7-day temperature outlook for Pune",
        "Compare ECMWF & GFS rain forecasts"
    ]
    
    for q in queries:
        try:
            print(f"\nQuery: {q}")
            res = await Runner.run(test_agent, input=[{"role": "user", "content": q}])
            print(f"Final output: {res.final_output}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_subset_tools())
