import express from "express";
import { InferenceClient } from "@huggingface/inference";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const HF_TOKEN = process.env.HF_TOKEN || "";
const client = new InferenceClient(HF_TOKEN);


const conversations = new Map();

function getConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, []);
  }
  return conversations.get(sessionId);
}

function addMessage(sessionId, role, text) {
  const conv = getConversation(sessionId);
  const msg = { id: uuidv4(), role, text, timestamp: Date.now() };
  conv.push(msg);
  return msg;
}

function formatHistory(sessionId, systemPrompt) {
  const conv = getConversation(sessionId);
  return [
    { role: "system", content: systemPrompt },
    ...conv.map((m) => ({ role: m.role, content: m.text })),
  ];
}


router.post("/generate-image", async (req, res) => {
  try {
    console.log('Image generation request:', req.body);
    const prompt = req.body.prompt || "a futuristic city";
    
    const out = await client.textToImage({
      model: "stabilityai/stable-diffusion-xl-base-1.0",
      inputs: prompt,
    });

    const buffer = Buffer.from(await out.arrayBuffer());
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});


router.post("/chat", async (req, res) => {
  try {
    console.log('LLaMA chat request:', req.body);
    const { userMessage, sessionId } = req.body;
    
    if (!userMessage || !sessionId) {
      return res.status(400).json({ error: "userMessage and sessionId required" });
    }

    addMessage(sessionId, "user", userMessage);
    const history = formatHistory(sessionId, "You are a helpful assistant.");
    console.log('Chat history:', history);

    const out = await client.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: history,
      max_tokens: 500,
    });

    console.log('LLaMA API response:', out);
    
    const reply = out.choices[0].message.content;
    addMessage(sessionId, "assistant", reply);

    console.log('Sending reply:', reply);
    res.json({ 
      reply: reply, 
      conversationHistory: getConversation(sessionId) 
    });
  } catch (err) {
    console.error('LLaMA chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/chat/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const history = getConversation(sessionId);
  res.json({ conversationHistory: history });
});


router.post("/qwen", async (req, res) => {
  try {
    console.log('Qwen request:', req.body);
    const { userMessage, imageUrl, sessionId } = req.body;
    
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    if (!userMessage && !imageUrl) {
      return res.status(400).json({ error: "Provide text or image" });
    }

    if (userMessage) addMessage(sessionId, "user", userMessage);
    const history = formatHistory(sessionId, "You are a helpful assistant.");

    const out = await client.chatCompletion({
      provider: "hyperbolic",
      model: "Qwen/Qwen2.5-VL-7B-Instruct",
      messages: history,
    });

    console.log('Qwen API response:', out);
    
    const reply = out.choices[0].message.content;
    addMessage(sessionId, "assistant", reply);

    console.log('Sending Qwen reply:', reply);
    res.json({ 
      reply: reply, 
      conversationHistory: getConversation(sessionId) 
    });
  } catch (err) {
    console.error("Qwen API Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/qwen/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const history = getConversation(sessionId);
  res.json({ conversationHistory: history });
});


router.post("/gemma", async (req, res) => {
  try {
    console.log('Gemma request:', req.body);
    const { prompt, userMessage, imageurl, sessionId } = req.body;
    
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    const message = prompt || userMessage;
    if (!message) {
      return res.status(400).json({ error: "Provide text message" });
    }

    addMessage(sessionId, "user", message);
    const history = formatHistory(sessionId, "You are a helpful AI assistant.");

    const out = await client.chatCompletion({
      model: "google/gemma-2-9b-it",
      messages: history,
      max_tokens: 1000,
      temperature: 0.7,
    });

    console.log('Gemma API response:', out);
    
    const reply = out.choices[0].message.content;
    addMessage(sessionId, "assistant", reply);

    console.log('Sending Gemma reply:', reply);
    res.json({ 
      reply: reply, 
      conversationHistory: getConversation(sessionId) 
    });
  } catch (err) {
    console.error("Gemma API Error:", err.response?.data || err.message);
    res.status(500).json({ error: `Gemma error: ${err.message}` });
  }
});

router.get("/gemma/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const history = getConversation(sessionId);
  res.json({ conversationHistory: history });
});

export default router;