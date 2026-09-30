import asyncio
import json
import httpx
from openai import AsyncOpenAI

async def test_direct_ovserve():
    print("--- DIRECT OVSERVE TEST ---")
    url = "http://127.0.0.1:11435/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    
    queries = [
        "Give me a 7-day temperature outlook for Pune.",
        "What is the weather in Pune?",
        "Explain atmospheric pressure.",
        "Compare two weather forecasts."
    ]
    
    async with httpx.AsyncClient(timeout=300) as client:
        for q in queries:
            payload = {
                "model": "OpenVINO/gemma-4-E2B-it-int4-ov",
                "messages": [{"role": "user", "content": q}],
                "temperature": 0
            }
            print(f"Query: {q}")
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                print(f"Raw Output: {data['choices'][0]['message']['content'][:200]}...\n")
            except Exception as e:
                print(f"Error: {e}\n")

async def test_agents_sdk():
    print("--- AGENTS SDK TEST ---")
    from agents import Agent, Runner, set_default_openai_client, set_default_openai_api
    from agents import function_tool

    set_default_openai_api("chat_completions")
    
    client = AsyncOpenAI(
        base_url="http://127.0.0.1:11435/v1",
        api_key="local-ovserve",
        timeout=300
    )
    set_default_openai_client(client, use_for_tracing=False)
    
    @function_tool
    def get_weather(location: str) -> str:
        """Get the current weather for a location."""
        print(f"TOOL CALLED: get_weather({location})")
        return "It is 25C and sunny."
        
    test_agent = Agent(
        name="TestAgent",
        instructions="You are a helpful assistant. Use tools if necessary.",
        tools=[get_weather],
        model="openai/OpenVINO/gemma-4-E2B-it-int4-ov"
    )
    
    try:
        print("Running Agents SDK test for 'What is the weather in Pune?'...")
        res = await Runner.run(test_agent, input=[{"role": "user", "content": "What is the weather in Pune?"}])
        print(f"Final output: {res.final_output}")
    except Exception as e:
        print(f"SDK Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_direct_ovserve())
    asyncio.run(test_agents_sdk())
